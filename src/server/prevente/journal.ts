import "server-only";

import { errorNameOf, logEvent } from "@/server/log";

/**
 * Journal de la mesure de la prévente (spécification `specs/C2-prevente-mesure.md`, § 2.2 point 6 ; tâche C2b, ticket
 * 1130 ; décision 0172 § 6). Une visite non écrite est perdue (C2-PO-6) : une ligne `prevente.visite_perdue`, avec le
 * **seul nom** de l'erreur. Ni message, ni détail, ni provenance, ni en-tête. Ne lève jamais.
 *
 * Branché au démarrage par `src/instrumentation.ts` sur `src/adapters/prevente-mesure-instance.ts` : `@/adapters`
 * n'importe pas le journal du serveur (`tests/unit/p0/imports.test.ts`).
 */
export function journaliserVisitePerdue(error: unknown): void {
  try {
    const errorName = errorNameOf(error);
    logEvent("prevente.visite_perdue", errorName === undefined ? {} : { errorName }, "warn");
  } catch {
    // Le journal lui-même ne doit rien casser.
  }
}
