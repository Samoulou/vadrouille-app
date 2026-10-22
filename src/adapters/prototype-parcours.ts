import {
  DETOUR_THRESHOLD_MINUTES,
  MAX_PREVIEW_SLOTS,
  ProposalSchema,
  TripSchema,
  type Category,
  type Day,
  type DayLineItem,
  type Proposal,
  type ProposalNeighbour,
  type Trip,
} from "@/contracts";

/**
 * Parcours de l'app sur un voyage d'essai (spécification E2E-essai, lot 1 ; décision D4) : fonctions pures, sans
 * lecture ni réseau. Un programme écrit par `p0Run` n'a aucune proposition enregistrée (`proposals: []`,
 * `src/server/p0/assemblage.ts`) ; il est servi comme un voyage de l'app **non débloqué** jusqu'au déblocage simulé :
 *
 * - « Tes premières propositions » : les étapes du programme, dans son ordre, la première journée puis le début de la
 *   deuxième, `MAX_PREVIEW_SLOTS` (8) au plus (cadrage D11) ;
 * - seules les journées de l'aperçu sont lisibles avant le déblocage ; les autres sont retirées du voyage servi ;
 * - après le déblocage, toutes les journées, et la suite du tri (6b) avec les étapes hors de l'aperçu.
 *
 * Les propositions sont tirées des étapes **telles qu'écrites** : même identifiant, même étape, mêmes voisins dans la
 * ligne du jour, même trajet depuis l'élément précédent (durée conservée ou relue, jamais inventée). Rien n'est stocké.
 */

/** Journées lues pour l'aperçu : la première, puis le début de la deuxième (D4). */
export const JOURS_APERCU = 2;

/**
 * Catégorie **de repli** d'une proposition tirée d'une étape (décision 0124 § 5) : le programme écrit n'en garde aucune
 * (texte maison, jamais Google). Conséquences assumées : toutes les activités d'un voyage d'essai comptent comme
 * « heritage » et tous les repas comme « restaurant » dans la mesure du tri (console) — la répartition par catégorie
 * n'y veut rien dire ; aucune question de catégorie n'est posée (`questions: false`). Le lot 4 ne doit jamais relire ces
 * catégories comme des préférences : il les remplace par la catégorie écrite avec le programme.
 */
const CATEGORIE_REPAS: Category = "restaurant";
const CATEGORIE_ACTIVITE: Category = "heritage";

interface JourLu {
  readonly index: number;
  readonly items: readonly { readonly type: string; readonly stop?: { readonly id: string; readonly commitment?: unknown } }[];
}

export interface SelectionApercu {
  /** Identifiants des étapes de l'aperçu, dans l'ordre du programme ; `MAX_PREVIEW_SLOTS` au plus. */
  readonly etapes: readonly string[];
  /** Journées lisibles avant le déblocage : celles de l'aperçu (la première au moins). */
  readonly jours: ReadonlySet<number>;
}

/** Étape proposable : une étape de la ligne du jour qui n'est pas un engagement saisi (`refineNoCommitment`). */
function proposable(ligne: JourLu["items"][number]): ligne is { type: "stop"; stop: { id: string } } {
  return ligne.type === "stop" && ligne.stop !== undefined && ligne.stop.commitment === undefined;
}

/** Aperçu d'un programme d'essai : étapes et journées, dans l'ordre des jours (indice croissant). */
export function selectionApercu(jours: readonly JourLu[]): SelectionApercu {
  const ordonnes = [...jours].sort((a, b) => a.index - b.index).slice(0, JOURS_APERCU);
  const etapes: string[] = [];
  const lisibles = new Set<number>();
  for (const jour of ordonnes) {
    for (const ligne of jour.items) {
      if (etapes.length >= MAX_PREVIEW_SLOTS) break;
      if (!proposable(ligne)) continue;
      etapes.push(ligne.stop.id);
      lisibles.add(jour.index);
    }
  }
  const premier = ordonnes[0];
  if (premier !== undefined) lisibles.add(premier.index);
  return { etapes, jours: lisibles };
}

