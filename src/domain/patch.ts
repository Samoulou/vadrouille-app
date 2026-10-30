import {
  PatchResultSchema,
  TripSnapshotSchema,
  type Change,
  type DayLineItemSnapshot,
  type DaySnapshot,
  type Meal,
  type PatchResult,
  type StopSnapshot,
  type TripPatch,
  type TripPatchOperation,
  type TransferItem,
  type TripSnapshot,
} from "@/contracts";

import { budgetParPersonne, changementDeBudget } from "@/domain/calculs";
import { creneauOccupe } from "@/domain/changement-de-ville";
import type { EntreeMoteur, EtatChoix } from "@/domain/entrees";
import { modesAdmis, sourceDe } from "@/domain/generation";
import { etapesDuJour } from "@/domain/programme";
import { DERNIERE_HEURE, finDuJour, tempsLibreAvant } from "@/domain/journee";
import type { Trajet } from "@/domain/planification";
import { INCONNU, logementsDuJour, trajetLePlusRapide, type Point } from "@/domain/relectures";
import { finOccupee, repasDeLHeure, squelette, type JourSquelette } from "@/domain/squelette";
import { element, lire } from "@/domain/tables";
import { arrondi5, versHeure, versMinutes } from "@/domain/temps";
import {
  estBloquante,
  PORTEE_R1_PAR_DEFAUT,
  validerProgramme,
  type ContexteValidation,
  type EntreeRapport,
  type RapportValidation,
} from "@/domain/validation";
import { controlerVersion, type Refus } from "@/domain/version";

/**
 * Patches, versions et annulation (spécification B5c ; décisions 0037 B2-TL-3 et B2-TL-4, 0045 § 5).
 *
 * `appliquerPatch` applique un `TripPatch` à l'instantané de la version courante, **tout ou rien** (B5-PO-13) :
 * 1. R10 d'abord : `baseVersion` différente de la version courante → refus `version_conflict` avec
 *    `currentVersion`, **sans rien calculer** (aucune interface injectée n'est appelée) ;
 * 2. `revert` (PO-5, B5-PO-14) : recopie exacte de l'instantané de `toVersion`, sans replanifier ni revalider (sauf
 *    `TripSnapshotSchema`) ;
 * 3. autres opérations, dans l'ordre du tableau, sur un brouillon ; chacune peut être refusée avec un code de
 *    `REFUS_MOTEUR` ; puis replanification des **seuls jours touchés** : leurs étapes non verrouillées (engagements
 *    déverrouillés compris) peuvent changer d'heure, jamais de lieu ni de jour ; leurs étapes verrouillées ne
 *    changent pas (R3) ; l'étape visée par un `add` ou un `move` est posée à l'heure demandée ;
 * 4. validation des jours touchés (R1 à R9, R3 contre la base) : une entrée bloquante **nouvelle** (absente du
 *    rapport des mêmes jours de la base) fait refuser le patch, code `no_option` ;
 *    **verrou seul** (décision 0147 § 9, M5a) : un patch fait seulement de `lock` et d'`unlock` ne déplace rien ; ni
 *    replanification ni validation, l'instantané de sortie est la base avec `locked` basculé (R3 tient trivialement,
 *    R1 à R9 sont inchangés), et « Ce qui change » est calculé sans aucune relecture (aucun trajet ne change) ;
 * 5. sortie : instantané validé par `TripSnapshotSchema` (aucune durée, aucune date de contrôle, aucun `toConfirm`),
 *    `PatchResult` validé par `PatchResultSchema` (les `Change[segment]` n'existent que là, calculés en mémoire à la
 *    réponse) et rapport de validation en mémoire.
 *
 * Aucun refus n'écrit quoi que ce soit, et aucune entrée (instantané de base, patch) n'est modifiée : le patch reçu
 * est celui que le serveur écrit, tel quel (0037 B2-TL-3). Fonction pure : même entrée, même sortie.
 */

/** Entrée d'un patch : celle du moteur (sans `version`, dérivée du patch), plus la version courante et l'historique. */
export type EntreePatch = {
  moteur: Omit<EntreeMoteur, "version">;
  patch: TripPatch;
  /** Version courante du voyage (lue sous le verrou de `trips` par le serveur, B11). */
  versionCourante: number;
  /** Instantané de la version courante. */
  base: TripSnapshot;
  /** Instantanés des versions antérieures, par numéro (`revert`). Seule `toVersion` est lue. */
  versionsAnterieures?: ReadonlyMap<number, TripSnapshot>;
  /**
   * Identifiants des étapes ajoutées par la personne dans les versions précédentes (R1 selon B5-PO-4, R7 selon
   * B5-PO-8). Depuis la décision 0147 § 6.1, le moteur y ajoute lui-même les étapes de la base marquées
   * `addedBy: "person"` (le serveur n'a plus à relire l'historique) ; le paramètre reste pour `mock` et les tests. Ceux
   * du patch courant s'y ajoutent.
   */
  ajouts?: ReadonlySet<string>;
};

export type ResultatPatch =
  | { ok: true; instantane: TripSnapshot; resultat: PatchResult; rapport: RapportValidation }
  | Refus;

const refus = <C extends Exclude<Refus["code"], "version_conflict">>(code: C) => ({ ok: false, code }) as const;

// --- Brouillon -------------------------------------------------------------------------------------------------

/**
 * Ligne d'un jour : une étape (fixe si l'opération l'a posée à une heure demandée), un repas ouvert, ou un changement de
 * ville (`transfer`, toujours fixe, jamais visé par une opération : il n'a pas d'identifiant).
 */
type Ligne =
  | { genre: "etape"; stop: StopSnapshot; fixe: boolean }
  | { genre: "repas"; time: string; meal: Meal }
  | { genre: "changement"; item: TransferItem };

