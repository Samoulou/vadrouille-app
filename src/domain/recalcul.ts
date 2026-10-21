import type { Category, DaySnapshot, PreferenceSignal, StopSnapshot, TripSnapshot } from "@/contracts";

import type { CandidatMoteur, EntreeMoteur, EtatChoix } from "@/domain/entrees";
import { estJourNonPlanifie } from "@/domain/jours-planifies";
import { categoriesArretees, memeCreneau } from "@/domain/preferences";

/**
 * Règles pures du recalcul des jours touchés par un tri (spécification B10, B10b ; décision 0119 § 2.2, B10-TL-6 ;
 * B10-PO-9, B10-PO-10). Fonctions sans entrée-sortie (0045 § 3), appelées par le workflow 5 (jours touchés, plan de
 * chaque jour) et par le workflow 4 (réserve filtrée, 0119 § 3). Module distinct de `preferences.ts` (0112 § 2 point 2,
 * dernier tiret) : il importe d'autres modules du domaine et n'est jamais importé par `src/features`. La règle des
 * catégories arrêtées n'a qu'une définition, `categoriesArretees` de `preferences.ts`, importée ici.
 *
 * Le remplacement d'un lieu écarté est fait par le moteur (`replanifierJour`), sur l'entrée que rend `entreeDuJour` :
 * - activité retirée : un candidat de la réserve filtrée (classement de B5, distance comprise), sinon du temps libre ;
 * - repas d'un créneau réglé sans choix : aucun candidat de ce créneau n'entre dans `choix`, donc un repas « pas encore
 *   choisi » (`openMeal`), avec ou sans réserve ;
 * - repas choisi sur une autre option : le candidat de cette option (pris dans sa proposition, pas dans la réserve) entre
 *   dans `choix` comme `choisi` ; refusé par la relecture, le moteur ne l'admet pas et pose `openMeal`, jamais l'option
 *   écartée (absente de `choix`).
 * Aucun lieu n'est inventé : le moteur ne place que des candidats de son entrée.
 */

// --- Types locaux (0119 § 2.2 point 4) ---------------------------------------------------------------------

/**
 * Signal tel que le recalcul le lit : `PreferenceSignal` (sans nom), plus les colonnes de `preference_signals` que le
 * contrat ne porte pas, `candidate_id` et `place_id` (seul identifiant Google stocké). Construit par la lecture serveur ;
 * `PreferenceSignalSchema` n'est pas étendu (B10b n'a pas de PR de contrat).
 */
export type SignalDuRecalcul = PreferenceSignal & { readonly candidatId?: string; readonly placeId?: string };

/**
 * Proposition (case) d'un tri telle que le recalcul la lit : colonnes de `proposals` et, de son contenu, l'identifiant et
 * le lieu de l'étape proposée. `candidat` : le candidat de l'option, construit par la lecture serveur pour un repas
 * choisi (B10-PO-10 point 3) ; `option` : rang de l'option dans son créneau de repas (absent : option unique).
 */
export type PropositionDuRecalcul = {
  readonly id: string;
  readonly kind: "activity" | "meal";
  readonly category: Category;
  readonly day: number;
  readonly time: string;
  readonly option?: { readonly index: number };
  readonly stopId?: string;
  readonly placeId?: string;
  readonly candidat?: CandidatMoteur;
};

/** Signaux et propositions d'un tri clos. `categories` : catégorie d'un lieu (`placeId`) qu'aucune proposition ne porte. */
export type TriDuRecalcul = {
  readonly signaux: readonly SignalDuRecalcul[];
  readonly propositions: readonly PropositionDuRecalcul[];
  readonly categories?: ReadonlyMap<string, Category>;
};

const actif = (signal: PreferenceSignal) => signal.status !== "cancelled";
const etapesDe = (jour: DaySnapshot): StopSnapshot[] => jour.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));
/** Étape que le recalcul ne retire jamais (B10-PO-9 : « hors étapes verrouillées et engagements »). */
const intouchable = (stop: StopSnapshot) => stop.locked || stop.commitment !== undefined;

// --- Réserve filtrée (B10-PO-10 point 1) -------------------------------------------------------------------

