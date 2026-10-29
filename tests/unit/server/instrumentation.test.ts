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
  brancherPhotosEssai: (photos: unknown) => brancherPhotosEssai(photos),
  brancherPartageEssai: (partage: unknown) => brancherPartageEssai(partage),
}));
// Décision 0135 : partage réel d'un voyage du site d'essai (double : aucune clé, aucun cookie, aucune base).
const brancherPartageEssai = vi.fn();
const partageEssai = { cle: vi.fn(), sessionVerifiee: vi.fn(), barriereLecture: vi.fn() };
vi.mock("@/server/essai/partage", () => ({ partageEssai }));
// Décision 0128 : photos du tri d'un voyage d'essai (double : aucune base, aucun cookie, aucun appel Google).
const brancherPhotosEssai = vi.fn();
const photosEssai = { photo: vi.fn() };
vi.mock("@/server/p0/photos", () => ({ creerPhotosEssai: () => photosEssai }));
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

// PR 879 (M1e) : branchement des photos du tri `api` (doubles : aucune barrière, aucun limiteur, aucune base).
const brancherPhotos = vi.fn();
const photosApi = { photo: vi.fn(), ouvertes: vi.fn() };
const creerPhotosApi = vi.fn(() => ({ photo: photosApi.photo }));
let echecPhotos: Error | null = null;
vi.mock("@/adapters/api-photos-instance", () => ({
  brancherPhotosApi: (photos: unknown) => brancherPhotos(photos),
}));
vi.mock("@/server/photos/api", () => ({
  get creerPhotosApi() {
    if (echecPhotos) throw echecPhotos;
    return () => creerPhotosApi();
  },
  photosApiOuvertes: () => photosApi.ouvertes(),
}));

// B4b : branchement du paiement simulé en base (doubles : aucune composition réelle, aucune base, aucune clé).
const brancherPaiement = vi.fn();
const composerPaiementSimule = vi.fn(() => ({ adaptateur: "simule" }));
let echecPaiement: Error | null = null;
vi.mock("@/adapters/simulated-payment-instance", () => ({
  brancherPaiementSimule: (fabrique: unknown) => brancherPaiement(fabrique),
}));
vi.mock("@/server/payment/composition", () => ({
  get composerPaiementSimule() {
    if (echecPaiement) throw echecPaiement;
    return () => composerPaiementSimule();
  },
}));

// B4c (PR 863 ; décision 0140 § 5 point 1) : branchement du paiement Stripe, mêmes doubles (aucune composition réelle,
// aucune base, aucune clé).
const brancherStripe = vi.fn();
const composerPaiementStripe = vi.fn(() => ({ adaptateur: "stripe" }));
vi.mock("@/adapters/stripe-payment-instance", () => ({
  brancherPaiementStripe: (fabrique: unknown) => brancherStripe(fabrique),
}));
vi.mock("@/server/payment/composition-stripe", () => ({
  composerPaiementStripe: () => composerPaiementStripe(),
}));

