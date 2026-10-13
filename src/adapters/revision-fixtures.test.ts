// @vitest-environment node
import { describe, expect, it } from "vitest";

import { RevisionFixturesSchema } from "@/contracts";
import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, edimbourg } from "@/mocks/edimbourg";

import { getRevisionFixtures } from "./index";
import { createMockTripAdapter, getMockRevisionFixtures } from "./mock";

/** Jeu simulé de révision (spécification F7, F7-TL-3 ; décision 0016 § 6) : isolation par organisation, adaptateur `mock` seul. */

const ownCtx = { organizationId: MOCK_ORGANIZATION_ID, userId: "user_test", role: "owner" as const };
const otherCtx = { organizationId: "mock_org_autre", userId: "user_test", role: "owner" as const };

describe("adaptateurs: jeu simulé de révision", () => {
  it("Édimbourg et son pendant débloqué : jeu validé par `RevisionFixturesSchema`", async () => {
    for (const tripId of [EDIMBOURG_TRIP_ID, EDIMBOURG_DEBLOQUE_TRIP_ID]) {
      const fixtures = await getMockRevisionFixtures(ownCtx, tripId);
      expect(fixtures).not.toBeNull();
      expect(RevisionFixturesSchema.safeParse(fixtures).success).toBe(true);
      expect(fixtures!.replacements.map((fixture) => fixture.stopId)).toEqual(["j2-dean-village"]);
    }
  });

  it("autre organisation, voyage inconnu ou sans jeu : `null`", async () => {
    expect(await getMockRevisionFixtures(otherCtx, EDIMBOURG_TRIP_ID)).toBeNull();
    expect(await getMockRevisionFixtures(ownCtx, "inconnu")).toBeNull();
    expect(await getMockRevisionFixtures(ownCtx, "mock_trip_lisbonne")).toBeNull();
    // Voyage d'une autre organisation servi par un adaptateur : pas de jeu de révision pour la session.
    const foreign = createMockTripAdapter([{ trip: { ...edimbourg, organizationId: "mock_org_autre" }, proposals: [] }]);
    expect(await getMockRevisionFixtures(ownCtx, EDIMBOURG_TRIP_ID, foreign)).toBeNull();
  });

  it("getRevisionFixtures : jeu avec l'adaptateur `mock` (par défaut), `null` avec un autre adaptateur", async () => {
    expect(await getRevisionFixtures(ownCtx, EDIMBOURG_TRIP_ID, undefined)).not.toBeNull();
    expect(await getRevisionFixtures(ownCtx, EDIMBOURG_TRIP_ID, "mock")).not.toBeNull();
    expect(await getRevisionFixtures(ownCtx, EDIMBOURG_TRIP_ID, "prototype")).toBeNull();
    expect(await getRevisionFixtures(ownCtx, EDIMBOURG_TRIP_ID, "api")).toBeNull();
  });
});