/** Lieux refusés (« Pas pour moi » actifs) : par candidat et par `placeId`, dans tout le voyage. */
export function lieuxRefuses(signaux: readonly SignalDuRecalcul[]): { candidats: Set<string>; lieux: Set<string> } {
  const candidats = new Set<string>();
  const lieux = new Set<string>();
  for (const signal of signaux) {
    if (!actif(signal) || signal.signal !== "dislike") continue;
    if (signal.candidatId !== undefined) candidats.add(signal.candidatId);
    if (signal.placeId !== undefined) lieux.add(signal.placeId);
  }
  return { candidats, lieux };
}

/**
 * Réserve filtrée par les signaux actifs du voyage (B10-PO-10 point 1 ; 0119 § 2.2 point 2 et § 3) : sans les lieux
 * refusés (par candidat **et** par `placeId`) ni les activités des catégories arrêtées (`categoriesArretees`). Les options
 * passées par « Option suivante » ne sont pas des refus et restent. Ordre de l'entrée conservé.
 */
export function reserveFiltree<T extends Pick<CandidatMoteur, "id" | "placeId" | "categorie" | "typeEtape">>(
  candidats: readonly T[],
  signauxActifs: readonly SignalDuRecalcul[],
): T[] {
  const refuses = lieuxRefuses(signauxActifs);
  const arretees = categoriesArretees(signauxActifs);
  return candidats.filter(
    (candidat) =>
      !refuses.candidats.has(candidat.id) &&
      !(candidat.placeId !== undefined && refuses.lieux.has(candidat.placeId)) &&
      !(candidat.typeEtape === "activity" && arretees.has(candidat.categorie)),
  );
}

// --- Créneaux de repas d'un tri (B10-PO-9, F6-PO-7) ----------------------------------------------------------

type CreneauDeRepas = { readonly day: number; readonly time: string; readonly options: readonly PropositionDuRecalcul[] };

/** État d'un créneau de repas après le tri : réglé sans choix, ou option choisie. */
type EtatDuCreneau = { readonly creneau: CreneauDeRepas; readonly etat: "sansChoix" } | { readonly creneau: CreneauDeRepas; readonly etat: "choisi"; readonly option: PropositionDuRecalcul };

const rangOption = (proposition: PropositionDuRecalcul) => proposition.option?.index ?? 1;

/**
 * Créneaux de repas réglés par les signaux du tri : « Je choisis » actif sur une option (`choisi`), sinon « Pas pour
 * moi » actif sur la dernière option du créneau (`sansChoix`, F6-PO-7 ; dernière : aucune option de rang supérieur parmi
 * les propositions du tri). Même règle que `paquetDeReprise` (`preferences.ts`).
 */
function creneauxRegles(tri: TriDuRecalcul): EtatDuCreneau[] {
  const decisions = new Map<string, SignalDuRecalcul>();
  for (const signal of tri.signaux) if (actif(signal) && signal.proposalId !== undefined) decisions.set(signal.proposalId, signal);
  const creneaux: CreneauDeRepas[] = [];
  for (const proposition of tri.propositions) {
    if (proposition.kind !== "meal") continue;
    if (creneaux.some((creneau) => memeCreneau({ kind: "meal", ...creneau }, proposition))) continue;
    creneaux.push({ day: proposition.day, time: proposition.time, options: tri.propositions.filter((autre) => memeCreneau(proposition, autre)) });
  }
  const regles: EtatDuCreneau[] = [];
  for (const creneau of creneaux) {
    const choisie = creneau.options.find((option) => decisions.get(option.id)?.signal === "choose");
    if (choisie !== undefined) {
      regles.push({ creneau, etat: "choisi", option: choisie });
      continue;
    }
    const derniere = Math.max(...creneau.options.map(rangOption));
    const refusee = creneau.options.some((option) => rangOption(option) === derniere && decisions.get(option.id)?.signal === "dislike");
    if (refusee) regles.push({ creneau, etat: "sansChoix" });
  }
  return regles;
}

