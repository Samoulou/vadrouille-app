import type { Day, DayMap, Proposal, Trip } from "@/contracts";

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
  /**
   * Positions d'un jour pour la carte (F4-TL-1), `null` si le jour n'a aucune position.
   * Affichage seulement : jamais persistées côté client (handover § 8).
   */
  getDayMap(ctx: AdapterContext, tripId: string, index: number): Promise<DayMap | null>;
  /** Positions de tous les jours du voyage, pour la vue d'ensemble (écran 11). */
  getTripMap(ctx: AdapterContext, tripId: string): Promise<DayMap[]>;
}
