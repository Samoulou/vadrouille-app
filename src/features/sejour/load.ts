import { cache } from "react";

import { getRequestContext, getTripAdapter, type AdapterContext, type TripAdapter } from "@/adapters";
import type { Day, DayMap, Trip } from "@/contracts";

export interface TripData {
  trip: Trip;
  /** Positions de tous les jours (vue d'ensemble et carte de chaque jour), chargées une fois. */
  maps: DayMap[];
}

/**
 * Voyage et positions lus par l'adaptateur dans le contexte d'organisation de la requête ;
 * `null` si le voyage est inconnu ou appartient à une autre organisation (404).
 */
export async function readTrip(adapter: TripAdapter, ctx: AdapterContext, tripId: string): Promise<TripData | null> {
  const trip = await adapter.getTrip(ctx, tripId);
  if (!trip) return null;
  const maps = await adapter.getTripMap(ctx, tripId);
  return { trip, maps };
}

/**
 * Une seule lecture par requête pour le layout, la page et leurs métadonnées (décision 0015 § 5.3),
 * sur le modèle de `features/presentation/load.ts`.
 */
export const loadTrip = cache(async (tripId: string): Promise<TripData | null> =>
  readTrip(getTripAdapter(), getRequestContext(), tripId),
);

/** `n` de l'adresse : entier écrit sans zéro initial, dans les jours du voyage ; sinon `null` (404). */
export function dayFromParam(trip: Trip, n: string): Day | null {
  if (!/^[1-9]\d*$/.test(n)) return null;
  const index = Number(n);
  return trip.days.find((day) => day.index === index) ?? null;
}
