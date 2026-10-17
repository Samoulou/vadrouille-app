// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { advanceClock, configureGeneration, explicitScope, resetScope } from "@/adapters/simulation";
import { fail, type Brief, type TripRequest } from "@/contracts";
import { MOCK_AUTH_CODE, MOCK_KNOWN_EMAIL } from "@/mocks/auth-simule";
import { MOCK_DEMO_TRIP_DRAFT, MOCK_GENERATION_STEP_MS, MOCK_INFERRED_BRIEF } from "@/mocks/creation-edimbourg";

import { hasSession, requestCode, verifyCode } from "./compte";
import { createTrip, getGenerationStatus } from "./creation";

const scopeName = vi.hoisted(() => ({ value: "lancement-1" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vadrouille-simulation": scopeName.value }),
}));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getCreationAdapter: vi.fn(actual.getCreationAdapter) };
});

/**
 * Lancement et suivi (F8c ; F8-PO-11, F8-PO-17 ; décision 0017 § 3.4 et § 9) : `createTrip` exige une session de la
 * portée, revalide son entrée avant tout appel à l'adaptateur et ne journalise rien ; `getGenerationStatus` lit
 * l'avancement de la portée.
 */

const NOW = Date.parse("2026-08-01T12:00:00+02:00");
const { inferredFields, ...inferred } = MOCK_INFERRED_BRIEF;
const BRIEF = { ...inferred, limits: [], inferredFields } as Brief;
const REQUEST: TripRequest = {
  requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11",
  draft: MOCK_DEMO_TRIP_DRAFT,
  brief: BRIEF,
};
const OTHER_ID = "0c6a1b0e-3d7f-4b8e-8f2a-6b9d5e4c3a21";

let serial = 0;
const actual = vi.mocked(adapters.getCreationAdapter).getMockImplementation()!;

async function signIn() {
  expect((await requestCode({ email: MOCK_KNOWN_EMAIL })).ok).toBe(true);
  expect((await verifyCode({ email: MOCK_KNOWN_EMAIL, code: MOCK_AUTH_CODE })).ok).toBe(true);
}

beforeEach(() => {
  serial += 1;
  scopeName.value = `lancement-${serial}`;
  resetScope(scopeName.value, NOW);
  vi.mocked(adapters.getCreationAdapter).mockImplementation(actual);
  vi.mocked(adapters.getCreationAdapter).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTrip : session et validation", () => {
  it("sans session : unauthenticated, aucun voyage créé, même avec un brouillon complet et valide", async () => {
    expect(await hasSession()).toBe(false);
    expect(await createTrip(REQUEST)).toEqual({
      ok: false,
      error: { code: "unauthenticated" },
    });
    expect(adapters.getCreationAdapter).not.toHaveBeenCalled();
    expect(explicitScope(scopeName.value).creation.launches.size).toBe(0);
  });

  it("sans session, une entrée invalide donne aussi unauthenticated (le schéma n'est pas un oracle)", async () => {
    expect(await createTrip({ inconnu: true })).toEqual({
      ok: false,
      error: { code: "unauthenticated" },
    });
  });

  it.each([
    ["requestId absent", { draft: REQUEST.draft, brief: REQUEST.brief }, "requestId"],
    ["requestId mal formé", { ...REQUEST, requestId: "123" }, "requestId"],
    ["champ inconnu", { ...REQUEST, organizationId: "mock_org_autre" }, undefined],
    ["brief sans envie", { ...REQUEST, brief: { ...BRIEF, wishes: [] } }, "brief.wishes"],
    [
      "5 villes",
      {
        ...REQUEST,
        draft: {
          ...REQUEST.draft,
          otherCities: Array(4).fill({
            name: "Glasgow",
            arrival: "2026-09-01",
            lodging: { kind: "none" },
          }),
        },
      },
      "draft.otherCities",
    ],
  ])("%s : validation_failed sans appeler l'adaptateur", async (_label, input, field) => {
    await signIn();
    const result = await createTrip(input);
    expect(result).toEqual({
      ok: false,
      error: field ? { code: "validation_failed", field } : { code: "validation_failed" },
    });
    expect(adapters.getCreationAdapter).not.toHaveBeenCalled();
  });

  it("arrivée passée sur l'horloge de la portée (au-delà d'un jour) : validation_failed sur draft.start", async () => {
    await signIn();
    advanceClock(scopeName.value, 30 * 86_400_000);
    expect(await createTrip(REQUEST)).toEqual({
      ok: false,
      error: { code: "validation_failed", field: "draft.start" },
    });
    expect(adapters.getCreationAdapter).not.toHaveBeenCalled();
  });
});

