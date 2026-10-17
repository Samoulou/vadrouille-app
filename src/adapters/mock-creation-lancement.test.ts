import { describe, expect, it } from "vitest";

import { GenerationStatusSchema, type Brief, type TripRequest } from "@/contracts";
import {
  MOCK_DEMO_TRIP_DRAFT,
  MOCK_GENERATION_STEP_MS,
  MOCK_INFERRED_BRIEF,
  mockGenerationStatus,
  type MockGenerationOutcome,
} from "@/mocks/creation-edimbourg";

import { MOCK_REQUEST_CONTEXT, mockTripAdapter } from "./mock";
import { createMockCreationAdapter } from "./mock-creation";
import type { CreationStore } from "./simulation";
import type { AdapterContext } from "./types";

/**
 * `createTrip` et `getGenerationStatus` simulés (spécification F8, « Tests » ; F8-PO-11, F8-PO-13 ; décision 0017
 * § 2.4, § 3.7 et § 10) : horloge injectée (paramètre `now`), sans faux minuteurs globaux.
 */

const { inferredFields, ...inferred } = MOCK_INFERRED_BRIEF;
const BRIEF = { ...inferred, limits: [], inferredFields } as Brief;
const REQUEST: TripRequest = {
  requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11",
  draft: MOCK_DEMO_TRIP_DRAFT,
  brief: BRIEF,
};
const OTHER_REQUEST: TripRequest = {
  ...REQUEST,
  requestId: "0c6a1b0e-3d7f-4b8e-8f2a-6b9d5e4c3a21",
};
const OTHER_ORG: AdapterContext = {
  organizationId: "mock_org_autre",
  userId: "mock_user_autre",
  role: "owner",
};

function setup(maxLaunches?: number) {
  let now = 1_000_000;
  const store: CreationStore = { launches: new Map(), outcome: "ready" };
  const adapter = createMockCreationAdapter({
    now: () => now,
    store,
    trips: mockTripAdapter,
    maxLaunches,
  });
  return {
    adapter,
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createTrip simulé", () => {
  it("idempotent par (organisation, requestId) : même voyage, un seul lancement gardé, sans récit ni brouillon", async () => {
    const { adapter, store } = setup();
    expect(await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST)).toEqual({
      ok: true,
      value: { tripId: "mock_trip_edimbourg" },
    });
    expect(await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST)).toEqual({
      ok: true,
      value: { tripId: "mock_trip_edimbourg" },
    });
    expect(store.launches.size).toBe(1);
    const [launch] = store.launches.values();
    expect(Object.keys(launch!).sort()).toEqual(["launchedAt", "organizationId", "requestId", "tripId"]);
    expect(JSON.stringify([...store.launches])).not.toContain("Édimbourg");
  });

  it("même requestId dans une autre organisation : un autre voyage, jamais celui de la première", async () => {
    const { adapter } = setup();
    const first = await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST);
    const second = await adapter.createTrip(OTHER_ORG, REQUEST);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.tripId).not.toBe(first.value.tripId);
      expect(second.value.tripId).toMatch(/^mock_trip_[0-9a-f]{16}$/);
    }
    // La seconde organisation ne lit pas l'avancement de la première.
    expect(await adapter.getGenerationStatus(OTHER_ORG, "mock_trip_edimbourg")).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("un aperçu actif à la fois : active_preview_exists pendant la génération, relance une fois finie", async () => {
    const { adapter, advance } = setup();
    await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST);
    expect(await adapter.createTrip(MOCK_REQUEST_CONTEXT, OTHER_REQUEST)).toEqual({
      ok: false,
      error: { code: "active_preview_exists" },
      activeTripId: "mock_trip_edimbourg",
    });
    // Une autre organisation n'est pas concernée.
    expect((await adapter.createTrip(OTHER_ORG, OTHER_REQUEST)).ok).toBe(true);
    advance(8 * MOCK_GENERATION_STEP_MS);
    expect(await adapter.createTrip(MOCK_REQUEST_CONTEXT, OTHER_REQUEST)).toEqual({ ok: true, value: { tripId: "mock_trip_edimbourg" } });
    expect(await adapter.getGenerationStatus(MOCK_REQUEST_CONTEXT, "mock_trip_edimbourg")).toMatchObject({
      ok: true,
      value: { phase: "preparing", ready: 0 },
    });
    // Le premier requestId rend toujours le même voyage (retour du navigateur sur un ancien brouillon).
    expect(await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST)).toEqual({
      ok: true,
      value: { tripId: "mock_trip_edimbourg" },
    });
  });

  it("au-delà de maxLaunches, le plus ancien lancement est retiré", async () => {
    const { adapter, store, advance } = setup(2);
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    for (const requestId of ids) {
      await adapter.createTrip(MOCK_REQUEST_CONTEXT, { ...REQUEST, requestId });
      advance(8 * MOCK_GENERATION_STEP_MS);
    }
    expect(store.launches.size).toBe(2);
    expect([...store.launches.values()].map((launch) => launch.requestId)).toEqual(ids.slice(1));
  });

  it("sans portée de simulation (horloge, lancements, voyages) : erreur", async () => {
    await expect(createMockCreationAdapter().createTrip(MOCK_REQUEST_CONTEXT, REQUEST)).rejects.toThrow(/portée/);
  });
});

