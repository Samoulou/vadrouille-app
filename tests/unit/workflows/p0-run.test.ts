// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

import { DUREE_MAX_EXECUTION_MS, etapeClore, etapeProgramme, etapeRevision, NOMS_BRIEFS, p0Run } from "@/workflows/p0-run";

/**
 * Workflow `p0Run` (P0r3c-4, décisions 0009, 0055 et 0063 ; depuis la décision 0116 § 3, une seule étape de travail
 * `etapeProgramme` puis `etapeClore`), sur des doubles seulement : garde, table de travail, composition (famille
 * `programme()`), écriture ; aucun appel réel aux modèles ni à Google, aucune base. Les directives `"use workflow"` et
 * `"use step"` sont sans effet hors du compilateur du SDK : les étapes s'appellent comme des fonctions, ce qui exerce leur
 * corps et leur frontière (entrée et sortie `{ runId }`).
 *
 * Réécriture autorisée par la décision 0116 § 8.2 (décision écrite au sens de `CLAUDE.md`) : chaque test de l'ancienne
 * version porte, dans la PR du lot 1, son ancien et son nouveau nom ; aucune propriété vérifiée ne disparaît.
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
    cloreExecution: vi.fn(),
    ecrireProgramme: vi.fn(),
    composerP0Reel: vi.fn(),
    programme: vi.fn(),
    agent: vi.fn(),
    ancrage: vi.fn(),
    etapeFinale: vi.fn(),
    redigerProgramme: vi.fn(),
    textSearch: vi.fn(),
    details: vi.fn(),
    detailsLogement: vi.fn(),
    matrice: vi.fn(),
  };
});

vi.mock("@/server/p0/garde", () => ({ verifierGardeEtape: d.verifierGardeEtape }));
vi.mock("@/server/p0/base", () => ({ poolPrototype: () => d.pool }));
vi.mock("@/adapters/prototype-travail", () => ({
  lireExecution: d.lireExecution,
  ecrirePhase: d.ecrirePhase,
  ecrireCoutModeles: d.ecrireCoutModeles,
  cloreExecution: d.cloreExecution,
}));
vi.mock("@/adapters/prototype-ecriture", () => ({ ecrireProgramme: d.ecrireProgramme, verrouS8Leve: vi.fn() }));
vi.mock("@/server/composition/p0-reel", () => ({ composerP0Reel: d.composerP0Reel }));

const LOGEMENT = { placeId: "SENT_LOGEMENT", position: { lat: 55.95, lng: -3.19 }, statut: "OPERATIONAL", horaires: null };

/** Sortie simulée du prompt `programme` (deux journées d'`edimbourg-1`, noms maison). */
const PROGRAMME = {
  jours: [
    {
      date: "2026-11-23",
      creneaux: [
        { debut: "12:00", nature: "arrivee" },
        { debut: "13:00", fin: "14:00", nature: "repas_midi", lieu: "Taverne maison", pourquoi: "Une tourte chaude." },
        { debut: "15:00", fin: "17:00", nature: "visite", lieu: "Forteresse maison", pourquoi: "Le château, enfin." },
      ],
    },
    { date: "2026-11-24", creneaux: [{ debut: "10:00", fin: "11:00", nature: "visite", lieu: "Musée maison", pourquoi: "Un peu d'histoire." }] },
  ],
};

const reponse = (programme: unknown = PROGRAMME) => ({ texte: JSON.stringify(programme), coutUsd: 0.01, fin: "stop" });

