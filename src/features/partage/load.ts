import { cache } from "react";

import { getShareAdapter, getSimulationScope, shareAvailable } from "@/adapters";
import type { SharedDayView, SharedTripView } from "@/contracts";

import { parseDayParam, parseShareToken } from "./routes";

/**
 * Lectures de la vue partagée, une par requête pour la page et ses métadonnées (sur le modèle de
 * `features/sejour/load.ts`). Ordre des contrôles (spécification F10, F10-PO-15 ; 0020 § 2.3) :
 * 1. `shareAvailable()`, sinon `null` (404) sans rien lire ;
 * 2. forme du jeton (`parseShareToken`), sinon `null` (404) sans appel à l'adaptateur ;
 * 3. portée de la requête, puis adaptateur de partage.
 * Jeton inconnu, désactivé ou expiré : `null` (404), sans dire lequel. Une erreur de l'adaptateur n'est pas
 * attrapée : elle mène à la page d'erreur commune (500), jamais à une 404.
 */

export interface SharedTripData {
  token: string;
  view: SharedTripView;
}

export interface SharedDayData {
  token: string;
  view: SharedDayView;
}

export const loadSharedTrip = cache(async (rawToken: string): Promise<SharedTripData | null> => {
  if (!shareAvailable()) return null;
  const token = parseShareToken(rawToken);
  if (token === null) return null;
  const scope = await getSimulationScope();
  const view = await getShareAdapter({ scope }).getSharedTrip(token);
  return view ? { token, view } : null;
});

export const loadSharedDay = cache(async (rawToken: string, n: string): Promise<SharedDayData | null> => {
  if (!shareAvailable()) return null;
  const token = parseShareToken(rawToken);
  const index = parseDayParam(n);
  if (token === null || index === null) return null;
  const scope = await getSimulationScope();
  const view = await getShareAdapter({ scope }).getSharedDay(token, index);
  return view ? { token, view } : null;
});
