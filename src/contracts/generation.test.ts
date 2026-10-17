import { describe, expect, it } from "vitest";

import { MOCK_DEMO_TRIP_DRAFT, MOCK_INFERRED_BRIEF } from "@/mocks/creation-edimbourg";

import { CreatedTripSchema, GenerationStatusRequestSchema } from "./creation";
import { GenerationStatusSchema, TripRequestSchema, isActivePreviewConflict } from "./index";
import { API_ERROR_CODES, isFinalGenerationPhase } from "./values";

/** Contrats du lancement et de l'écran 5 (F8c ; décision 0017 § 2.4 ; 0077 § 3 point 5). */

const { inferredFields, ...inferred } = MOCK_INFERRED_BRIEF;
const REQUEST = {
  requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11",
  draft: MOCK_DEMO_TRIP_DRAFT,
  brief: { ...inferred, limits: [], inferredFields },
};

const day = (index: number, state: "preparing" | "ready", readyStops: number) => ({ index, state, readyStops });
const STATUS = {
  phase: "preparing",
  tripId: "mock_trip_edimbourg",
  days: [day(1, "ready", 4), day(2, "preparing", 1)],
  expected: 8,
  ready: 5,
};

describe("TripRequestSchema", () => {
  it("accepte requestId, brouillon et brief ; refuse l'organisation et un requestId qui n'est pas un UUID", () => {
    expect(TripRequestSchema.safeParse(REQUEST).success).toBe(true);
    expect(
      TripRequestSchema.safeParse({
        ...REQUEST,
        organizationId: "mock_org_autre",
      }).success,
    ).toBe(false);
    expect(TripRequestSchema.safeParse({ ...REQUEST, requestId: "brouillon-1" }).success).toBe(false);
    expect(TripRequestSchema.safeParse({ ...REQUEST, story: "On part à deux." }).success).toBe(false);
  });

  it("enveloppes { tripId } strictes, identifiant de voyage seulement", () => {
    expect(CreatedTripSchema.safeParse({ tripId: "mock_trip_edimbourg" }).success).toBe(true);
    expect(CreatedTripSchema.safeParse({ tripId: "../admin" }).success).toBe(false);
    expect(
      GenerationStatusRequestSchema.safeParse({
        tripId: "mock_trip_edimbourg",
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe("GenerationStatusSchema", () => {
  it("accepte un état cohérent de chaque phase", () => {
    expect(GenerationStatusSchema.safeParse(STATUS).success).toBe(true);
    const done = {
      ...STATUS,
      days: [day(1, "ready", 4), day(2, "ready", 4)],
      ready: 8,
    };
    expect(GenerationStatusSchema.safeParse({ ...done, phase: "ready" }).success).toBe(true);
    const partial = {
      ...STATUS,
      days: [day(1, "ready", 4), day(2, "ready", 2)],
      ready: 6,
    };
    expect(GenerationStatusSchema.safeParse({ ...partial, phase: "incomplete" }).success).toBe(true);
    expect(
      GenerationStatusSchema.safeParse({
        ...STATUS,
        phase: "failed",
        reason: "quota_reached",
        retryable: false,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["ready différent de la somme des jours", { ...STATUS, ready: 4 }],
    ["ready au-delà de expected", { ...STATUS, days: [day(1, "ready", 9)], expected: 8, ready: 9 }],
    ["jours dans le désordre", { ...STATUS, days: [day(2, "preparing", 1), day(1, "ready", 4)] }],
    ["aucun jour", { ...STATUS, days: [], ready: 0 }],
    ["prêt avant la fin", { ...STATUS, phase: "ready" }],
    [
      "incomplet sans manque",
      {
        ...STATUS,
        phase: "incomplete",
        days: [day(1, "ready", 4), day(2, "ready", 4)],
        ready: 8,
      },
    ],
    ["incomplet avec un jour en préparation", { ...STATUS, phase: "incomplete" }],
    ["échec sans raison", { ...STATUS, phase: "failed", retryable: true }],
    ["raison inconnue", { ...STATUS, phase: "failed", reason: "timeout", retryable: true }],
    [
      "nom de lieu en trop",
      {
        ...STATUS,
        days: [{ ...day(1, "ready", 4), names: ["[Lieu]"] }, day(2, "preparing", 1)],
      },
    ],
  ])("refuse : %s", (_label, value) => {
    expect(GenerationStatusSchema.safeParse(value).success).toBe(false);
  });

  it("seule la phase « preparing » n'est pas finale", () => {
    expect(isFinalGenerationPhase("preparing")).toBe(false);
    for (const phase of ["ready", "incomplete", "failed"] as const) expect(isFinalGenerationPhase(phase)).toBe(true);
  });
});

describe("codes du lancement", () => {
  it("unauthenticated et active_preview_exists sont des codes d'ApiError ; quota_reached n'en est pas un (0077)", () => {
    expect(API_ERROR_CODES).toContain("unauthenticated");
    expect(API_ERROR_CODES).toContain("active_preview_exists");
    expect(API_ERROR_CODES).not.toContain("quota_reached");
  });

  it("isActivePreviewConflict ne reconnaît que le conflit qui porte un voyage", () => {
    expect(
      isActivePreviewConflict({
        ok: false,
        error: { code: "active_preview_exists" },
        activeTripId: "mock_trip_edimbourg",
      }),
    ).toBe(true);
    expect(isActivePreviewConflict({ ok: false, error: { code: "provider_error" } })).toBe(false);
    expect(
      isActivePreviewConflict({
        ok: true,
        value: { tripId: "mock_trip_edimbourg" },
      }),
    ).toBe(false);
  });
});
