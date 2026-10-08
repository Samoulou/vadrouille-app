// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TripSchema } from "@/contracts";
import { EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, edimbourg } from "@/mocks/edimbourg";

import { createMockTripAdapter, mockTripAdapter } from "./mock";

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
});