/** Voisin d'un élément de la ligne du jour (contrat `ProposalNeighbour`) ; un trajet n'en est pas un. */
function voisin(ligne: DayLineItem | undefined): ProposalNeighbour | undefined {
  switch (ligne?.type) {
    case "stop":
      return { type: "stop", stopId: ligne.stop.id };
    case "openMeal":
      return { type: "meal", meal: ligne.meal };
    case "free":
      return { type: "free" };
    case "terminus":
      return { type: "terminus", role: ligne.role };
    default:
      return undefined;
  }
}

/** Premier élément qui n'est pas un trajet, avant (`pas = -1`) ou après (`pas = 1`) le rang donné. */
function voisinDans(items: readonly DayLineItem[], rang: number, pas: -1 | 1): ProposalNeighbour | undefined {
  for (let i = rang + pas; i >= 0 && i < items.length; i += pas) {
    const ligne = items[i];
    if (ligne?.type !== "segment") return voisin(ligne);
  }
  return undefined;
}

/**
 * Proposition tirée de l'étape au rang `rang` d'une journée recomposée. Trajet depuis l'élément précédent seulement
 * s'il a une durée ; au-delà du seuil, la raison de l'étape justifie le détour, et sans raison le trajet n'est pas
 * montré (jamais une justification inventée).
 */
function propositionDe(jour: Day, rang: number): Proposal | null {
  const ligne = jour.items[rang];
  if (ligne?.type !== "stop" || ligne.stop.commitment !== undefined) return null;
  const { stop } = ligne;
  const precedent = jour.items[rang - 1];
  const trajet = precedent?.type === "segment" && precedent.segment.minutes !== null ? precedent.segment : undefined;
  const avecDetour = trajet !== undefined && trajet.minutes !== null && trajet.minutes > DETOUR_THRESHOLD_MINUTES;
  const montrerTrajet = trajet !== undefined && (!avecDetour || stop.reason !== undefined);
  const before = voisinDans(jour.items, rang, -1);
  const after = voisinDans(jour.items, rang, 1);
  return ProposalSchema.parse({
    id: stop.id,
    kind: stop.kind === "meal" ? "meal" : "activity",
    day: jour.index,
    time: stop.start,
    neighbours: { ...(before ? { before } : {}), ...(after ? { after } : {}) },
    stop,
    category: stop.kind === "meal" ? CATEGORIE_REPAS : CATEGORIE_ACTIVITE,
    ...(montrerTrajet ? { travelFromPrevious: trajet } : {}),
    ...(montrerTrajet && avecDetour ? { detour: stop.reason } : {}),
  });
}

/** Propositions des journées données, dans l'ordre du programme, pour les seules étapes que `garder` retient. */
export function propositionsDesJours(jours: readonly Day[], garder: (stopId: string) => boolean): Proposal[] {
  const propositions: Proposal[] = [];
  for (const jour of [...jours].sort((a, b) => a.index - b.index)) {
    jour.items.forEach((ligne, rang) => {
      if (ligne.type !== "stop" || !garder(ligne.stop.id)) return;
      const proposition = propositionDe(jour, rang);
      if (proposition) propositions.push(proposition);
    });
  }
  return propositions;
}

/**
 * Voyage d'essai non débloqué : les seules journées lisibles (déjà recomposées), `unlocked: false`, et les lignes
 * « À faire » qui ne désignent ni une journée ni une étape retirée.
 */
export function voyageNonDebloque(trip: Trip, joursLisibles: readonly Day[]): Trip {
  const indices = new Set(joursLisibles.map((jour) => jour.index));
  const etapes = new Set(
    joursLisibles.flatMap((jour) => [...jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop.id] : [])), ...jour.events.map((e) => e.id)]),
  );
  const checklist = trip.checklist.filter(
    (ligne) => (ligne.when.type !== "tripDay" || indices.has(ligne.when.day)) && (ligne.stopId === undefined || etapes.has(ligne.stopId)),
  );
  return TripSchema.parse({ ...trip, days: joursLisibles, checklist, unlocked: false });
}
