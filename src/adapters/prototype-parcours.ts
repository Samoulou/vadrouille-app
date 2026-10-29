import { DETOUR_THRESHOLD_MINUTES, ProposalSchema, TripSchema, type Day, type DayLineItem, type Proposal, type ProposalNeighbour, type Trip } from "@/contracts";
import { etapeEnCase, servisAvantDeblocage } from "@/server/programme/apercu";

/**
 * Parcours de l'app sur un voyage d'essai (spécification E2E-essai, lot 1 ; décision D4) : fonctions pures, sans
 * lecture ni réseau. Un programme écrit par `p0Run` n'a aucune proposition enregistrée (`proposals: []`,
 * `src/server/programme/assemblage.ts`) ; il est servi comme un voyage de l'app **non débloqué** jusqu'au déblocage simulé :
 *
 * - « Tes premières propositions » : les étapes du programme, dans son ordre, la première journée puis le début de la
 *   deuxième, `MAX_PREVIEW_SLOTS` (8) au plus (cadrage D11) ;
 * - seules les journées de l'aperçu sont lisibles avant le déblocage ; les autres sont retirées du voyage servi ;
 * - après le déblocage, toutes les journées, et la suite du tri (6b) avec les étapes hors de l'aperçu.
 *
 * Les propositions sont tirées des étapes **telles qu'écrites** : même identifiant, même étape, mêmes voisins dans la
 * ligne du jour, même trajet depuis l'élément précédent (durée conservée ou relue, jamais inventée). Rien n'est stocké.
 *
 * Les règles communes avec la vraie app (sélection de l'aperçu, partie commune d'une case, journées et lignes « À faire »
 * servies avant le déblocage) sont écrites une seule fois dans `src/domain/apercu.ts` (décision 0136 § 1.7, M1a-1), que
 * ce module atteint par la réexportation `src/server/programme/apercu.ts` ; restent ici les voisins et le seuil de détour.
 */

/** Aperçu d'un programme d'essai : étapes et journées, dans l'ordre des jours (`src/domain/apercu.ts`). */
export { JOURS_APERCU, selectionApercu, type SelectionApercu } from "@/server/programme/apercu";

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
 * Proposition tirée de l'étape au rang `rang` d'une journée recomposée (partie commune : `etapeEnCase`). Trajet depuis
 * l'élément précédent seulement s'il a une durée ; au-delà du seuil, la raison de l'étape justifie le détour, et sans
 * raison le trajet n'est pas montré (jamais une justification inventée).
 */
function propositionDe(jour: Day, rang: number): Proposal | null {
  const cas = etapeEnCase(jour, rang);
  if (cas === null) return null;
  const { stop } = cas;
  const trajet = cas.segmentAvant !== undefined && cas.segmentAvant.minutes !== null ? cas.segmentAvant : undefined;
  const avecDetour = trajet !== undefined && trajet.minutes !== null && trajet.minutes > DETOUR_THRESHOLD_MINUTES;
  const montrerTrajet = trajet !== undefined && (!avecDetour || stop.reason !== undefined);
  const before = voisinDans(jour.items, rang, -1);
  const after = voisinDans(jour.items, rang, 1);
  return ProposalSchema.parse({
    id: cas.id,
    kind: cas.kind,
    day: cas.day,
    time: cas.time,
    neighbours: { ...(before ? { before } : {}), ...(after ? { after } : {}) },
    stop,
    category: cas.category,
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
 * « À faire » qui ne désignent ni une journée ni une étape retirée (règle `servisAvantDeblocage`, `src/domain/apercu.ts`).
 */
export function voyageNonDebloque(trip: Trip, joursLisibles: readonly Day[]): Trip {
  const { jours, aFaire } = servisAvantDeblocage(joursLisibles, trip.checklist, new Set(joursLisibles.map((jour) => jour.index)));
  return TripSchema.parse({ ...trip, days: jours, checklist: aFaire, unlocked: false });
}
