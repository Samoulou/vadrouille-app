// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { brancherConnexionReelle, debrancherConnexionReellePourTests, type OperationsConnexion } from "@/adapters/better-auth";
import { resetScope } from "@/adapters/simulation";
import type { AdapterContext } from "@/adapters/types";
import { fail, type Brief, type TripRequest } from "@/contracts";
import { MOCK_DEMO_TRIP_DRAFT, MOCK_INFERRED_BRIEF } from "@/mocks/creation-edimbourg";
import { createTrip } from "@/server/actions/creation";

/**
 * `createTrip` avec `AUTH_ADAPTER=better-auth` (revue consolidée du head `2b80bd7` de la PR 452, mineur 6) : le
 * contexte passé à l'adaptateur de création est celui de la session (organisation, personne **et rôle**), jamais un
 * rôle écrit en dur.
 */

const SCOPE = "creation-better-auth";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vadrouille-simulation": "creation-better-auth", cookie: "c" }) }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getCreationAdapter: vi.fn() };
});

const NOW = Date.parse("2026-08-01T12:00:00+02:00");
const { inferredFields, ...inferred } = MOCK_INFERRED_BRIEF;
const REQUEST: TripRequest = {
  requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11",
  draft: MOCK_DEMO_TRIP_DRAFT,
  brief: { ...inferred, limits: [], inferredFields } as Brief,
};
const CTX: AdapterContext = { organizationId: "0b5e0000-0000-4000-8000-000000000001", userId: "0b5e0000-0000-4000-8000-000000000002", role: "member" };

const operations: OperationsConnexion = {
  requestCode: async () => ({ ok: true }),
  verifyCode: async () => ({ ok: false, code: "invalid_code" }),
  readSession: async () => ({ sessionId: "s", ...CTX }),
  signOut: async () => ({ ok: true }),
};

beforeEach(() => {
  vi.stubEnv("AUTH_ADAPTER", "better-auth");
  vi.stubEnv("VADROUILLE_ENV", "ci");
  resetScope(SCOPE, NOW);
  debrancherConnexionReellePourTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  debrancherConnexionReellePourTests();
});

describe("createTrip : contexte de la session (better-auth)", () => {
  it("passe l'organisation, la personne et le rôle de la session à l'adaptateur", async () => {
    const creer = vi.fn(async () => fail("provider_error"));
    vi.mocked(adapters.getCreationAdapter).mockReturnValue({ createTrip: creer } as never);
    brancherConnexionReelle({ operations: () => operations, limiter: async () => ({ ok: true, value: undefined }), contexte: async () => ({ ...CTX }) });
    expect(await createTrip(REQUEST)).toEqual(fail("provider_error"));
    expect(creer).toHaveBeenCalledWith(CTX, REQUEST);
  });

  it("session présente mais contexte absent (adhésion retirée) : unauthenticated, adaptateur non appelé", async () => {
    const creer = vi.fn();
    vi.mocked(adapters.getCreationAdapter).mockReturnValue({ createTrip: creer } as never);
    brancherConnexionReelle({ operations: () => operations, limiter: async () => ({ ok: true, value: undefined }), contexte: async () => null });
    expect(await createTrip(REQUEST)).toEqual(fail("unauthenticated"));
    expect(creer).not.toHaveBeenCalled();
  });
});
