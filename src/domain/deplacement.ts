import {
  PatchResultSchema,
  TripSnapshotSchema,
  type Change,
  type DayLineItemSnapshot,
  type DaySnapshot,
  type StopSnapshot,
  type TripPatch,
  type TripSnapshot,
} from "@/contracts";

import { budgetParPersonne, changementDeBudget } from "@/domain/calculs";
import { creneauOccupe } from "@/domain/changement-de-ville";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { DERNIERE_HEURE, tempsLibreAvant } from "@/domain/journee";
import type { ResultatPatch } from "@/domain/patch";
import { etapesDuJour } from "@/domain/programme";
import { logementsDuJour, type ModeTrajet } from "@/domain/relectures";
import { finOccupee } from "@/domain/squelette";
import { lire } from "@/domain/tables";
import { arrondi5, versHeure, versMinutes } from "@/domain/temps";
import { controlerVersion, type Refus } from "@/domain/version";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";

/**
 * Déplacer une étape **sans relecture** (ticket 947, « Déplacer » sur l'adaptateur `api` ; spécification M5 § 3 et § 14 ;
 * décision 0147 § 8, § 11 : forme de patch `[move]`). Aucun appel Places ni Routes : les instantanés ne portent aucune durée
 * de trajet (`TripSnapshotSchema`) et le moteur de replanification (`appliquerPatch`) en exige une pour décaler une étape à
 * lieu ; ce module ne décale donc **rien** d'autre que l'étape déplacée.
 *
 * **Règle** (fonctions pures, mêmes règles d'écriture de la ligne du jour que la génération : `src/domain/journee.ts`) :
 * - seule une étape `stop` de la ligne d'un jour, **activité**, non verrouillée, sans `commitment`, se déplace (R3 ; un repas
 *   n'a pas de point : question au Product Owner) ;
 * - **point d'insertion** : un temps libre `[de, à]` d'un jour, précédé directement d'une étape, d'un repas pas encore choisi
 *   ou du début du jour (jamais d'un changement de ville), suivi au plus d'un trajet avant l'élément daté suivant. Le temps
 *   réservé au trajet est celui que ce temps libre laissait déjà avant l'élément suivant (`a` = début de l'élément suivant −
 *   fin du temps libre, au moins la marge) ; il est compté **avant et après** l'étape déplacée : heure proposée
 *   `arrondi5(de + a)`, admise si l'étape (sa durée occupée) finit au plus tard à `début suivant − a`. Un temps libre
 *   voisin de l'étape dans son propre jour n'est pas un point (F7 : « l'étape déplacée n'y figure pas comme point ») ; un
 *   point qui chevaucherait un événement verrouillé ou un engagement de `Day.events` non plus ;
 * - **jour d'origine** : l'étape, son trajet d'arrivée et ses temps libres voisins sont remplacés par un temps libre (règle
 *   B5-PO-9 de `tempsLibreAvant`) jusqu'au départ vers l'élément suivant, dont le trajet est gardé (son mode est celui du
 *   trajet depuis l'étape déplacée) ; aucun autre élément ne bouge, terminus compris ;
 * - **jour d'arrivée** : le temps libre est remplacé par le trajet vers l'étape (mode du trajet qui suivait le temps libre),
 *   l'étape à l'heure du point (fin décalée d'autant) et le temps libre qui reste ; aucun autre élément ne bouge.
 *
 * **Limite assumée, dite dans la PR** : les durées de trajet ne sont pas relues ; la lecture suivante les relit (port de
 * relectures de la lecture, comme à chaque affichage), et un trajet plus long que le temps réservé n'est pas détecté ici.
 * R3 est rejouée (`etapesVerrouilleesModifiees`) : une écriture qui toucherait une étape verrouillée est refusée en entier.
 */

/** Point d'insertion : identifiant opaque (rejoué tel quel par l'écran), jour et heure de début de l'étape déplacée. */
export type PointDeDeplacement = { readonly id: string; readonly day: number; readonly time: string };

