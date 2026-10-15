// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

import type { LigneCandidat } from "@/contracts/prototype-travail";
import type { Candidat } from "@/prototype/candidat";
import { etapeAncrage, etapeClore, etapeFinale, etapeRecherche, NOMS_BRIEFS, p0Run } from "@/workflows/p0-run";

/**
 * Workflow `p0Run` (P0r3c-4, décisions 0009, 0055 et 0063), sur des doubles seulement : garde, table de travail,
 * composition, agent et ancrage simulés ; aucun appel réel aux modèles ni à Google, aucune base. Les directives
 * `"use workflow"` et `"use step"` sont sans effet hors du compilateur du SDK : les étapes s'appellent comme des
 * fonctions, ce qui exerce leur corps et leur frontière (entrée et sortie `{ runId }`).
 */

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SENTINELLE_GOOGLE = "SENT_PLACE_GOOGLE_1";
const SENTINELLE_ERREUR = "SENTINELLE-MESSAGE-FOURNISSEUR";

const d = vi.hoisted(() => {
  const pool = { connect: () => Promise.reject(new Error("pool simulé : aucune connexion")) };
  return {
    pool,
    verifierGardeEtape: vi.fn(),
    lireExecution: vi.fn(),
    ecrirePhase: vi.fn(),
    ecrireCoutModeles: vi.fn(),
    remplacerCandidats: vi.fn(),
    lireCandidats: vi.fn(),
    cloreExecution: vi.fn(),
    composerP0Reel: vi.fn(),
    agent: vi.fn(),
    ancrage: vi.fn(),
    etapeFinale: vi.fn(),
    chercherCandidats: vi.fn(),
    ancrerLogementsDuSejour: vi.fn(),
    ancrerCandidatsDansZone: vi.fn(),
  };
});

vi.mock("@/server/p0/garde", () => ({ verifierGardeEtape: d.verifierGardeEtape }));
vi.mock("@/server/p0/base", () => ({ poolPrototype: () => d.pool }));
vi.mock("@/adapters/prototype-travail", () => ({
  lireExecution: d.lireExecution,
  ecrirePhase: d.ecrirePhase,
  ecrireCoutModeles: d.ecrireCoutModeles,
  remplacerCandidats: d.remplacerCandidats,
  lireCandidats: d.lireCandidats,
  cloreExecution: d.cloreExecution,
}));
vi.mock("@/server/composition/p0-reel", () => ({ composerP0Reel: d.composerP0Reel }));
vi.mock("@/research/agent", () => ({ chercherCandidats: d.chercherCandidats }));
vi.mock("@/grounding/ancrage-zone", () => ({
  ancrerLogementsDuSejour: d.ancrerLogementsDuSejour,
  ancrerCandidatsDansZone: d.ancrerCandidatsDansZone,
}));

const candidat = (n: number, typeEtape: Candidat["typeEtape"] = "activity"): Candidat => ({
  id: `c_00${n}`,
  nom: `Lieu maison ${n}`,
  resume: "Résumé maison.",
  categorie: "walk",
  typeEtape,
  source: { url: "https://guide.example/page", date: "2026-09-01", classe: "independante" },
  aReserver: false,
  ...(typeEtape === "event" ? { evenement: { date: "2026-11-24", heure: "19:30", dateConfirmee: false } } : {}),
});

const recherche = { rechercher: vi.fn(async () => []) };
const pages = { lire: vi.fn(async () => ({ ok: false })) };
const textSearch = vi.fn();
const detailsLogement = vi.fn();

function execution(mode: "reel" | "essai" = "reel", brief = "edimbourg-1.json") {
  return { mode, brief, variante: "A" as const, coutModelesMicros: 0, jourQuota: "2026-10-15", ecouleMs: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  d.verifierGardeEtape.mockImplementation(async (runId: string) => ({ ok: true, garde: Object.freeze({ runId }) }));
  d.lireExecution.mockResolvedValue(execution());
  d.ecrirePhase.mockResolvedValue(undefined);
  d.ecrireCoutModeles.mockResolvedValue(undefined);
  d.remplacerCandidats.mockResolvedValue(undefined);
  d.cloreExecution.mockResolvedValue(undefined);
  d.agent.mockReturnValue({ modeles: { envoyer: vi.fn() }, rechercheWeb: recherche, pages });
  d.ancrage.mockReturnValue({ textSearch, detailsLogement });
  d.composerP0Reel.mockReturnValue({ agent: d.agent, ancrage: d.ancrage, etapeFinale: d.etapeFinale });
  d.chercherCandidats.mockResolvedValue({ candidats: [candidat(1), candidat(2)] });
  d.ancrerLogementsDuSejour.mockResolvedValue({ logements: [], zone: { sud: 55.9, ouest: -3.3, nord: 56, est: -3.1 } });
});

