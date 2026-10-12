import type { Trip } from "@/contracts";
import { formatDateCourte, formatTripDates, formatVoyageurs } from "@/lib/dates";

// Format de la ligne de la plaque : implémentation unique dans `src/lib/dates.ts` (décision 0021 § 3).
export { formatDateCourte, formatVoyageurs };

/**
 * Ligne d'informations de la `DestinationPlate`, au format de F5 (F5, écran 11) :
 * « sam. 29.08 – jeu. 03.09 · 2 adultes ». Sans année : le Séjour et l'écran 9 n'en affichent pas.
 */
export function plateMeta(trip: Pick<Trip, "start" | "end" | "travellers">): string {
  return formatTripDates(trip.start, trip.end, trip.travellers);
}
