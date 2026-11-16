import "server-only";

import type { TripReview } from "@/contracts";
import { accesApresVoyage } from "@/domain/apres-voyage";
import { localDateAt } from "@/features/voyage/today";
import { accessUntil } from "@/lib/dates";
import { OFFER_CONFIG } from "@/server/config/offer";

/**
 * Accès à l'écran 16 à l'instant `maintenant` (M8a, ticket 1062 ; décision 0160 § 1.5 point 3 ; spécification M8 § 3.1
 * point 4) : date locale de la destination (`timeZone` du voyage), comparée au dernier jour (`end`) et à
 * `accessUntil(end, OFFER_CONFIG.accessDaysAfterReturn)`. **Calcul unique** (revue de la PR 1068, mineur 7), lu par le serveur
 * (`src/server/avis/avis.ts`, lecture et écriture sur `api`) et par `getTripReview` de `mock` (`src/adapters/index.ts`).
 * Module pur, sans entrée-sortie (l'instant est reçu).
 */
export function accesAuMoment(end: string, timeZone: string, maintenant: number): TripReview["access"] {
  return accesApresVoyage(end, accessUntil(end, OFFER_CONFIG.accessDaysAfterReturn), localDateAt(maintenant, timeZone));
}
