import "server-only";

import type { ApiErrorCode } from "@/contracts/values";

/**
 * Correspondance des erreurs de la connexion réelle (spécification B3, B3c point 3 et critère C6) : **seul tableau** qui
 * traduit un code d'erreur de Better Auth 1.7.7 (`APIError#body.code`, jamais le message) en code de
 * `API_ERROR_CODES`. Tout code absent du tableau, toute erreur sans code, toute panne du port d'envoi et toute erreur
 * inattendue donnent `provider_error` (`retryable: true`), ce que décide `codeEchec`. Aucun message, code ni corps de la
 * bibliothèque ou du port d'envoi ne sort de `src/server`.
 */

/** Codes d'échec des opérations de la liste blanche : sous-ensemble de `API_ERROR_CODES`, vérifié à la compilation. */
export type AuthFailureCode = Extract<ApiErrorCode, "invalid_code" | "code_expired" | "too_many_attempts" | "unauthenticated" | "provider_error">;

/** Codes de Better Auth 1.7.7 rendus par les opérations de la liste blanche (`signInEmailOTP`, greffon `emailOTP`). */
export const ERREURS_BIBLIOTHEQUE: Readonly<Record<string, AuthFailureCode>> = Object.freeze({
  INVALID_OTP: "invalid_code",
  OTP_EXPIRED: "code_expired",
  TOO_MANY_ATTEMPTS: "too_many_attempts",
});

/** Code de `API_ERROR_CODES` d'un code de la bibliothèque ; `undefined` hors du tableau (l'appelant rend `provider_error`). */
export function codeEchec(codeBibliotheque: string | undefined): AuthFailureCode | undefined {
  if (codeBibliotheque === undefined || !Object.hasOwn(ERREURS_BIBLIOTHEQUE, codeBibliotheque)) return undefined;
  return ERREURS_BIBLIOTHEQUE[codeBibliotheque];
}