function execution(mode: "reel" | "essai" = "reel", brief = "edimbourg-1.json") {
  return { mode, brief, variante: "A" as const, coutModelesMicros: 0, jourQuota: "2026-10-15", numeroDuJour: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  d.verifierGardeEtape.mockImplementation(async (runId: string) => ({ ok: true, garde: Object.freeze({ runId }) }));
  d.lireExecution.mockResolvedValue(execution());
  d.ecrirePhase.mockResolvedValue(undefined);
  d.ecrireCoutModeles.mockResolvedValue(undefined);
  d.cloreExecution.mockResolvedValue(undefined);
  d.ecrireProgramme.mockResolvedValue(undefined);
  d.redigerProgramme.mockResolvedValue(reponse());
  d.detailsLogement.mockResolvedValue(LOGEMENT);
  d.textSearch.mockImplementation(async ({ texte }: { texte: string }) => ({ placeIds: [`${SENTINELLE_GOOGLE}_${texte.length}`] }));
  d.details.mockImplementation(async (placeId: string) => ({ placeId, position: { lat: 55.95, lng: -3.19 }, statut: "OPERATIONAL", horaires: null }));
  d.matrice.mockImplementation(async ({ origines, destinations }: { origines: string[]; destinations: string[] }) => ({
    secondes: origines.map(() => destinations.map(() => 600)),
  }));
  d.programme.mockReturnValue({
    redigerProgramme: d.redigerProgramme,
    textSearch: d.textSearch,
    places: { details: d.details },
    detailsLogement: d.detailsLogement,
    routes: { matrice: d.matrice },
  });
  d.composerP0Reel.mockReturnValue({ agent: d.agent, ancrage: d.ancrage, etapeFinale: d.etapeFinale, programme: d.programme });
});

const aucunAppel = () => {
  expect(d.composerP0Reel).not.toHaveBeenCalled();
  expect(d.programme).not.toHaveBeenCalled();
  expect(d.redigerProgramme).not.toHaveBeenCalled();
  expect(d.textSearch).not.toHaveBeenCalled();
  expect(d.details).not.toHaveBeenCalled();
  expect(d.detailsLogement).not.toHaveBeenCalled();
  expect(d.matrice).not.toHaveBeenCalled();
};

const aucunAppelGoogle = () => {
  expect(d.textSearch).not.toHaveBeenCalled();
  expect(d.details).not.toHaveBeenCalled();
  expect(d.detailsLogement).not.toHaveBeenCalled();
  expect(d.matrice).not.toHaveBeenCalled();
};

async function refus(promesse: Promise<unknown>): Promise<Error> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(FatalError);
  return erreur as Error;
}

function lignesDuJournal(espion: { mock: { calls: unknown[][] } }, evenement: string): Record<string, unknown>[] {
  return espion.mock.calls
    .map((appel) => String(appel[0]))
    .filter((ligne) => ligne.includes(evenement))
    .map((ligne) => JSON.parse(ligne) as Record<string, unknown>);
}

describe("p0Run : garde à l'entrée de chaque étape (0055 § 1 point 2, réponse 4 de la Sécurité, PR 326)", () => {
  it("garde fermée : etapeProgramme s'arrête (FatalError, real_mode_unavailable) sans lecture, composition ni appel", async () => {
    d.verifierGardeEtape.mockResolvedValue({ ok: false, code: "deployment_refused" });
    const erreur = await refus(etapeProgramme({ runId: RUN_ID }));
    expect(erreur.message).toBe("real_mode_unavailable");
    expect(d.lireExecution).not.toHaveBeenCalled();
    expect(d.ecrirePhase).not.toHaveBeenCalled();
    expect(d.ecrireProgramme).not.toHaveBeenCalled();
    aucunAppel();
  });

  it("garde fermée à la clôture : rien n'est écrit", async () => {
    d.verifierGardeEtape.mockResolvedValue({ ok: false, code: "deployment_refused" });
    expect(await etapeClore({ runId: RUN_ID, code: "upstream_unavailable" })).toEqual({ runId: RUN_ID });
    expect(d.cloreExecution).not.toHaveBeenCalled();
  });

  it("garde vérifiée avant la composition, avec DUREE_MAX_EXECUTION_MS (40 min, 0102 § 6) ; pour un essai, la même garde, une seule fois (plus de durée propre à l'essai)", async () => {
    await etapeProgramme({ runId: RUN_ID });
    expect(d.verifierGardeEtape).toHaveBeenCalledTimes(1);
    expect(d.verifierGardeEtape.mock.calls[0]?.[1]).toMatchObject({ dureeMaxMs: DUREE_MAX_EXECUTION_MS });
    expect(d.verifierGardeEtape.mock.invocationCallOrder[0]).toBeLessThan(d.composerP0Reel.mock.invocationCallOrder[0] ?? 0);

    vi.clearAllMocks();
    d.lireExecution.mockResolvedValue(execution("essai"));
    await etapeProgramme({ runId: RUN_ID });
    expect(d.verifierGardeEtape.mock.calls.map((appel) => (appel[1] as { dureeMaxMs: number }).dureeMaxMs)).toEqual([DUREE_MAX_EXECUTION_MS]);
  });

  it("garde de l'essai fermée (exécution plus vieille que DUREE_MAX_EXECUTION_MS) : arrêt sans composition", async () => {
    d.lireExecution.mockResolvedValue(execution("essai"));
    d.verifierGardeEtape.mockResolvedValueOnce({ ok: false, code: "run_refused" });
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("real_mode_unavailable");
    aucunAppel();
  });
});

