import { z } from "zod";

import { API_ERROR_CODES } from "./values";

/**
 * Format d'erreur commun des actions serveur (décision 0017 § 4, reprise par 0020 § 1.3) : codes en
 * `snake_case`, `field` construit seulement à partir des clés connues du schéma, jamais la valeur reçue.
 */
export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type { ApiErrorCode } from "./values";

export const ApiErrorSchema = z
  .strictObject({
    code: ApiErrorCodeSchema,
    field: z.string().min(1).optional(),
    retryable: z.boolean().optional(),
    /**
     * Version courante du voyage (évolution E10, B2-PO-8), présente si et seulement si `code` vaut
     * `version_conflict` ; l'interface propose alors de rejouer la révision (`retryable: true`). B5 la remplit.
     */
    currentVersion: z.number().int().positive().optional(),
  })
  .superRefine((error, ctx) => {
    const conflict = error.code === "version_conflict";
    if (conflict !== (error.currentVersion !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "currentVersion présent si et seulement si code vaut version_conflict",
        path: ["currentVersion"],
      });
    }
    if (conflict && error.retryable !== true) {
      ctx.addIssue({ code: "custom", message: "version_conflict : retryable vaut true", path: ["retryable"] });
    }
  });
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(code: ApiError["code"], field?: string): Result<T> {
  return field ? { ok: false, error: { code, field } } : { ok: false, error: { code } };
}