type JourBrouillon = { origine: DaySnapshot; lignes: Ligne[] };

/** Changement visé par une opération (B5-PO-15) : heure finale lue après replanification. */
type Cible =
  | { type: "replaced"; id: string; avant: string; /** Étape remplacée (trajet vers le même créneau). */ remplacee: string }
  | { type: "added"; id: string }
  | { type: "moved"; id: string; avant: { day: number; time: string } };

/**
 * Lignes d'un jour. Un changement de ville (`transfer`, décision 0148 § 1) est une ligne **fixe** : sans identifiant, aucun
 * patch ne le vise, et `replanifierHoraires` le pose à son heure avec son créneau occupé (`creneauOccupe`, 0151 § 5).
 */
function lignesDe(jour: DaySnapshot): Ligne[] {
  return jour.items.flatMap((item): Ligne[] => {
    if (item.type === "stop") return [{ genre: "etape", stop: item.stop, fixe: false }];
    if (item.type === "openMeal") return [{ genre: "repas", time: item.time, meal: item.meal }];
    if (item.type === "transfer") return [{ genre: "changement", item }];
    return [];
  });
}

function trouver(jours: readonly JourBrouillon[], stopId: string): { jour: JourBrouillon; rang: number; stop: StopSnapshot } | undefined {
  for (const jour of jours) {
    const rang = jour.lignes.findIndex((ligne) => ligne.genre === "etape" && ligne.stop.id === stopId);
    const ligne = jour.lignes.at(rang);
    if (rang >= 0 && ligne?.genre === "etape") return { jour, rang, stop: ligne.stop };
  }
  return undefined;
}

function identifiantPris(jours: readonly JourBrouillon[], id: string): boolean {
  return jours.some(
    (jour) =>
      jour.lignes.some((ligne) => ligne.genre === "etape" && ligne.stop.id === id) ||
      jour.origine.events.some((evenement) => evenement.id === id) ||
      jour.origine.surprise?.id === id,
  );
}

/** Un repas posé à une heure prend la place du repas ouvert de la même fenêtre dans ce jour (B5-PO-8). */
function retirerRepasOuvert(jour: JourBrouillon, stop: StopSnapshot, configuration: EntreeMoteur["configuration"]): void {
  if (stop.kind !== "meal") return;
  const repas = repasDeLHeure(versMinutes(stop.start), configuration);
  if (repas === undefined) return;
  jour.lignes = jour.lignes.filter((ligne) => !(ligne.genre === "repas" && ligne.meal === repas));
}

/** Heure « HH:MM » d'un nombre de minutes, ou `undefined` au-delà de la dernière heure écrite. */
function heureSure(minutes: number): string | undefined {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= DERNIERE_HEURE ? versHeure(minutes) : undefined;
}

// --- Replanification d'un jour touché (B5-PO-13) -------------------------------------------------------------

type ContextePatch = {
  moteur: Omit<EntreeMoteur, "version">;
  trajet: Trajet;
  squelettes: ReadonlyMap<number, JourSquelette>;
};

/**
 * Jour portant un `transfer` touché **seulement** par `lock` / `unlock` (décision 0151 § 5 point 3) : rien ne bouge, le
 * jour est recopié tel quel avec les nouveaux verrous, `transfer` compris, sans replanification ; jamais `no_option`.
 * Toute autre opération sur ce jour (lignes ajoutées, retirées, déplacées ou remplacées) : `undefined`, et le jour est
 * replanifié par la règle du changement de ville (`replanifierHoraires`).
 */
function verrousSeulement(jour: JourBrouillon): DaySnapshot | undefined {
  const sansVerrou = (lignes: readonly Ligne[]) =>
    JSON.stringify(lignes.map((ligne) => (ligne.genre === "etape" ? { ...ligne, stop: { ...ligne.stop, locked: false } } : ligne)));
  if (sansVerrou(jour.lignes) !== sansVerrou(lignesDe(jour.origine))) return undefined;
  const verrous = new Map(jour.lignes.flatMap((ligne) => (ligne.genre === "etape" ? [[ligne.stop.id, ligne.stop.locked] as const] : [])));
  return {
    ...jour.origine,
    items: jour.origine.items.map((item) => {
      const locked = item.type === "stop" ? verrous.get(item.stop.id) : undefined;
      return item.type === "stop" && locked !== undefined ? { ...item, stop: { ...item.stop, locked } } : item;
    }),
  };
}

/**
 * Replanifie les heures d'un jour touché. Les étapes verrouillées et l'étape posée par l'opération (`fixe`) gardent
 * leur heure ; les autres lignes (étapes non verrouillées, repas ouverts) gardent leur ordre et leur heure si elles
 * tiennent, sinon elles sont décalées au plus tôt après la précédente (trajet le plus rapide et marge, grille de
 * 5 min), et passent après une étape fixe avant laquelle elles ne tiennent plus. Le temps libre, les trajets et le
 * terminus de fin sont réécrits comme à la génération. `undefined` : le jour ne peut pas être replanifié (trajet
 * inconnu vers une étape à décaler, chevauchement avec une étape fixe, fin du jour dépassée, changement de ville).
 *
 * Changement de ville (`transfer`, décision 0151 § 5, qui remplace la règle provisoire `no_option` de M4-C) : un patch
 * fait seulement de `lock` / `unlock` recopie le jour (`verrousSeulement`). Sinon le `transfer` est une ligne **fixe**,
 * jamais réécrite ni déplacée, qui occupe son créneau (`creneauOccupe` de `changement-de-ville.ts`, 0148 § 5.3) : une
 * ligne qui commence avant son départ doit finir (fin occupée) avant lui, sans quoi le jour n'est pas replanifiable
 * (`undefined`, refus `no_option`) — une étape ne passe jamais d'une ville à l'autre ; aucune ligne ne commence dans le
 * créneau ; la première étape après l'arrivée n'a pas de trajet avant elle (spécification M4 § 7.3) et le temps libre
 * avant le départ suit la règle de tous les jours. Les marges de M4-suite § 3.3 s'y ajouteront.
 */
