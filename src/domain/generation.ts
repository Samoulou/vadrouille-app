import {
  MOBILITY_MODES,
  TripSnapshotSchema,
  type DayLineItemSnapshot,
  type DaySnapshot,
  type Source,
  type StopSnapshot,
  type SurpriseIdeaSnapshot,
  type TripSnapshot,
} from "@/contracts";

import { classer, type ParametresClassement } from "@/domain/classement";
import type { CandidatEvenement, CandidatIdee, CandidatMoteur, EntreeMoteur, EtatChoix, Nuit } from "@/domain/entrees";
import { identifiantEtape } from "@/domain/identifiant";
import { planifierJour, type ResultatJour, type Trajet } from "@/domain/planification";
import { DERNIERE_HEURE, finDuJour, tempsLibreAvant } from "@/domain/journee";
import { estJourNonPlanifie, joursAPlanifier } from "@/domain/jours-planifies";
import { INCONNU, trajetLePlusRapide, type ModeTrajet, type Point, type Relectures } from "@/domain/relectures";
import {
  finOccupee,
  retirerCreneaux,
  squelette,
  squeletteAvecEngagements,
  type BlocFixe,
  type JourSquelette,
} from "@/domain/squelette";
import { element } from "@/domain/tables";
import { versHeure, versMinutes } from "@/domain/temps";
import {
  estBloquante,
  PORTEE_R1_PAR_DEFAUT,
  urlSourceValide,
  validerProgramme,
  type ContexteValidation,
  type EntreeRapport,
  type PorteeR1,
  type RapportValidation,
} from "@/domain/validation";
import type { CodeRefus } from "@/domain/version";

/** Refus « aucune option compatible » (B5-TL-5, code de `REFUS_MOTEUR`). */
export type RefusAucuneOption = { ok: false; code: Extract<CodeRefus, "no_option"> };

/**
 * Génération d'un programme par le moteur, sans modèle (spécification B5b ; cadrage § 6.5 étapes 5 à 8) :
 * squelette avec engagements (B5-PO-12), classement et planification des candidats de la réserve (mode le plus
 * rapide, B5-PO-6), événements et idée du jour (B5-PO-16), réparation déterministe, puis **sortie d'écriture**
 * validée par `TripSnapshotSchema` et rapport de validation en mémoire.
 *
 * Réparation (0011 point 4, P0-PO-7) : le planificateur ne retient d'un créneau que le premier candidat du
 * classement qui satisfait les horaires connus (R4) et la marge de trajet (R5) — c'est l'option suivante. Le jour
 * construit est ensuite validé (R1 à R9) : un candidat en cause dans une entrée bloquante est écarté pour ce jour et
 * le jour est replanifié ; sans suivant, le créneau reste vide (repas : `openMeal` ; activité : temps libre). Aucun
 * appel de modèle : l'entrée du moteur n'a aucune interface de modèle, et aucune liste de candidats écartés n'est
 * produite.
 *
 * Sortie d'écriture : aucun trajet n'a `minutes`, aucune étape ni idée n'a `verifiedAt`, aucune étape n'a
 * `toConfirm`, aucun jour n'a `travelMinutes` (0011 point 5). Les durées, horaires et validités lus par les
 * interfaces ne servent qu'au calcul. Une version qui échoue à la validation n'est jamais produite : refus
 * `no_option` (B5-TL-5).
 */

export type ResultatGeneration =
  | { ok: true; instantane: TripSnapshot; rapport: RapportValidation }
  | RefusAucuneOption;

export type ResultatReplanification =
  | { ok: true; jour: DaySnapshot; rapport: RapportValidation }
  | RefusAucuneOption;

const REFUS_AUCUNE_OPTION = { ok: false, code: "no_option" } as const;

// --- Contexte commun ----------------------------------------------------------------------------------------

type Contexte = {
  entree: EntreeMoteur;
  modes: readonly ModeTrajet[];
  trajet: Trajet;
  parametres: ParametresClassement;
  portee: PorteeR1;
  candidatsParId: ReadonlyMap<string, CandidatMoteur>;
};