describe("p0Run : fabriques appelées dans l'étape, une seule famille (0055 § 3, avis S-3 ; 0116 § 3)", () => {
  it("programme : composition construite dans l'étape, aucune écriture avant la phase ecriture", async () => {
    // L'écriture du programme est le seul effet durable hors phase et coût : rien n'est écrit avant elle.
    d.ecrireProgramme.mockImplementation(async () => {
      expect(d.ecrirePhase.mock.calls.map((appel) => appel[2])).toEqual(["recherche", "ancrage"]);
      expect(d.matrice).toHaveBeenCalled();
    });
    expect(await etapeProgramme({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.composerP0Reel).toHaveBeenCalledTimes(1);
    const [garde, options] = d.composerP0Reel.mock.calls[0] as [{ runId: string }, Record<string, unknown>];
    expect(garde.runId).toBe(RUN_ID);
    expect(options).toMatchObject({ coutEstimeModelesMicros: 20_000, modeles: { programme: { modele: "deepseek/deepseek-v4.1-flash" } } });
    expect(d.programme).toHaveBeenCalledTimes(1);
    expect(d.agent).not.toHaveBeenCalled();
    expect(d.ancrage).not.toHaveBeenCalled();
    expect(d.etapeFinale).not.toHaveBeenCalled();
    expect(d.ecrireProgramme).toHaveBeenCalledTimes(1);
    expect(d.ecrireCoutModeles).toHaveBeenCalledTimes(1);
    // Le coût des modèles est écrit dès la réponse du modèle, avant tout appel Google.
    expect(d.ecrireCoutModeles.mock.invocationCallOrder[0]).toBeLessThan(d.detailsLogement.mock.invocationCallOrder[0] ?? 0);
  });

  it("une composition neuve à chaque étape (aucune gardée en cache de module)", async () => {
    await etapeProgramme({ runId: RUN_ID });
    await etapeProgramme({ runId: RUN_ID });
    expect(d.composerP0Reel).toHaveBeenCalledTimes(2);
    expect(d.programme).toHaveBeenCalledTimes(2);
  });

  it("programme de l'essai : profil de l'essai, une requête de modèle, plafond de coût de l'essai (2 USD, 0093 point 5)", async () => {
    d.lireExecution.mockResolvedValue(execution("essai"));
    await etapeProgramme({ runId: RUN_ID });
    expect(d.redigerProgramme).toHaveBeenCalledTimes(1);
    const plafonds = (d.composerP0Reel.mock.calls[0]?.[1] as { plafonds: { fournisseur: string; maxCoutMicros?: number }[] }).plafonds;
    expect(plafonds.find((p) => p.fournisseur === "modeles")?.maxCoutMicros).toBe(2_000_000);
  });

  it("coût des modèles déjà compté : l'étape ne dispose que du reste du plafond", async () => {
    d.lireExecution.mockResolvedValue({ ...execution(), coutModelesMicros: 2_500_000 });
    await etapeProgramme({ runId: RUN_ID });
    const plafonds = (d.composerP0Reel.mock.calls[0]?.[1] as { plafonds: { fournisseur: string; maxCoutMicros?: number }[] }).plafonds;
    expect(plafonds.find((p) => p.fournisseur === "modeles")?.maxCoutMicros).toBe(500_000);
    expect(d.ecrireCoutModeles).toHaveBeenCalledWith(d.pool, RUN_ID, 2_500_000);
  });

  it("forfait entier de l'exécution à l'étape (0116 § 3.5) : Text Search, fiches et Routes du mode ; logements par detailsLogement, lieux par textSearch", async () => {
    const sortie = await etapeProgramme({ runId: RUN_ID });
    expect(JSON.stringify(sortie)).not.toContain(SENTINELLE_GOOGLE);
    const plafonds = (d.composerP0Reel.mock.calls[0]?.[1] as { plafonds: { methode?: string; maxRequetes?: number; maxElements?: number }[] }).plafonds;
    expect(plafonds.find((p) => p.methode === "places_text_search")?.maxRequetes).toBe(90);
    expect(plafonds.find((p) => p.methode === "places_details")?.maxRequetes).toBe(90);
    expect(plafonds.find((p) => p.methode === "routes_matrix")).toMatchObject({ maxRequetes: 30, maxElements: 840 });
    expect(d.detailsLogement).toHaveBeenCalledTimes(1);
    expect(d.textSearch).toHaveBeenCalledTimes(3);
  });
});

describe("p0Run : état sérialisé réduit à l'identifiant d'exécution (0009 point 3, 0011 § 3)", () => {
  it("erreur d'un fournisseur : code persisté seul (S4), sans message ; coût des modèles écrit quand même", async () => {
    d.redigerProgramme.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_unavailable" }));
    const erreur = await refus(etapeProgramme({ runId: RUN_ID }));
    expect(erreur.message).toBe("upstream_unavailable");
    expect(JSON.stringify(erreur)).not.toContain(SENTINELLE_ERREUR);
    expect(String(erreur.stack)).not.toContain(SENTINELLE_ERREUR);
    expect(d.ecrireCoutModeles).toHaveBeenCalledTimes(1);
    expect(d.ecrireProgramme).not.toHaveBeenCalled();
  });

  it("code d'avant appel levé après la composition : pipeline_failed (codePersiste, S4)", async () => {
    d.redigerProgramme.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "config_invalid" }));
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
  });

  it("écriture du coût en échec : étape en erreur (pipeline_failed), aucun appel Google ni programme ; p0Run clôt l'exécution", async () => {
    d.ecrireCoutModeles.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "base" }));
    const erreur = await refus(etapeProgramme({ runId: RUN_ID }));
    expect(erreur.message).toBe("pipeline_failed");
    expect(String(erreur.stack)).not.toContain(SENTINELLE_ERREUR);
    aucunAppelGoogle();

    vi.clearAllMocks();
    d.ecrireCoutModeles.mockRejectedValue(new Error(SENTINELLE_ERREUR));
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.ecrireProgramme).not.toHaveBeenCalled();
    expect(d.cloreExecution).toHaveBeenCalledTimes(1);
    expect(d.cloreExecution.mock.calls[0]?.[2]).toBe("pipeline_failed");
  });

  it("écriture du coût en échec après une erreur du fournisseur : l'erreur d'origine reste celle qui sort", async () => {
    d.redigerProgramme.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_unavailable" }));
    d.ecrireCoutModeles.mockRejectedValue(new Error(SENTINELLE_ERREUR));
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("upstream_unavailable");
    expect(d.ecrireCoutModeles).toHaveBeenCalledTimes(1);
  });

  it("erreur inconnue : pipeline_failed ; brief inconnu : brief_invalid avant toute composition", async () => {
    d.redigerProgramme.mockRejectedValue(new Error(SENTINELLE_ERREUR));
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    vi.clearAllMocks();
    d.lireExecution.mockResolvedValue(execution("reel", "inconnu.json"));
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("brief_invalid");
    aucunAppel();
  });

  it("p0Run : programme sans journée lisible, arrêt pipeline_failed, rien écrit, aucun appel Google", async () => {
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    for (const texte of ["pas du JSON", JSON.stringify({ jours: [] }), JSON.stringify({ jours: [{ date: "2027-01-01", creneaux: [] }] })]) {
      vi.clearAllMocks();
      d.redigerProgramme.mockResolvedValue({ texte, coutUsd: 0.01, fin: "stop" });
      expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
      expect(d.ecrireProgramme).not.toHaveBeenCalled();
      expect(d.ecrireCoutModeles).toHaveBeenCalledTimes(1);
      aucunAppelGoogle();
    }
    d.redigerProgramme.mockResolvedValue({ texte: "{}", coutUsd: 0, fin: "stop" });
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.cloreExecution).toHaveBeenCalledWith(d.pool, RUN_ID, "pipeline_failed");
    journal.mockRestore();
  });

  it("p0Run : etapeProgramme (famille programme() seule) ; étape arrêtée : clôture ; sortie { runId } seule", async () => {
    d.matrice.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_unavailable" }));
    const sortie = await p0Run({ runId: RUN_ID });
    expect(sortie).toEqual({ runId: RUN_ID });
    expect(Object.keys(sortie)).toEqual(["runId"]);
    expect(d.ecrirePhase.mock.calls.map((appel) => appel[2])).toEqual(["recherche", "ancrage"]);
    expect(d.composerP0Reel).toHaveBeenCalledTimes(1);
    expect(d.programme).toHaveBeenCalledTimes(1);
    expect(d.cloreExecution).toHaveBeenCalledWith(d.pool, RUN_ID, "upstream_unavailable");
  });

  it("phase déjà passée (étape redistribuée après expiration) : arrêt avant toute composition, pipeline_failed", async () => {
    d.ecrirePhase.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "phase_deja_passee" }));
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    aucunAppel();
    expect(d.ecrireCoutModeles).not.toHaveBeenCalled();
  });

  it("p0Run : étape arrêtée, exécution close avec son code ; aucun programme écrit", async () => {
    d.redigerProgramme.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_redirect" }));
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.cloreExecution).toHaveBeenCalledTimes(1);
    expect(d.cloreExecution.mock.calls[0]?.[2]).toBe("upstream_redirect");
    expect(d.ecrireProgramme).not.toHaveBeenCalled();
  });

  it("décision 0116 § 4.4 : ligne de journal fermée p0.programme_written, compteurs maison seulement (aucun nom, aucun verdict)", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);
    d.redigerProgramme.mockResolvedValue(
      reponse({
        jours: [
          ...PROGRAMME.jours,
          { date: "2026-11-24", creneaux: [] },
          { date: "2030-01-01", creneaux: [] },
          {
            date: "2026-11-25",
            placeId: SENTINELLE_GOOGLE,
            creneaux: [
              { debut: "25:00", nature: "visite", lieu: "x", pourquoi: "y" },
              { debut: "10:00", nature: "inconnue" },
            ],
          },
        ],
      }),
    );
    await etapeProgramme({ runId: RUN_ID });
    const lignes = lignesDuJournal(info, "p0.programme_written");
    expect(lignes).toEqual([
      {
        level: "info",
        event: "p0.programme_written",
        days: 3,
        slots: 4,
        placesToVerify: 3,
        daysRemoved: 2,
        slotsRemoved: 2,
        fieldsRemoved: 1,
        textsCut: 0,
        modelCalls: 1,
        unverifiedForCap: 0,
        // Lot 2a (0121 § 2.3, § 4.3) : aucun site proposé, aucun soumis.
        sitesProposed: 0,
        sitesChecked: 0,
        sitesRemoved: 0,
        sitesUnchecked: 0,
      },
    ]);
    const texte = JSON.stringify(lignes);
    for (const interdit of ["Taverne maison", "Forteresse", SENTINELLE_GOOGLE]) expect(texte).not.toContain(interdit);
    // Aucun compteur de verdict (0117 § 4) : la liste exacte des clés est vérifiée ci-dessus ; aucune n'en est un.
    for (const cle of ["verified", "verifies", "notFound", "introuvables", "closed", "fermes", "outOfZone", "horsZone"]) expect(lignes[0]).not.toHaveProperty(cle);
    info.mockRestore();
  });

  it("décision 0116 § 4.4 : rédaction qui lève : ligne p0.programme_written écrite quand même (warn, nom de l'erreur, jamais son message)", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);
    d.redigerProgramme.mockRejectedValue(Object.assign(new Error(SENTINELLE_ERREUR), { name: "ErreurOpenRouter", code: "cap_reached" }));
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    const lignes = lignesDuJournal(info, "p0.programme_written");
    expect(lignes).toEqual([
      {
        level: "warn",
        event: "p0.programme_written",
        days: 0,
        slots: 0,
        placesToVerify: 0,
        daysRemoved: 0,
        slotsRemoved: 0,
        fieldsRemoved: 0,
        textsCut: 0,
        modelCalls: 1,
        unverifiedForCap: 0,
        sitesProposed: 0,
        sitesChecked: 0,
        sitesRemoved: 0,
        sitesUnchecked: 0,
        errorName: "ErreurOpenRouter",
      },
    ]);
    expect(JSON.stringify(lignes)).not.toContain(SENTINELLE_ERREUR);
    expect(d.ecrireProgramme).not.toHaveBeenCalled();
    expect(d.ecrireCoutModeles).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it("clôture : un code hors de CODES_ARRET devient pipeline_failed", async () => {
    await etapeClore({ runId: RUN_ID, code: SENTINELLE_ERREUR as never });
    expect(d.cloreExecution).toHaveBeenCalledWith(d.pool, RUN_ID, "pipeline_failed");
  });
});

