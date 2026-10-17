// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { brancherConnexionReelle } from "./better-auth";
import { getOptionalRequestContext, getRequestContext, PROTOTYPE_USER_ID, SessionRequiseError } from "./context";
import { mockTripAdapter } from "./mock";
import type { AdapterContext } from "./types";

// B3c (décision 0077 § 5.3, B3-TL-4) : contexte de la session, lu par `getServerRequestContext()` (B3b) branché au
// démarrage ; simulé ici par le branchement d'un double.
const session = vi.hoisted(() => ({ lire: vi.fn<() => Promise<AdapterContext | null>>() }));

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

describe("getRequestContext avec AUTH_ADAPTER=better-auth (B3c ; décision 0077 § 5.3, B3-TL-4)", () => {
  const SESSION: AdapterContext = { organizationId: "0b5e0000-0000-4000-8000-000000000001", userId: "0b5e0000-0000-4000-8000-000000000002", role: "owner" };
  const CI: NodeJS.ProcessEnv = { NODE_ENV: "test", VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" };

  beforeEach(() => {
    brancherConnexionReelle({
      operations: () => {
        throw new Error("non appelé");
      },
      limiter: async () => ({ ok: true, value: undefined }),
      contexte: session.lire,
    });
  });

  afterEach(() => {
    session.lire.mockReset();
  });

  it("rend le contexte de la session, quel que soit DATA_ADAPTER (B3-PO-10), et une copie", async () => {
    session.lire.mockResolvedValue(SESSION);
    for (const value of [undefined, "mock", "prototype", "api"]) {
      expect(await getRequestContext(value, CI)).toEqual(SESSION);
      expect(await getOptionalRequestContext(value, { ...CI, VADROUILLE_ENV: "local" })).toEqual(SESSION);
    }
    const ctx = await getRequestContext("mock", CI);
    ctx.organizationId = "autre";
    expect(SESSION.organizationId).toBe("0b5e0000-0000-4000-8000-000000000001");
  });

  it("sans session : getOptionalRequestContext rend null, getRequestContext lève SessionRequiseError", async () => {
    session.lire.mockResolvedValue(null);
    expect(await getOptionalRequestContext("mock", CI)).toBeNull();
    await expect(getRequestContext("mock", CI)).rejects.toBeInstanceOf(SessionRequiseError);
  });

  it("refusé hors local et ci (B3-TL-2), avant toute lecture de session", async () => {
    session.lire.mockResolvedValue(SESSION);
    for (const env of [
      { ...CI, VADROUILLE_ENV: "staging" },
      { ...CI, VADROUILLE_ENV: "production" },
      { NODE_ENV: "test", VERCEL_ENV: "production", AUTH_ADAPTER: "better-auth" },
      { NODE_ENV: "test", AUTH_ADAPTER: "better-auth" },
    ] satisfies NodeJS.ProcessEnv[]) {
      await expect(getRequestContext("mock", env)).rejects.toThrow(/better-auth refusée/);
    }
    expect(session.lire).not.toHaveBeenCalled();
  });

  it("avec AUTH_ADAPTER=mock, la session n'est jamais lue", async () => {
    expect(await getRequestContext("mock", { ...CI, AUTH_ADAPTER: "mock" })).toEqual({
      organizationId: MOCK_ORGANIZATION_ID,
      userId: MOCK_USER_ID,
      role: "owner",
    });
    expect(session.lire).not.toHaveBeenCalled();
  });
});
