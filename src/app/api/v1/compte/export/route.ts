import { telechargerExport } from "@/server/routes/compte-export";

/**
 * « Exporter mes données » (spécification M9 § 3.5 et § 6.2 ; ticket 1097, M9a) : tout est dans
 * `src/server/routes/compte-export.ts` ; ce fichier n'importe rien d'autre de `src/server` (`ligne/route-handlers`).
 * `GET` seulement : Next.js répond 405 aux autres méthodes.
 */

export const dynamic = "force-dynamic";

export const GET = telechargerExport;