/**
 * Modes admis : `Brief.mobility` (B5-PO-6). Une liste vide n'exclut aucun mode : les trois sont admis (écart
 * signalé dans la PR de B5b, le contrat admet une liste vide).
 */
export function modesAdmis(mobility: readonly ModeTrajet[]): readonly ModeTrajet[] {
  return mobility.length > 0 ? mobility : MOBILITY_MODES;
}

function contexteDe(entree: EntreeMoteur): Contexte {
  const modes = modesAdmis(entree.brief.mobility);
  const trajet: Trajet = (depuis, vers) => {
    const resultat = trajetLePlusRapide(entree.relectures, depuis, vers, modes);
    return resultat === INCONNU ? undefined : resultat;
  };
  return {
    entree,
    modes,
    trajet,
    parametres: {
      classement: entree.classement.formule,
      ageSourceMaxJours: entree.classement.ageSourceMaxJours,
      dateReference: entree.dateReference,
    },
    portee: { ...PORTEE_R1_PAR_DEFAUT, ...entree.porteeR1 },
    candidatsParId: new Map(entree.candidats.map((candidat) => [candidat.id, candidat])),
  };
}

/** Source affichée d'un candidat : la première source `https:` valide (R1), libellée par son domaine. */
export function sourceDe(candidat: { sources: readonly { url: string }[] }): Source | undefined {
  const source = candidat.sources.find((entree) => urlSourceValide(entree.url));
  return source === undefined ? undefined : { label: new URL(source.url).hostname, url: source.url };
}

export function lieuValide(relectures: Relectures, placeId: string | undefined): placeId is string {
  return placeId !== undefined && relectures.validite(placeId) === "valide";
}

function etiquette(nuits: readonly Nuit[], index: number): string {
  const nuit = element(nuits, index) ?? nuits.at(0);
  if (nuit === undefined) throw new RangeError("moteur : un voyage sans logement n'entre pas dans le moteur (B5-PO-7)");
  return nuit.etiquette;
}

// --- Événements et idée du jour (B5-PO-16) --------------------------------------------------------------------

/**
 * Événements retenus pour une date : date dans le séjour, heure lue sur la page, et R1 (source `https:` ; lieu
 * valide, ou sans lieu si la portée l'admet). Un événement écarté ne laisse aucune trace. Ordre de l'entrée.
 */
export function evenementsDuJour(
  date: string,
  evenements: readonly CandidatEvenement[],
  voyage: { start: string; end: string },
  relectures: Relectures,
  portee: PorteeR1 = PORTEE_R1_PAR_DEFAUT,
): CandidatEvenement[] {
  return evenements.filter((evenement) => {
    const info = evenement.evenement;
    if (info.date !== date || info.heure === undefined) return false;
    if (info.date < voyage.start || info.date > voyage.end) return false;
    if (sourceDe(evenement) === undefined) return false;
    return evenement.placeId === undefined ? portee.evenementsSansLieu === "admis" : lieuValide(relectures, evenement.placeId);
  });
}

/**
 * Idée « Surprends-moi » d'un jour (B5-PO-16) : la première, dans l'ordre du classement (type `surprise`, trajet
 * mesuré depuis le logement du soir), des candidats d'idée qui satisfont R1 (`placeId` valide, au moins une source
 * `https:`), qui ont une raison et qui ne sont pas déjà utilisés (identifiant ou lieu) ; sinon aucune idée.
 */
export function ideeDuJour(
  idees: readonly CandidatIdee[],
  options: {
    logement: number;
    relectures: Relectures;
    trajet: Trajet;
    parametres: ParametresClassement;
    exclus: { ids: ReadonlySet<string>; lieux: ReadonlySet<string> };
  },
): CandidatIdee | undefined {
  const admissibles = idees.filter(
    (idee) =>
      idee.raison.trim() !== "" &&
      lieuValide(options.relectures, idee.placeId) &&
      sourceDe(idee) !== undefined &&
      !options.exclus.ids.has(idee.id) &&
      !options.exclus.lieux.has(idee.placeId),
  );
  const logement: Point = { logement: options.logement };
  return classer(
    admissibles,
    "surprise",
    (idee) => (idee.placeId === undefined ? undefined : options.trajet(logement, { lieu: idee.placeId })?.minutes),
    options.parametres,
  ).at(0);
}

