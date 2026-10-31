import "server-only";

import { ApiErrorSchema, type ApiError } from "@/contracts";

/**
 * Issue d'un cas d'usage sur les versions d'un voyage, avant sa conversion en `Result` par l'appelant : une valeur, ou un
 * refus (`ApiError` validée par `ApiErrorSchema`). Module unique pour `Issue`, `refus` et `conflit`, jusque-là recopiés
 * dans les cas d'usage des versions et des lieux (dette relevée par la revue de la PR 996, Q810 ; ticket 998). Aucun
 * changement de comportement : mêmes erreurs, mêmes codes.
 */

/** Refus d'un cas d'usage : l'erreur d'action renvoyée telle quelle à l'écran. */
export type Refus = { readonly ok: false; readonly error: ApiError };

/** Valeur, ou refus. */
export type Issue<T> = { readonly ok: true; readonly value: T } | Refus;

/** Refus validé par `ApiErrorSchema` (une erreur hors contrat lève : erreur de programmation, `internal` par le cadre). */
export const refus = (error: ApiError): Refus => ({ ok: false, error: ApiErrorSchema.parse(error) });

/** `version_conflict` (`retryable`) avec la version courante. */
export const conflit = (currentVersion: number): Refus => refus({ code: "version_conflict", retryable: true, currentVersion });