function replanifierHoraires(jour: JourBrouillon, contexte: ContextePatch): DaySnapshot | undefined {
  if (jour.origine.items.some((item) => item.type === "transfer")) {
    const copie = verrousSeulement(jour);
    if (copie !== undefined) return copie;
  }
  const { configuration, nuits } = contexte.moteur;
  const marge = configuration.margeMinutes;
  const origine = jour.origine;
  const index = origine.index;
  const bornes = contexte.squelettes.get(index);
  if (bornes === undefined) return undefined;
  const logements = logementsDuJour(index - 1, nuits.length);
  const arrivee: Point = { logement: logements.arrivee };
  const premier = origine.items.at(0);
  const dernier = origine.items.at(-1);
  const etiquetteDe = (nuit: number) => element(nuits, nuit)?.etiquette ?? nuits.at(0)?.etiquette ?? "";
  const debutJour = premier?.type === "terminus" && premier.role === "start" ? versMinutes(premier.time) : bornes.debut;
  const labelDebut = premier?.type === "terminus" && premier.role === "start" ? premier.label : etiquetteDe(logements.depart);
  const finBase = dernier?.type === "terminus" && dernier.role === "end" ? versMinutes(dernier.time) : bornes.fin;
  const labelFin = dernier?.type === "terminus" && dernier.role === "end" ? dernier.label : etiquetteDe(logements.arrivee);

  const debutDe = (ligne: Ligne) => versMinutes(ligne.genre === "etape" ? ligne.stop.start : ligne.genre === "repas" ? ligne.time : ligne.item.start);
  const parDebut = (a: Ligne, b: Ligne) => debutDe(a) - debutDe(b);
  const estFixe = (ligne: Ligne) => ligne.genre === "changement" || (ligne.genre === "etape" && (ligne.stop.locked || ligne.fixe));
  const fixes = jour.lignes.filter(estFixe).sort(parDebut);
  const mobiles = jour.lignes.filter((ligne) => !estFixe(ligne)).sort(parDebut);

  const items: DayLineItemSnapshot[] = [{ type: "terminus", role: "start", time: versHeure(debutJour), label: labelDebut }];
  let fin = debutJour;
  let position: Point = { logement: logements.depart };
  /** L'élément précédent est-il verrouillé ? Le début du jour compte comme tel (un conflit entre verrous ne bloque pas, B5-PO-6). */
  let precedentVerrouille = true;
  let dernierVerrouille = false;
  /** Juste après un changement de ville : la prochaine étape n'a pas de trajet avant elle (spécification M4 § 7.3). */
  let apresChangement = false;

  /** Temps libre avant un élément (B5-PO-9), même règle que la génération (`journee.ts`). */
  const libreAvant = (debut: number, trajet: number | undefined) => {
    const libre = tempsLibreAvant(fin, debut, trajet, configuration);
    if (libre !== undefined) items.push(libre);
  };

  /** Pose une étape à `debut` ; `false` si une heure dépasse la journée. */
  const poserEtape = (stop: StopSnapshot, debut: number, trajet: ReturnType<Trajet>): boolean => {
    const decalage = debut - versMinutes(stop.start);
    const finEcrite = stop.end === undefined ? undefined : heureSure(versMinutes(stop.end) + decalage);
    const start = heureSure(debut);
    const occupee = finOccupee(stop, configuration) + decalage;
    if (start === undefined || (stop.end !== undefined && finEcrite === undefined) || occupee > DERNIERE_HEURE) return false;
    libreAvant(debut, trajet?.minutes);
    if (trajet !== undefined) items.push({ type: "segment", segment: { mode: trajet.mode, estimated: trajet.estimee } });
    const ecrite: StopSnapshot = decalage === 0 ? stop : { ...stop, start, ...(finEcrite === undefined ? {} : { end: finEcrite }) };
    items.push({ type: "stop", stop: ecrite });
    fin = Math.max(fin, occupee);
    if (stop.placeId !== undefined) position = { lieu: stop.placeId };
    apresChangement = false;
    precedentVerrouille = stop.locked;
    dernierVerrouille = stop.locked;
    return true;
  };

  /**
   * Changement de ville : à son départ, jamais déplacé ; refusé si la ligne précédente finit après le départ. Après lui, la
   * position est le logement d'arrivée (aucun trajet d'une ville à l'autre) et l'instant, la fin de son créneau occupé.
   */
  const poserChangement = (item: TransferItem): boolean => {
    const creneau = creneauOccupe(item, configuration);
    if (creneau.debut < fin) return false;
    libreAvant(creneau.debut, undefined);
    items.push(item);
    fin = creneau.fin;
    position = arrivee;
    apresChangement = true;
    // Le créneau occupé n'est jamais partagé, même avec une étape verrouillée (au contraire de deux verrous, B5-PO-6).
    precedentVerrouille = false;
    dernierVerrouille = false;
    return true;
  };

  /** Étape fixe : à son heure ; refusée si elle chevauche la précédente, sauf entre deux étapes verrouillées. */
  const poserFixe = (ligne: Ligne): boolean => {
    if (ligne.genre === "changement") return poserChangement(ligne.item);
    if (ligne.genre !== "etape") return false;
    const { stop } = ligne;
    const debut = versMinutes(stop.start);
    const trajet = stop.placeId === undefined || apresChangement ? undefined : contexte.trajet(position, { lieu: stop.placeId });
    const auPlusTot = fin + (trajet === undefined ? 0 : trajet.minutes + marge);
    if (debut < auPlusTot && !(precedentVerrouille && stop.locked)) return false;
    return poserEtape(stop, debut, trajet);
  };

  /** Fin occupée d'une ligne mobile posée à `debut`, et son lieu (un changement de ville n'est jamais mobile). */
  const occupation = (ligne: Ligne, debut: number): { fin: number; lieu?: string } =>
    ligne.genre === "repas"
      ? { fin: debut + lire(configuration.dureesParDefaut, ligne.meal) }
      : ligne.genre === "changement"
        ? { fin: creneauOccupe(ligne.item, configuration).fin }
        : {
            fin: finOccupee(ligne.stop, configuration) + debut - versMinutes(ligne.stop.start),
            ...(ligne.stop.placeId === undefined ? {} : { lieu: ligne.stop.placeId }),
          };

  for (const ligne of mobiles) {
    if (ligne.genre === "changement") return undefined;
    // Les étapes fixes qui commencent avant cette ligne passent d'abord.
    while (fixes.length > 0 && debutDe(fixes.at(0) ?? ligne) <= debutDe(ligne)) {
      const fixe = fixes.shift();
      if (fixe === undefined || !poserFixe(fixe)) return undefined;
    }
    for (;;) {
      const lieu = ligne.genre === "etape" ? ligne.stop.placeId : undefined;
      const trajet = lieu === undefined || apresChangement ? undefined : contexte.trajet(position, { lieu });
      // Trajet sans durée connue vers une étape à planifier : non planifiable (B5-PO-6) ; juste après un changement de
      // ville, aucun trajet n'est compté (spécification M4 § 7.3).
      if (lieu !== undefined && trajet === undefined && !apresChangement) return undefined;
      const auPlusTot = arrondi5(fin + (trajet === undefined ? 0 : trajet.minutes) + marge);
      const debut = Math.max(debutDe(ligne), auPlusTot);
      const occupee = occupation(ligne, debut);
      const prochain = fixes.at(0);
      const lieuProchain = prochain?.genre === "etape" ? prochain.stop.placeId : undefined;
      const versProchain =
        occupee.lieu === undefined || lieuProchain === undefined ? undefined : contexte.trajet({ lieu: occupee.lieu }, { lieu: lieuProchain });
      const tient =
        prochain === undefined ||
        occupee.fin + (versProchain === undefined ? 0 : versProchain.minutes + marge) <= debutDe(prochain);
      if (tient) {
        if (ligne.genre === "repas") {
          const time = heureSure(debut);
          if (time === undefined || occupee.fin > DERNIERE_HEURE) return undefined;
          libreAvant(debut, undefined);
          items.push({ type: "openMeal", time, meal: ligne.meal });
          fin = Math.max(fin, occupee.fin);
          precedentVerrouille = false;
          dernierVerrouille = false;
          // `apresChangement` reste vrai (choix voulu, R8) : un repas ouvert n'a pas de lieu, la position reste le logement
          // d'arrivée et la première **étape** après le changement de ville n'a toujours pas de trajet avant elle (M4 § 7.3).
        } else if (!poserEtape(ligne.stop, debut, trajet)) {
          return undefined;
        }
        break;
      }
      // La ligne ne tient plus avant la prochaine étape fixe : celle-ci passe d'abord, la ligne est retentée après. Jamais
      // à travers un changement de ville : une ligne de la ville quittée ne passe pas dans la ville d'arrivée (0151 § 5).
      if (prochain.genre === "changement") return undefined;
      fixes.shift();
      if (!poserFixe(prochain)) return undefined;
    }
  }
  for (const fixe of fixes) if (!poserFixe(fixe)) return undefined;

  // Retour au logement et terminus `end` : même règle que la génération (`journee.ts`).
  const finale = finDuJour({ position, arrivee, fin, retour: () => contexte.trajet(position, arrivee), label: labelFin });
  // Fin du jour : dans la fenêtre du squelette (ou la fin déjà écrite dans la base), sauf derrière une étape verrouillée (R3 prime).
  if (arrondi5(finale.finJour) > Math.max(bornes.fin, finBase) && !dernierVerrouille) return undefined;
  items.push(...finale.items);

  return {
    index,
    date: origine.date,
    items,
    events: origine.events,
    travelBudgetMinutes: origine.travelBudgetMinutes,
    ...(origine.surprise === undefined ? {} : { surprise: origine.surprise }),
    // Titre libre du jour (décision 0116 § 6) : une révision le garde.
    ...(origine.theme === undefined ? {} : { theme: origine.theme }),
  };
}

