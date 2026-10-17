// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MOCK_DEMO_TRIP,
  MOCK_DEMO_UNLOCKED_TRIP,
  authAdapterChoice,
  getAuthAdapter,
  getTripAdapter,
  isMockAdapter,
  isPrototypeAdapter,
  mockAuthAllowed,
} from "./index";
import { mockTripAdapter } from "./mock";
import { explicitScope } from "./simulation";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTripAdapter", () => {
  it("choisit l'adaptateur mock par défaut", () => {
    vi.stubEnv("DATA_ADAPTER", undefined);
    expect(getTripAdapter()).toBe(mockTripAdapter);
  });

  it("choisit l'adaptateur mock avec DATA_ADAPTER=mock", () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(getTripAdapter()).toBe(mockTripAdapter);
  });

  it("lève « adaptateur api non implémenté » avec DATA_ADAPTER=api", () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    expect(() => getTripAdapter()).toThrow("adaptateur api non implémenté");
  });

  it("refuse une valeur inconnue", () => {
    vi.stubEnv("DATA_ADAPTER", "postgres");
    expect(() => getTripAdapter()).toThrow(/DATA_ADAPTER inconnu/);
  });

  it("adaptateurs: getTripAdapter accepte prototype et cite mock, api, prototype dans son erreur", () => {
    expect(() => getTripAdapter("postgres")).toThrow("(valeurs : mock, api, prototype)");
    const adapter = getTripAdapter("prototype", { NODE_ENV: "test" });
    expect(adapter).not.toBe(mockTripAdapter);
    expect(typeof adapter.getTrip).toBe("function");
    expect(() => getTripAdapter("prototype", { NODE_ENV: "production" })).toThrow(/adaptateur prototype refusé/);
  });
});

