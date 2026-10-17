import { cache } from "react";

import { getTripReader, type AdapterContext, type TripAdapter } from "@/adapters";
import type { Day, DayMap, Stop, Trip } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";

import { DAY_PARAM_PATTERN } from "./routes";

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
 * sur le modèle de `features/presentation/load.ts`. Lecture par `getTripReader()` : un voyage débloqué par
 * un paiement simulé est servi débloqué (décision 0020 § 3). Sans session (`better-auth`, B3c) : `null`, comme un voyage
 * inconnu ; la page redirige avant d'appeler ce chargeur (`exigerSession`), la mise en page et les métadonnées ne
 * redirigent jamais.
 */
export const loadTrip = cache(async (tripId: string): Promise<TripData | null> => {
  const ctx = await contexteFacultatif();
  return ctx === null ? null : readTrip(getTripReader(), ctx, tripId);
});

/** `n` de l'adresse : entier écrit sans zéro initial (`DAY_PARAM_PATTERN`), dans les jours du voyage ; sinon `null` (404). */
export function dayFromParam(trip: Trip, n: string): Day | null {
  if (!DAY_PARAM_PATTERN.test(n)) return null;
  const index = Number(n);
  return trip.days.find((day) => day.index === index) ?? null;
}

/**
 * Étape remplaçable désignée par le `stopId` de l'adresse (F7-PO-2) : une étape `stop` de la ligne du jour, sinon
 * `null` (404) — un événement de `Day.events`, un terminus ou un repas pas encore choisi n'en sont pas.
 */
export function replaceTargetOf(day: Day, stopId: string): Stop | null {
  let decoded = stopId;
  try {
    decoded = decodeURIComponent(stopId);
  } catch {
    return null;
  }
  for (const item of day.items) {
    if (item.type === "stop" && item.stop.id === decoded) return item.stop;
  }
  return null;
}
