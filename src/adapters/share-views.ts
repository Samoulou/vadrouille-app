import type { SharedDayView, SharedTripView, Trip } from "@/contracts";
import { SharedDayViewSchema, SharedTripViewSchema } from "@/contracts/share";

import { projectSharedMaps, projectSharedPoints, projectSharedTrip } from "./share-projection";
import type { AdapterContext, TripAdapter } from "./types";

/**
 * Vues `RP` et `RPJ` d'un voyage déjà résolu par un adaptateur de partage (simulé, `mock-share.ts`, ou signé,
 * `signed-share.ts`) : une seule implémentation de la projection et de sa validation stricte. `trips` et `ctx` sont ceux
 * du voyage partagé (organisation du lien, jamais celle de la requête du visiteur).
 */
export async function buildSharedTripView(trips: TripAdapter, ctx: AdapterContext, trip: Trip): Promise<SharedTripView> {
  const maps = await trips.getTripMap(ctx, trip.id);
  return SharedTripViewSchema.parse({ trip: projectSharedTrip(trip), maps: projectSharedMaps(trip, maps) });
}

/** `RPJ` du jour `index` ; `null` pour un jour hors du voyage. */
export async function buildSharedDayView(trips: TripAdapter, ctx: AdapterContext, trip: Trip, index: number): Promise<SharedDayView | null> {
  const day = trip.days.find((candidate) => candidate.index === index);
  if (!day) return null;
  const map = await trips.getDayMap(ctx, trip.id, index);
  return SharedDayViewSchema.parse({ trip: projectSharedTrip(trip), dayIndex: index, points: projectSharedPoints(day, map) });
}