// --- Ce qui change (B5-PO-15) ----------------------------------------------------------------------------------

/**
 * Trajets d'un jour : minutes du mode le plus rapide vers chaque étape, et retour au logement, en mémoire. Un
 * changement de ville (`transfer`, décision 0148 § 1 point 3) coupe la ligne : aucun trajet vers la première étape
 * après lui (spécification M4 § 7.3), ni retour au logement s'il n'est suivi d'aucune étape avec lieu.
 */
type TrajetsDuJour = { versEtape: Map<string, { minutes: number; estimee: boolean }>; retour?: { minutes: number; estimee: boolean } };

function trajetsDuJour(jour: DaySnapshot, contexte: ContextePatch): TrajetsDuJour {
  const { nuits, relectures } = contexte.moteur;
  const modes = modesAdmis(contexte.moteur.brief.mobility);
  const logements = logementsDuJour(jour.index - 1, nuits.length);
  const versEtape: TrajetsDuJour["versEtape"] = new Map();
  let position: Point | undefined = { logement: logements.depart };
  for (const item of jour.items) {
    if (item.type === "transfer") {
      position = undefined;
      continue;
    }
    if (item.type !== "stop") continue;
    const { id, placeId } = item.stop;
    if (placeId === undefined) continue;
    const trajet = position === undefined ? INCONNU : trajetLePlusRapide(relectures, position, { lieu: placeId }, modes);
    if (trajet !== INCONNU) versEtape.set(id, { minutes: trajet.minutes, estimee: trajet.estimee });
    position = { lieu: placeId };
  }
  if (position === undefined) return { versEtape };
  const retour = trajetLePlusRapide(relectures, position, { logement: logements.arrivee }, modes);
  return retour === INCONNU ? { versEtape } : { versEtape, retour: { minutes: retour.minutes, estimee: retour.estimee } };
}

