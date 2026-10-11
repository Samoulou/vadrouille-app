import type { AdapterContext, TripAdapter } from "@/adapters";
import type { Proposal } from "@/contracts";

export interface PresentationData {
  tripId: string;
  unlocked: boolean;
  /** Jours encore en préparation (`Day.generating`). */
  generatingDays: number[];
  proposals: Proposal[];
}

/**
 * Données de l'écran de présentation, lues par l'adaptateur dans le contexte d'organisation de la
 * requête ; `null` si le voyage est inconnu ou appartient à une autre organisation (404). Le filtrage
 * des étapes verrouillées et l'ordre du paquet sont faits par `buildDeck`.
 */
export async function loadPresentation(adapter: TripAdapter, ctx: AdapterContext, tripId: string): Promise<PresentationData | null> {
  const trip = await adapter.getTrip(ctx, tripId);
  if (!trip) {
    return null;
  }
  const proposals = await adapter.listProposals(ctx, tripId);
  return {
    tripId: trip.id,
    unlocked: trip.unlocked,
    generatingDays: trip.days.filter((day) => day.generating).map((day) => day.index),
    proposals,
  };
}