// --- Construction d'un jour (sortie d'écriture) ------------------------------------------------------------

type JourConstruit = {
  jour: DaySnapshot;
  /** Étape nouvelle → candidat de la réserve (réparation, R7). */
  candidatDe: Map<string, string>;
  /** Étapes fixes (engagements, étapes gardées). */
  fixes: Set<string>;
};

/** Étape fixe sans identifiant : champs repris un par un (le reste d'objet déstructuré est refusé, revue de #180). */
export function sansIdentifiant(stop: StopSnapshot): BlocFixe["stop"] {
  return {
    kind: stop.kind,
    ...(stop.placeId === undefined ? {} : { placeId: stop.placeId }),
    name: stop.name,
    start: stop.start,
    ...(stop.end === undefined ? {} : { end: stop.end }),
    facts: stop.facts,
    ...(stop.reason === undefined ? {} : { reason: stop.reason }),
    ...(stop.source === undefined ? {} : { source: stop.source }),
    exceptions: stop.exceptions,
    locked: stop.locked,
    ...(stop.commitment === undefined ? {} : { commitment: stop.commitment }),
  };
}

function construireJour(squeletteDuJour: JourSquelette, plan: ResultatJour, contexte: Contexte): JourConstruit {
  const { entree } = contexte;
  const { configuration } = entree;
  const index = squeletteDuJour.index;
  const items: DayLineItemSnapshot[] = [
    { type: "terminus", role: "start", time: versHeure(squeletteDuJour.debut), label: etiquette(entree.nuits, squeletteDuJour.logementDepart) },
  ];
  const candidatDe = new Map<string, string>();
  const fixes = new Set<string>();
  let fin = squeletteDuJour.debut;
  let rang = 0;

  /** Temps libre avant un élément (B5-PO-9), règle partagée avec les patches (`journee.ts`). */
  const libreAvant = (debut: number, trajet: number | undefined) => {
    const libre = tempsLibreAvant(fin, debut, trajet, configuration);
    if (libre !== undefined) items.push(libre);
  };

  for (const element of plan.elements) {
    switch (element.genre) {
      case "candidat": {
        const etape = element.etape;
        const candidat = contexte.candidatsParId.get(etape.candidatId);
        const source = candidat === undefined ? undefined : sourceDe(candidat);
        if (candidat === undefined || source === undefined) throw new Error("moteur : candidat planifié inconnu");
        libreAvant(etape.debut, etape.trajetAvant);
        items.push({ type: "segment", segment: { mode: etape.modeAvant, estimated: etape.estimeeAvant } });
        rang += 1;
        const id = identifiantEtape(entree.version, index, "etape", rang);
        items.push({
          type: "stop",
          stop: {
            id,
            kind: etape.creneau === "meal" ? "meal" : "activity",
            placeId: etape.placeId,
            name: candidat.nom,
            start: versHeure(etape.debut),
            end: versHeure(etape.fin),
            facts: { ...candidat.faits, durationMinutes: etape.fin - etape.debut },
            source,
            exceptions: candidat.aReserver ? ["toReserve"] : [],
            locked: false,
          },
        });
        candidatDe.set(id, candidat.id);
        fin = etape.fin;
        break;
      }
      case "fixe": {
        const { bloc } = element;
        libreAvant(bloc.debut, element.trajetAvant?.minutes);
        if (element.trajetAvant !== undefined) {
          items.push({ type: "segment", segment: { mode: element.trajetAvant.mode, estimated: element.trajetAvant.estimee } });
        }
        rang += 1;
        const id = bloc.id ?? identifiantEtape(entree.version, index, "etape", rang);
        items.push({ type: "stop", stop: { id, ...bloc.stop } });
        fixes.add(id);
        fin = Math.max(fin, bloc.fin);
        break;
      }
      case "repasLibre":
        libreAvant(element.debut, undefined);
        items.push({ type: "openMeal", time: versHeure(element.debut), meal: element.repas });
        fin = element.fin;
        break;
    }
  }

  const arrivee: Point = { logement: squeletteDuJour.logementArrivee };
  const derniere = [...plan.elements].reverse().find((element) => element.genre !== "repasLibre");
  const position: Point =
    derniere === undefined
      ? { logement: squeletteDuJour.logementDepart }
      : derniere.genre === "candidat"
        ? { lieu: derniere.etape.placeId }
        : derniere.bloc.stop.placeId === undefined
          ? { logement: squeletteDuJour.logementDepart }
          : { lieu: derniere.bloc.stop.placeId };
  // Retour au logement et terminus `end` : règle partagée avec les patches (`journee.ts`).
  items.push(...finDuJour({ position, arrivee, fin, retour: () => plan.retour, label: etiquette(entree.nuits, squeletteDuJour.logementArrivee) }).items);

  return {
    jour: { index, date: squeletteDuJour.date, items, events: [], travelBudgetMinutes: squeletteDuJour.budgetTrajet },
    candidatDe,
    fixes,
  };
}

