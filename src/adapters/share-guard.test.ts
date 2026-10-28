// @vitest-environment node
import { describe, expect, it } from "vitest";

import { realShareAvailable, shareAvailable, shareDemoAvailable } from "./share-guard";

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
