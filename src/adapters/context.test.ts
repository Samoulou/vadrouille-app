// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { getRequestContext, PROTOTYPE_USER_ID } from "./context";
import { mockTripAdapter } from "./mock";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRequestContext (décision 0013, § 3.6)", () => {
  it("renvoie l'organisation simulée avec l'adaptateur mock (défaut)", async () => {
    vi.stubEnv("DATA_ADAPTER", undefined);
    expect(await getRequestContext()).toEqual({ organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" });
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(await getRequestContext()).toEqual({ organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" });
  });

  it("lève une erreur avec tout autre adaptateur", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    await expect(getRequestContext()).rejects.toThrow(/B3/);
  });

  it("adaptateurs: contexte de requête org_prototype en mode prototype, refusé en production", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    vi.stubEnv("NODE_ENV", "test");
    expect(await getRequestContext()).toEqual({ organizationId: PROTOTYPE_ORG_ID, userId: PROTOTYPE_USER_ID, role: "owner" });
    expect(await getRequestContext("prototype", { NODE_ENV: "development" })).toEqual({ organizationId: PROTOTYPE_ORG_ID, userId: PROTOTYPE_USER_ID, role: "owner" });
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(getRequestContext()).rejects.toThrow(/adaptateur prototype refusé/);
    await expect(getRequestContext("prototype", { NODE_ENV: "test", VADROUILLE_ENV: "production" })).rejects.toThrow(
      /adaptateur prototype refusé/,
    );
    await expect(getRequestContext("prototype", { NODE_ENV: "production" })).rejects.toThrow(/adaptateur prototype refusé/);
  });

  it("adaptateurs: org_prototype et son utilisateur technique ont des uuid fixes distincts (0046 D15 point 4)", () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(PROTOTYPE_ORG_ID).toMatch(UUID);
    expect(PROTOTYPE_USER_ID).toMatch(UUID);
    expect(PROTOTYPE_USER_ID).not.toBe(PROTOTYPE_ORG_ID);
  });

  it("renvoie une copie : la modifier ne change pas le contexte suivant", async () => {
    const ctx = await getRequestContext("mock");
    ctx.organizationId = "autre";
    expect((await getRequestContext("mock")).organizationId).toBe(MOCK_ORGANIZATION_ID);
  });
});

describe("adaptateur mock : voyage débloqué (écran 6b)", () => {
  const ctx = { organizationId: MOCK_ORGANIZATION_ID, userId: "user_test", role: "owner" as const };

  it("renvoie le voyage débloqué et ses propositions, validés", async () => {
    const trip = await mockTripAdapter.getTrip(ctx, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(trip?.unlocked).toBe(true);
    expect((await mockTripAdapter.listProposals(ctx, EDIMBOURG_DEBLOQUE_TRIP_ID)).length).toBeGreaterThanOrEqual(7);
    expect((await mockTripAdapter.getTrip(ctx, EDIMBOURG_TRIP_ID))?.unlocked).toBe(false);
  });

  it("ne renvoie rien pour une autre organisation", async () => {
    const other = { organizationId: "mock_org_autre", userId: "user_test", role: "owner" as const };
    expect(await mockTripAdapter.getTrip(other, EDIMBOURG_DEBLOQUE_TRIP_ID)).toBeNull();
    expect(await mockTripAdapter.listProposals(other, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual([]);
  });
});

describe("contexte de requête (E6)", () => {
  it("adaptateurs: le contexte porte userId et role", async () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    const ctx = await getRequestContext();
    expect(Object.keys(ctx).sort()).toEqual(["organizationId", "role", "userId"]);
    expect(ctx).toEqual({ organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" });
  });
});
