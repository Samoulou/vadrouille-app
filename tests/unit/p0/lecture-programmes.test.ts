// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { valeurCookieAcces } from "@/server/p0/acces";
import { poolLectureProgrammes } from "@/server/p0/lecture-programmes";

/**
 * Barrière de la lecture des programmes réels (décision 0074 ; exigence 4, « même barrière que le lancement ») : pool
 * rendu seulement si la garde du mode réel est ouverte et le cookie d'accès valide ; sinon `null`, sans pool créé.
 */

const pool = { connect: vi.fn() };
const poolPrototype = vi.fn((): unknown => pool);
vi.mock("@/server/p0/base", () => ({ poolPrototype: () => poolPrototype() }));
const logEvent = vi.fn();
vi.mock("@/server/log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
  errorNameOf: (erreur: unknown) => (erreur instanceof Error ? erreur.name : undefined),
}));

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  poolPrototype.mockClear();
  logEvent.mockClear();
});

const [NOM_CODE = "", NOM_BASE = ""] = Object.keys({ P0_RUN_TOKEN: 0, P0_DATABASE_URL: 0 });
const T0 = Date.UTC(2026, 9, 16, 15);

function preversion(code: Buffer, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "p0-reel",
    P0_REAL_RUNS: "enabled",
    [NOM_BASE]: "postgres://exemple.invalid/p0",
    [NOM_CODE]: code.toString("hex"),
    ...extra,
  };
}

describe("p0: lecture des programmes réels derrière la barrière du lancement (décision 0074)", () => {
  const code = randomBytes(32);
  const cookie = valeurCookieAcces(code, T0);
  const lire = (env: NodeJS.ProcessEnv, valeur: string | undefined, maintenant = T0) =>
    poolLectureProgrammes({ env, execArgv: [], maintenant: () => maintenant, cookie: async () => valeur });

  it("garde ouverte et cookie valide : le pool vadrouille_prototype", async () => {
    expect(await lire(preversion(code), cookie)).toBe(pool);
    expect(poolPrototype).toHaveBeenCalledTimes(1);
  });

  it("sans cookie, cookie expiré ou signé par un autre code : null, aucun pool", async () => {
    expect(await lire(preversion(code), undefined)).toBeNull();
    expect(await lire(preversion(code), cookie, T0 + 12 * 3_600_000)).toBeNull();
    expect(await lire(preversion(code), valeurCookieAcces(randomBytes(32), T0))).toBeNull();
    expect(poolPrototype).not.toHaveBeenCalled();
  });

  it("pool impossible à créer : null, p0.read_unavailable avec le seul nom d'erreur", async () => {
    poolPrototype.mockImplementationOnce(() => {
      throw new RangeError("secret de configuration");
    });
    expect(await lire(preversion(code), cookie)).toBeNull();
    expect(logEvent).toHaveBeenCalledWith("p0.read_unavailable", { errorName: "RangeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("secret");
  });

  it.each<[string, Record<string, string | undefined>]>([
    ["autre branche", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["mode réel non activé", { P0_REAL_RUNS: undefined }],
    ["base absente", { [NOM_BASE]: undefined }],
    ["production", { VERCEL_ENV: "production" }],
    ["CI", { CI: "true" }],
  ])("garde fermée (%s) : null même avec un cookie valide, aucun pool", async (_cas, extra) => {
    expect(await lire(preversion(code, extra), cookie)).toBeNull();
    expect(poolPrototype).not.toHaveBeenCalled();
  });
});
