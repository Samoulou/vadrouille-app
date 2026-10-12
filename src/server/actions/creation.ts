"use server";

import { getCreationAdapter } from "@/adapters";
import { BriefRequestSchema, InferredBriefSchema, fail, ok, type InferredBrief, type Result } from "@/contracts";

import { parseInput } from "../parse-input";

/**
 * Actions serveur de la création du voyage (décision 0017 § 3.3 et § 3.4, F8-PO-17). F8a livre
 * `structureBrief` ; F8b ajoute `suggestLodging`, F8c `createTrip` et `getGenerationStatus`.
 *
 * Action anonyme : 1. `parseInput` de l'entrée reçue en `unknown` (`validation_failed`, sans appel à
 * l'adaptateur) ; 2. appel de l'adaptateur ; 3. validation de la sortie par `InferredBriefSchema` : une sortie non
 * conforme devient `provider_error` et rien n'est rendu. Aucun journal : ni récit ni destination.
 */

/** Erreurs de structuration transmises telles quelles ; toute autre devient `provider_error`. */
const STRUCTURE_ERRORS = new Set(["rate_limited", "cost_cap_reached", "provider_error"]);

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
