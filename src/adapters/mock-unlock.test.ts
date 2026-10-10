// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { validateDayMap } from "@/contracts";
import {
  EDIMBOURG_DEBLOQUE_TRIP_ID,
  EDIMBOURG_TRIP_ID,
  MOCK_ORGANIZATION_ID,
  propositions,
  propositionsDebloque,
} from "@/mocks/edimbourg";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";

import { getTripAdapter, getTripReader } from "./index";
import { counterpartOf, createMockTripAdapter, mockTripAdapter } from "./mock";
import { withSimulatedUnlock } from "./mock-unlock";
import { explicitScope, resetScope } from "./simulation";

/** Vue débloquée du voyage simulé, forme B (décision 0020 § 3). */

const ctx = { organizationId: MOCK_ORGANIZATION_ID };
const otherCtx = { organizationId: "mock_org_autre" };

const unlockedFor = (paid: Set<string>) => async (_ctx: { organizationId: string }, tripId: string) => ({ unlocked: paid.has(`${_ctx.organizationId}:${tripId}`) });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withSimulatedUnlock", () => {
  it("sans droit : l'adaptateur de base, inchangé", async () => {
    const reader = withSimulatedUnlock(mockTripAdapter, unlockedFor(new Set()), counterpartOf);
    expect(await reader.getTrip(ctx, EDIMBOURG_TRIP_ID)).toEqual(await mockTripAdapter.getTrip(ctx, EDIMBOURG_TRIP_ID));
    expect(await reader.listProposals(ctx, EDIMBOURG_TRIP_ID)).toEqual(propositions);
    expect(await reader.getTripMap(ctx, EDIMBOURG_TRIP_ID)).toEqual(await mockTripAdapter.getTripMap(ctx, EDIMBOURG_TRIP_ID));
  });

  it("avec un droit : contenu du pendant débloqué, réétiqueté sous l'identifiant payé", async () => {
    const reader = withSimulatedUnlock(mockTripAdapter, unlockedFor(new Set([`${MOCK_ORGANIZATION_ID}:${EDIMBOURG_TRIP_ID}`])), counterpartOf);
    const trip = await reader.getTrip(ctx, EDIMBOURG_TRIP_ID);
    expect(trip?.id).toBe(EDIMBOURG_TRIP_ID);
    expect(trip?.unlocked).toBe(true);
    expect(trip?.days.find((day) => day.index === 6)?.generating).toBe(true);
    expect((await reader.getDay(ctx, EDIMBOURG_TRIP_ID, 6))?.generating).toBe(true);
    expect((await reader.listProposals(ctx, EDIMBOURG_TRIP_ID)).map((p) => p.id)).toEqual(propositionsDebloque.map((p) => p.id));
    expect(JSON.stringify(trip)).not.toContain(EDIMBOURG_DEBLOQUE_TRIP_ID);
  });

  it("positions du pendant réétiquetées et revalidées ; avant T6, aucune position (null)", async () => {
    const maps = edimbourgCarte.map((map) => ({ ...map, tripId: EDIMBOURG_DEBLOQUE_TRIP_ID }));
    const { edimbourg, edimbourgDebloque } = await import("@/mocks/edimbourg");
    const base = createMockTripAdapter([
      { trip: edimbourg, proposals: propositions, maps: edimbourgCarte },
      { trip: edimbourgDebloque, proposals: propositionsDebloque, maps },
    ]);
    const reader = withSimulatedUnlock(base, unlockedFor(new Set([`${MOCK_ORGANIZATION_ID}:${EDIMBOURG_TRIP_ID}`])), counterpartOf);
    const trip = (await reader.getTrip(ctx, EDIMBOURG_TRIP_ID))!;
    const map = await reader.getDayMap(ctx, EDIMBOURG_TRIP_ID, 2);
    expect(map?.tripId).toBe(EDIMBOURG_TRIP_ID);
    expect(validateDayMap(trip.days[1]!, map!, EDIMBOURG_TRIP_ID)).toEqual([]);
    for (const dayMap of await reader.getTripMap(ctx, EDIMBOURG_TRIP_ID)) expect(dayMap.tripId).toBe(EDIMBOURG_TRIP_ID);

    const plain = withSimulatedUnlock(mockTripAdapter, unlockedFor(new Set([`${MOCK_ORGANIZATION_ID}:${EDIMBOURG_TRIP_ID}`])), counterpartOf);
    expect(await plain.getDayMap(ctx, EDIMBOURG_TRIP_ID, 2)).toBeNull();
    expect(await plain.getTripMap(ctx, EDIMBOURG_TRIP_ID)).toEqual([]);
  });

  it("voyage débloqué dans les données : jamais modifié ; autre organisation : rien", async () => {
    const reader = withSimulatedUnlock(mockTripAdapter, async () => ({ unlocked: true }), counterpartOf);
    expect(await reader.getTrip(ctx, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual(await mockTripAdapter.getTrip(ctx, EDIMBOURG_DEBLOQUE_TRIP_ID));
    expect(await reader.getTrip(otherCtx, EDIMBOURG_TRIP_ID)).toBeNull();
    expect(await reader.listProposals(otherCtx, EDIMBOURG_TRIP_ID)).toEqual([]);
  });

  it("voyage débloqué sans pendant connu : son contenu, avec unlocked: true", async () => {
    const reader = withSimulatedUnlock(mockTripAdapter, async () => ({ unlocked: true }), () => undefined);
    const trip = await reader.getTrip(ctx, EDIMBOURG_TRIP_ID);
    expect(trip?.unlocked).toBe(true);
    expect(await reader.listProposals(ctx, EDIMBOURG_TRIP_ID)).toEqual(propositions);
  });
});

