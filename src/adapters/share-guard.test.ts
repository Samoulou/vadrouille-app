// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { assertApiAdapter } from "./api-guard";
import { apiShareAvailable, realShareAvailable, shareAvailable, shareDemoAvailable } from "./share-guard";

/** Garde du partage simulé, fermée par défaut (spécification F10, F10-TL-7, C38 ; décision 0039). */

describe("shareDemoAvailable", () => {
  it.each([
    [{}, false],
    [{ NODE_ENV: "" }, false],
    [{ NODE_ENV: "staging" }, false],
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "test" }, true],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_SHARE: "1" }, true],
    [{ VADROUILLE_DEMO_SHARE: "1" }, true],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_SHARE: "true" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_SHARE: " 1" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_SHARE: "1", VERCEL_ENV: "production" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_SHARE: "1", VADROUILLE_ENV: "production" }, false],
    [{ NODE_ENV: "development", VERCEL_ENV: "production" }, false],
    [{ NODE_ENV: "development", VADROUILLE_ENV: "production" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "1" }, false],
  ])("%j : %s", (env, expected) => {
    expect(shareDemoAvailable(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe("shareAvailable", () => {
  it.each([
    [{ NODE_ENV: "test" }, true],
    [{ NODE_ENV: "test", DATA_ADAPTER: "mock" }, true],
    [{ NODE_ENV: "test", DATA_ADAPTER: "api" }, false],
    // Décision 0135 : le partage réel du site d'essai ouvre la garde avec l'adaptateur `prototype` sous sa liste blanche
    // (cette ligne valait `false` avant 0135, qui l'amende par écrit).
    [{ NODE_ENV: "test", DATA_ADAPTER: "prototype" }, true],
    [{ NODE_ENV: "production", DATA_ADAPTER: "prototype", VERCEL_ENV: "preview" }, true],
    [{ NODE_ENV: "production", DATA_ADAPTER: "prototype", VERCEL_ENV: "production" }, false],
    [{ NODE_ENV: "production", DATA_ADAPTER: "prototype", VADROUILLE_ENV: "production", VADROUILLE_DEMO_SHARE: "1" }, false],
    [{ NODE_ENV: "production", DATA_ADAPTER: "prototype" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_SHARE: "1", DATA_ADAPTER: "api" }, false],
    [{ NODE_ENV: "production" }, false],
  ])("%j : %s", (env, expected) => {
    expect(shareAvailable(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe("realShareAvailable (décision 0135)", () => {
  it.each([
    [{ NODE_ENV: "test", DATA_ADAPTER: "prototype" }, true],
    [{ NODE_ENV: "production", DATA_ADAPTER: "prototype", VERCEL_ENV: "preview" }, true],
    [{ NODE_ENV: "production", DATA_ADAPTER: "prototype", VADROUILLE_PROTOTYPE: "1", CI: "true" }, true],
    [{ NODE_ENV: "production", DATA_ADAPTER: "prototype" }, false],
    [{ NODE_ENV: "production", DATA_ADAPTER: "prototype", VERCEL_ENV: "production" }, false],
    [{ NODE_ENV: "development", DATA_ADAPTER: "prototype", VADROUILLE_ENV: "production" }, false],
    [{ NODE_ENV: "development", DATA_ADAPTER: "prototype", VADROUILLE_ENV: "staging" }, false],
    [{ NODE_ENV: "test", DATA_ADAPTER: "api" }, false],
    [{ NODE_ENV: "test", DATA_ADAPTER: "mock" }, false],
    [{ NODE_ENV: "test" }, false],
  ])("%j : %s", (env, expected) => {
    expect(realShareAvailable(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

/**
 * Garde du partage `api` (décision 0157 § 1.2, T2 ; ticket 1013, M6a). Les lignes de `shareAvailable` ci-dessus restent
 * toutes, sans changement de résultat (les lignes `DATA_ADAPTER: "api"` sans `better-auth` ni environnement déclaré
 * restent fausses) ; celles-ci sont ajoutées.
 */
const API_CI = { DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth", VADROUILLE_ENV: "ci" } as const;
const LIGNES_API: readonly (readonly [Record<string, string>, boolean])[] = [
  [API_CI, true],
  [{ ...API_CI, VADROUILLE_ENV: "local" }, true],
  [{ ...API_CI, NODE_ENV: "production" }, true],
  [{ DATA_ADAPTER: "api", VADROUILLE_ENV: "ci" }, false],
  [{ ...API_CI, AUTH_ADAPTER: "mock" }, false],
  [{ DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth" }, false],
  [{ DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth", NODE_ENV: "test" }, false],
  [{ ...API_CI, VADROUILLE_ENV: "staging" }, false],
  [{ ...API_CI, VADROUILLE_ENV: "production" }, false],
  [{ ...API_CI, VERCEL_ENV: "production" }, false],
  [{ ...API_CI, VERCEL_TARGET_ENV: "production" }, false],
  [{ ...API_CI, VERCEL_ENV: "preview" }, false],
  [{ VADROUILLE_DEMO_SHARE: "1" }, false],
  [{ ...API_CI, DATA_ADAPTER: "mock" }, false],
  [{ ...API_CI, DATA_ADAPTER: "prototype" }, false],
];

describe("apiShareAvailable (décision 0157 § 1.2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(LIGNES_API)("%j : %s", (env, expected) => {
    expect(apiShareAvailable(env as NodeJS.ProcessEnv)).toBe(expected);
  });

  it("shareAvailable suit apiShareAvailable sur api ; NODE_ENV=test seul ne l'ouvre pas", () => {
    for (const [env, expected] of LIGNES_API) {
      if ((env as Record<string, string>).DATA_ADAPTER !== "api") continue;
      expect(shareAvailable(env as NodeJS.ProcessEnv), JSON.stringify(env)).toBe(expected);
    }
  });

  it("apiShareAvailable vrai implique que assertApiAdapter ne lève pas sur le même environnement", () => {
    for (const [env, expected] of LIGNES_API) {
      if (!expected) continue;
      vi.unstubAllEnvs();
      vi.stubEnv("DATA_ADAPTER", env.DATA_ADAPTER ?? "");
      vi.stubEnv("AUTH_ADAPTER", env.AUTH_ADAPTER ?? "");
      vi.stubEnv("VADROUILLE_ENV", env.VADROUILLE_ENV ?? "");
      vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV ?? "");
      vi.stubEnv("VERCEL_TARGET_ENV", env.VERCEL_TARGET_ENV ?? "");
      expect(apiShareAvailable(), JSON.stringify(env)).toBe(true);
      expect(() => assertApiAdapter(), JSON.stringify(env)).not.toThrow();
    }
  });

  it("hors de local et ci (ouverture de betterAuthAllowed simulée, M1h) : TRUSTED_IP_HEADER exigé, à sa seule valeur admise", () => {
    const ouverte = true;
    const preview = { DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth", VERCEL_ENV: "preview" } as unknown as NodeJS.ProcessEnv;
    expect(apiShareAvailable(preview, ouverte)).toBe(false);
    expect(apiShareAvailable({ ...preview, TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }, ouverte)).toBe(true);
    expect(apiShareAvailable({ ...preview, TRUSTED_IP_HEADER: " X-Vercel-Forwarded-For " }, ouverte)).toBe(true);
    expect(apiShareAvailable({ ...preview, TRUSTED_IP_HEADER: "x-forwarded-for" }, ouverte)).toBe(false);
    expect(apiShareAvailable({ ...preview, TRUSTED_IP_HEADER: "" }, ouverte)).toBe(false);
    // Production : jamais, même ouverte et avec l'en-tête.
    expect(apiShareAvailable({ ...preview, VERCEL_ENV: "production", TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }, ouverte)).toBe(false);
    expect(apiShareAvailable({ ...preview, VERCEL_TARGET_ENV: "production", TRUSTED_IP_HEADER: "x-vercel-forwarded-for" }, ouverte)).toBe(false);
    // Sans l'ouverture (aujourd'hui) : fermée même avec l'en-tête.
    expect(apiShareAvailable({ ...preview, TRUSTED_IP_HEADER: "x-vercel-forwarded-for" })).toBe(false);
    // En `ci` : l'en-tête n'est pas exigé.
    expect(apiShareAvailable({ ...API_CI } as unknown as NodeJS.ProcessEnv, ouverte)).toBe(true);
  });
});
