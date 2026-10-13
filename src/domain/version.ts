import { ApiErrorSchema, type ApiError } from "@/contracts";

/**
 * Refus typés du moteur (décision 0045 § 5, B5-TL-5) et R10 — un patch ne s'applique qu'à sa version de base.
 *
 * Résultat du moteur : `{ ok: true, … } | { ok: false, code }`, énumération fermée, aucun détail sauf
 * `currentVersion` sur `version_conflict` (nécessaire à `ApiError`, handover § 4 « Concurrence »). Seul
 * `version_conflict` est converti ici en `ApiError` ; les autres codes le seront par B11, qui ajoute à
 * `API_ERROR_CODES` ce qui manque (PR de contrat distincte).
 */

export const REFUS_MOTEUR = [
  "version_conflict",
  "unknown_stop",
  "unknown_candidate",
  "out_of_trip",
  "locked_stop",
  "no_effect",
  "no_option",
  "invalid_revert",
] as const;
export type CodeRefus = (typeof REFUS_MOTEUR)[number];

export type RefusVersion = { ok: false; code: "version_conflict"; currentVersion: number };
export type Refus = RefusVersion | { ok: false; code: Exclude<CodeRefus, "version_conflict"> };

/**
 * R10 : la version de base d'un patch doit être la version courante. Sinon, refus explicite, sans rien calculer
 * (le serveur garde la seconde défense : contrainte d'unicité `(trip_id, version)` et verrou de ligne).
 */
export function controlerVersion(baseVersion: number, versionCourante: number): { ok: true } | RefusVersion {
  return baseVersion === versionCourante ? { ok: true } : { ok: false, code: "version_conflict", currentVersion: versionCourante };
}

/** Seule conversion de `src/domain` vers `ApiError` : `{ code: "version_conflict", retryable: true, currentVersion }`. */
export function erreurDeVersion(refus: RefusVersion): ApiError {
  return ApiErrorSchema.parse({ code: refus.code, retryable: true, currentVersion: refus.currentVersion });
}
