import "server-only";

import { MAX_PREVIEW_SLOTS } from "@/contracts/values";

/**
 * Constantes de la génération (décision 0081, B9-TL-1 : `src/server/config/generation.ts` ; spécification B9, B9b).
 * Aucun plafond ni montant ici : ceux-ci restent dans `usage.ts` (valeurs réservées à Samuel, B9-PO-10). Lu par les cas
 * d'usage de `src/server/creation/` et par l'expiration de `src/server/generation/`.
 */

/** Cases de l'aperçu (PO-6) : `GenerationStatus.expected`. */
export const CASES_APERCU = MAX_PREVIEW_SLOTS;

/** Jours couverts par l'aperçu (J1 et J2, B9-PO-5) : `GenerationStatus.days`. */
export const JOURS_APERCU = 2;

/**
 * N de l'expiration d'une exécution figée (0081 B9-TL-3 point 5) : 20 minutes depuis `updated_at`. Revu dans la même PR
 * si la durée maximale d'une étape change (0075).
 */
export const EXPIRATION_EXECUTION_MS = 20 * 60_000;
