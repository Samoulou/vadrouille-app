// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import {
  brancherConnexionReelle,
  debrancherConnexionReellePourTests,
  type OperationsConnexion,
} from "@/adapters/better-auth";
import { resetScope } from "@/adapters/simulation";
import { fail, type Brief, type TripRequest } from "@/contracts";
import {
  MOCK_DEMO_TRIP_DRAFT,
  MOCK_INFERRED_BRIEF,
} from "@/mocks/creation-edimbourg";
import {
  createTrip,
  getGenerationStatus,
  retryGeneration,
} from "@/server/actions/creation";

/**
 * Spécification M1a, critère 7 (décision 0136 § 2.1) : sur `api`, l'action de création ne lit jamais le cookie d'accès du
 * site d'essai. Une requête qui le porte, sans session, est refusée (`unauthenticated`) et l'adaptateur n'est pas appelé ;
 * le graphe du chemin `api` n'atteint pas `src/server/p0/acces.ts` ni `src/server/p0/garde.ts`, seuls lecteurs du cookie
 * (`tests/unit/p0/imports.test.ts`, « chaine-inversee: aucun accès au schéma prototype (graphe) »).
 */

const SCOPE = "chaine-inversee-cookie";
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-vadrouille-simulation": "chaine-inversee-cookie",
      cookie: "__Host-p0_acces=valeur-de-test",
    }),
  cookies: async () => {
    throw new Error("le chemin api ne lit aucun cookie par next/headers");
  },
}));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getCreationAdapter: vi.fn() };
});

const NOW = Date.parse("2026-08-01T12:00:00+02:00");
const { inferredFields, ...inferred } = MOCK_INFERRED_BRIEF;
const REQUEST: TripRequest = {
  requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e12",
  draft: MOCK_DEMO_TRIP_DRAFT,
  brief: { ...inferred, limits: [], inferredFields } as Brief,
};

const operations: OperationsConnexion = {
  requestCode: async () => ({ ok: true }),
  verifyCode: async () => ({ ok: false, code: "invalid_code" }),
  readSession: async () => null,
  signOut: async () => ({ ok: true }),
};

beforeEach(() => {
  vi.stubEnv("AUTH_ADAPTER", "better-auth");
  vi.stubEnv("DATA_ADAPTER", "api");
  vi.stubEnv("VADROUILLE_ENV", "ci");
  resetScope(SCOPE, NOW);
  debrancherConnexionReellePourTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  debrancherConnexionReellePourTests();
});

describe("chaîne inversée : cookie d'accès du site d'essai", () => {
  it("chaine-inversee: aucun cookie d'accès (cookie porté, sans session : unauthenticated, adaptateur non appelé)", async () => {
    const appel = vi.fn();
    vi.mocked(adapters.getCreationAdapter).mockReturnValue({
      createTrip: appel,
      getGenerationStatus: appel,
      retryGeneration: appel,
    } as never);
    brancherConnexionReelle({
      operations: () => operations,
      limiter: async () => ({ ok: true, value: undefined }),
      contexte: async () => null,
    });
    expect(await createTrip(REQUEST)).toEqual(fail("unauthenticated"));
    expect(
      await getGenerationStatus({
        tripId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e13",
      }),
    ).toEqual(fail("unauthenticated"));
    expect(
      await retryGeneration({
        tripId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e13",
        requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e14",
      }),
    ).toEqual(fail("unauthenticated"));
    expect(appel).not.toHaveBeenCalled();
  });
});
