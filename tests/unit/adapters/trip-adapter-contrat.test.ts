// @vitest-environment node
import { describe, it } from "vitest";

import { MOCK_REQUEST_CONTEXT, mockTripAdapter } from "@/adapters/mock";
import { LISBONNE_TRIP_ID, PORTO_TRIP_ID } from "@/mocks/autres-voyages";
import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID } from "@/mocks/edimbourg";

import { executerContratTripAdapter } from "../../support/trip-adapter-contrat";

/**
 * `adaptateurs: mock et api passent la même suite de contrat` (spécification B6, B6a point 6 ; décision 0086 § 1.5),
 * côté `mock` (`pnpm test`). Côté `api` : `tests/db/adaptateur-api.test.ts`.
 */
describe("contrat TripAdapter : mock", () => {
  it("adaptateurs: mock et api passent la même suite de contrat", async () => {
    await executerContratTripAdapter({
      adapter: mockTripAdapter,
      ctx: MOCK_REQUEST_CONTEXT,
      autreCtx: { organizationId: "mock_org_autre", userId: "mock_user_autre", role: "owner" },
      voyages: [EDIMBOURG_TRIP_ID, EDIMBOURG_DEBLOQUE_TRIP_ID, LISBONNE_TRIP_ID, PORTO_TRIP_ID],
      inconnu: "mock_trip_inconnu",
      jourSansPosition: { tripId: LISBONNE_TRIP_ID, index: 1 },
    });
  });
});
