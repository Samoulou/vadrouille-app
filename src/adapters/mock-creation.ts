import { InferredBriefSchema, fail, ok, type InferredBrief, type Result } from "@/contracts";
import { MOCK_INFERRED_BRIEF } from "@/mocks/creation-edimbourg";

import type { CreationAdapter } from "./types";

export interface MockCreationOptions {
  /** Brief renvoyé par `structureBrief` (tests) ; le brief d'Édimbourg par défaut. */
  inferredBrief?: unknown;
}

/**
 * Création simulée (décision 0017 § 3.2, F8-PO-13), sans réseau, sans écriture disque, sans journal :
 * `structureBrief` renvoie un brief préparé quel que soit le récit, qu'il ne lit pas et ne garde pas. La sortie
 * est validée par son schéma ici, comme `mockTripAdapter`, puis de nouveau par l'action (F8-PO-17).
 */
export function createMockCreationAdapter({ inferredBrief = MOCK_INFERRED_BRIEF }: MockCreationOptions = {}): CreationAdapter {
  return {
    async structureBrief(): Promise<Result<InferredBrief>> {
      const parsed = InferredBriefSchema.safeParse(inferredBrief);
      return parsed.success ? ok(parsed.data) : fail("provider_error");
    },
  };
}
