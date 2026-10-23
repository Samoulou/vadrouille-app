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
  brancherDeblocagesEssai: (deblocages: unknown) => brancherDeblocages(deblocages),
  brancherCreationEssai: (port: unknown) => brancherCreationEssai(port),
}));
// Spécification E2E-essai, lot 3 : création d'un voyage d'essai (double : aucune base, aucun cookie, aucun lancement).
const brancherCreationEssai = vi.fn();
const creationEssai = { lancer: vi.fn(), relancer: vi.fn(), etat: vi.fn() };
vi.mock("@/server/p0/creation-essai", () => ({ creationEssai }));
// Spécification E2E-essai, lot 1 : déblocages de l'essai retenus par cookie (double : aucune clé, aucun cookie).
const brancherDeblocages = vi.fn();
const deblocagesEssaiParCookie = { lire: vi.fn(), retenir: vi.fn() };
vi.mock("@/server/essai/deblocage", () => ({ deblocagesEssaiParCookie }));
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

// B10a : branchement du tri enregistré `api` (doubles : aucun cas d'usage réel, aucune base).
const brancherTri = vi.fn();
const casDuTri = { deciderCarte: vi.fn(), annulerDecision: vi.fn(), repondreQuestion: vi.fn(), cloreTri: vi.fn() };
let echecTri: Error | null = null;
vi.mock("@/adapters/api-tri-instance", () => ({
  brancherTriEnregistre: (tri: unknown) => brancherTri(tri),
}));
vi.mock("@/server/presentation/tri", () => ({
  get deciderCarte() {
    if (echecTri) throw echecTri;
    return casDuTri.deciderCarte;
  },
  annulerDecision: casDuTri.annulerDecision,
  repondreQuestion: casDuTri.repondreQuestion,
  cloreTri: casDuTri.cloreTri,
}));

beforeEach(() => {
  vi.resetModules();
  brancherTri.mockClear();
  echecTri = null;
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
  brancherCreationEssai.mockClear();
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

  it("DATA_ADAPTER=prototype : déblocages de l'essai par cookie branchés (spécification E2E-essai, lot 1)", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await register();
    expect(brancherDeblocages).toHaveBeenCalledTimes(1);
    expect(brancherDeblocages).toHaveBeenCalledWith(deblocagesEssaiParCookie);
  });

  it("échec du branchement des déblocages : essai.unlock_unavailable (événement distinct), lecture réelle gardée", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    brancherDeblocages.mockImplementationOnce(() => {
      throw new RangeError("secret du cookie");
    });
    await register();
    expect(brancher).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("essai.unlock_unavailable", { errorName: "RangeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("secret");
  });

  it("DATA_ADAPTER=prototype : création d'un voyage d'essai branchée (spécification E2E-essai, lot 3)", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await register();
    expect(brancherCreationEssai).toHaveBeenCalledTimes(1);
    expect(brancherCreationEssai).toHaveBeenCalledWith(creationEssai);
  });

  it("échec du branchement de la création : essai.creation_unavailable (nom d'erreur seulement), lecture réelle gardée", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    brancherCreationEssai.mockImplementationOnce(() => {
      throw new TypeError("brief de Rome");
    });
    await register();
    expect(brancher).toHaveBeenCalledTimes(1);
    expect(brancherDeblocages).toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("essai.creation_unavailable", { errorName: "TypeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("Rome");
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

describe("instrumentation : branchement du tri enregistré api (spécification B10, B10a ; décision 0112 § 2 point 3)", () => {
  it("DATA_ADAPTER=api : les quatre cas d'usage du tri sont branchés, rien n'est appelé au démarrage", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    await register();
    expect(brancherTri).toHaveBeenCalledTimes(1);
    expect(brancherTri).toHaveBeenCalledWith({
      decideCard: casDuTri.deciderCarte,
      undoDecision: casDuTri.annulerDecision,
      answerPreferencePrompt: casDuTri.repondreQuestion,
      completeDeck: casDuTri.cloreTri,
    });
    for (const cas of Object.values(casDuTri)) expect(cas).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "mock", "prototype"])("DATA_ADAPTER=%j : tri enregistré non branché", async (valeur) => {
    vi.stubEnv("DATA_ADAPTER", valeur);
    await register();
    expect(brancherTri).not.toHaveBeenCalled();
  });

  it("échec du branchement : voyages.action_failed (branchement-tri) avec le seul nom d'erreur, lecture et création toujours branchées", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    echecTri = Object.assign(new TypeError("secret du module"), { cause: "secret" });
    await register();
    expect(brancherTri).not.toHaveBeenCalled();
    expect(brancherApi).toHaveBeenCalledTimes(1);
    expect(brancherCreation).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("voyages.action_failed", { action: "branchement-tri", errorName: "TypeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("secret");
  });
});