describe("createTrip : lancement", () => {
  it("avec session : le voyage simulé, idempotent par requestId (un seul lancement gardé)", async () => {
    await signIn();
    expect(await hasSession()).toBe(true);
    expect(await createTrip(REQUEST)).toEqual({
      ok: true,
      value: { tripId: "mock_trip_edimbourg" },
    });
    expect(await createTrip(REQUEST)).toEqual({
      ok: true,
      value: { tripId: "mock_trip_edimbourg" },
    });
    expect(explicitScope(scopeName.value).creation.launches.size).toBe(1);
  });

  it("nouveau requestId pendant la génération : active_preview_exists avec le voyage en préparation", async () => {
    await signIn();
    await createTrip(REQUEST);
    expect(await createTrip({ ...REQUEST, requestId: OTHER_ID })).toEqual({
      ok: false,
      error: { code: "active_preview_exists" },
      activeTripId: "mock_trip_edimbourg",
    });
    // Génération finie : un nouveau requestId relance la suite d'états.
    advanceClock(scopeName.value, 8 * MOCK_GENERATION_STEP_MS);
    expect(await createTrip({ ...REQUEST, requestId: OTHER_ID })).toEqual({
      ok: true,
      value: { tripId: "mock_trip_edimbourg" },
    });
    expect(await getGenerationStatus({ tripId: "mock_trip_edimbourg" })).toMatchObject({ ok: true, value: { phase: "preparing", ready: 0 } });
  });

  it("un conflit dont l'identifiant n'est pas un identifiant de voyage devient provider_error", async () => {
    await signIn();
    vi.mocked(adapters.getCreationAdapter).mockReturnValue({
      createTrip: async () => ({
        ok: false,
        error: { code: "active_preview_exists" },
        activeTripId: "../admin",
      }),
    } as never);
    expect(await createTrip(REQUEST)).toEqual({
      ok: false,
      error: { code: "provider_error" },
    });
  });

  it.each([
    ["cost_cap_reached", fail("cost_cap_reached"), "cost_cap_reached"],
    ["provider_error", fail("provider_error"), "provider_error"],
    ["autre code", fail("not_found"), "provider_error"],
    ["sortie non conforme", { ok: true, value: { tripId: "Édimbourg !" } }, "provider_error"],
  ] as const)("%s : %s", async (_label, output, code) => {
    await signIn();
    vi.mocked(adapters.getCreationAdapter).mockReturnValue({
      createTrip: async () => output,
    } as never);
    expect(await createTrip(REQUEST)).toEqual({ ok: false, error: { code } });
  });

  it("adaptateur qui lève : provider_error", async () => {
    await signIn();
    vi.mocked(adapters.getCreationAdapter).mockReturnValue({
      createTrip: async () => {
        throw new Error("panne");
      },
    } as never);
    expect(await createTrip(REQUEST)).toEqual({
      ok: false,
      error: { code: "provider_error" },
    });
  });
});

describe("getGenerationStatus", () => {
  it("suite d'états de la portée depuis le lancement", async () => {
    await signIn();
    await createTrip(REQUEST);
    expect(await getGenerationStatus({ tripId: "mock_trip_edimbourg" })).toMatchObject({
      ok: true,
      value: { phase: "preparing", ready: 0, expected: 8 },
    });
    advanceClock(scopeName.value, 4 * MOCK_GENERATION_STEP_MS);
    expect(await getGenerationStatus({ tripId: "mock_trip_edimbourg" })).toMatchObject({
      ok: true,
      value: {
        phase: "preparing",
        ready: 4,
        days: [
          { state: "ready", readyStops: 4 },
          { state: "preparing", readyStops: 0 },
        ],
      },
    });
    advanceClock(scopeName.value, 4 * MOCK_GENERATION_STEP_MS);
    expect(await getGenerationStatus({ tripId: "mock_trip_edimbourg" })).toMatchObject({ ok: true, value: { phase: "ready", ready: 8 } });
  });

  it("issue configurée par la portée (aperçu incomplet)", async () => {
    configureGeneration(scopeName.value, "incomplete");
    await signIn();
    await createTrip(REQUEST);
    advanceClock(scopeName.value, 8 * MOCK_GENERATION_STEP_MS);
    expect(await getGenerationStatus({ tripId: "mock_trip_edimbourg" })).toMatchObject({ ok: true, value: { phase: "incomplete", ready: 6 } });
  });

  it("voyage jamais lancé dans la portée : déjà complet ; voyage inconnu : not_found", async () => {
    expect(await getGenerationStatus({ tripId: "mock_trip_edimbourg" })).toMatchObject({ ok: true, value: { phase: "ready", ready: 8 } });
    expect(await getGenerationStatus({ tripId: "mock_trip_inconnu" })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it.each([
    ["identifiant mal formé", { tripId: "../x" }],
    ["champ inconnu", { tripId: "mock_trip_edimbourg", organizationId: "mock_org_autre" }],
  ])("%s : validation_failed sans appeler l'adaptateur", async (_label, input) => {
    expect((await getGenerationStatus(input)).ok).toBe(false);
    expect(adapters.getCreationAdapter).not.toHaveBeenCalled();
  });

  it("sortie non conforme ou d'un autre voyage : provider_error", async () => {
    vi.mocked(adapters.getCreationAdapter).mockReturnValue({
      getGenerationStatus: async () => ({
        ok: true,
        value: {
          phase: "ready",
          tripId: "mock_trip_edimbourg",
          days: [],
          expected: 8,
          ready: 8,
        },
      }),
    } as never);
    expect(await getGenerationStatus({ tripId: "mock_trip_edimbourg" })).toEqual({ ok: false, error: { code: "provider_error" } });
    vi.mocked(adapters.getCreationAdapter).mockReturnValue({
      getGenerationStatus: async () => ({
        ok: true,
        value: {
          phase: "ready",
          tripId: "mock_trip_autre",
          days: [{ index: 1, state: "ready", readyStops: 1 }],
          expected: 1,
          ready: 1,
        },
      }),
    } as never);
    expect(await getGenerationStatus({ tripId: "mock_trip_edimbourg" })).toEqual({ ok: false, error: { code: "provider_error" } });
  });
});

describe("aucune donnée journalisée", () => {
  it("createTrip et getGenerationStatus n'écrivent rien dans la console (ni destination, ni brief)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
    await createTrip(REQUEST);
    await signIn();
    await createTrip(REQUEST);
    await createTrip({ ...REQUEST, requestId: "x" });
    await getGenerationStatus({ tripId: "mock_trip_edimbourg" });
    await getGenerationStatus({ tripId: "mock_trip_inconnu" });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