/**
 * Jour non planifié (B9-PO-6 ; 0081 § B9-TL-13) : terminus `start` au logement de départ à l'heure de début du
 * squelette, terminus `end` au logement d'arrivée à sa fin, sans étape, sans trajet, sans événement ni idée.
 * Aucune relecture n'est lue pour ce jour.
 */
function jourNonPlanifie(squeletteDuJour: JourSquelette, nuits: readonly Nuit[]): DaySnapshot {
  const fin = Math.min(DERNIERE_HEURE, Math.max(squeletteDuJour.debut, squeletteDuJour.fin));
  return {
    index: squeletteDuJour.index,
    date: squeletteDuJour.date,
    items: [
      { type: "terminus", role: "start", time: versHeure(squeletteDuJour.debut), label: etiquette(nuits, squeletteDuJour.logementDepart) },
      { type: "terminus", role: "end", time: versHeure(fin), label: etiquette(nuits, squeletteDuJour.logementArrivee) },
    ],
    events: [],
    travelBudgetMinutes: squeletteDuJour.budgetTrajet,
  };
}

function etapeEvenement(evenement: CandidatEvenement, id: string): StopSnapshot {
  const source = sourceDe(evenement);
  return {
    id,
    kind: "event",
    ...(evenement.placeId === undefined ? {} : { placeId: evenement.placeId }),
    name: evenement.nom,
    start: evenement.evenement.heure ?? "00:00",
    facts: evenement.faits,
    ...(source === undefined ? {} : { source }),
    exceptions: [...(evenement.aReserver ? (["toReserve"] as const) : []), ...(evenement.evenement.dateRelue ? [] : (["unconfirmed"] as const))],
    locked: false,
  };
}

function ideeEcrite(idee: CandidatIdee, id: string): SurpriseIdeaSnapshot {
  const source = sourceDe(idee);
  if (source === undefined || idee.placeId === undefined) throw new Error("moteur : idée sans source ni lieu");
  return { id, placeId: idee.placeId, name: idee.nom, facts: idee.faits, reason: idee.raison, source };
}

// --- Validation et réparation ------------------------------------------------------------------------------

/** États de choix de la validation (R7) : par étape existante, puis par étape nouvelle depuis son candidat. */
function choixDesEtapes(construits: readonly JourConstruit[], choix: ReadonlyMap<string, EtatChoix>): Map<string, EtatChoix> {
  const resultat = new Map(choix);
  for (const construit of construits) {
    for (const [etape, candidat] of construit.candidatDe) {
      const etat = choix.get(candidat);
      if (etat !== undefined) resultat.set(etape, etat);
    }
  }
  return resultat;
}

function contexteValidation(contexte: Contexte, construits: readonly JourConstruit[], base?: readonly DaySnapshot[]): ContexteValidation {
  const { entree } = contexte;
  const nonRelus = new Set<string>();
  for (const construit of construits) {
    for (const evenement of construit.jour.events) {
      if (evenement.exceptions.includes("unconfirmed")) nonRelus.add(evenement.id);
    }
  }
  return {
    voyage: { start: entree.voyage.start, end: entree.voyage.end },
    pace: entree.brief.pace,
    configuration: entree.configuration,
    relectures: entree.relectures,
    modes: contexte.modes,
    nuits: entree.nuits,
    evenementsNonRelus: nonRelus,
    choix: choixDesEtapes(construits, entree.choix),
    porteeR1: contexte.portee,
    ...(base === undefined ? {} : { base }),
  };
}