export type SituationDuDeplacement =
  | { readonly type: "etape"; readonly jour: DaySnapshot; readonly rang: number; readonly stop: StopSnapshot }
  | { readonly type: "absente" }
  /** Étape verrouillée (R3), engagement, événement de `Day.events` ou idée « Surprends-moi » : jamais déplacés. */
  | { readonly type: "non_deplacable"; readonly verrouillee: boolean };

/** Étape visée dans l'instantané : une étape `stop` de la ligne d'un jour, non verrouillée et sans `commitment`. */
export function situerEtapeADeplacer(instantane: TripSnapshot, stopId: string): SituationDuDeplacement {
  for (const jour of instantane.days) {
    for (const [rang, item] of jour.items.entries()) {
      if (item.type !== "stop" || item.stop.id !== stopId) continue;
      if (item.stop.locked || item.stop.commitment !== undefined) return { type: "non_deplacable", verrouillee: item.stop.locked };
      return { type: "etape", jour, rang, stop: item.stop };
    }
    if (jour.events.some((evenement) => evenement.id === stopId) || jour.surprise?.id === stopId) return { type: "non_deplacable", verrouillee: false };
  }
  return { type: "absente" };
}

/** Identifiant opaque d'un point : jour et heure (« deplacer-j4-1545 »), unique dans le voyage. */
export function identifiantDuPoint(day: number, time: string): string {
  return `deplacer-j${day}-${time.replace(":", "")}`;
}

// --- Éléments datés de la ligne -------------------------------------------------------------------------------

type Ancre = Extract<DayLineItemSnapshot, { type: "terminus" | "stop" | "openMeal" | "transfer" }>;

function estAncre(item: DayLineItemSnapshot | undefined): item is Ancre {
  return item !== undefined && item.type !== "segment" && item.type !== "free";
}

function debutDAncre(item: Ancre): number {
  switch (item.type) {
    case "terminus":
    case "openMeal":
      return versMinutes(item.time);
    case "stop":
      return versMinutes(item.stop.start);
    case "transfer":
      return versMinutes(item.start);
  }
}

function finDAncre(item: Ancre, configuration: ConfigurationMoteur): number {
  switch (item.type) {
    case "terminus":
      return versMinutes(item.time);
    case "openMeal":
      return versMinutes(item.time) + lire(configuration.dureesParDefaut, item.meal);
    case "stop":
      return finOccupee(item.stop, configuration);
    case "transfer":
      return creneauOccupe(item, configuration).fin;
  }
}

function ancreAvant(items: readonly DayLineItemSnapshot[], rang: number): number | undefined {
  for (let i = rang - 1; i >= 0; i -= 1) if (estAncre(items.at(i))) return i;
  return undefined;
}

function ancreApres(items: readonly DayLineItemSnapshot[], rang: number): number | undefined {
  for (let i = rang + 1; i < items.length; i += 1) if (estAncre(items.at(i))) return i;
  return undefined;
}

type Segment = Extract<DayLineItemSnapshot, { type: "segment" }>;
type Libre = Extract<DayLineItemSnapshot, { type: "free" }>;

/** Entre deux éléments datés : rien, un trajet, un temps libre, ou un temps libre puis un trajet (forme écrite par le moteur). */
function intervalleRegulier(items: readonly DayLineItemSnapshot[]): { libre?: Libre; segment?: Segment } | undefined {
  const [premier, second, ...reste] = items;
  if (reste.length > 0) return undefined;
  if (premier === undefined) return {};
  if (second === undefined) {
    if (premier.type === "segment") return { segment: premier };
    if (premier.type === "free") return { libre: premier };
    return undefined;
  }
  return premier.type === "free" && second.type === "segment" ? { libre: premier, segment: second } : undefined;
}

/** Région de l'étape dans son jour : élément daté d'avant (`p`), d'après (`n`) et intervalles réguliers autour. */
type Region = {
  readonly p: number;
  readonly n: number;
  readonly avant: { libre?: Libre; segment?: Segment };
  readonly apres: { libre?: Libre; segment?: Segment };
};