function etapesSituees(jours: readonly DaySnapshot[]): Map<string, { jour: number; stop: StopSnapshot }> {
  return new Map(jours.flatMap((jour) => etapesDuJour(jour).map((stop) => [stop.id, { jour: jour.index, stop }] as const)));
}

/**
 * Identité d'une étape pour « Ce qui change » (décision 0147 § 5.2 point 1) : l'identifiant, le `placeId` et le nom.
 * Depuis M1b, un identifiant `j<jour>-<rang>` est réutilisé d'une version à l'autre (0142 § 5.1) : une étape de même
 * `id` mais d'autre lieu ou d'autre nom n'est pas la même étape (`removed` puis `added`, jamais `moved`). Reprise par la
 * liste « À faire » (`lignesApresVersion`, `src/domain/a-faire.ts`, 0147 § 7.2 point 1).
 */
export function identite(stop: Pick<StopSnapshot, "id" | "placeId" | "name">): string {
  return JSON.stringify([stop.id, stop.placeId ?? null, stop.name]);
}

function etapesParIdentite(jours: readonly DaySnapshot[]): Map<string, { jour: number; stop: StopSnapshot }> {
  return new Map(jours.flatMap((jour) => etapesDuJour(jour).map((stop) => [identite(stop), { jour: jour.index, stop }] as const)));
}

/** Verrou posé ou retiré entre deux états de la même étape (0147 § 5.2 point 3), ou rien. */
function changementDeVerrou(avant: StopSnapshot, apres: StopSnapshot): Change | undefined {
  if (avant.locked === apres.locked) return undefined;
  return { type: apres.locked ? "locked" : "unlocked", label: apres.name, time: apres.start };
}

/**
 * Changements d'un patch (B5-PO-15, F7-PO-6 ; complétés par la décision 0147 § 5.2) : d'abord ceux des étapes visées
 * (`replaced`, `added`, `moved`, forme de 0016 § 4.5, `moved` suivi de `locked` ou `unlocked` si le verrou change
 * aussi), puis, jour touché par jour touché : `removed` pour une étape de la version de départ dont l'identité
 * (`identite` : `id`, `placeId`, nom) n'existe dans **aucun** jour de la version d'arrivée, sauf l'ancienne étape d'un
 * remplacement, déjà nommée par `replaced` (bloquant 1 de la revue de 0147) ; `moved` pour une autre étape dont l'heure
 * ou le jour change (décalage de la replanification ; pour `revert`, étape qui revient ailleurs), suivi de `locked` ou
 * `unlocked` si son verrou change aussi ; `added` pour une étape qui apparaît sans être visée (`revert`, ou étape de
 * même identifiant mais d'autre lieu ou d'autre nom) ; `segment` pour chaque trajet dont la durée change ; `budget`
 * (B5-PO-10) ; enfin `locked` ou `unlocked` à la place d'`unchanged` pour une étape qui garde son lieu et son heure mais
 * pas son verrou, et `unchanged` pour les autres, verrouillées comprises. Les lignes `checklist` ne viennent jamais
 * d'ici (0147 § 5.2 point 4). Noms maison seulement (`Stop.name`).
 */