/**
 * Candidat à écarter pour une entrée bloquante : celui de l'étape en cause ; pour une étape fixe, le candidat qui la
 * précède dans le jour (une étape fixe ne bouge jamais, R3 prime) ; pour une entrée de jour, le dernier candidat du
 * jour. `ignorer` : entrée sur une étape fixe sans candidat avant elle (rien à réparer). `undefined` : irréparable.
 */
function cibleDeReparation(entree: EntreeRapport, construit: JourConstruit): string | "ignorer" | undefined {
  const etapes = construit.jour.items.flatMap((item) => (item.type === "stop" ? [item.stop.id] : []));
  const derniereNouvelle = (avant: number) =>
    etapes
      .slice(0, avant)
      .reverse()
      .find((id) => construit.candidatDe.has(id));
  if (entree.etape !== undefined) {
    const direct = construit.candidatDe.get(entree.etape);
    if (direct !== undefined) return direct;
    if (construit.fixes.has(entree.etape)) {
      const precedente = derniereNouvelle(etapes.indexOf(entree.etape));
      return precedente === undefined ? "ignorer" : construit.candidatDe.get(precedente);
    }
  }
  const derniere = derniereNouvelle(etapes.length);
  return derniere === undefined ? undefined : construit.candidatDe.get(derniere);
}

/**
 * Planifie et construit un jour, avec réparation : tant qu'une entrée bloquante met en cause un candidat, il est
 * écarté pour ce jour et le jour est replanifié (chaque tour écarte au moins un candidat : la boucle s'arrête).
 * `utilises` n'est complété qu'au jour accepté.
 */
function planifierAvecReparation(
  squeletteDuJour: JourSquelette,
  contexte: Contexte,
  utilises: Set<string>,
  base?: readonly DaySnapshot[],
): JourConstruit | undefined {
  const { entree } = contexte;
  const exclus = new Set<string>();
  for (let tour = 0; tour <= entree.candidats.length; tour += 1) {
    const utilisesDuTour = new Set(utilises);
    const plan = planifierJour(squeletteDuJour, {
      candidats: entree.candidats,
      relectures: entree.relectures,
      trajet: contexte.trajet,
      parametres: contexte.parametres,
      configuration: entree.configuration,
      utilises: utilisesDuTour,
      repasLibres: true,
      admis: (candidat, creneau) =>
        !exclus.has(candidat.id) &&
        sourceDe(candidat) !== undefined &&
        // Repas et soirée : seulement s'ils sont choisis (B5-PO-8) ; sinon repas ouvert, soirée en temps libre.
        (creneau.type === "activity" || entree.choix.has(candidat.id)),
    });
    const construit = construireJour(squeletteDuJour, plan, contexte);
    const jours = [construit.jour];
    const rapport = validerProgramme(jours, contexteValidation(contexte, [construit], base));
    const cibles = new Set<string>();
    let irreparable = false;
    for (const entreeRapport of rapport) {
      if (!estBloquante(entreeRapport, jours)) continue;
      const cible = cibleDeReparation(entreeRapport, construit);
      if (cible === "ignorer") continue;
      if (cible === undefined || exclus.has(cible)) irreparable = true;
      else cibles.add(cible);
    }
    if (cibles.size === 0) {
      if (irreparable) return undefined;
      for (const id of utilisesDuTour) utilises.add(id);
      return construit;
    }
    for (const cible of cibles) exclus.add(cible);
  }
  return undefined;
}

// --- Entrées publiques -------------------------------------------------------------------------------------

/**
 * Génère le programme d'un voyage (version `entree.version`) : instantané validé par `TripSnapshotSchema` et rapport
 * en mémoire, ou refus `no_option` si une entrée bloquante du rapport subsiste après réparation.
 *
 * Moteur partiel (0081 § B9-TL-13) : avec `entree.jours`, seuls ces jours sont planifiés ; les autres sont rendus
 * non planifiés (B9-PO-6), sans aucune lecture des relectures pour eux. R1 à R10 s'appliquent aux jours planifiés.
 * `jours` absent : tout le voyage, comme B5.
 */
