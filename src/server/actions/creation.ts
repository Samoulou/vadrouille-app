"use server";

import { getCreationAdapter } from "@/adapters";
import {
  BriefRequestSchema,
  InferredBriefSchema,
  LodgingRequestSchema,
  LodgingSuggestionSchema,
  fail,
  ok,
  type InferredBrief,
  type LodgingSuggestion,
  type Result,
} from "@/contracts";
import type { ApiErrorCode } from "@/contracts/values";

import { parseInput } from "../parse-input";

/**
 * Actions serveur de la création du voyage (décision 0017 § 3.3 et § 3.4, F8-PO-17). F8a livre
 * `structureBrief`, F8b `suggestLodging` ; F8c ajoute `createTrip` et `getGenerationStatus`.
 *
 * Action anonyme : 1. `parseInput` de l'entrée reçue en `unknown` (`validation_failed`, sans appel à
 * l'adaptateur) ; 2. appel de l'adaptateur ; 3. validation de la sortie par `InferredBriefSchema` : une sortie non
 * conforme devient `provider_error` et rien n'est rendu. Aucun journal : ni récit ni destination.
 */

/**
 * Erreurs de structuration transmises telles quelles ; toute autre devient `provider_error`. Typées par
 * `ApiErrorCode` (dérivé de `API_ERROR_CODES`) : un code absent de la liste commune ne compile pas.
 */
const STRUCTURE_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["rate_limited", "cost_cap_reached", "provider_error"]);

export async function structureBrief(input: unknown): Promise<Result<InferredBrief>> {
  const parsed = parseInput(BriefRequestSchema, input);
  if (!parsed.ok) return parsed;
  let result: Result<unknown>;
  try {
    result = await getCreationAdapter().structureBrief(parsed.value);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok) return fail(STRUCTURE_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
  const output = InferredBriefSchema.safeParse(result.value);
  return output.success ? ok(output.data) : fail("provider_error");
}

/** Erreurs de la suggestion de logement transmises telles quelles ; toute autre devient `provider_error`. */
const LODGING_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["no_option", "rate_limited", "cost_cap_reached", "provider_error"]);

/**
 * Écran 3 (F8b, F8-PO-8) : action anonyme, même ordre que `structureBrief` (0017 § 3.4) : `parseInput` par
 * `LodgingRequestSchema` (sans appel à l'adaptateur en cas d'échec), appel de l'adaptateur, validation de la sortie
 * par `LodgingSuggestionSchema` (sinon `provider_error`, rien n'est rendu). Aucun journal : ni destination ni ville.
 */
export async function suggestLodging(input: unknown): Promise<Result<LodgingSuggestion>> {
  const parsed = parseInput(LodgingRequestSchema, input);
  if (!parsed.ok) return parsed;
  let result: Result<unknown>;
  try {
    result = await getCreationAdapter().suggestLodging(parsed.value);
  } catch {
    return fail("provider_error");
  }
  if (!result.ok) return fail(LODGING_ERRORS.has(result.error.code) ? result.error.code : "provider_error");
  const output = LodgingSuggestionSchema.safeParse(result.value);
  return output.success ? ok(output.data) : fail("provider_error");
}