/** Repas que le programme place dans un créneau : étape `meal` du jour, identifiant d'une option ou même heure. */
function repasPlace(jour: DaySnapshot, creneau: CreneauDeRepas): StopSnapshot | undefined {
  if (jour.index !== creneau.day) return undefined;
  const ids = new Set(creneau.options.flatMap((option) => (option.stopId === undefined ? [] : [option.stopId])));
  return etapesDe(jour).find((stop) => stop.kind === "meal" && !intouchable(stop) && (ids.has(stop.id) || stop.start === creneau.time));
}

const memeLieu = (stop: StopSnapshot, option: PropositionDuRecalcul) =>
  (option.stopId !== undefined && stop.id === option.stopId) || (stop.placeId !== undefined && stop.placeId === option.placeId);

// --- Plan d'un jour (0119 § 2.2 point 3) -------------------------------------------------------------------

/** Ce que le tri fait d'un jour de la version de base. */
export type PlanDuJour = {
  /** Étapes du jour conservées (toutes sauf celles qu'un signal du tri retire), pour `EntreeMoteur.conservees`. */
  readonly conservees: ReadonlySet<string>;
  /** Étapes retirées, dans l'ordre du jour. */
  readonly retirees: readonly string[];
  /** Créneaux de repas réglés sans choix : leur repas est retiré, rien de ce créneau n'entre dans `choix` (`openMeal`). */
  readonly creneauxARouvrir: readonly { readonly day: number; readonly time: string }[];
  /** Candidats des options choisies autres que l'option placée (pris dans leur proposition), versés dans `choix`. */
  readonly repasChoisis: readonly CandidatMoteur[];
  /**
   * États de choix du jour : repas choisis par identifiant de candidat (`choisi`), et étapes conservées de repas ou
   * d'activité par identifiant d'étape (R7 ; `choisi` si « Je choisis » porte sur elle, `garde` sinon, F6-PO-7).
   */
  readonly choix: ReadonlyMap<string, EtatChoix>;
};

/** Raisons de toucher un jour, calculées une fois pour `joursTouches` et `planDuJour`. */
function analyse(jour: DaySnapshot, tri: TriDuRecalcul): Omit<PlanDuJour, "conservees" | "choix"> & { choisiesEnPlace: Set<string>; ouvert: boolean } {
  const refuses = lieuxRefuses(tri.signaux);
  const refuseesParEtape = new Set<string>();
  for (const signal of tri.signaux) {
    if (!actif(signal) || signal.signal !== "dislike" || signal.proposalId === undefined) continue;
    const stopId = tri.propositions.find((proposition) => proposition.id === signal.proposalId)?.stopId;
    if (stopId !== undefined) refuseesParEtape.add(stopId);
  }
  const arretees = categoriesArretees(tri.signaux);
  const categorieDe = (stop: StopSnapshot): Category | undefined =>
    tri.propositions.find((proposition) => proposition.stopId === stop.id)?.category ??
    (stop.placeId === undefined ? undefined : tri.categories?.get(stop.placeId));

  const retirees = new Set<string>();
  for (const stop of etapesDe(jour)) {
    if (intouchable(stop)) continue;
    const refusee = refuseesParEtape.has(stop.id) || (stop.placeId !== undefined && refuses.lieux.has(stop.placeId));
    const categorie = stop.kind === "activity" ? categorieDe(stop) : undefined;
    if (refusee || (categorie !== undefined && arretees.has(categorie))) retirees.add(stop.id);
  }

  const creneauxARouvrir: { day: number; time: string }[] = [];
  const repasChoisis: CandidatMoteur[] = [];
  const choisiesEnPlace = new Set<string>();
  let ouvert = false;
  for (const regle of creneauxRegles(tri)) {
    if (regle.creneau.day !== jour.index) continue;
    const place = repasPlace(jour, regle.creneau);
    if (regle.etat === "sansChoix") {
      if (place === undefined) continue;
      retirees.add(place.id);
      creneauxARouvrir.push({ day: regle.creneau.day, time: regle.creneau.time });
      continue;
    }
    if (place !== undefined && memeLieu(place, regle.option)) {
      choisiesEnPlace.add(place.id);
      continue;
    }
    // Option choisie autre que l'option placée (ou créneau sans repas placé, `openMeal`) : le jour est touché.
    const libre = place === undefined && jour.items.some((item) => item.type === "openMeal" && item.time === regle.creneau.time);
    if (place === undefined && !libre) continue;
    if (place !== undefined) retirees.add(place.id);
    ouvert = true;
    if (regle.option.candidat !== undefined) repasChoisis.push(regle.option.candidat);
  }

  const ordre = etapesDe(jour).map((stop) => stop.id);
  return { retirees: ordre.filter((id) => retirees.has(id)), creneauxARouvrir, repasChoisis, choisiesEnPlace, ouvert };
}