function changements(
  base: readonly DaySnapshot[],
  apres: readonly DaySnapshot[],
  joursTouches: readonly number[],
  cibles: readonly Cible[],
  contexte: ContextePatch,
): Change[] {
  const avant = etapesParIdentite(base);
  const avantParId = etapesSituees(base);
  const ensuite = etapesSituees(apres);
  const identitesEnsuite = new Set(etapesParIdentite(apres).keys());
  const visees = new Set(cibles.map((cible) => cible.id));
  const remplaceDe = new Map(cibles.flatMap((cible) => (cible.type === "replaced" ? [[cible.id, cible.remplacee] as const] : [])));
  /** Anciennes étapes des remplacements : jamais `removed`, le `replaced` les nomme déjà (0147 § 5.2 point 2). */
  const remplacees = new Set(remplaceDe.values());
  const resultat: Change[] = [];

  for (const cible of cibles) {
    const situee = ensuite.get(cible.id);
    if (situee === undefined) continue;
    const { stop, jour } = situee;
    switch (cible.type) {
      case "replaced":
        resultat.push({ type: "replaced", time: stop.start, before: cible.avant, after: stop.name });
        break;
      case "added":
        resultat.push({ type: "added", time: stop.start, label: stop.name });
        break;
      case "moved": {
        resultat.push({ type: "moved", label: stop.name, before: cible.avant, after: { day: jour, time: stop.start } });
        const precedente = avantParId.get(cible.id);
        const verrou = precedente === undefined ? undefined : changementDeVerrou(precedente.stop, stop);
        if (verrou !== undefined) resultat.push(verrou);
        break;
      }
    }
  }

  const lignesFinales: Change[] = [];
  for (const index of joursTouches) {
    const jourApres = apres.find((jour) => jour.index === index);
    const jourBase = base.find((jour) => jour.index === index);
    if (jourBase !== undefined) {
      for (const stop of etapesDuJour(jourBase)) {
        if (remplacees.has(stop.id) || identitesEnsuite.has(identite(stop))) continue;
        resultat.push({ type: "removed", label: stop.name, before: { day: index, time: stop.start } });
      }
    }
    if (jourApres === undefined) continue;
    const gardees: Change[] = [];
    for (const stop of etapesDuJour(jourApres)) {
      if (visees.has(stop.id)) continue;
      const precedente = avant.get(identite(stop));
      if (precedente === undefined) {
        resultat.push({ type: "added", time: stop.start, label: stop.name });
        continue;
      }
      const verrou = changementDeVerrou(precedente.stop, stop);
      if (precedente.jour === index && precedente.stop.start === stop.start) {
        // Même lieu, même heure : `locked` ou `unlocked` à la place d'`unchanged` si seul le verrou change.
        if (verrou !== undefined) resultat.push(verrou);
        else gardees.push({ type: "unchanged", label: stop.name, time: stop.start });
      } else {
        resultat.push({
          type: "moved",
          label: stop.name,
          before: { day: precedente.jour, time: precedente.stop.start },
          after: { day: index, time: stop.start },
        });
        if (verrou !== undefined) resultat.push(verrou);
      }
    }
    if (jourBase !== undefined) {
      const trajetsAvant = trajetsDuJour(jourBase, contexte);
      const trajetsApres = trajetsDuJour(jourApres, contexte);
      for (const stop of etapesDuJour(jourApres)) {
        const apresTrajet = trajetsApres.versEtape.get(stop.id);
        // Trajet comparé à celui de la même étape (même identité) ou de l'étape remplacée, jamais d'une autre étape de
        // même identifiant (identifiant réutilisé, 0147 § 5.2 point 1).
        const remplacee = remplaceDe.get(stop.id);
        const memeEtape = avant.has(identite(stop));
        const avantTrajet = remplacee !== undefined ? trajetsAvant.versEtape.get(remplacee) : memeEtape ? trajetsAvant.versEtape.get(stop.id) : undefined;
        if (apresTrajet !== undefined && avantTrajet !== undefined && apresTrajet.minutes !== avantTrajet.minutes) {
          resultat.push({ type: "segment", label: stop.name, before: avantTrajet.minutes, after: apresTrajet.minutes, estimated: apresTrajet.estimee });
        }
      }
      const retourAvant = trajetsAvant.retour;
      const retourApres = trajetsApres.retour;
      const fin = jourApres.items.at(-1);
      if (retourAvant !== undefined && retourApres !== undefined && retourAvant.minutes !== retourApres.minutes && fin?.type === "terminus") {
        resultat.push({ type: "segment", label: fin.label, before: retourAvant.minutes, after: retourApres.minutes, estimated: retourApres.estimee });
      }
      const budget = changementDeBudget(budgetParPersonne(jourBase), budgetParPersonne(jourApres));
      if (budget !== undefined) resultat.push(budget);
    }
    lignesFinales.push(...gardees);
  }
  return [...resultat, ...lignesFinales];
}

// --- Entrée publique -----------------------------------------------------------------------------------------

function cleRapport(entree: EntreeRapport): string {
  return `${entree.regle}|${entree.etape ?? ""}|${entree.jour ?? ""}`;
}

/** Recopie de l'instantané de base : objets neufs, validés par `TripSnapshotSchema`. */
function copie(instantane: TripSnapshot): TripSnapshot {
  return TripSnapshotSchema.parse(instantane);
}

function jourDifferent(a: DaySnapshot | undefined, b: DaySnapshot | undefined): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * Applique un patch (voir l'en-tête du module). Résultat : `{ ok: true, instantane, resultat, rapport }` (version
 * `baseVersion + 1`), ou un refus typé de `REFUS_MOTEUR` (0045 § 5), sans détail sauf `currentVersion`.
 *
 * Entrée bloquante « nouvelle » : comparée au rapport des mêmes jours de la base par la clé `regle|etape|jour`
 * (`cleRapport`). Cette clé ne distingue pas deux causes d'une même règle pour la même étape et le même jour : un
 * patch qui aggrave une violation déjà présente (une seconde cause de R8 sur un jour qui en avait une, par exemple)
 * n'est pas refusé. Limite acceptée (écart 1 de B5c) : les entrées du rapport n'ont pas de sous-cause.
 */