const aucunAppel = () => {
  expect(d.composerP0Reel).not.toHaveBeenCalled();
  expect(d.agent).not.toHaveBeenCalled();
  expect(d.ancrage).not.toHaveBeenCalled();
  expect(d.etapeFinale).not.toHaveBeenCalled();
  expect(d.chercherCandidats).not.toHaveBeenCalled();
  expect(d.ancrerLogementsDuSejour).not.toHaveBeenCalled();
  expect(d.ancrerCandidatsDansZone).not.toHaveBeenCalled();
};

async function refus(promesse: Promise<unknown>): Promise<Error> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(FatalError);
  return erreur as Error;
}

describe("p0Run : garde à l'entrée de chaque étape (0055 § 1 point 2, réponse 4 de la Sécurité, PR 326)", () => {
  it.each([
    ["recherche", etapeRecherche],
    ["ancrage", etapeAncrage],
    ["finale", etapeFinale],
  ])("garde fermée : l'étape %s s'arrête (FatalError, real_mode_unavailable) sans lecture, composition ni appel", async (_nom, etape) => {
    d.verifierGardeEtape.mockResolvedValue({ ok: false, code: "deployment_refused" });
    const erreur = await refus(etape({ runId: RUN_ID }));
    expect(erreur.message).toBe("real_mode_unavailable");
    expect(d.lireExecution).not.toHaveBeenCalled();
    expect(d.ecrirePhase).not.toHaveBeenCalled();
    expect(d.remplacerCandidats).not.toHaveBeenCalled();
    aucunAppel();
  });

  it("garde fermée à la clôture : rien n'est écrit", async () => {
    d.verifierGardeEtape.mockResolvedValue({ ok: false, code: "deployment_refused" });
    expect(await etapeClore({ runId: RUN_ID, code: "upstream_unavailable" })).toEqual({ runId: RUN_ID });
    expect(d.cloreExecution).not.toHaveBeenCalled();
  });

  it("garde vérifiée avant la composition, avec la durée du mode réel ; pour un essai, revérifiée avec sa durée (5 min)", async () => {
    await etapeRecherche({ runId: RUN_ID });
    expect(d.verifierGardeEtape).toHaveBeenCalledTimes(1);
    expect(d.verifierGardeEtape.mock.calls[0]?.[1]).toMatchObject({ dureeMaxMs: 900_000 });
    expect(d.verifierGardeEtape.mock.invocationCallOrder[0]).toBeLessThan(d.composerP0Reel.mock.invocationCallOrder[0] ?? 0);

    vi.clearAllMocks();
    d.lireExecution.mockResolvedValue(execution("essai"));
    await etapeRecherche({ runId: RUN_ID });
    expect(d.verifierGardeEtape.mock.calls.map((appel) => (appel[1] as { dureeMaxMs: number }).dureeMaxMs)).toEqual([900_000, 300_000]);
  });

  it("garde de l'essai fermée (durée de 5 min dépassée) : arrêt sans composition", async () => {
    d.lireExecution.mockResolvedValue(execution("essai"));
    d.verifierGardeEtape.mockResolvedValueOnce({ ok: true, garde: { runId: RUN_ID } }).mockResolvedValueOnce({ ok: false, code: "run_refused" });
    expect((await refus(etapeRecherche({ runId: RUN_ID }))).message).toBe("real_mode_unavailable");
    aucunAppel();
  });
});