/**
 * Plan d'un jour de la version de base pour un tri (0119 § 2.2 point 3 ; B10-PO-10 points 2 et 3). Les étapes retirées
 * par le tri : activité ou lieu refusé (par proposition ou par `placeId`), activité d'une catégorie arrêtée dans ce tri,
 * repas placé d'un créneau réglé sans choix (quelle que soit son option), repas placé d'un créneau dont une autre option
 * est choisie. Jamais une étape verrouillée ni un engagement. Toutes les autres étapes sont conservées.
 */
export function planDuJour(jour: DaySnapshot, tri: TriDuRecalcul): PlanDuJour {
  const { retirees, creneauxARouvrir, repasChoisis, choisiesEnPlace } = analyse(jour, tri);
  const retireesSet = new Set(retirees);
  const conservees = new Set(etapesDe(jour).flatMap((stop) => (retireesSet.has(stop.id) ? [] : [stop.id])));
  const choix = new Map<string, EtatChoix>();
  for (const stop of etapesDe(jour)) {
    if (!conservees.has(stop.id) || stop.commitment !== undefined || stop.kind === "event") continue;
    choix.set(stop.id, choisiesEnPlace.has(stop.id) ? "choisi" : "garde");
  }
  for (const candidat of repasChoisis) choix.set(candidat.id, "choisi");
  return { conservees, retirees, creneauxARouvrir, repasChoisis, choix };
}

// --- Jours touchés (B10-PO-9 ; 0119 § 2.2 point 1) ---------------------------------------------------------

/**
 * Indices des jours **planifiés** de la version de base touchés par un tri (B10-PO-9), dans l'ordre : un jour qui a une
 * étape retirée par `planDuJour`, ou un créneau sans repas placé (`openMeal`) dont une option est choisie. « Je choisis »
 * sur l'option placée, « Option suivante » seule et « J'aime » ne touchent aucun jour. Un jour non planifié n'est jamais
 * touché : le voyage complet le planifiera avec la réserve filtrée (0119 § 3).
 */
export function joursTouches(base: TripSnapshot, tri: TriDuRecalcul): number[] {
  return base.days
    .filter((jour) => !estJourNonPlanifie(jour))
    .filter((jour) => {
      const resultat = analyse(jour, tri);
      return resultat.retirees.length > 0 || resultat.ouvert;
    })
    .map((jour) => jour.index);
}

// --- Entrée du moteur pour un jour touché ------------------------------------------------------------------

/**
 * Entrée de `replanifierJour` pour un jour touché : réserve filtrée par les signaux actifs du voyage, plus les repas
 * choisis du plan (pris dans leur proposition, pas dans la réserve) ; `conservees` du plan ; `choix` du jour **remplacé**
 * par celui du plan (un candidat d'un créneau rouvert ou d'une option écartée n'y entre jamais). Les autres champs de
 * l'entrée sont repris tels quels (relectures, version, configuration).
 */
export function entreeDuJour(entree: EntreeMoteur, plan: PlanDuJour, signauxActifs: readonly SignalDuRecalcul[]): EntreeMoteur {
  const reserve = reserveFiltree(entree.candidats, signauxActifs);
  const ids = new Set(reserve.map((candidat) => candidat.id));
  const choisis = plan.repasChoisis.filter((candidat) => !ids.has(candidat.id));
  return { ...entree, candidats: [...reserve, ...choisis], conservees: plan.conservees, choix: plan.choix };
}
