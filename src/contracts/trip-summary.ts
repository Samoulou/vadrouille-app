import { z } from "zod";

import { TripBaseSchema } from "./trip";

/**
 * Résumé d'un voyage pour « Mes voyages » (écran 17 ; spécification F11, F11-TL-1 ; décision 0021 § 1.2).
 *
 * Champs repris de `TripBaseSchema` (le voyage sans ses raffinements, que Zod 4 refuse de `pick`) par `pick` (aucune seconde copie), plus deux comptes dérivés du voyage :
 * - `toReserveCount` : lignes « À faire » non faites (`countToReserve`, `@/contracts/values`) ;
 * - `dayCount` : nombre de jours, pour que la réouverture ignore un jour qui n'existe plus sans transmettre
 *   les jours.
 *
 * Objet strict : ni jour, ni étape, ni position, ni `placeId`, ni liste « À faire », ni `organizationId`
 * (l'isolation vient du contexte de la requête, jamais d'une donnée envoyée au navigateur).
 */
export const TripSummarySchema = TripBaseSchema.pick({
  id: true,
  destination: true,
  destinationColor: true,
  start: true,
  end: true,
  timeZone: true,
  travellers: true,
  unlocked: true,
}).extend({
  toReserveCount: z.number().int().nonnegative(),
  dayCount: z.number().int().positive(),
});
export type TripSummary = z.infer<typeof TripSummarySchema>;