describe("p0Run : fabriques appelées dans chaque étape, une famille par étape (0055 § 3, avis S-3)", () => {
  it("recherche : composition construite dans l'étape, famille agent() seule ; candidats écrits sans placeId", async () => {
    expect(await etapeRecherche({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.composerP0Reel).toHaveBeenCalledTimes(1);
    const [garde, options] = d.composerP0Reel.mock.calls[0] as [{ runId: string }, Record<string, unknown>];
    expect(garde.runId).toBe(RUN_ID);
    expect(options).toMatchObject({ coutEstimeModelesMicros: 20_000, coutEstimeRechercheWebMicros: 40_000 });
    expect(d.agent).toHaveBeenCalledTimes(1);
    expect(d.ancrage).not.toHaveBeenCalled();
    expect(d.etapeFinale).not.toHaveBeenCalled();
    expect(d.ecrirePhase).toHaveBeenCalledWith(d.pool, RUN_ID, "recherche");
    const lignes = d.remplacerCandidats.mock.calls[0]?.[2] as LigneCandidat[];
    expect(lignes.map((l) => [l.cle, l.placeId])).toEqual([
      ["c_001", null],
      ["c_002", null],
    ]);
    expect(d.ecrireCoutModeles).toHaveBeenCalledTimes(1);
  });

  it("une composition neuve à chaque étape (aucune gardée en cache de module)", async () => {
    d.lireCandidats.mockResolvedValue([]);
    d.ancrerCandidatsDansZone.mockResolvedValue(new Map());
    await etapeRecherche({ runId: RUN_ID });
    await etapeRecherche({ runId: RUN_ID });
    await etapeAncrage({ runId: RUN_ID });
    expect(d.composerP0Reel).toHaveBeenCalledTimes(3);
    expect(d.agent).toHaveBeenCalledTimes(2);
    expect(d.ancrage).toHaveBeenCalledTimes(1);
  });

  it("recherche de l'essai : plafonds de l'agent (6 recherches web, 15 pages), la 7e recherche lève cap_reached sans appel", async () => {
    d.lireExecution.mockResolvedValue(execution("essai"));
    await etapeRecherche({ runId: RUN_ID });
    const deps = d.chercherCandidats.mock.calls[0]?.[1] as { recherche: { rechercher: (r: unknown) => Promise<unknown> }; config: { totalCandidats: number } };
    expect(deps.config.totalCandidats).toBe(12);
    for (let i = 0; i < 6; i += 1) await deps.recherche.rechercher({ requete: "x" });
    await expect(deps.recherche.rechercher({ requete: "x" })).rejects.toMatchObject({ code: "cap_reached" });
    expect(recherche.rechercher).toHaveBeenCalledTimes(6);
    const plafonds = (d.composerP0Reel.mock.calls[0]?.[1] as { plafonds: { fournisseur: string; maxCoutMicros?: number }[] }).plafonds;
    expect(plafonds.find((p) => p.fournisseur === "modeles")?.maxCoutMicros).toBe(300_000);
  });

  it("coût des modèles déjà compté : l'étape ne dispose que du reste du plafond", async () => {
    d.lireExecution.mockResolvedValue({ ...execution(), coutModelesMicros: 2_500_000 });
    await etapeRecherche({ runId: RUN_ID });
    const plafonds = (d.composerP0Reel.mock.calls[0]?.[1] as { plafonds: { fournisseur: string; maxCoutMicros?: number }[] }).plafonds;
    expect(plafonds.find((p) => p.fournisseur === "modeles")?.maxCoutMicros).toBe(500_000);
    expect(d.ecrireCoutModeles).toHaveBeenCalledWith(d.pool, RUN_ID, 2_500_000);
  });

  it("ancrage : famille ancrage() seule ; candidats résolus avec leur placeId, événements non résolus gardés sans", async () => {
    d.lireCandidats.mockResolvedValue([candidat(1), candidat(2, "event"), candidat(3)].map((c) => ({ cle: c.id, candidat: c, placeId: null })));
    d.ancrerCandidatsDansZone.mockResolvedValue(
      new Map<string, unknown>([
        ["c_001", { resolu: true, placeId: SENTINELLE_GOOGLE }],
        ["c_002", { resolu: false, cause: "introuvable" }],
        ["c_003", { resolu: false, cause: "hors_zone" }],
      ]),
    );
    const sortie = await etapeAncrage({ runId: RUN_ID });
    expect(sortie).toEqual({ runId: RUN_ID });
    expect(JSON.stringify(sortie)).not.toContain(SENTINELLE_GOOGLE);
    expect(d.ancrage).toHaveBeenCalledTimes(1);
    expect(d.agent).not.toHaveBeenCalled();
    expect(d.etapeFinale).not.toHaveBeenCalled();
    expect(d.ancrerLogementsDuSejour.mock.calls[0]?.[1]).toEqual({ detailsLogement });
    expect(d.ancrerCandidatsDansZone.mock.calls[0]?.[2]).toEqual({ textSearch });
    const lignes = d.remplacerCandidats.mock.calls[0]?.[2] as LigneCandidat[];
    expect(lignes.map((l) => [l.cle, l.placeId])).toEqual([
      ["c_001", SENTINELLE_GOOGLE],
      ["c_002", null],
    ]);
    const plafonds = (d.composerP0Reel.mock.calls[0]?.[1] as { plafonds: { methode?: string; maxRequetes?: number }[] }).plafonds;
    // Une requête Text Search par logement est laissée à l'étape finale, qui relit le logement (0063, amendement P0r3c-5).
    expect(plafonds.find((p) => p.methode === "places_text_search")?.maxRequetes).toBe(89);
    expect(plafonds.find((p) => p.methode === "places_details")?.maxRequetes).toBe(1);
    expect(plafonds.find((p) => p.methode === "routes_matrix")).toMatchObject({ maxRequetes: 0, maxElements: 0 });
  });
});

describe("p0Run : état sérialisé réduit à l'identifiant d'exécution (0009 point 3, 0011 § 3)", () => {
  it("erreur d'un fournisseur : code persisté seul (S4), sans message ; coût des modèles écrit quand même", async () => {
    d.chercherCandidats.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_unavailable" }));
    const erreur = await refus(etapeRecherche({ runId: RUN_ID }));
    expect(erreur.message).toBe("upstream_unavailable");
    expect(JSON.stringify(erreur)).not.toContain(SENTINELLE_ERREUR);
    expect(String(erreur.stack)).not.toContain(SENTINELLE_ERREUR);
    expect(d.ecrireCoutModeles).toHaveBeenCalledTimes(1);
    expect(d.remplacerCandidats).not.toHaveBeenCalled();
  });

  it("code d'avant appel levé après la composition : pipeline_failed (codePersiste, S4)", async () => {
    d.chercherCandidats.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "config_invalid" }));
    expect((await refus(etapeRecherche({ runId: RUN_ID }))).message).toBe("pipeline_failed");
  });

  it("écriture du coût en échec : étape en erreur (pipeline_failed), candidats écrits mais étape suivante jamais lancée", async () => {
    d.ecrireCoutModeles.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "base" }));
    const erreur = await refus(etapeRecherche({ runId: RUN_ID }));
    expect(erreur.message).toBe("pipeline_failed");
    expect(String(erreur.stack)).not.toContain(SENTINELLE_ERREUR);

    vi.clearAllMocks();
    d.ecrireCoutModeles.mockRejectedValue(new Error(SENTINELLE_ERREUR));
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.ancrage).not.toHaveBeenCalled();
    expect(d.lireCandidats).not.toHaveBeenCalled();
    expect(d.cloreExecution).toHaveBeenCalledTimes(1);
    expect(d.cloreExecution.mock.calls[0]?.[2]).toBe("pipeline_failed");
  });

  it("écriture du coût en échec après une erreur du fournisseur : l'erreur d'origine reste celle qui sort", async () => {
    d.chercherCandidats.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_unavailable" }));
    d.ecrireCoutModeles.mockRejectedValue(new Error(SENTINELLE_ERREUR));
    expect((await refus(etapeRecherche({ runId: RUN_ID }))).message).toBe("upstream_unavailable");
    expect(d.ecrireCoutModeles).toHaveBeenCalledTimes(1);
  });

  it("erreur inconnue : pipeline_failed ; brief inconnu : brief_invalid avant toute composition", async () => {
    d.chercherCandidats.mockRejectedValue(new Error(SENTINELLE_ERREUR));
    expect((await refus(etapeRecherche({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    vi.clearAllMocks();
    d.lireExecution.mockResolvedValue(execution("reel", "inconnu.json"));
    expect((await refus(etapeRecherche({ runId: RUN_ID }))).message).toBe("brief_invalid");
    aucunAppel();
  });

  it("candidat relu invalide : pipeline_failed, aucun appel d'ancrage", async () => {
    d.lireCandidats.mockResolvedValue([{ cle: "c_001", candidat: { id: "c_001", nom: SENTINELLE_ERREUR }, placeId: null }]);
    const erreur = await refus(etapeAncrage({ runId: RUN_ID }));
    expect(erreur.message).toBe("pipeline_failed");
    expect(d.ancrage).not.toHaveBeenCalled();
  });

  it("p0Run : recherche, ancrage puis étape finale (famille etapeFinale() seule) ; étape finale arrêtée : clôture ; sortie { runId } seule", async () => {
    d.lireCandidats.mockResolvedValue([]);
    d.ancrerCandidatsDansZone.mockResolvedValue(new Map());
    d.etapeFinale.mockImplementation(() => {
      throw Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_unavailable" });
    });
    const sortie = await p0Run({ runId: RUN_ID });
    expect(sortie).toEqual({ runId: RUN_ID });
    expect(Object.keys(sortie)).toEqual(["runId"]);
    expect(d.ecrirePhase.mock.calls.map((appel) => appel[2])).toEqual(["recherche", "ancrage", "notation"]);
    expect(d.composerP0Reel).toHaveBeenCalledTimes(3);
    expect(d.agent).toHaveBeenCalledTimes(1);
    expect(d.ancrage).toHaveBeenCalledTimes(1);
    expect(d.etapeFinale).toHaveBeenCalledTimes(1);
    expect(d.cloreExecution).toHaveBeenCalledWith(d.pool, RUN_ID, "upstream_unavailable");
  });

  it("phase déjà passée (étape redistribuée après expiration) : arrêt avant toute composition, pipeline_failed", async () => {
    d.ecrirePhase.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "phase_deja_passee" }));
    for (const etape of [etapeRecherche, etapeAncrage, etapeFinale]) {
      expect((await refus(etape({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    }
    aucunAppel();
    expect(d.ecrireCoutModeles).not.toHaveBeenCalled();
  });

  it("p0Run : étape arrêtée, exécution close avec son code ; l'étape suivante ne part pas", async () => {
    d.chercherCandidats.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_redirect" }));
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.cloreExecution).toHaveBeenCalledTimes(1);
    expect(d.cloreExecution.mock.calls[0]?.[2]).toBe("upstream_redirect");
    expect(d.ancrage).not.toHaveBeenCalled();
  });

  it("clôture : un code hors de CODES_ARRET devient pipeline_failed", async () => {
    await etapeClore({ runId: RUN_ID, code: SENTINELLE_ERREUR as never });
    expect(d.cloreExecution).toHaveBeenCalledWith(d.pool, RUN_ID, "pipeline_failed");
  });
});

describe("p0Run : forme du module (décision 0063)", () => {
  const source = readFileSync(path.join(process.cwd(), "src/workflows/p0-run.ts"), "utf8");
  const index = readFileSync(path.join(process.cwd(), "src/workflows/index.ts"), "utf8");

  it("aucune étape relancée (maxRetries = 0)", () => {
    for (const etape of [etapeRecherche, etapeAncrage, etapeFinale, etapeClore]) expect((etape as unknown as { maxRetries: number }).maxRetries).toBe(0);
  });

  it("un workflow, quatre étapes (recherche, ancrage, étape finale, clôture) ; ni webhook ni hook dans src/workflows", () => {
    expect(source.match(/^\s*"use workflow";$/gm)).toHaveLength(1);
    expect(source.match(/^\s*"use step";$/gm)).toHaveLength(4);
    // P0r3d : `complet.ts`, l'interrupteur de démarrage seul (une constante, aucune directive, aucun import hors server-only).
    const complet = readFileSync(path.join(process.cwd(), "src/workflows/complet.ts"), "utf8");
    for (const texte of [source, index, complet]) expect(texte).not.toMatch(/createWebhook|createHook|defineHook|resumeHook|resumeWebhook|getHookByToken/);
    expect(complet).not.toMatch(/"use (?:workflow|step|server|client)"/);
    expect([...complet.matchAll(/^import .*$/gm)].map((m) => m[0])).toEqual(['import "server-only";']);
    expect(readdirSync(path.join(process.cwd(), "src/workflows")).sort()).toEqual(["complet.ts", "index.ts", "p0-run.ts"]);
  });

  it("aucune composition, aucun client ni registre au niveau du module (fabriques appelées dans l'étape)", () => {
    const horsFonctions = source.split("\n").filter((ligne) => /^(const|let|var|export const) /.test(ligne));
    for (const ligne of horsFonctions) expect(ligne).not.toMatch(/composerP0Reel|creerRegistreForfait|poolPrototype\(\)|\.agent\(|\.ancrage\(|\.etapeFinale\(/);
  });

  it("NOMS_BRIEFS : exactement les fichiers de prototype/briefs/", () => {
    const fichiers = readdirSync(path.join(process.cwd(), "prototype/briefs"))
      .filter((f) => f.endsWith(".json"))
      .sort();
    expect([...NOMS_BRIEFS].sort()).toEqual(fichiers);
  });
});
