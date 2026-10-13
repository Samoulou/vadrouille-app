import {
  InferredBriefSchema,
  LodgingSuggestionSchema,
  fail,
  ok,
  type InferredBrief,
  type LodgingRequest,
  type LodgingSuggestion,
  type Result,
} from "@/contracts";
import { MOCK_INFERRED_BRIEF, MOCK_LODGING_SUGGESTION, isMockEdinburgh } from "@/mocks/creation-edimbourg";

import type { CreationAdapter } from "./types";

export interface MockCreationOptions {
  /** Brief renvoyé par `structureBrief` (tests) ; le brief d'Édimbourg par défaut. */
  inferredBrief?: unknown;
  /** Suggestion renvoyée pour Édimbourg par `suggestLodging` (tests) ; celle du jeu simulé par défaut. */
  lodgingSuggestion?: unknown;
}

/** Nom de la ville `city` du brouillon : `0` pour la destination, `i` pour `otherCities[i − 1]`. */
function cityName(request: LodgingRequest): string | undefined {
  return request.city === 0 ? request.draft.destination : request.draft.otherCities[request.city - 1]?.name;
}

/**
 * Création simulée (décision 0017 § 3.2, F8-PO-13), sans réseau, sans écriture disque, sans journal, sans horloge :
 * - `structureBrief` renvoie un brief préparé quel que soit le récit, qu'il ne lit pas et ne garde pas ;
 * - `suggestLodging` renvoie la suggestion d'Édimbourg pour une ville nommée « Édimbourg », « Edimbourg » ou
 *   « Edinburgh » (casse et accents ignorés), et `no_option` pour toute autre ville ; il ne garde rien.
 * Les sorties sont validées par leur schéma ici, comme `mockTripAdapter`, puis de nouveau par l'action (F8-PO-17).
 */
export function createMockCreationAdapter({
  inferredBrief = MOCK_INFERRED_BRIEF,
  lodgingSuggestion = MOCK_LODGING_SUGGESTION,
}: MockCreationOptions = {}): CreationAdapter {
  return {
    async structureBrief(): Promise<Result<InferredBrief>> {
      const parsed = InferredBriefSchema.safeParse(inferredBrief);
      return parsed.success ? ok(parsed.data) : fail("provider_error");
    },
    async suggestLodging(request: LodgingRequest): Promise<Result<LodgingSuggestion>> {
      const name = cityName(request);
      if (name === undefined || !isMockEdinburgh(name)) return fail("no_option");
      const parsed = LodgingSuggestionSchema.safeParse(lodgingSuggestion);
      return parsed.success ? ok(parsed.data) : fail("provider_error");
    },
  };
}