function regionDe(jour: DaySnapshot, rang: number): Region | undefined {
  const p = ancreAvant(jour.items, rang);
  const n = ancreApres(jour.items, rang);
  if (p === undefined || n === undefined) return undefined;
  const avant = intervalleRegulier(jour.items.slice(p + 1, rang));
  const apres = intervalleRegulier(jour.items.slice(rang + 1, n));
  if (avant === undefined || apres === undefined) return undefined;
  return { p, n, avant, apres };
}

/** Temps libre d'un jour qui peut recevoir une étape : rang, éléments datés qui l'encadrent et trajet qui le suit. */
type Creneau = { readonly rang: number; readonly libre: Libre; readonly suivante: Ancre; readonly segment?: Segment };

function creneauDe(jour: DaySnapshot, rang: number): Creneau | undefined {
  const libre = jour.items.at(rang);
  const precedente = jour.items.at(rang - 1);
  if (libre?.type !== "free" || !estAncre(precedente) || precedente.type === "transfer") return undefined;
  if (precedente.type === "terminus" && precedente.role !== "start") return undefined;
  const n = ancreApres(jour.items, rang);
  const suivante = n === undefined ? undefined : jour.items.at(n);
  if (n === undefined || !estAncre(suivante) || (suivante.type === "terminus" && suivante.role !== "end")) return undefined;
  const entre = jour.items.slice(rang + 1, n);
  if (entre.length > 1 || (entre.length === 1 && entre[0]?.type !== "segment")) return undefined;
  const segment = entre[0]?.type === "segment" ? entre[0] : undefined;
  return { rang, libre, suivante, ...(segment === undefined ? {} : { segment }) };
}

/** Durée occupée de l'étape (sa fin, sinon sa durée par défaut, B5-PO-1). */
function dureeOccupee(stop: StopSnapshot, configuration: ConfigurationMoteur): number {
  return finOccupee(stop, configuration) - versMinutes(stop.start);
}

/** Heure de l'étape posée dans un créneau, ou `undefined` si elle n'y tient pas (trajet réservé avant et après, marge). */
function heureDansLeCreneau(creneau: Creneau, jour: DaySnapshot, stop: StopSnapshot, configuration: ConfigurationMoteur): number | undefined {
  const debutSuivante = debutDAncre(creneau.suivante);
  const reserve = Math.max(configuration.margeMinutes, debutSuivante - versMinutes(creneau.libre.to));
  const debut = arrondi5(versMinutes(creneau.libre.from) + reserve);
  const fin = debut + dureeOccupee(stop, configuration);
  if (fin + reserve > debutSuivante || fin > DERNIERE_HEURE) return undefined;
  if (stop.end !== undefined && versMinutes(stop.end) + debut - versMinutes(stop.start) > DERNIERE_HEURE) return undefined;
  // Jamais par-dessus un événement verrouillé ou un engagement de `Day.events` (ils ne bougent jamais).
  const chevauche = jour.events.some(
    (evenement) => (evenement.locked || evenement.commitment !== undefined) && versMinutes(evenement.start) < fin && debut < finOccupee(evenement, configuration),
  );
  return chevauche ? undefined : debut;
}

/**
 * Points d'insertion de l'étape `stopId` (voir l'en-tête du module), par jour du voyage, dans l'ordre des jours puis des
 * heures. Une étape verrouillée, un engagement, un événement ou une idée : `non_deplacable` ; inconnue : `absente`. Un repas,
 * ou une étape dont les voisins n'ont pas la forme écrite par le moteur : aucun point (tous les jours « complets »).
 */
