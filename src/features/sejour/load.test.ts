import { describe, expect, it } from "vitest";

import { MOCK_DEMO_TRIP } from "@/adapters";
import { createMockTripAdapter } from "@/adapters/mock";
import { edimbourg } from "@/mocks/edimbourg";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";

import { dayFromParam, readTrip } from "./load";

describe("sejour: 404 hors organisation ou hors limites (lecture)", () => {
  const adapter = createMockTripAdapter([
    { trip: edimbourg, proposals: [], maps: edimbourgCarte },
    { trip: { ...edimbourg, id: "autre_trip", organizationId: "autre_org" }, proposals: [] },
  ]);

  it("lit le voyage et ses positions dans l'organisation de la requête", async () => {
    const data = await readTrip(adapter, MOCK_DEMO_TRIP.ctx, MOCK_DEMO_TRIP.tripId);
    expect(data?.trip.id).toBe("mock_trip_edimbourg");
    expect(data?.maps.map((map) => map.dayIndex)).toEqual(edimbourgCarte.map((map) => map.dayIndex));
  });

  it("voyage inconnu ou d'une autre organisation : null", async () => {
    expect(await readTrip(adapter, MOCK_DEMO_TRIP.ctx, "inconnu")).toBeNull();
    expect(await readTrip(adapter, MOCK_DEMO_TRIP.ctx, "autre_trip")).toBeNull();
    expect(await readTrip(adapter, { organizationId: "autre_org" }, MOCK_DEMO_TRIP.tripId)).toBeNull();
  });

  it.each(["0", "7", "02", "abc", "1.5", "-1", "", " 2"])("n = « %s » : hors limites", (n) => {
    expect(dayFromParam(edimbourg, n)).toBeNull();
  });

  it.each(["1", "2", "6"])("n = « %s » : jour du voyage", (n) => {
    expect(dayFromParam(edimbourg, n)?.index).toBe(Number(n));
  });
});
