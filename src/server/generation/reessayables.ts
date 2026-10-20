import "server-only";

/**
 * Codes d'arrêt réessayables (spécification B9, B9-PO-9 ; décision 0081 B9-TL-6 (h)) : `retryable` vrai seulement pour
 * `upstream_unavailable`, `upstream_timeout` et `step_expired`. Module feuille, sans import : lu par la conversion unique
 * (`raison-echec.ts`, qui en tire `REESSAYABLES`) et par les modules du voyage complet atteints depuis le webhook simulé
 * (réconciliation, expiration, état bloqué), qui n'atteignent ainsi ni `@/ai/natures` ni `@/ai/erreurs`. L'égalité avec
 * `CODES_ARRET.filter((c) => echecDeCode(c).retryable)` est vérifiée par le test de `raison-echec.ts`.
 */

/** Échéance d'une étape (B9-TL-3 point 5) : seul code propre à la génération. */
export const CODE_ETAPE_EXPIREE = "step_expired";

/** Codes d'arrêt réessayables, la liste que `retryGeneration` passe à l'écriture conditionnelle de reprise (0087 § 1.3 point 1). */
export const CODES_REESSAYABLES = ["upstream_unavailable", "upstream_timeout", CODE_ETAPE_EXPIREE] as const;
