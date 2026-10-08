// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DayMapSchema, TripSchema } from "@/contracts";
import { EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, edimbourg } from "@/mocks/edimbourg";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";

import { MOCK_DEMO_TRIP, createMockTripAdapter, mockTripAdapter } from "./mock";

const ownCtx = { organizationId: MOCK_ORGANIZATION_ID };
const otherCtx = { organizationId: "mock_org_autre" };

describe("adaptateur mock", () => {
  it("renvoie le voyage validé pour son organisation", async () => {
    const trip = await mockTripAdapter.getTrip(ownCtx, EDIMBOURG_TRIP_ID);
    expect(trip).toEqual(edimbourg);
    expect(() => TripSchema.parse(trip)).not.toThrow();
  });

  it("renvoie un jour par son index", async () => {
    const day = await mockTripAdapter.getDay(ownCtx, EDIMBOURG_TRIP_ID, 3);
    expect(day?.date).toBe("2026-08-31");
    expect(await mockTripAdapter.getDay(ownCtx, EDIMBOURG_TRIP_ID, 7)).toBeNull();
  });

  it("renvoie les 8 propositions", async () => {
    expect(await mockTripAdapter.listProposals(ownCtx, EDIMBOURG_TRIP_ID)).toHaveLength(8);
  });

  it("ne renvoie rien pour une autre organisation (isolation)", async () => {
    expect(await mockTripAdapter.getTrip(otherCtx, EDIMBOURG_TRIP_ID)).toBeNull();
    expect(await mockTripAdapter.getDay(otherCtx, EDIMBOURG_TRIP_ID, 1)).toBeNull();
    expect(await mockTripAdapter.listProposals(otherCtx, EDIMBOURG_TRIP_ID)).toEqual([]);
  });

  it("ne renvoie rien pour un voyage inconnu", async () => {
    expect(await mockTripAdapter.getTrip(ownCtx, "inconnu")).toBeNull();
    expect(await mockTripAdapter.listProposals(ownCtx, "inconnu")).toEqual([]);
  });

  it("renvoie une copie : modifier le résultat ne modifie pas le jeu", async () => {
    const trip = await mockTripAdapter.getTrip(ownCtx, EDIMBOURG_TRIP_ID);
    trip?.days.pop();
    expect(edimbourg.days).toHaveLength(6);
  });

  it("valide chaque sortie : un jeu invalide échoue", async () => {
    const broken = { ...edimbourg, rating: 4.5 } as typeof edimbourg;
    const adapter = createMockTripAdapter([{ trip: broken, proposals: [] }]);
    await expect(adapter.getTrip(ownCtx, EDIMBOURG_TRIP_ID)).rejects.toThrow();
  });

  it("renvoie les positions d'un jour, validées (F4)", async () => {
    const map = await mockTripAdapter.getDayMap(ownCtx, EDIMBOURG_TRIP_ID, 2);
    expect(map?.dayIndex).toBe(2);
    expect(() => DayMapSchema.parse(map)).not.toThrow();
    expect(await mockTripAdapter.getDayMap(ownCtx, EDIMBOURG_TRIP_ID, 7)).toBeNull();
  });

  it("renvoie les positions des 6 jours pour la vue d'ensemble (F4)", async () => {
    const maps = await mockTripAdapter.getTripMap(ownCtx, EDIMBOURG_TRIP_ID);
    expect(maps.map((map) => map.dayIndex)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ne renvoie aucune position pour une autre organisation ou un voyage inconnu (isolation)", async () => {
    expect(await mockTripAdapter.getDayMap(otherCtx, EDIMBOURG_TRIP_ID, 2)).toBeNull();
    expect(await mockTripAdapter.getTripMap(otherCtx, EDIMBOURG_TRIP_ID)).toEqual([]);
    expect(await mockTripAdapter.getTripMap(ownCtx, "inconnu")).toEqual([]);
  });

  it("renvoie null pour un jour sans position", async () => {
    const empty = edimbourgCarte.map((map) => (map.dayIndex === 2 ? { ...map, points: [] } : map));
    const adapter = createMockTripAdapter([{ trip: edimbourg, proposals: [], maps: empty }]);
    expect(await adapter.getDayMap(ownCtx, EDIMBOURG_TRIP_ID, 2)).toBeNull();
    expect(await adapter.getTripMap(ownCtx, EDIMBOURG_TRIP_ID)).toHaveLength(5);
  });

  it("refuse des positions qui ne concordent pas avec le jour", async () => {
    const broken = edimbourgCarte.map((map) =>
      map.dayIndex === 2 ? { ...map, points: [{ ref: { type: "stop" as const, stopId: "j1-chateau" }, lat: 1, lng: 1 }] } : map,
    );
    const adapter = createMockTripAdapter([{ trip: edimbourg, proposals: [], maps: broken }]);
    await expect(adapter.getDayMap(ownCtx, EDIMBOURG_TRIP_ID, 2)).rejects.toThrow(/j1-chateau/);
  });

  it("expose la référence du voyage de démonstration pour les pages de développement", async () => {
    expect(await mockTripAdapter.getTrip(MOCK_DEMO_TRIP.ctx, MOCK_DEMO_TRIP.tripId)).not.toBeNull();
  });
});