describe("getGenerationStatus simulé", () => {
  it("voyage jamais lancé dans la portée : complet ; voyage inconnu : not_found", async () => {
    const { adapter } = setup();
    expect(await adapter.getGenerationStatus(MOCK_REQUEST_CONTEXT, "mock_trip_edimbourg")).toMatchObject({
      ok: true,
      value: { phase: "ready", ready: 8 },
    });
    expect(await adapter.getGenerationStatus(MOCK_REQUEST_CONTEXT, "mock_trip_inconnu")).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("issue de la portée : erreur réparable puis reprise", async () => {
    const { adapter, store, advance } = setup();
    store.outcome = "failed";
    await adapter.createTrip(MOCK_REQUEST_CONTEXT, REQUEST);
    advance(3 * MOCK_GENERATION_STEP_MS);
    expect(await adapter.getGenerationStatus(MOCK_REQUEST_CONTEXT, "mock_trip_edimbourg")).toMatchObject({
      ok: true,
      value: {
        phase: "failed",
        reason: "provider_error",
        retryable: true,
        ready: 3,
      },
    });
    // Échec final : un nouveau lancement n'est pas refusé.
    expect((await adapter.createTrip(MOCK_REQUEST_CONTEXT, OTHER_REQUEST)).ok).toBe(true);
  });
});

describe("suite d'états simulée (mockGenerationStatus)", () => {
  const at = (step: number, outcome?: MockGenerationOutcome) => mockGenerationStatus("mock_trip_edimbourg", step * MOCK_GENERATION_STEP_MS, outcome);

  it("prêt : une proposition de plus par pas, J1 prêt au 4e, tout prêt au 8e", () => {
    expect(at(0)).toEqual({
      phase: "preparing",
      tripId: "mock_trip_edimbourg",
      days: [
        { index: 1, state: "preparing", readyStops: 0 },
        { index: 2, state: "preparing", readyStops: 0 },
      ],
      expected: 8,
      ready: 0,
    });
    expect(at(1).ready).toBe(1);
    expect(at(4).days.map((day) => day.state)).toEqual(["ready", "preparing"]);
    expect(at(5).days.map((day) => day.readyStops)).toEqual([4, 1]);
    expect(at(8)).toMatchObject({
      phase: "ready",
      ready: 8,
      days: [{ state: "ready" }, { state: "ready" }],
    });
    expect(at(20)).toEqual(at(8));
    expect(mockGenerationStatus("mock_trip_edimbourg", Number.POSITIVE_INFINITY)).toEqual(at(8));
  });

  it("aperçu incomplet : 6 sur 8, jours finis", () => {
    expect(at(7)).toMatchObject({ phase: "preparing" });
    expect(at(7, "incomplete")).toMatchObject({ phase: "preparing", ready: 6 });
    expect(at(8, "incomplete")).toMatchObject({
      phase: "incomplete",
      ready: 6,
      days: [
        { state: "ready", readyStops: 4 },
        { state: "ready", readyStops: 2 },
      ],
    });
  });

  it("erreurs : réparable du 3e au 5e pas puis reprise ; définitive au 3e", () => {
    expect(at(2, "failed")).toMatchObject({ phase: "preparing", ready: 2 });
    expect(at(4, "failed")).toMatchObject({
      phase: "failed",
      retryable: true,
      ready: 3,
    });
    expect(at(5, "failed")).toMatchObject({ phase: "preparing", ready: 3 });
    expect(at(10, "failed")).toMatchObject({ phase: "ready", ready: 8 });
    expect(at(3, "failedFinal")).toMatchObject({
      phase: "failed",
      reason: "cost_cap_reached",
      retryable: false,
      ready: 3,
    });
    expect(at(30, "failedFinal")).toMatchObject({
      phase: "failed",
      retryable: false,
    });
  });

  it("chaque état de chaque issue est conforme à GenerationStatusSchema", () => {
    for (const outcome of ["ready", "incomplete", "failed", "failedFinal"] as const) {
      for (let step = 0; step <= 12; step++) expect(GenerationStatusSchema.safeParse(at(step, outcome)).success, `${outcome} ${step}`).toBe(true);
    }
  });
});
