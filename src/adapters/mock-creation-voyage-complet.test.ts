import { describe, expect, it } from "vitest";

import { FullTripStatusSchema } from "@/contracts";
import { MOCK_GENERATION_STEP_MS } from "@/mocks/creation-edimbourg";

import { MOCK_DEMO_TRIP, MOCK_DEMO_UNLOCKED_TRIP, MOCK_REQUEST_CONTEXT, mockTripAdapter } from "./mock";
import { createMockCreationAdapter } from "./mock-creation";
import type { CreationStore } from "./simulation";
import type { AdapterContext } from "./types";

/**
 * `getFullTripStatus` simulé (décision 0087 § 1.5 point 4) : lecture du jeu simulé seulement, sans état gardé dans la
 * portée, pour que la tâche frontend des bandeaux de Séjour et de 6b ne dépende pas du code de B9d.
 */

const OTHER_ORG: AdapterContext = { organizationId: "mock_org_autre", userId: "mock_user_autre", role: "owner" };

function setup() {
  let now = 1_000_000;
  const store: CreationStore = { launches: new Map(), outcome: "ready" };
  const adapter = createMockCreationAdapter({ now: () => now, store, trips: mockTripAdapter });
  return {
    adapter,
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("getFullTripStatus simulé", () => {
  it("voyage débloqué du jeu simulé : ready, avec tripId seulement", async () => {
    const { adapter } = setup();
    const result = await adapter.getFullTripStatus(MOCK_REQUEST_CONTEXT, MOCK_DEMO_UNLOCKED_TRIP.tripId);
    expect(result).toEqual({ ok: true, value: { phase: "ready", tripId: MOCK_DEMO_UNLOCKED_TRIP.tripId } });
    if (result.ok) expect(FullTripStatusSchema.safeParse(result.value).success).toBe(true);
  });

  it("voyage non débloqué : none (aucun droit, donc aucune exécution du voyage complet)", async () => {
    const { adapter } = setup();
    expect(await adapter.getFullTripStatus(MOCK_REQUEST_CONTEXT, MOCK_DEMO_TRIP.tripId)).toEqual({
      ok: true,
      value: { phase: "none", tripId: MOCK_DEMO_TRIP.tripId },
    });
  });

  it("voyage inconnu ou d'une autre organisation : not_found, jamais forbidden", async () => {
    const { adapter } = setup();
    expect(await adapter.getFullTripStatus(MOCK_REQUEST_CONTEXT, "mock_trip_inconnu")).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.getFullTripStatus(OTHER_ORG, MOCK_DEMO_UNLOCKED_TRIP.tripId)).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("ne garde rien dans la portée et ne dépend pas de l'horloge", async () => {
    const { adapter, store, advance } = setup();
    const first = await adapter.getFullTripStatus(MOCK_REQUEST_CONTEXT, MOCK_DEMO_UNLOCKED_TRIP.tripId);
    advance(10 * MOCK_GENERATION_STEP_MS);
    expect(await adapter.getFullTripStatus(MOCK_REQUEST_CONTEXT, MOCK_DEMO_UNLOCKED_TRIP.tripId)).toEqual(first);
    expect(store.launches.size).toBe(0);
  });

  it("sans portée de simulation : erreur explicite, comme getGenerationStatus", async () => {
    const adapter = createMockCreationAdapter();
    await expect(adapter.getFullTripStatus(MOCK_REQUEST_CONTEXT, MOCK_DEMO_TRIP.tripId)).rejects.toThrow("portée de simulation");
  });
});