export function pointsDeDeplacement(
  instantane: TripSnapshot,
  stopId: string,
  configuration: ConfigurationMoteur,
): { readonly ok: true; readonly points: readonly PointDeDeplacement[] } | { readonly ok: false; readonly situation: Exclude<SituationDuDeplacement, { type: "etape" }> } {
  const situation = situerEtapeADeplacer(instantane, stopId);
  if (situation.type !== "etape") return { ok: false, situation };
  const { stop, jour: origine, rang } = situation;
  const region = regionDe(origine, rang);
  if (stop.kind !== "activity" || region === undefined) return { ok: true, points: [] };
  const points: PointDeDeplacement[] = [];
  for (const jour of instantane.days) {
    for (const [i, item] of jour.items.entries()) {
      if (item.type !== "free") continue;
      // Les temps libres voisins de l'étape dans son jour ne sont pas des points.
      if (jour.index === origine.index && i > region.p && i < region.n) continue;
      const creneau = creneauDe(jour, i);
      if (creneau === undefined) continue;
      const debut = heureDansLeCreneau(creneau, jour, stop, configuration);
      if (debut === undefined) continue;
      const time = versHeure(debut);
      points.push({ id: identifiantDuPoint(jour.index, time), day: jour.index, time });
    }
  }
  return { ok: true, points };
}

// --- Réécriture des jours -----------------------------------------------------------------------------------

/** Y a-t-il, avant le rang `fin`, une étape à lieu depuis le début du jour ou depuis le dernier changement de ville ? */
function lieuAvant(items: readonly DayLineItemSnapshot[], fin: number): boolean {
  for (let i = fin - 1; i >= 0; i -= 1) {
    const item = items.at(i);
    if (item?.type === "transfer") return false;
    if (item?.type === "stop" && item.stop.placeId !== undefined) return true;
  }
  return false;
}

/**
 * Région de l'étape retirée (jour d'origine) : un temps libre jusqu'au départ vers l'élément suivant, puis le trajet qui
 * précédait cet élément (gardé : il part désormais du dernier lieu d'avant). Ce trajet tombe si l'élément suivant devient le
 * premier après un changement de ville, ou s'il est le terminus et que la position est encore le logement du matin, qui est
 * aussi celui du soir (même règle que `finDuJour`).
 */
function regionSansEtape(jour: DaySnapshot, region: Region, stop: StopSnapshot, configuration: ConfigurationMoteur, nombreDeNuits: number): DayLineItemSnapshot[] {
  const precedente = jour.items.at(region.p);
  const suivante = jour.items.at(region.n);
  if (!estAncre(precedente) || !estAncre(suivante)) return [];
  let segment = region.apres.segment;
  if (precedente.type === "transfer") segment = undefined;
  if (segment !== undefined && suivante.type === "terminus" && !lieuAvant(jour.items, region.p + 1)) {
    const logements = logementsDuJour(jour.index - 1, nombreDeNuits);
    if (logements.depart === logements.arrivee) segment = undefined;
  }
  const debutSuivante = debutDAncre(suivante);
  // Départ vers l'élément suivant tel que la ligne l'avait écrit : fin du temps libre d'après, sinon fin de l'étape.
  const depart = region.apres.libre === undefined ? finOccupee(stop, configuration) : versMinutes(region.apres.libre.to);
  const trajet = segment === undefined ? undefined : Math.max(0, debutSuivante - depart - configuration.margeMinutes);
  const libre = tempsLibreAvant(finDAncre(precedente, configuration), debutSuivante, trajet, configuration);
  return [...(libre === undefined ? [] : [libre]), ...(segment === undefined ? [] : [segment])];
}