describe("isMockAdapter (spécification D1)", () => {
  it.each([undefined, "", "  ", "mock", " mock "])("vrai pour DATA_ADAPTER=%j", (value) => {
    vi.stubEnv("DATA_ADAPTER", value);
    expect(isMockAdapter()).toBe(true);
    expect(isMockAdapter(value)).toBe(true);
  });

  it.each(["api", "autre", "MOCK"])("faux, sans erreur, pour DATA_ADAPTER=%j", (value) => {
    vi.stubEnv("DATA_ADAPTER", value);
    expect(() => isMockAdapter()).not.toThrow();
    expect(isMockAdapter()).toBe(false);
  });

  it("ne dépend ni de NODE_ENV ni de VADROUILLE_DEV_PAGES", () => {
    vi.stubEnv("DATA_ADAPTER", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", undefined);
    expect(isMockAdapter()).toBe(true);
  });
});

describe("isPrototypeAdapter (spécification P0, P0b1)", () => {
  it("vrai pour prototype, faux sinon, sans erreur ni liste blanche", () => {
    expect(isPrototypeAdapter("prototype")).toBe(true);
    expect(isPrototypeAdapter(" prototype ")).toBe(true);
    for (const value of [undefined, "", "mock", "api", "PROTOTYPE"]) expect(isPrototypeAdapter(value)).toBe(false);
  });
});

describe("MOCK_DEMO_UNLOCKED_TRIP (D1-PO-3)", () => {
  it("désigne le voyage débloqué, lisible par l'adaptateur mock", async () => {
    const trip = await mockTripAdapter.getTrip(MOCK_DEMO_UNLOCKED_TRIP.ctx, MOCK_DEMO_UNLOCKED_TRIP.tripId);
    expect(trip?.unlocked).toBe(true);
    expect(MOCK_DEMO_UNLOCKED_TRIP.ctx).toEqual(MOCK_DEMO_TRIP.ctx);
    expect(MOCK_DEMO_UNLOCKED_TRIP.tripId).not.toBe(MOCK_DEMO_TRIP.tripId);
  });
});

/**
 * Garde de la connexion simulée (décision 0017 § 11.2, F8b) : levée à l'appel, fermée par défaut, aucun repli vers
 * `mock`. `env` est passé explicitement : aucun changement de l'environnement du processus.
 */
describe("getAuthAdapter (décision 0017 § 11.2)", () => {
  const env = (values: Record<string, string | undefined>) => values as unknown as NodeJS.ProcessEnv;
  const scope = explicitScope("auth-garde");

  it.each(["development", "test", "production"])(
    "lève sur un déploiement de production, avec ou sans drapeau (NODE_ENV=%s)",
    (nodeEnv) => {
      for (const deployment of [{ VERCEL_ENV: "production" }, { VADROUILLE_ENV: "production" }, { VADROUILLE_ENV: " Production" }]) {
        expect(() => getAuthAdapter({ scope, env: env({ NODE_ENV: nodeEnv, ...deployment }) })).toThrow(/connexion simulée refusée/);
        expect(() => getAuthAdapter({ scope, env: env({ NODE_ENV: nodeEnv, VADROUILLE_DEMO_AUTH: "1", ...deployment }) })).toThrow(
          /connexion simulée refusée/,
        );
      }
    },
  );

  it("lève avec NODE_ENV=production sans le drapeau, ou avec un drapeau autre que « 1 »", () => {
    expect(() => getAuthAdapter({ scope, env: env({ NODE_ENV: "production" }) })).toThrow(/connexion simulée refusée/);
    expect(() => getAuthAdapter({ scope, env: env({ NODE_ENV: "production", VADROUILLE_DEMO_AUTH: "true" }) })).toThrow(/refusée/);
    expect(() => getAuthAdapter({ scope, env: env({ VADROUILLE_DEMO_AUTH: " 1" }) })).toThrow(/refusée/);
  });

  it("ne lève pas avec NODE_ENV=production et le drapeau, hors déploiement de production (Playwright, CI)", () => {
    const adapter = getAuthAdapter({ scope, env: env({ NODE_ENV: "production", VADROUILLE_DEMO_AUTH: "1", VERCEL_ENV: "preview" }) });
    expect(adapter.mode).toBe("simulated");
  });

  it.each(["development", "test"])("ne lève pas en %s hors déploiement de production", (nodeEnv) => {
    expect(getAuthAdapter({ scope, env: env({ NODE_ENV: nodeEnv }) }).mode).toBe("simulated");
    expect(getAuthAdapter({ scope, env: env({ NODE_ENV: nodeEnv, AUTH_ADAPTER: "mock" }) }).config.codeTtlMs).toBe(600_000);
  });

  it("lève pour AUTH_ADAPTER inconnu, et pour better-auth hors local et ci (B3c ; B3-TL-2), même en test", () => {
    expect(() => getAuthAdapter({ scope, env: env({ NODE_ENV: "test", AUTH_ADAPTER: "better-auth" }) })).toThrow(/better-auth refusée/);
    expect(() => getAuthAdapter({ scope, env: env({ NODE_ENV: "test", AUTH_ADAPTER: "better-auth", VADROUILLE_ENV: "staging" }) })).toThrow(
      /better-auth refusée/,
    );
    expect(() => getAuthAdapter({ scope, env: env({ NODE_ENV: "test", AUTH_ADAPTER: "magique" }) })).toThrow(/AUTH_ADAPTER inconnu/);
  });

  it.each(["local", "ci"])("rend l'adaptateur better-auth en %s (B3c), mode réel, limites par adresse e-mail (B3-PO-6)", (environnement) => {
    const adapter = getAuthAdapter({ scope, env: env({ NODE_ENV: "production", AUTH_ADAPTER: "better-auth", VADROUILLE_ENV: environnement }) });
    expect(adapter.mode).toBe("real");
    expect(adapter.config).toEqual({ codeTtlMs: 600_000, maxAttempts: 3, maxCodeRequests: 5, codeRequestWindowMs: 3_600_000 });
  });

  it("mockAuthAllowed et authAdapterChoice sont exportés pour l'écran 4 et les tests", () => {
    expect(mockAuthAllowed(env({ NODE_ENV: "test" }))).toBe(true);
    expect(mockAuthAllowed(env({}))).toBe(false);
    expect(authAdapterChoice(env({}))).toBe("mock");
    expect(authAdapterChoice(env({ AUTH_ADAPTER: " better-auth " }))).toBe("better-auth");
  });
});
