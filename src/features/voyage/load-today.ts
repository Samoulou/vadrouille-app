import { cache } from "react";

import { getTripReader, type AdapterContext, type TripAdapter } from "@/adapters";
import { contexteFacultatif } from "@/features/compte/session";

import { projectTodayTrip, type TodayTrip } from "./today";

/**
 * Voyage de l'écran 15 lu par l'adaptateur dans le contexte d'organisation de la requête, projeté pour l'écran
 * (F10-TL-2) ; `null` si le voyage est inconnu ou appartient à une autre organisation (404). Une erreur de
 * l'adaptateur n'est pas rattrapée : elle donne la page d'erreur commune (500, décision 0021 § 4), jamais un 404.
 */
export async function readToday(adapter: TripAdapter, ctx: AdapterContext, tripId: string): Promise<TodayTrip | null> {
  const trip = await adapter.getTrip(ctx, tripId);
  return trip ? projectTodayTrip(trip) : null;
}

/**
 * Une seule lecture par requête pour la page et ses métadonnées. Lecture par `getTripReader()` (décision 0020
 * § 3) : l'écran 15 suit l'accès du Séjour (F10-PO-4). Sans session (`better-auth`, B3c) : `null` ; la page redirige
 * avant d'appeler ce chargeur (`exigerSession`), les métadonnées ne redirigent jamais.
 */
export const loadToday = cache(async (tripId: string): Promise<TodayTrip | null> => {
  const ctx = await contexteFacultatif();
  return ctx === null ? null : readToday(getTripReader(), ctx, tripId);
});