describe("getTripReader", () => {
  it("sans paiement simulé disponible : l'adaptateur de base (identité)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEMO_PAYMENT", undefined);
    expect(getTripReader()).toBe(getTripAdapter());
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getTripReader()).toBe(getTripAdapter());
  });

  it("isolation de deux portées : un droit dans l'une ne débloque pas l'autre", async () => {
    resetScope("lecteur-a", 0);
    resetScope("lecteur-b", 0);
    const a = explicitScope("lecteur-a");
    const b = explicitScope("lecteur-b");
    a.payment.entitlements.set(`${MOCK_ORGANIZATION_ID}\u0000${EDIMBOURG_TRIP_ID}`, {
      organizationId: MOCK_ORGANIZATION_ID,
      tripId: EDIMBOURG_TRIP_ID,
      at: 0,
    });
    expect((await getTripReader({ scope: a }).getTrip(ctx, EDIMBOURG_TRIP_ID))?.unlocked).toBe(true);
    expect((await getTripReader({ scope: b }).getTrip(ctx, EDIMBOURG_TRIP_ID))?.unlocked).toBe(false);
    expect((await getTripReader({ scope: a }).getTrip(otherCtx, EDIMBOURG_TRIP_ID))).toBeNull();
  });
});

describe("jeux simulés d'Édimbourg", () => {
  it("identifiants de propositions et d'étapes proposées disjoints entre l'aperçu et la suite du tri", () => {
    const apercu = new Set(propositions.flatMap((p) => [p.id, p.stop.id]));
    const suite = propositionsDebloque.flatMap((p) => [p.id, p.stop.id]);
    expect(suite.filter((id) => apercu.has(id))).toEqual([]);
  });

  it("pendant débloqué de l'aperçu", () => {
    expect(counterpartOf(EDIMBOURG_TRIP_ID)).toBe(EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(counterpartOf(EDIMBOURG_DEBLOQUE_TRIP_ID)).toBeUndefined();
    expect(counterpartOf("constructor")).toBeUndefined();
  });
});