export function generer(entree: EntreeMoteur): ResultatGeneration {
  const contexte = contexteDe(entree);
  const planifies = joursAPlanifier(entree.voyage, entree.jours);
  const jours = squeletteAvecEngagements({
    voyage: { start: entree.voyage.start, end: entree.voyage.end },
    pace: entree.brief.pace,
    nombreDeNuits: entree.nuits.length,
    engagements: entree.engagements,
    configuration: entree.configuration,
    budgetTrajetReduit: entree.budgetTrajetReduit,
  });
  const aPlanifier = jours.filter((jour) => planifies.has(jour.index));

  // Programme (`items`), jour par jour : un candidat n'est retenu qu'une fois dans le voyage.
  const utilises = new Set<string>();
  const construits: JourConstruit[] = [];
  for (const jour of aPlanifier) {
    const construit = planifierAvecReparation(jour, contexte, utilises);
    if (construit === undefined) return REFUS_AUCUNE_OPTION;
    construits.push(construit);
  }

  // Événements et idée, hors du programme (B5-PO-16), une fois le programme entier connu.
  const lieuxUtilises = new Set<string>();
  for (const construit of construits) {
    for (const item of construit.jour.items) if (item.type === "stop" && item.stop.placeId !== undefined) lieuxUtilises.add(item.stop.placeId);
  }
  const idsUtilises = new Set(utilises);
  const planifiesEcrits: DaySnapshot[] = construits.map((construit, rang) => {
    const squeletteDuJour = aPlanifier.at(rang);
    if (squeletteDuJour === undefined) throw new Error("moteur : jour sans squelette");
    const index = construit.jour.index;
    const events = evenementsDuJour(construit.jour.date, entree.evenements, entree.voyage, entree.relectures, contexte.portee).map(
      (evenement, position) => etapeEvenement(evenement, identifiantEtape(entree.version, index, "evenement", position + 1)),
    );
    const idee = ideeDuJour(entree.idees, {
      logement: squeletteDuJour.logementArrivee,
      relectures: entree.relectures,
      trajet: contexte.trajet,
      parametres: contexte.parametres,
      exclus: { ids: idsUtilises, lieux: lieuxUtilises },
    });
    if (idee?.placeId !== undefined) {
      idsUtilises.add(idee.id);
      lieuxUtilises.add(idee.placeId);
    }
    const jour: DaySnapshot = {
      ...construit.jour,
      events,
      ...(idee === undefined ? {} : { surprise: ideeEcrite(idee, identifiantEtape(entree.version, index, "idee")) }),
    };
    construit.jour = jour;
    return jour;
  });

  const rapport = validerProgramme(planifiesEcrits, contexteValidation(contexte, construits));
  if (rapport.some((entreeRapport) => estBloquante(entreeRapport, planifiesEcrits))) return REFUS_AUCUNE_OPTION;
  const ecrits = new Map(planifiesEcrits.map((jour) => [jour.index, jour]));
  const days = jours.map((jour) => ecrits.get(jour.index) ?? jourNonPlanifie(jour, entree.nuits));
  return { ok: true, instantane: TripSnapshotSchema.parse({ days }), rapport };
}

/**
 * Replanifie un jour d'un instantané (B5-PO-11) : ses étapes verrouillées et ses engagements (verrouillés ou non)
 * sont des blocs fixes, gardés à l'identique avec leur identifiant, jamais remplacés par un candidat, même meilleur ;
 * les autres créneaux sont replanifiés depuis la réserve, sans reprendre un lieu déjà présent ailleurs dans le
 * voyage. Événements et idée du jour sont repris tels quels. R3 est contrôlée contre l'instantané de base.
 *
 * Jour de base non planifié (B9-PO-6 ; 0081 § B9-TL-13, voyage complet de B9d) : il est planifié comme par
 * `generer` — engagements de sa date posés et verrouillés (B5-PO-12), puis événements et idée du jour (B5-PO-16),
 * sans reprendre un lieu ni une idée déjà présents dans le voyage.
 */
