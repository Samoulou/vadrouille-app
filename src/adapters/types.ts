import type { Day, Proposal, Trip } from "@/contracts";

/**
 * Contexte de chaque appel : toute donnée appartient à une organisation
 * (cadrage § 6.8). Un adaptateur ne renvoie jamais la donnée d'une autre
 * organisation.
 */
export interface AdapterContext {
  organizationId: string;
}

/** Accès aux voyages, simulé (`mock`) ou réel (`api`, avec le back-end). */
export interface TripAdapter {
  getTrip(ctx: AdapterContext, tripId: string): Promise<Trip | null>;
  /** `index` : 1 = J1. */
  getDay(ctx: AdapterContext, tripId: string, index: number): Promise<Day | null>;
  listProposals(ctx: AdapterContext, tripId: string): Promise<Proposal[]>;
}