/** Créneau du jour d'arrivée : trajet vers l'étape, l'étape à son heure, temps libre restant, trajet de retour si besoin. */
function creneauAvecEtape(
  creneau: Creneau,
  stop: StopSnapshot,
  debut: number,
  configuration: ConfigurationMoteur,
  modeParDefaut: Segment["segment"],
): DayLineItemSnapshot[] {
  const decalage = debut - versMinutes(stop.start);
  const deplacee: StopSnapshot = {
    ...stop,
    start: versHeure(debut),
    ...(stop.end === undefined ? {} : { end: versHeure(versMinutes(stop.end) + decalage) }),
  };
  const mode: Segment = creneau.segment ?? { type: "segment", segment: modeParDefaut };
  const debutSuivante = debutDAncre(creneau.suivante);
  const reserve = Math.max(configuration.margeMinutes, debutSuivante - versMinutes(creneau.libre.to));
  const avecLieu = deplacee.placeId !== undefined;
  const libre = tempsLibreAvant(finOccupee(deplacee, configuration), debutSuivante, creneau.segment === undefined ? undefined : reserve - configuration.margeMinutes, configuration);
  // Sans trajet après le temps libre, l'élément suivant n'avait pas de trajet ; s'il en demande un depuis le lieu déplacé
  // (étape à lieu, terminus), il est ajouté, même mode.
  const suivanteDemandeTrajet =
    creneau.segment === undefined && avecLieu && (creneau.suivante.type === "terminus" || (creneau.suivante.type === "stop" && creneau.suivante.stop.placeId !== undefined));
  return [
    ...(avecLieu ? [{ type: "segment" as const, segment: { ...mode.segment } }] : []),
    { type: "stop", stop: deplacee },
    ...(libre === undefined ? [] : [libre]),
    ...(suivanteDemandeTrajet ? [{ type: "segment" as const, segment: { ...mode.segment } }] : []),
  ];
}

export type EntreeDeplacement = {
  readonly base: TripSnapshot;
  readonly versionCourante: number;
  /** Patch `[move]` de la personne (forme admise, 0147 § 11). */
  readonly patch: TripPatch;
  readonly configuration: ConfigurationMoteur;
  readonly nombreDeNuits: number;
  /** Modes admis du voyage (lecture) : mode d'un trajet nouveau quand aucun trajet voisin n'en donne. */
  readonly modes: readonly ModeTrajet[];
};

const refus = <C extends Exclude<Refus["code"], "version_conflict">>(code: C) => ({ ok: false, code }) as const;

/**
 * Applique un patch `[move]` sans relecture (voir l'en-tête du module) : R10 d'abord (sans rien calculer), puis l'étape
 * (`unknown_stop`, `locked_stop` pour une étape verrouillée, `no_option` pour un engagement ou un événement), le point
 * demandé parmi les points calculés sur la base (`no_option` sinon), la réécriture des jours touchés, R3 rejouée (refus
 * `locked_stop` en entier, sans version) et la sortie validée (`TripSnapshotSchema`, `PatchResultSchema`). Fonction pure.
 */
