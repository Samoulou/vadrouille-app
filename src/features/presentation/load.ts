import { isTrialTrip, voyageEssaiRevisable, type AdapterContext, type TripAdapter } from "@/adapters";
import type { DeckSession, PreviewSlot, Proposal, Trip } from "@/contracts";

/**
 * Jour du voyage tel que l'écran le reçoit (B2-PO-14) : de quoi composer le jour de la semaine (depuis `date`) et le
 * contexte d'une proposition (noms des étapes et événements du jour), rien de plus : ni `placeId`, ni autre clé
 * d'étape, ni voyage complet.
 */
export interface PresentationDay {
  index: number;
  date: string;
  stops: { id: string; name: string }[];
}

/** Créneau de l'aperçu sans proposition ancrée (case `noOption`, B2-PO-9) : nommé par un bandeau, jamais une carte. */
export interface NoOptionSlot {
  day: number;
  time: string;
  kind: "activity" | "meal";
}

export interface PresentationData {
  tripId: string;
  unlocked: boolean;
  /** Jours encore en préparation (`Day.generating`). */
  generatingDays: number[];
  proposals: Proposal[];
  /** Projection des jours du voyage (B2-PO-14). */
  days: PresentationDay[];
  /** Créneaux `noOption` de l'aperçu, dans l'ordre des cases ; toujours vide pour un voyage débloqué. */
  noOptionSlots: NoOptionSlot[];
  /**
   * État du tri enregistré (adaptateur `api`, B10a point 5 ; décision 0112 § 4 point 2) ; `null` sur `mock` et
   * `prototype` (session en mémoire de F6). Non nul, `proposals` est déjà réduit au paquet de reprise, dans son ordre.
   */
  deck: DeckSession | null;
  /**
   * Voyage d'essai, décidé par l'adaptateur (`isTrialTrip`, décision 0124 § 4) : tri sans question, phrase « choix sans
   * effet » à la fin du tri. `false` pour tout programme qui porte ses propositions, sur tout adaptateur.
   */
  essai: boolean;
  /**
   * Voyage d'essai lancé depuis l'app (identifiant `proto_<slug>_<exécution>`, décision 0125 § 2) : ses « Pas pour moi »
   * réécrivent le programme à la fin du tri (spécification E2E-essai, lot 4 ; décision 0126). Les voyages d'essai d'un
   * brief commité (`/prototype/executions`) gardent la phrase « choix sans effet ».
   */
  revisable: boolean;
}

/** Projection d'un jour : étapes de la ligne et événements, `{ id, name }` seulement. */
export function presentationDay(day: Trip["days"][number]): PresentationDay {
  const stops = [
    ...day.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])),
    ...day.events,
  ].map((stop) => ({ id: stop.id, name: stop.name }));
  return { index: day.index, date: day.date, stops };
}

/** Cases de l'aperçu (écran 6) : les cases `proposal` deviennent les cartes, dans l'ordre ; les autres, des créneaux. */
function fromPreview(slots: readonly PreviewSlot[]): Pick<PresentationData, "proposals" | "noOptionSlots"> {
  const proposals: Proposal[] = [];
  const noOptionSlots: NoOptionSlot[] = [];
  for (const slot of slots) {
    if (slot.type === "proposal") proposals.push(slot.proposal);
    else noOptionSlots.push({ day: slot.day, time: slot.time, kind: slot.kind });
  }
  return { proposals, noOptionSlots };
}

/**
 * Données de l'écran de présentation, lues par l'adaptateur dans le contexte d'organisation de la
 * requête ; `null` si le voyage est inconnu ou appartient à une autre organisation (404). Voyage non débloqué
 * (écran 6) : l'aperçu (`listPreviewSlots`, B2-PO-9) ; voyage débloqué (6b) : `listProposals`. Le filtrage des
 * étapes verrouillées et l'ordre du paquet sont faits par `buildDeck`. Projection construite côté serveur. Tri
 * enregistré (`getDeckSession` non nul) : les cartes sont les propositions lues réduites aux `proposalIds` du paquet de
 * reprise, dans leur ordre (décision 0112 § 4 point 2).
 */
export async function loadPresentation(adapter: TripAdapter, ctx: AdapterContext, tripId: string): Promise<PresentationData | null> {
  const trip = await adapter.getTrip(ctx, tripId);
  if (!trip) {
    return null;
  }
  const { proposals, noOptionSlots } = trip.unlocked
    ? { proposals: await adapter.listProposals(ctx, tripId), noOptionSlots: [] }
    : fromPreview(await adapter.listPreviewSlots(ctx, tripId));
  const deck = await adapter.getDeckSession(ctx, tripId);
  const essai = await isTrialTrip(adapter, ctx, tripId);
  const parId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  return {
    tripId: trip.id,
    unlocked: trip.unlocked,
    generatingDays: trip.days.filter((day) => day.generating).map((day) => day.index),
    proposals: deck === null ? proposals : deck.proposalIds.flatMap((id) => parId.get(id) ?? []),
    days: trip.days.map(presentationDay),
    noOptionSlots,
    deck,
    essai,
    revisable: essai && voyageEssaiRevisable(trip.id),
  };
}
