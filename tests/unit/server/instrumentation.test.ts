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
  brancherLectureProgrammesReels: (barriere: unknown, relecteur: unknown) => brancher(barriere, relecteur),
}));
vi.mock("@/server/p0/lecture-programmes", () => ({
  // Accesseur : un échec au chargement de la barrière est simulé à sa lecture, dans le `try` de `register()`.
  get poolLectureProgrammes() {
    if (echecBarriere) throw echecBarriere;
    return () => poolLectureProgrammes();
  },
}));

// B6b : branchement de l'adaptateur `api` (doubles : aucun cas d'usage, aucune base, aucune composition réelle).
const brancherApi = vi.fn();
const createApiTripAdapter = vi.fn((options: unknown) => ({ options }));
const choisirSourceRelectures = vi.fn((double: unknown) => ({ choisie: double }));
let echecApi: Error | null = null;
vi.mock("@/adapters/api-instance", () => ({
  brancherLectureVoyages: (fabrique: unknown) => brancherApi(fabrique),
}));
vi.mock("@/adapters/api", () => ({
  get createApiTripAdapter() {
    if (echecApi) throw echecApi;
    return (options: unknown) => createApiTripAdapter(options);
  },
}));
vi.mock("@/server/composition/lecture", () => ({
  choisirSourceRelectures: (double: unknown) => choisirSourceRelectures(double),
}));

// B9e : branchement de la création `api` (doubles : aucun cas d'usage, aucune base, aucune composition de la génération).
const brancherCreation = vi.fn();
const createApiCreationAdapter = vi.fn(() => ({ creation: true }));
let echecCreation: Error | null = null;
vi.mock("@/adapters/api-creation-instance", () => ({
  brancherCreationVoyages: (fabrique: unknown) => brancherCreation(fabrique),
}));
vi.mock("@/adapters/api-creation", () => ({
  get createApiCreationAdapter() {
    if (echecCreation) throw echecCreation;
    return () => createApiCreationAdapter();
  },
}));

beforeEach(() => {
  vi.resetModules();
  logEvent.mockClear();
  brancher.mockClear();
  brancherApi.mockClear();
  createApiTripAdapter.mockClear();
  choisirSourceRelectures.mockClear();
  echecApi = null;
  brancherCreation.mockClear();
  createApiCreationAdapter.mockClear();
  echecCreation = null;
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

  it("DATA_ADAPTER=prototype : relecteur Routes réel branché avec la barrière (P0r4, décision 0079)", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await register();
    const relecteur = brancher.mock.calls[0]?.[1] as { relireJournee?: unknown } | undefined;
    expect(typeof relecteur?.relireJournee).toBe("function");
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

describe("instrumentation : branchement de l'adaptateur api (spécification B6, B6b point 1)", () => {
  it("DATA_ADAPTER=api : fabrique branchée ; elle passe le double à choisirSourceRelectures puis à createApiTripAdapter", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    await register();
    expect(brancherApi).toHaveBeenCalledTimes(1);
    expect(brancher).not.toHaveBeenCalled();
    // Rien n'est construit au démarrage : la fabrique ne sert qu'à la lecture.
    expect(createApiTripAdapter).not.toHaveBeenCalled();
    const fabrique = brancherApi.mock.calls[0]?.[0] as (double: unknown) => unknown;
    const double = { double: true };
    expect(fabrique(double)).toEqual({ options: { relectures: { choisie: double } } });
    expect(choisirSourceRelectures).toHaveBeenCalledWith(double);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "mock", "prototype"])("DATA_ADAPTER=%j : adaptateur api non branché", async (valeur) => {
    vi.stubEnv("DATA_ADAPTER", valeur);
    await register();
    expect(brancherApi).not.toHaveBeenCalled();
  });

  it("échec du branchement : voyages.action_failed (branchement) avec le seul nom d'erreur, serveur non arrêté", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    echecApi = Object.assign(new TypeError("secret du module"), { cause: "secret" });
    await register();
    expect(brancherApi).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith("voyages.action_failed", { action: "branchement", errorName: "TypeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("secret");
  });
});

describe("instrumentation : branchement de la création api (spécification B9, B9e point 1)", () => {
  it("DATA_ADAPTER=api : fabrique de la création branchée, rien n'est construit au démarrage", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    await register();
    expect(brancherCreation).toHaveBeenCalledTimes(1);
    expect(createApiCreationAdapter).not.toHaveBeenCalled();
    const fabrique = brancherCreation.mock.calls[0]?.[0] as () => unknown;
    expect(fabrique()).toEqual({ creation: true });
    expect(createApiCreationAdapter).toHaveBeenCalledTimes(1);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "mock", "prototype"])("DATA_ADAPTER=%j : création api non branchée", async (valeur) => {
    vi.stubEnv("DATA_ADAPTER", valeur);
    await register();
    expect(brancherCreation).not.toHaveBeenCalled();
  });

  it("échec du branchement : voyages.action_failed (branchement-creation) avec le seul nom d'erreur, lecture toujours branchée", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    echecCreation = Object.assign(new TypeError("secret du module"), { cause: "secret" });
    await register();
    expect(brancherCreation).not.toHaveBeenCalled();
    expect(brancherApi).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("voyages.action_failed", { action: "branchement-creation", errorName: "TypeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("secret");
  });
});