export function deplacerSansRelecture(entree: EntreeDeplacement): ResultatPatch {
  const { patch, configuration } = entree;
  const version = controlerVersion(patch.baseVersion, entree.versionCourante);
  if (!version.ok) return version;
  const [operation, ...autres] = patch.operations;
  if (operation?.op !== "move" || autres.length > 0) throw new RangeError("déplacement : patch [move] attendu");
  const base = TripSnapshotSchema.parse(entree.base);

  const situation = situerEtapeADeplacer(base, operation.stopId);
  if (situation.type === "absente") return refus("unknown_stop");
  if (situation.type === "non_deplacable") return refus(situation.verrouillee ? "locked_stop" : "no_option");
  const { stop, jour: origine, rang } = situation;
  if (!base.days.some((jour) => jour.index === operation.day)) return refus("out_of_trip");
  const points = pointsDeDeplacement(base, stop.id, configuration);
  const point = points.ok ? points.points.find((candidat) => candidat.day === operation.day && candidat.time === operation.time) : undefined;
  const region = regionDe(origine, rang);
  const destination = base.days.find((jour) => jour.index === operation.day);
  if (point === undefined || region === undefined || destination === undefined) return refus("no_option");
  const debut = versMinutes(point.time);
  const rangDuCreneau = destination.items.findIndex((_, i) => {
    if (destination.index === origine.index && i > region.p && i < region.n) return false;
    const creneau = creneauDe(destination, i);
    return creneau !== undefined && heureDansLeCreneau(creneau, destination, stop, configuration) === debut;
  });
  const creneau = creneauDe(destination, rangDuCreneau);
  if (creneau === undefined) return refus("no_option");

  // Mode d'un trajet nouveau : celui du trajet qui suivait le temps libre, sinon celui qui menait à l'étape, sinon le
  // premier mode admis du voyage (estimé : la lecture suivante relit la durée).
  const premierMode = entree.modes.at(0) ?? "walk";
  const modeParDefaut = region.avant.segment?.segment ?? region.apres.segment?.segment ?? { mode: premierMode, estimated: true };
  const sansEtape = regionSansEtape(origine, region, stop, configuration, entree.nombreDeNuits);
  const avecEtape = creneauAvecEtape(creneau, stop, debut, configuration, modeParDefaut);

  const reecrire = (jour: DaySnapshot): DaySnapshot => {
    const estOrigine = jour.index === origine.index;
    const estArrivee = jour.index === destination.index;
    if (!estOrigine && !estArrivee) return jour;
    const items: DayLineItemSnapshot[] = [];
    for (const [i, item] of jour.items.entries()) {
      if (estOrigine && i > region.p && i < region.n) {
        if (i === region.p + 1) items.push(...sansEtape);
        continue;
      }
      if (estArrivee && i === creneau.rang) {
        items.push(...avecEtape);
        continue;
      }
      items.push(item);
    }
    return { ...jour, items };
  };
  const days = base.days.map(reecrire);
  const joursTouches = [...new Set([origine.index, destination.index])].sort((a, b) => a - b);
  const touchesApres = days.filter((jour) => joursTouches.includes(jour.index));

  // R3 rejouée (B5-PO-11) : nom, jour, heures et `placeId` de chaque étape verrouillée inchangés, sinon refus en entier.
  if (etapesVerrouilleesModifiees(base.days, touchesApres).length > 0) return refus("locked_stop");

  const instantane = TripSnapshotSchema.parse({ days });
  const resultat = PatchResultSchema.parse({
    version: patch.baseVersion + 1,
    touchedDays: joursTouches,
    changes: changementsDuDeplacement(base.days, instantane.days, joursTouches, stop, origine.index),
  });
  return { ok: true, instantane, resultat, rapport: [] };
}

/**
 * « Ce qui change » d'un déplacement (forme de `changements()` de `patch.ts`, 0016 § 4.5) : l'étape déplacée (`moved`), le
 * budget de chaque jour touché s'il change, puis les autres étapes des jours touchés, inchangées (aucune ne bouge). Aucun
 * changement de trajet : aucune durée n'est relue. Aucune ligne `checklist` : une étape déplacée garde ses lignes (M5 § 7.4).
 */
function changementsDuDeplacement(
  base: readonly DaySnapshot[],
  apres: readonly DaySnapshot[],
  joursTouches: readonly number[],
  stop: StopSnapshot,
  jourDOrigine: number,
): Change[] {
  const resultat: Change[] = [];
  const inchangees: Change[] = [];
  for (const index of joursTouches) {
    const jourApres = apres.find((jour) => jour.index === index);
    const jourBase = base.find((jour) => jour.index === index);
    if (jourApres === undefined || jourBase === undefined) continue;
    const arrivee = etapesDuJour(jourApres).find((etape) => etape.id === stop.id);
    if (arrivee !== undefined) resultat.unshift({ type: "moved", label: stop.name, before: { day: jourDOrigine, time: stop.start }, after: { day: index, time: arrivee.start } });
    const budget = changementDeBudget(budgetParPersonne(jourBase), budgetParPersonne(jourApres));
    if (budget !== undefined) resultat.push(budget);
    for (const etape of etapesDuJour(jourApres)) if (etape.id !== stop.id) inchangees.push({ type: "unchanged", label: etape.name, time: etape.start });
  }
  return [...resultat, ...inchangees];
}