export function appliquerPatch(entree: EntreePatch): ResultatPatch {
  const { patch, moteur } = entree;

  // 1. R10, sans rien calculer.
  const version = controlerVersion(patch.baseVersion, entree.versionCourante);
  if (!version.ok) return version;

  const modes = modesAdmis(moteur.brief.mobility);
  const contexte: ContextePatch = {
    moteur,
    trajet: (depuis, vers) => {
      const resultat = trajetLePlusRapide(moteur.relectures, depuis, vers, modes);
      return resultat === INCONNU ? undefined : resultat;
    },
    squelettes: new Map(
      squelette({
        voyage: { start: moteur.voyage.start, end: moteur.voyage.end },
        pace: moteur.brief.pace,
        nombreDeNuits: moteur.nuits.length,
        engagements: moteur.engagements,
        configuration: moteur.configuration,
        budgetTrajetReduit: moteur.budgetTrajetReduit,
      }).map((jour) => [jour.index, jour]),
    ),
  };
  const base = copie(entree.base);

  // 2. Annulation : recopie exacte de `toVersion` (B5-PO-14).
  const premiere = patch.operations.at(0);
  if (premiere?.op === "revert" || patch.operations.some((operation) => operation.op === "revert")) {
    const cible = premiere?.op === "revert" ? premiere.toVersion : undefined;
    const anterieure = cible === undefined ? undefined : entree.versionsAnterieures?.get(cible);
    if (patch.operations.length !== 1 || cible === undefined || cible < 1 || cible >= patch.baseVersion || anterieure === undefined) {
      return refus("invalid_revert");
    }
    // Instantané de l'historique invalide : refus typé, pas d'exception (on ne recopie jamais un instantané invalide).
    const lu = TripSnapshotSchema.safeParse(anterieure);
    if (!lu.success) return refus("invalid_revert");
    const instantane = lu.data;
    const indexes = [...new Set([...base.days, ...instantane.days].map((jour) => jour.index))].sort((a, b) => a - b);
    const touches = indexes.filter((index) =>
      jourDifferent(
        base.days.find((jour) => jour.index === index),
        instantane.days.find((jour) => jour.index === index),
      ),
    );
    const resultat = PatchResultSchema.parse({
      version: patch.baseVersion + 1,
      touchedDays: touches,
      changes: changements(base.days, instantane.days, touches, [], contexte),
    });
    return { ok: true, instantane, resultat, rapport: [] };
  }

  // 3. Opérations dans l'ordre du tableau, sur un brouillon.
  const brouillon: JourBrouillon[] = base.days.map((jour) => ({ origine: jour, lignes: lignesDe(jour) }));
  const touches = new Set<number>();
  const cibles: Cible[] = [];
  const remplacees = new Map<string, string>();
  const choix = new Map<string, EtatChoix>(moteur.choix);
  const ajouts = new Set([
    ...(entree.ajouts ?? []),
    // Lieux à soi de la base (décision 0147 § 6.1) : marqués dans l'instantané, rétablis par un `revert`.
    ...base.days.flatMap((jour) => etapesDuJour(jour).flatMap((stop) => (stop.addedBy === "person" ? [stop.id] : []))),
  ]);
  const deverrouillees = new Set<string>();
  const candidats = new Map(moteur.candidats.map((candidat) => [candidat.id, candidat]));
  const { configuration } = moteur;
  const situeeDansBase = etapesSituees(base.days);

  function appliquerOperation(operation: TripPatchOperation): Refus | undefined {
    switch (operation.op) {
      case "replace": {
        const trouve = trouver(brouillon, operation.stopId);
        if (trouve === undefined) return refus("unknown_stop");
        if (trouve.stop.locked) return refus("locked_stop");
        const candidat = candidats.get(operation.candidateId);
        if (candidat === undefined) return refus("unknown_candidate");
        if (identifiantPris(brouillon, operation.newStopId)) throw new RangeError("moteur : identifiant d'étape déjà attribué");
        const ancien = trouve.stop;
        const debut = versMinutes(ancien.start);
        const durees = configuration.dureesParDefaut;
        const soiree = ancien.kind === "activity" && debut >= versMinutes(configuration.debutSoiree);
        const duree =
          candidat.typeEtape === "meal"
            ? lire(durees, repasDeLHeure(debut, configuration) ?? "dinner")
            : soiree
              ? durees.evening
              : (candidat.faits.durationMinutes ?? durees.activity);
        const end = heureSure(debut + duree);
        if (end === undefined) return refus("no_option");
        const source = sourceDe(candidat);
        const stop: StopSnapshot = {
          id: operation.newStopId,
          kind: candidat.typeEtape,
          ...(candidat.placeId === undefined ? {} : { placeId: candidat.placeId }),
          name: candidat.nom,
          start: ancien.start,
          end,
          facts: { ...candidat.faits, durationMinutes: duree },
          ...(source === undefined ? {} : { source }),
          exceptions: candidat.aReserver ? ["toReserve"] : [],
          locked: false,
        };
        trouve.jour.lignes.splice(trouve.rang, 1, { genre: "etape", stop, fixe: false });
        // La personne a choisi ce candidat (B5-PO-8, « choisie »).
        choix.set(stop.id, "choisi");
        const remplacee = remplacees.get(ancien.id) ?? ancien.id;
        remplacees.set(stop.id, remplacee);
        const anterieure = cibles.findIndex((cible) => cible.id === ancien.id);
        const avant = anterieure >= 0 ? cibles.at(anterieure) : undefined;
        if (anterieure >= 0) cibles.splice(anterieure, 1);
        cibles.push(
          avant?.type === "added"
            ? { type: "added", id: stop.id }
            : { type: "replaced", id: stop.id, avant: avant?.type === "replaced" ? avant.avant : ancien.name, remplacee },
        );
        touches.add(trouve.jour.origine.index);
        return undefined;
      }
      case "add": {
        const jour = brouillon.find((candidat) => candidat.origine.index === operation.day);
        if (jour === undefined) return refus("out_of_trip");
        if (identifiantPris(brouillon, operation.stopId)) throw new RangeError("moteur : identifiant d'étape déjà attribué");
        const debut = versMinutes(operation.time);
        const durees = configuration.dureesParDefaut;
        // Lieu ajouté : aucun fait, durée prévue de son type (B5-PO-4, B5-PO-1).
        const duree = operation.kind === "meal" ? lire(durees, repasDeLHeure(debut, configuration) ?? "dinner") : durees.activity;
        const end = heureSure(debut + duree);
        if (end === undefined) return refus("no_option");
        const stop: StopSnapshot = {
          id: operation.stopId,
          kind: operation.kind,
          ...(operation.placeId === undefined ? {} : { placeId: operation.placeId }),
          name: operation.name,
          start: operation.time,
          end,
          facts: {},
          exceptions: [],
          locked: false,
          // Lieu à soi (décision 0147 § 6.1) : marque stockée dans l'instantané ; « Ajouté par toi. » sur la fiche.
          addedBy: "person",
        };
        retirerRepasOuvert(jour, stop, configuration);
        jour.lignes.push({ genre: "etape", stop, fixe: true });
        ajouts.add(stop.id);
        cibles.push({ type: "added", id: stop.id });
        touches.add(jour.origine.index);
        return undefined;
      }
      case "move": {
        const trouve = trouver(brouillon, operation.stopId);
        if (trouve === undefined) return refus("unknown_stop");
        if (trouve.stop.locked) return refus("locked_stop");
        const destination = brouillon.find((candidat) => candidat.origine.index === operation.day);
        if (destination === undefined) return refus("out_of_trip");
        const ancien = trouve.stop;
        const debut = versMinutes(operation.time);
        const decalage = debut - versMinutes(ancien.start);
        const end = ancien.end === undefined ? undefined : heureSure(versMinutes(ancien.end) + decalage);
        if (ancien.end !== undefined && end === undefined) return refus("no_option");
        const stop: StopSnapshot = { ...ancien, start: operation.time, ...(end === undefined ? {} : { end }) };
        trouve.jour.lignes.splice(trouve.rang, 1);
        retirerRepasOuvert(destination, stop, configuration);
        destination.lignes.push({ genre: "etape", stop, fixe: true });
        if (!cibles.some((cible) => cible.id === stop.id)) {
          const situee = situeeDansBase.get(stop.id);
          cibles.push({
            type: "moved",
            id: stop.id,
            avant: situee === undefined ? { day: trouve.jour.origine.index, time: ancien.start } : { day: situee.jour, time: situee.stop.start },
          });
        }
        touches.add(trouve.jour.origine.index);
        touches.add(destination.origine.index);
        return undefined;
      }
      case "lock":
      case "unlock": {
        const trouve = trouver(brouillon, operation.stopId);
        if (trouve === undefined) return refus("unknown_stop");
        const verrou = operation.op === "lock";
        if (trouve.stop.locked === verrou) return refus("no_effect");
        const ligne = trouve.jour.lignes.at(trouve.rang);
        if (ligne?.genre !== "etape") return refus("unknown_stop");
        trouve.jour.lignes.splice(trouve.rang, 1, { ...ligne, stop: { ...trouve.stop, locked: verrou } });
        if (verrou) deverrouillees.delete(trouve.stop.id);
        else deverrouillees.add(trouve.stop.id);
        touches.add(trouve.jour.origine.index);
        return undefined;
      }
      case "revert":
        return refus("invalid_revert");
    }
  }

  for (const operation of patch.operations) {
    const resultat = appliquerOperation(operation);
    if (resultat !== undefined) return resultat;
  }

  // 3 bis. Verrou seul (décision 0147 § 9) : la base, verrous basculés ; aucune replanification, aucune relecture.
  if (patch.operations.every((operation) => operation.op === "lock" || operation.op === "unlock")) {
    const verrous = new Map(brouillon.flatMap((jour) => jour.lignes.flatMap((ligne) => (ligne.genre === "etape" ? [[ligne.stop.id, ligne.stop.locked] as const] : []))));
    const days = base.days.map((jour) =>
      touches.has(jour.index)
        ? { ...jour, items: jour.items.map((item) => (item.type === "stop" ? { ...item, stop: { ...item.stop, locked: verrous.get(item.stop.id) ?? item.stop.locked } } : item)) }
        : jour,
    );
    const joursTouches = [...touches].sort((a, b) => a - b);
    const instantane = TripSnapshotSchema.parse({ days });
    const sansRelecture: ContextePatch = { ...contexte, moteur: { ...moteur, relectures: { validite: () => INCONNU, plages: () => INCONNU, duree: () => INCONNU } } };
    const resultat = PatchResultSchema.parse({
      version: patch.baseVersion + 1,
      touchedDays: joursTouches,
      changes: changements(base.days, instantane.days, joursTouches, cibles, sansRelecture),
    });
    return { ok: true, instantane, resultat, rapport: [] };
  }

  // 4. Replanification des seuls jours touchés, puis validation.
  const joursTouches = [...touches].sort((a, b) => a - b);
  const replanifies = new Map<number, DaySnapshot>();
  for (const jour of brouillon) {
    if (!touches.has(jour.origine.index)) continue;
    const replanifie = replanifierHoraires(jour, contexte);
    if (replanifie === undefined) return refus("no_option");
    replanifies.set(jour.origine.index, replanifie);
  }
  const days = base.days.map((jour) => replanifies.get(jour.index) ?? jour);
  const joursBaseTouches = base.days.filter((jour) => touches.has(jour.index));
  const joursApresTouches = days.filter((jour) => touches.has(jour.index));

  const nonRelus = new Set(base.days.flatMap((jour) => jour.events.filter((e) => e.exceptions.includes("unconfirmed")).map((e) => e.id)));
  const validation: ContexteValidation = {
    voyage: { start: moteur.voyage.start, end: moteur.voyage.end },
    pace: moteur.brief.pace,
    configuration,
    relectures: moteur.relectures,
    modes,
    nuits: moteur.nuits,
    evenementsNonRelus: nonRelus,
    choix,
    ajouts,
    porteeR1: { ...PORTEE_R1_PAR_DEFAUT, ...moteur.porteeR1 },
  };
  // R3 : une étape déverrouillée par ce patch n'est plus protégée (B5-PO-11) ; les autres verrous de la base le restent.
  const baseR3 = base.days.map((jour) => ({
    ...jour,
    items: jour.items.map((item) =>
      item.type === "stop" && deverrouillees.has(item.stop.id) ? { ...item, stop: { ...item.stop, locked: false } } : item,
    ),
  }));
  const rapportBase = new Set(validerProgramme(joursBaseTouches, validation).map(cleRapport));
  const rapport = validerProgramme(joursApresTouches, { ...validation, base: baseR3 });
  const nouvelleBloquante = rapport.some((entreeRapport) => estBloquante(entreeRapport, joursApresTouches) && !rapportBase.has(cleRapport(entreeRapport)));
  if (nouvelleBloquante) return refus("no_option");

  // 5. Sortie d'écriture et réponse.
  const instantane = TripSnapshotSchema.parse({ days });
  const resultat = PatchResultSchema.parse({
    version: patch.baseVersion + 1,
    touchedDays: joursTouches,
    changes: changements(base.days, instantane.days, joursTouches, cibles, contexte),
  });
  return { ok: true, instantane, resultat, rapport };
}