describe("p0Run : forme du module (décision 0063 ; décision 0116 § 3.1)", () => {
  const source = readFileSync(path.join(process.cwd(), "src/workflows/p0-run.ts"), "utf8");
  const index = readFileSync(path.join(process.cwd(), "src/workflows/index.ts"), "utf8");

  it("aucune étape relancée (maxRetries = 0)", () => {
    for (const etape of [etapeProgramme, etapeRevision, etapeClore]) expect((etape as unknown as { maxRetries: number }).maxRetries).toBe(0);
  });

  it("workflows: p0Run réduit à etapeProgramme puis etapeClore ; ni webhook ni hook dans src/workflows", () => {
    // Décision 0126 § 1 : `p0Revision` (etapeRevision puis etapeClore) s'ajoute, même forme.
    expect(source.match(/^\s*"use workflow";$/gm)).toHaveLength(2);
    expect(source.match(/^\s*"use step";$/gm)).toHaveLength(3);
    const debutRevision = source.indexOf("export async function p0Revision(");
    const corps = source.slice(source.indexOf("export async function p0Run("), debutRevision);
    expect([...corps.matchAll(/await (etape\w+)\(/g)].map((m) => m[1])).toEqual(["etapeProgramme", "etapeClore"]);
    const corpsRevision = source.slice(debutRevision);
    expect([...corpsRevision.matchAll(/await (etape\w+)\(/g)].map((m) => m[1])).toEqual(["etapeRevision", "etapeClore"]);
    for (const ancienne of ["etapeRecherche", "etapeAncrage", "etapeFinale"]) expect(source).not.toMatch(new RegExp(`export async function ${ancienne}\\(`));
    // P0r3d : `complet.ts`, l'interrupteur de démarrage seul (une constante, aucune directive, aucun import hors server-only).
    const complet = readFileSync(path.join(process.cwd(), "src/workflows/complet.ts"), "utf8");
    for (const texte of [source, index, complet]) expect(texte).not.toMatch(/createWebhook|createHook|defineHook|resumeHook|resumeWebhook|getHookByToken/);
    expect(complet).not.toMatch(/"use (?:workflow|step|server|client)"/);
    expect([...complet.matchAll(/^import .*$/gm)].map((m) => m[0])).toEqual(['import "server-only";']);
    expect(readdirSync(path.join(process.cwd(), "src/workflows")).sort()).toEqual(["apercu.test.ts", "apercu.ts", "complet.ts", "index.ts", "p0-run.ts", "recalcul.test.ts", "recalcul.ts", "voyage-complet.test.ts", "voyage-complet.ts"]);
  });

  it("aucune composition, aucun client ni registre au niveau du module (fabriques appelées dans l'étape)", () => {
    const horsFonctions = source.split("\n").filter((ligne) => /^(const|let|var|export const) /.test(ligne));
    for (const ligne of horsFonctions) expect(ligne).not.toMatch(/composerP0Reel|creerRegistreForfait|poolPrototype\(\)|\.agent\(|\.ancrage\(|\.etapeFinale\(|\.programme\(/);
  });

  it("NOMS_BRIEFS : exactement les fichiers de prototype/briefs/", () => {
    const fichiers = readdirSync(path.join(process.cwd(), "prototype/briefs"))
      .filter((f) => f.endsWith(".json"))
      .sort();
    expect([...NOMS_BRIEFS].sort()).toEqual(fichiers);
  });
});