beforeEach(() => {
  vi.resetModules();
  brancherStripe.mockClear();
  composerPaiementStripe.mockClear();
  brancherPaiement.mockClear();
  composerPaiementSimule.mockClear();
  echecPaiement = null;
  brancherTri.mockClear();
  echecTri = null;
  brancherPhotos.mockClear();
  creerPhotosApi.mockClear();
  photosApi.photo.mockClear();
  photosApi.ouvertes.mockClear();
  echecPhotos = null;
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
  brancherPhotosEssai.mockClear();
  brancherPartageEssai.mockClear();
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

  it("DATA_ADAPTER=prototype : partage réel branché (décision 0135)", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await register();
    expect(brancherPartageEssai).toHaveBeenCalledTimes(1);
    expect(brancherPartageEssai).toHaveBeenCalledWith(partageEssai);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("DATA_ADAPTER=prototype : photos du tri branchées (décision 0128)", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await register();
    expect(brancherPhotosEssai).toHaveBeenCalledTimes(1);
    expect(brancherPhotosEssai).toHaveBeenCalledWith(photosEssai);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("échec du branchement des photos : essai.photo_unavailable (nom d'erreur seulement), lecture réelle et création gardées", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    brancherPhotosEssai.mockImplementationOnce(() => {
      throw new TypeError("clé SENTINELLE");
    });
    await register();
    expect(brancher).toHaveBeenCalledTimes(1);
    expect(brancherCreationEssai).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("essai.photo_unavailable", { errorName: "TypeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("SENTINELLE");
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

describe("instrumentation : branchement des photos du tri api (PR 879, M1e)", () => {
  it("DATA_ADAPTER=api : photos branchées une fois, rien n'est appelé au démarrage", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    await register();
    expect(brancherPhotos).toHaveBeenCalledTimes(1);
    expect(creerPhotosApi).toHaveBeenCalledTimes(1);
    expect(photosApi.photo).not.toHaveBeenCalled();
    expect(photosApi.ouvertes).not.toHaveBeenCalled();
    const branchees = brancherPhotos.mock.calls[0]?.[0] as { photo: (lieu: unknown) => unknown; ouvertes: () => unknown };
    const lieu = async () => null;
    branchees.photo(lieu);
    branchees.ouvertes();
    expect(photosApi.photo).toHaveBeenCalledWith(lieu);
    expect(photosApi.ouvertes).toHaveBeenCalledTimes(1);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "mock", "prototype"])("DATA_ADAPTER=%j : photos du tri api non branchées", async (valeur) => {
    vi.stubEnv("DATA_ADAPTER", valeur);
    await register();
    expect(brancherPhotos).not.toHaveBeenCalled();
  });

  it("échec du branchement : voyages.action_failed (branchement-photos) avec le seul nom d'erreur, tri toujours branché", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    echecPhotos = Object.assign(new TypeError("secret du module"), { cause: "secret" });
    await register();
    expect(brancherPhotos).not.toHaveBeenCalled();
    expect(brancherTri).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("voyages.action_failed", { action: "branchement-photos", errorName: "TypeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("secret");
  });
});

describe("instrumentation : branchement du paiement simulé en base (spécification B4, B4b point 1)", () => {
  it("PAYMENT_ADAPTER=simulated : fabrique branchée, la composition n'est construite qu'au premier usage", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    vi.stubEnv("PAYMENT_ADAPTER", "simulated");
    await register();
    expect(brancherPaiement).toHaveBeenCalledTimes(1);
    expect(composerPaiementSimule).not.toHaveBeenCalled();
    const [fabrique] = brancherPaiement.mock.calls[0] as [() => unknown];
    expect(fabrique()).toEqual({ adaptateur: "simule" });
    expect(composerPaiementSimule).toHaveBeenCalledTimes(1);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "mock", "stripe"])("PAYMENT_ADAPTER=%j : paiement simulé non branché", async (valeur) => {
    vi.stubEnv("DATA_ADAPTER", "api");
    vi.stubEnv("PAYMENT_ADAPTER", valeur);
    await register();
    expect(brancherPaiement).not.toHaveBeenCalled();
  });

  it("échec du branchement : voyages.action_failed (branchement-paiement) avec le seul nom d'erreur, lecture toujours branchée", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    vi.stubEnv("PAYMENT_ADAPTER", "simulated");
    echecPaiement = Object.assign(new TypeError("secret du module"), { cause: "secret" });
    await register();
    expect(brancherPaiement).not.toHaveBeenCalled();
    expect(brancherApi).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("voyages.action_failed", { action: "branchement-paiement", errorName: "TypeError" }, "error");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain("secret");
  });
});

describe("instrumentation : branchement du paiement Stripe (spécification B4, B4c point 2 ; PR 863)", () => {
  it("PAYMENT_ADAPTER=stripe : fabrique branchée, la composition n'est construite qu'au premier usage ; paiement simulé non branché", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    vi.stubEnv("PAYMENT_ADAPTER", "stripe");
    await register();
    expect(brancherStripe).toHaveBeenCalledTimes(1);
    expect(brancherPaiement).not.toHaveBeenCalled();
    expect(composerPaiementStripe).not.toHaveBeenCalled();
    const [fabrique] = brancherStripe.mock.calls[0] as [() => unknown];
    expect(fabrique()).toEqual({ adaptateur: "stripe" });
    expect(composerPaiementStripe).toHaveBeenCalledTimes(1);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "mock", "simulated"])("PAYMENT_ADAPTER=%j : paiement Stripe non branché", async (valeur) => {
    vi.stubEnv("DATA_ADAPTER", "api");
    vi.stubEnv("PAYMENT_ADAPTER", valeur);
    await register();
    expect(brancherStripe).not.toHaveBeenCalled();
  });
});
