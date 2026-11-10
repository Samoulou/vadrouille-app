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

/**
 * Réponse au questionnaire non écrite (tâche C2c, ticket 1137 ; décision 0177 § 8) : une ligne
 * `prevente.reponse_perdue`, avec le **seul nom** de l'erreur. Ni message, ni détail, ni provenance, ni parcours, ni
 * réponse, ni texte de la question 1, ni adresse IP, ni en-tête. Ne lève jamais.
 */
export function journaliserReponsePerdue(error: unknown): void {
  try {
    const errorName = errorNameOf(error);
    logEvent("prevente.reponse_perdue", errorName === undefined ? {} : { errorName }, "warn");
  } catch {
    // Le journal lui-même ne doit rien casser.
  }
}

/** Plafond global du jour atteint (décision 0177 § 8) : une ligne `prevente.plafond_atteint`, sans aucun champ. Ne lève jamais. */
export function journaliserPlafondAtteint(): void {
  try {
    logEvent("prevente.plafond_atteint", {}, "warn");
  } catch {
    // Le journal lui-même ne doit rien casser.
  }
}
