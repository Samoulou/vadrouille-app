import { describe, expect, it } from "vitest";

import { fail, type Brief, type TripRequest } from "@/contracts";
import { MOCK_CREATED_TRIP_ID, MOCK_DEMO_TRIP_DRAFT, MOCK_GENERATION_STEP_MS, MOCK_INFERRED_BRIEF, type MockGenerationOutcome } from "@/mocks/creation-edimbourg";

import { MOCK_REQUEST_CONTEXT, mockTripAdapter } from "./mock";
import { createMockCreationAdapter } from "./mock-creation";
import type { CreationStore } from "./simulation";

/** `retryGeneration` simulé (B9b, B9-PO-9 ; décision 0081 B9-TL-11) : horloge injectée, sans faux minuteurs. */

const { inferredFields, ...inferred } = MOCK_INFERRED_BRIEF;
const REQUEST: TripRequest = {
  requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11",
  draft: MOCK_DEMO_TRIP_DRAFT,
  brief: { ...inferred, limits: [], inferredFields } as Brief,
};
const RETRY = { tripId: MOCK_CREATED_TRIP_ID, requestId: "7d3c2b1a-0f9e-4d8c-b7a6-5e4d3c2b1a09" };

function setup(outcome: MockGenerationOutcome) {
  let now = 1_000_000;
  const store: CreationStore = { launches: new Map(), outcome };
  const adapter = createMockCreationAdapter({ now: () => now, store, trips: mockTripAdapter });
  return { adapter, store, advance: (ms: number) => (now += ms) };
}

describe("retryGeneration simulé", () => {
  it("après un échec réessayable : un seul nouveau lancement par requestId, qui aboutit", async () => {
    const { adapter, store, advance } = setup("failed");
    await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST);
    advance(3 * MOCK_GENERATION_STEP_MS);
    expect(await adapter.getGenerationStatus(MOCK_REQUEST_CONTEXT, MOCK_CREATED_TRIP_ID)).toMatchObject({ ok: true, value: { phase: "failed", retryable: true } });
    expect(await adapter.retryGeneration(MOCK_REQUEST_CONTEXT, RETRY)).toEqual({ ok: true, value: { tripId: MOCK_CREATED_TRIP_ID } });
    expect(await adapter.retryGeneration(MOCK_REQUEST_CONTEXT, RETRY)).toEqual({ ok: true, value: { tripId: MOCK_CREATED_TRIP_ID } });
    expect(store.launches.size).toBe(2);
    expect(await adapter.getGenerationStatus(MOCK_REQUEST_CONTEXT, MOCK_CREATED_TRIP_ID)).toMatchObject({ ok: true, value: { phase: "preparing", ready: 0 } });
    advance(8 * MOCK_GENERATION_STEP_MS);
    expect(await adapter.getGenerationStatus(MOCK_REQUEST_CONTEXT, MOCK_CREATED_TRIP_ID)).toMatchObject({ ok: true, value: { phase: "ready", ready: 8 } });
  });

  it("rien à relancer (en cours, prêt, échec non réessayable, kind full) : validation_failed sans lancement", async () => {
    for (const [outcome, elapsed] of [["ready", 0], ["ready", 8], ["failedFinal", 3]] as const) {
      const { adapter, store, advance } = setup(outcome);
      await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST);
      advance(elapsed * MOCK_GENERATION_STEP_MS);
      expect(await adapter.retryGeneration(MOCK_REQUEST_CONTEXT, RETRY)).toEqual(fail("validation_failed"));
      expect(store.launches.size).toBe(1);
    }
    const { adapter, store, advance } = setup("failed");
    await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST);
    advance(3 * MOCK_GENERATION_STEP_MS);
    expect(await adapter.retryGeneration(MOCK_REQUEST_CONTEXT, { ...RETRY, kind: "full" })).toEqual(fail("validation_failed"));
    expect(store.launches.size).toBe(1);
  });

  it("voyage jamais lancé ou d'une autre organisation : not_found", async () => {
    const { adapter } = setup("failed");
    expect(await adapter.retryGeneration(MOCK_REQUEST_CONTEXT, RETRY)).toEqual(fail("not_found"));
    await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST);
    expect(await adapter.retryGeneration({ organizationId: "mock_org_autre", userId: "mock_user_autre", role: "owner" }, RETRY)).toEqual(fail("not_found"));
  });
});
