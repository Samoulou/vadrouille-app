// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { getRequestContext } from "./context";
import { mockTripAdapter } from "./mock";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRequestContext (décision 0013, § 3.6)", () => {
  it("renvoie l'organisation simulée avec l'adaptateur mock (défaut)", () => {
    vi.stubEnv("DATA_ADAPTER", undefined);
    expect(getRequestContext()).toEqual({ organizationId: MOCK_ORGANIZATION_ID });
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(getRequestContext()).toEqual({ organizationId: MOCK_ORGANIZATION_ID });
  });

  it("lève une erreur avec tout autre adaptateur", () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    expect(() => getRequestContext()).toThrow(/B3/);
  });

  it("adaptateurs: contexte de requête org_prototype en mode prototype, refusé en production", () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    vi.stubEnv("NODE_ENV", "test");
    expect(getRequestContext()).toEqual({ organizationId: PROTOTYPE_ORG_ID });
    expect(getRequestContext("prototype", { NODE_ENV: "development" })).toEqual({ organizationId: PROTOTYPE_ORG_ID });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => getRequestContext()).toThrow(/adaptateur prototype refusé/);
    expect(() => getRequestContext("prototype", { NODE_ENV: "test", VADROUILLE_ENV: "production" })).toThrow(
      /adaptateur prototype refusé/,
    );
    expect(() => getRequestContext("prototype", { NODE_ENV: "production" })).toThrow(/adaptateur prototype refusé/);
  });

  it("renvoie une copie : la modifier ne change pas le contexte suivant", () => {
    const ctx = getRequestContext("mock");
    ctx.organizationId = "autre";
    expect(getRequestContext("mock").organizationId).toBe(MOCK_ORGANIZATION_ID);
  });
});

describe("adaptateur mock : voyage débloqué (écran 6b)", () => {
  const ctx = { organizationId: MOCK_ORGANIZATION_ID };

  it("renvoie le voyage débloqué et ses propositions, validés", async () => {
    const trip = await mockTripAdapter.getTrip(ctx, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(trip?.unlocked).toBe(true);
    expect((await mockTripAdapter.listProposals(ctx, EDIMBOURG_DEBLOQUE_TRIP_ID)).length).toBeGreaterThanOrEqual(7);
    expect((await mockTripAdapter.getTrip(ctx, EDIMBOURG_TRIP_ID))?.unlocked).toBe(false);
  });

  it("ne renvoie rien pour une autre organisation", async () => {
    const other = { organizationId: "mock_org_autre" };
    expect(await mockTripAdapter.getTrip(other, EDIMBOURG_DEBLOQUE_TRIP_ID)).toBeNull();
    expect(await mockTripAdapter.listProposals(other, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual([]);
  });
});