export function replanifierJour(entree: EntreeMoteur, base: TripSnapshot, index: number): ResultatReplanification {
  const contexte = contexteDe(entree);
  const jourBase = base.days.find((jour) => jour.index === index);
  const nonPlanifie = jourBase !== undefined && estJourNonPlanifie(jourBase);
  const entreeSquelette = {
    voyage: { start: entree.voyage.start, end: entree.voyage.end },
    pace: entree.brief.pace,
    nombreDeNuits: entree.nuits.length,
    engagements: entree.engagements,
    configuration: entree.configuration,
    budgetTrajetReduit: entree.budgetTrajetReduit,
  };
  const squeletteDuJour = (nonPlanifie ? squeletteAvecEngagements(entreeSquelette) : squelette(entreeSquelette)).find(
    (jour) => jour.index === index,
  );
  if (jourBase === undefined || squeletteDuJour === undefined) throw new RangeError("moteur : jour hors du séjour");

  let jour: JourSquelette = squeletteDuJour;
  if (!nonPlanifie) {
    const blocs: BlocFixe[] = jourBase.items
      .flatMap((item) => (item.type === "stop" && (item.stop.locked || item.stop.commitment !== undefined) ? [item.stop] : []))
      .map((stop) => ({ id: stop.id, stop: sansIdentifiant(stop), debut: versMinutes(stop.start), fin: finOccupee(stop, entree.configuration) }))
      .sort((a, b) => a.debut - b.debut);
    jour = {
      ...squeletteDuJour,
      creneaux: retirerCreneaux(squeletteDuJour.creneaux, blocs, entree.configuration),
      fixes: blocs,
    };
  }

  // Lieux déjà présents ailleurs dans le voyage, ou gardés dans ce jour : leurs candidats ne sont pas repris.
  const lieux = new Set<string>();
  for (const autre of base.days) {
    const etapes = autre.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));
    const gardees = autre.index === index ? etapes.filter((stop) => stop.locked || stop.commitment !== undefined) : etapes;
    for (const stop of [...gardees, ...autre.events]) if (stop.placeId !== undefined) lieux.add(stop.placeId);
    if (autre.surprise?.placeId !== undefined) lieux.add(autre.surprise.placeId);
  }
  const utilises = new Set(
    entree.candidats.flatMap((candidat) => (candidat.placeId !== undefined && lieux.has(candidat.placeId) ? [candidat.id] : [])),
  );

  const construit = planifierAvecReparation(jour, contexte, utilises, base.days);
  if (construit === undefined) return REFUS_AUCUNE_OPTION;
  let ajouts: Pick<DaySnapshot, "events" | "surprise"> = {
    events: jourBase.events,
    ...(jourBase.surprise === undefined ? {} : { surprise: jourBase.surprise }),
  };
  if (nonPlanifie) {
    for (const item of construit.jour.items) if (item.type === "stop" && item.stop.placeId !== undefined) lieux.add(item.stop.placeId);
    const events = evenementsDuJour(construit.jour.date, entree.evenements, entree.voyage, entree.relectures, contexte.portee).map(
      (evenement, position) => etapeEvenement(evenement, identifiantEtape(entree.version, index, "evenement", position + 1)),
    );
    const idee = ideeDuJour(entree.idees, {
      logement: squeletteDuJour.logementArrivee,
      relectures: entree.relectures,
      trajet: contexte.trajet,
      parametres: contexte.parametres,
      exclus: { ids: utilises, lieux },
    });
    ajouts = { events, ...(idee === undefined ? {} : { surprise: ideeEcrite(idee, identifiantEtape(entree.version, index, "idee")) }) };
  }
  const resultat: DaySnapshot = { ...construit.jour, ...ajouts };
  const rapport = validerProgramme([resultat], contexteValidation(contexte, [{ ...construit, jour: resultat }], base.days));
  return { ok: true, jour: TripSnapshotSchema.parse({ days: [resultat] }).days.at(0) ?? resultat, rapport };
}
