import "server-only";

/**
 * Réglages des goûts retenus (tâche M8c-1, ticket 1121 ; décision 0160 § 1.7 point 2 et § 1.8 point 3). Passés en
 * paramètres à `candidatsDeGouts` (`src/domain/gouts.ts`) : le domaine n'importe pas `src/server`.
 */

/** « Trois J'aime déduits » (handover backend, correspondance `PreferenceSignal` → `RetainedPreference`). */
export const GOUT_DEDUIT_SEUIL = 3;

/**
 * Faux : aucun candidat « distance » sur `api` tant qu'aucune tâche ne porte ce goût au prompt (0160 § 1.7 point 2). La
 * tâche qui branchera B10f et le champ du prompt la passera à `true`.
 */
export const GOUT_DISTANCE_PROPOSE = false;
