// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `register()` (décision 0074) : après la validation de l'environnement, avec `DATA_ADAPTER=prototype` et le runtime
 * `nodejs`, la barrière de lecture des programmes réels est branchée sur l'adaptateur ; sans cet adaptateur, rien n'est
 * branché ; un échec du branchement écrit `p0.read_unavailable` avec le seul nom d'erreur, sans arrêter le serveur
 * (`process.exit` n'est pas doublé : un appel arrêterait ce test).
 */

const logEvent = vi.fn();
const brancher = vi.fn();
const poolLectureProgrammes = vi.fn(async () => null);
let echecBarriere: Error | null = null;

vi.mock("@/server/env", () => ({
  parseServerEnv: () => undefined,
  assertServerProcessEnv: () => undefined,
  ServerEnvError: class extends Error {},
}));
vi.mock("@/server/log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
  errorNameOf: (erreur: unknown) => (erreur instanceof Error ? erreur.name : undefined),
}));
vi.mock("@/adapters/prototype-instance", () => ({
  brancherLectureProgrammesReels: (barriere: unknown) => brancher(barriere),
}));
vi.mock("@/server/p0/lecture-programmes", () => ({
  // Accesseur : un échec au chargement de la barrière est simulé à sa lecture, dans le `try` de `register()`.
  get poolLectureProgrammes() {
    if (echecBarriere) throw echecBarriere;
    return () => poolLectureProgrammes();
  },
}));

beforeEach(() => {
  vi.resetModules();
  logEvent.mockClear();
  brancher.mockClear();
  poolLectureProgrammes.mockClear();
  echecBarriere = null;
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function register() {
  const { register: enregistrer } = await import("@/instrumentation");
  await enregistrer();
}

describe("instrumentation : branchement de la lecture des programmes réels (décision 0074)", () => {
  it("DATA_ADAPTER=prototype : barrière branchée, et elle appelle la barrière du serveur à chaque lecture", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await register();
    expect(brancher).toHaveBeenCalledTimes(1);
    const barriere = brancher.mock.calls[0]?.[0] as () => Promise<unknown>;
    expect(await barriere()).toBeNull();
    expect(await barriere()).toBeNull();
    expect(poolLectureProgrammes).toHaveBeenCalledTimes(2);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "mock", "api"])("DATA_ADAPTER=%j : rien n'est branché", async (valeur) => {
    vi.stubEnv("DATA_ADAPTER", valeur);
    await register();
    expect(brancher).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("runtime edge : rien n'est branché", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await register();
    expect(brancher).not.toHaveBeenCalled();
  });

  it("échec du branchement : p0.read_unavailable avec le seul nom d'erreur, serveur non arrêté", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    echecBarriere = Object.assign(new TypeError("secret du module"), { cause: "secret" });
    await register();
    expect(brancher).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("p0.read_unavailable", { errorName: "TypeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("secret");
  });
});
