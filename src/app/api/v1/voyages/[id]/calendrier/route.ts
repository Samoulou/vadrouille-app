import { telechargerCalendrier } from "@/server/routes/calendrier";

/**
 * Fichier `.ics` du programme (spécification M6 § 4 ; décision 0157 § 1.6, T6 ; ticket 1005, M6b) : tout est dans
 * `src/server/routes/calendrier.ts` ; ce fichier n'importe rien d'autre de `src/server` (`ligne/route-handlers`).
 * `GET` seulement : Next.js répond 405 aux autres méthodes.
 */

export const dynamic = "force-dynamic";

export const GET = telechargerCalendrier;
