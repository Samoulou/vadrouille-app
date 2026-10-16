// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

import type { ClientModeles, RequeteModele } from "@/ai/client";
import { creerModelesSimules } from "@/ai/modeles.simule";
import { creerNoterCandidats } from "@/ai/noter-candidats";
import { creerRedigerRaisons } from "@/ai/rediger-raisons";
import type { LigneCandidat, PhaseTravail } from "@/contracts/prototype-travail";
import { capacitesAncrage } from "@/grounding/ancrage-zone";
import type { ClientPlaces, ClientRoutes, RequeteMatrice, RequeteTextSearch } from "@/grounding/interfaces";
import { creerPlacesSimule } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import { PHASES } from "@/prototype/arret";
import { placeIdsDuProgramme } from "@/prototype/programme-reduit";
import { creerLecteurPages } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule } from "@/research/pages.simule";
import { creerRechercheSimulee } from "@/research/recherche-web.simule";
import { demandeDe, type AppelFacture, type DemandeReservation, type Plafond, type PortConsommation } from "@/server/usage/port";
import { etapeAncrage, etapeFinale, etapeRecherche, LIMITE_FONCTION_MS, MARGE_FIN_ETAPE_MS, p0Run } from "@/workflows/p0-run";

import { lireFixtures } from "../../../scripts/p0/fichiers";
import { clesDe, CLES_INTERDITES, sentinelles } from "../p0/harnais";

/**
 * Étape finale de `p0Run` (P0r3c-5, ticket 352 ; 0063 point 10 et son amendement P0r3c-5 ; 0055 § 6 points 1, 3 et 4 ;
 * 0052 § 1), de bout en bout sur les doubles du mode simulé (fixtures commitées d'Édimbourg) : recherche, ancrage puis
 * étape finale, jusqu'à l'écriture réelle du programme (`ecrireProgramme`) sur un client `pg` simulé. Garde, table de
 * travail (en mémoire, avec la garde d'idempotence de `ecrirePhase`) et composition sont des doubles ; aucun appel
 * réel aux modèles ni à Google, aucune base.
 */

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const SENTINELLE_ERREUR = "SENTINELLE-MESSAGE-FINALE";
const fixtures = lireFixtures("edimbourg");
const { placeIds: IDS_GOOGLE, autres: AUTRES_GOOGLE } = sentinelles(fixtures);

type Capture = {
  requetes: RequeteModele[];
  textSearch: RequeteTextSearch[];
  details: string[];
  matrices: RequeteMatrice[];
  /** Ordre des appels de l'étape finale : `modele:<etape>`, `textSearch`, `details`, `routes`. */
  ordre: string[];
};

const d = vi.hoisted(() => ({
  etat: {
    mode: "reel" as "reel" | "essai",
    brief: "edimbourg-1.json",
    statut: "en_cours" as string,
    phase: null as string | null,
    lignes: [] as LigneCandidat[],
    cout: 0,
    clos: undefined as string | undefined,
    ecouleMs: 0,
  },
  requetesSql: [] as {
    texte: string;
    valeurs: readonly unknown[] | undefined;
  }[],
  ecrituresPhase: [] as string[],
  composerP0Reel: vi.fn(),
  echecEcritureProgramme: false,
  /** Fiches Place Details sans statut d'établissement (quartier, parc, site naturel ; Q460). */
  sansStatut: false,
  /** Contenu servi pour `essai.json`, `mode-reel.json` et `classement.json` (les fichiers commités, sauf cas modifié par un test). */
  essai: {} as Record<string, unknown>,
  modeReel: {} as Record<string, unknown>,
  classement: {} as unknown,
}));

// Lus à chaque accès (les imports transformés par Vitest relisent `default`) : un test peut changer l'un ou l'autre.
vi.mock("../../../prototype/config/essai.json", () => ({
  get default() {
    return d.essai;
  },
}));
vi.mock("../../../prototype/config/mode-reel.json", () => ({
  get default() {
    return d.modeReel;
  },
}));
vi.mock("../../../prototype/config/classement.json", () => ({
  get default() {
    return d.classement;
  },
}));

vi.mock("@/server/p0/garde", () => ({
  verifierGardeEtape: async (runId: string) => ({
    ok: true,
    garde: Object.freeze({ runId }),
  }),
}));

/** Client `pg` simulé pour `ecrireProgramme` (transaction, positions, programme, statut). */
vi.mock("@/server/p0/base", () => ({
  poolPrototype: () => ({
    connect: async () => ({
      query: async (texte: string, valeurs?: readonly unknown[]) => {
        d.requetesSql.push({ texte, valeurs });
        if (d.echecEcritureProgramme && texte.startsWith("SELECT public."))
          throw Object.assign(new Error("permission denied"), {
            code: "42501",
          });
        if (texte.startsWith("INSERT INTO prototype.programmes")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
        if (texte.startsWith("UPDATE prototype.runs SET status = 'programme_ecrit'")) {
          if (d.etat.statut !== "en_cours") return { rows: [] };
          d.etat.statut = "programme_ecrit";
          d.etat.phase = null;
          return { rows: [{ id: RUN_ID }] };
        }
        return { rows: [] };
      },
      release: () => undefined,
    }),
  }),
}));

/** Table de travail en mémoire : mêmes règles que l'adaptateur (exécution en cours, garde d'idempotence des phases). */
vi.mock("@/adapters/prototype-travail", () => {
  const absente = () =>
    Object.assign(new Error("execution_absente"), {
      code: "execution_absente",
    });
  const enCours = () => {
    if (d.etat.statut !== "en_cours") throw absente();
  };
  return {
    lireExecution: async () => {
      enCours();
      return {
        mode: d.etat.mode,
        brief: d.etat.brief,
        variante: "B",
        coutModelesMicros: d.etat.cout,
        jourQuota: "2026-10-12",
        ecouleMs: d.etat.ecouleMs,
      };
    },
    ecrirePhase: async (_pool: unknown, _runId: string, phase: PhaseTravail) => {
      enCours();
      const rang = PHASES.indexOf(phase);
      if (d.etat.phase !== (rang === 0 ? null : PHASES[rang - 1]))
        throw Object.assign(new Error("phase_deja_passee"), {
          code: "phase_deja_passee",
        });
      d.etat.phase = phase;
      d.ecrituresPhase.push(phase);
    },
    ecrireCoutModeles: async (_pool: unknown, _runId: string, micros: number) => {
      enCours();
      d.etat.cout = Math.max(d.etat.cout, Math.ceil(micros / 10_000) * 10_000);
    },
    remplacerCandidats: async (_pool: unknown, _runId: string, lignes: LigneCandidat[]) => {
      enCours();
      d.etat.lignes = structuredClone(lignes);
    },
    lireCandidats: async () => {
      enCours();
      return structuredClone(d.etat.lignes);
    },
    cloreExecution: async (_pool: unknown, _runId: string, code: string) => {
      if (d.etat.statut !== "en_cours") return;
      d.etat.lignes = [];
      d.etat.statut = "arretee";
      d.etat.phase = null;
      d.etat.clos = code;
    },
  };
});

vi.mock("@/server/composition/p0-reel", () => ({
  composerP0Reel: d.composerP0Reel,
}));

let capture: Capture;
/** Port de consommation (registre de l'étape) et plafonds reçus par la dernière composition. */
let derniere: { usage: PortConsommation; plafonds: readonly Plafond[] } | undefined;

type OptionsSimulees = {
  usage: PortConsommation;
  plafonds: readonly Plafond[];
  coutEstimeModelesMicros: number;
  modeles: {
    routage: never;
    notation: { modele: string };
    raisons: { modele: string };
  };
};

/**
 * Composition sur les doubles du mode simulé, de même forme que la vraie : chaque appel payant est **réservé** auprès
 * du port de l'étape (registre du forfait de l'étape, avec son échéance) puis confirmé, comme le font les clients réels
 * (D13) ; refusé, il ne part pas. Chaque appel est capturé.
 */
function compositionSimulee(_garde: unknown, options: OptionsSimulees) {
  derniere = { usage: options.usage, plafonds: options.plafonds };
  const periodes = {
    jour: { du: 0, au: Number.MAX_SAFE_INTEGER },
    mois: { du: 0, au: Number.MAX_SAFE_INTEGER },
  };
  async function facture<T>(appel: AppelFacture, envoi: () => Promise<T>, coutReel: (reponse: T) => number | null = () => null): Promise<T> {
    const reservation = await options.usage.reserve(demandeDe({ nature: "execution", executionId: RUN_ID, periodes }, appel, options.plafonds));
    if (!reservation.ok)
      throw Object.assign(new Error(reservation.code), {
        code: reservation.code,
      });
    try {
      const reponse = await envoi();
      await options.usage.confirm(reservation.reservationId, {
        coutMicros: coutReel(reponse),
      });
      return reponse;
    } catch (erreur) {
      await options.usage.abandon(reservation.reservationId);
      throw erreur;
    }
  }
  const google = (methode: AppelFacture["methode"], elements = 0): AppelFacture => ({
    fournisseur: "google",
    methode,
    sku: "sku-test",
    unites: { requetes: 1, elements },
    coutEstimeMicros: 0,
  });
  const simules = creerModelesSimules(fixtures.modeles);
  const modeles: ClientModeles = {
    envoyer: (requete) =>
      facture(
        {
          fournisseur: "modeles",
          methode: "chat",
          sku: requete.modele,
          unites: { requetes: 1, elements: 0 },
          coutEstimeMicros: options.coutEstimeModelesMicros,
        },
        async () => {
          capture.requetes.push(structuredClone(requete));
          capture.ordre.push(`modele:${requete.etape}`);
          return simules.envoyer(requete);
        },
        (reponse) => Math.round(reponse.coutUsd * 1_000_000),
      ),
  };
  const placesSimule = creerPlacesSimule(fixtures.places);
  const places: ClientPlaces = {
    textSearch: (requete) =>
      facture(google("places_text_search"), async () => {
        capture.textSearch.push(structuredClone(requete));
        capture.ordre.push("textSearch");
        return placesSimule.textSearch(requete);
      }),
    details: (placeId) =>
      facture(google("places_details"), async () => {
        capture.details.push(placeId);
        capture.ordre.push("details");
        const fiche = await placesSimule.details(placeId);
        if (d.sansStatut) delete fiche.statut;
        return fiche;
      }),
  };
  const routesSimule = creerRoutesSimule(fixtures.routes);
  const routes: ClientRoutes = {
    matrice: (requete) =>
      facture(google("routes_matrix", requete.origines.length * requete.destinations.length), async () => {
        capture.matrices.push(structuredClone(requete));
        capture.ordre.push("routes");
        return routesSimule.matrice(requete);
      }),
  };
  const lecteur = creerLecteurPages({
    resoudre: creerResolveurSimule(fixtures.pages.dns),
    http: creerHttpSimule(fixtures.pages.pages, () => undefined),
  });
  return {
    agent: () => ({
      modeles,
      rechercheWeb: creerRechercheSimulee(fixtures.recherche),
      pages: lecteur,
    }),
    ancrage: () => capacitesAncrage(places),
    etapeFinale: () => ({
      places: { details: (placeId: string) => places.details(placeId) },
      routes,
      detailsLogement: capacitesAncrage(places).detailsLogement,
      noterCandidats: creerNoterCandidats(modeles, {
        modele: options.modeles.notation.modele,
        routage: options.modeles.routage,
      }),
      redigerRaisons: creerRedigerRaisons(modeles, {
        modele: options.modeles.raisons.modele,
        routage: options.modeles.routage,
      }),
    }),
  };
}

const ESSAI = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/config/essai.json"), "utf8")) as Record<string, unknown>;
const MODE_REEL = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/config/mode-reel.json"), "utf8")) as Record<string, unknown>;
const CLASSEMENT = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/config/classement.json"), "utf8")) as Record<string, unknown>;

function reinitialiser(): void {
  d.essai = structuredClone(ESSAI);
  d.modeReel = structuredClone(MODE_REEL);
  d.classement = structuredClone(CLASSEMENT);
  Object.assign(d.etat, {
    mode: "reel",
    brief: "edimbourg-1.json",
    statut: "en_cours",
    phase: null,
    lignes: [],
    cout: 0,
    clos: undefined,
    ecouleMs: 0,
  });
  d.requetesSql.length = 0;
  d.ecrituresPhase.length = 0;
  d.echecEcritureProgramme = false;
  d.sansStatut = false;
  d.composerP0Reel.mockImplementation(compositionSimulee);
  derniere = undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  reinitialiser();
});

/** Recherche et ancrage réels sur les doubles ; la capture ne porte ensuite que l'étape finale. */
async function jusquAEtapeFinale(): Promise<void> {
  capture = {
    requetes: [],
    textSearch: [],
    details: [],
    matrices: [],
    ordre: [],
  };
  await etapeRecherche({ runId: RUN_ID });
  await etapeAncrage({ runId: RUN_ID });
  capture = {
    requetes: [],
    textSearch: [],
    details: [],
    matrices: [],
    ordre: [],
  };
}

async function refus(promesse: Promise<unknown>): Promise<Error> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(FatalError);
  return erreur as Error;
}

/** Programme écrit : contenu (paramètre lié de l'INSERT) et positions (paramètres de la fonction de la base). */
function programmeEcrit(): {
  contenu: Record<string, unknown>;
  positions: Map<string, [number, number]>;
} {
  const insertion = d.requetesSql.find((r) => r.texte.startsWith("INSERT INTO prototype.programmes"));
  const positions = new Map(
    d.requetesSql
      .filter((r) => r.texte.startsWith("SELECT public."))
      .map((r) => [String(r.valeurs?.[1]), [Number(r.valeurs?.[2]), Number(r.valeurs?.[3])] as [number, number]]),
  );
  return {
    contenu: JSON.parse(String(insertion?.valeurs?.[1])) as Record<string, unknown>,
    positions,
  };
}

describe("p0Run, étape finale de bout en bout sur les doubles (P0r3c-5)", () => {
  it("p0Run : recherche, ancrage, étape finale ; programme et positions écrits ensemble, exécution programme_ecrit", async () => {
    capture = {
      requetes: [],
      textSearch: [],
      details: [],
      matrices: [],
      ordre: [],
    };
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.etat.clos).toBeUndefined();
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(d.ecrituresPhase).toEqual([...PHASES]);
    const { contenu, positions } = programmeEcrit();
    expect(Object.keys(contenu).sort()).toEqual(["proposals", "schema", "terminus", "trip"]);
    // Positions : exactement les lieux du programme, chacun venant d'une fiche de l'étape finale (0052 § 1.3).
    const attendus = placeIdsDuProgramme(contenu as never);
    expect(attendus.size).toBeGreaterThan(0);
    expect([...positions.keys()].sort()).toEqual([...attendus].sort());
    const transaction = d.requetesSql.map((r) => r.texte.split(/\s+/)[0]);
    expect(transaction[0]).toBe("BEGIN");
    expect(transaction.at(-1)).toBe("COMMIT");
  });

  it("Q460 (diagnostic de l'essai 1) : fiches sans statut d'établissement (logement « quartier », lieux) ; p0Run va jusqu'au programme", async () => {
    d.sansStatut = true;
    capture = {
      requetes: [],
      textSearch: [],
      details: [],
      matrices: [],
      ordre: [],
    };
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.etat.clos).toBeUndefined();
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(d.ecrituresPhase).toEqual([...PHASES]);
    expect(capture.details.length).toBeGreaterThan(1);
    expect(placeIdsDuProgramme(programmeEcrit().contenu as never).size).toBeGreaterThan(0);
  });

  it("ordre : notation (modèle) avant tout appel Google ; logements (Text Search puis fiche) ; fiches ; Routes ; raisons en dernier", async () => {
    await jusquAEtapeFinale();
    await etapeFinale({ runId: RUN_ID });
    const premierGoogle = capture.ordre.findIndex((appel) => !appel.startsWith("modele:"));
    expect(capture.ordre.slice(0, premierGoogle).every((appel) => appel === "modele:notation")).toBe(true);
    expect(premierGoogle).toBeGreaterThan(0);
    expect(capture.ordre.slice(premierGoogle, premierGoogle + 2)).toEqual(["textSearch", "details"]);
    const dernierDetails = capture.ordre.lastIndexOf("details");
    expect(capture.ordre.indexOf("routes")).toBeGreaterThan(dernierDetails);
    expect(capture.ordre.indexOf("modele:raisons")).toBeGreaterThan(capture.ordre.lastIndexOf("routes"));
    expect(capture.ordre.lastIndexOf("modele:notation")).toBeLessThan(premierGoogle);
    // Text Search : les logements du brief seulement (une requête chacun).
    expect(capture.textSearch).toHaveLength(1);
  });

  it("aucune donnée Google dans un prompt (0052 § 1.4, cadrage R1) : ni identifiant, ni nom, adresse, position ou statut de fiche", async () => {
    await jusquAEtapeFinale();
    await etapeFinale({ runId: RUN_ID });
    expect(capture.requetes.map((r) => r.etape).sort()).toEqual(expect.arrayContaining(["notation", "raisons"]));
    const prompts = JSON.stringify(capture.requetes);
    for (const valeur of [...IDS_GOOGLE, ...AUTRES_GOOGLE]) expect(prompts).not.toContain(valeur);
  });

  it("programme écrit : aucune clé de fiche ni de trajet hors des positions (handover back-end § 8)", async () => {
    await jusquAEtapeFinale();
    await etapeFinale({ runId: RUN_ID });
    const { contenu } = programmeEcrit();
    const cles = clesDe(contenu);
    for (const interdite of CLES_INTERDITES) expect(cles.has(interdite)).toBe(false);
    for (const valeur of AUTRES_GOOGLE) expect(JSON.stringify(contenu)).not.toContain(valeur);
  });

  it("plafonds de l'étape finale : Text Search une par logement, fiches au plus placesDetails − logements, tout Routes ; appels sous ces plafonds", async () => {
    await jusquAEtapeFinale();
    await etapeFinale({ runId: RUN_ID });
    const plafonds = derniere?.plafonds ?? [];
    expect(plafonds.find((p) => p.methode === "places_text_search")?.maxRequetes).toBe(1);
    expect(plafonds.find((p) => p.methode === "places_details")?.maxRequetes).toBe(89);
    expect(plafonds.find((p) => p.methode === "routes_matrix")).toMatchObject({
      maxRequetes: 30,
      maxElements: 500,
    });
    // Fiches des lieux (hors logement) : au plus placesDetails − 2 × logements.
    expect(capture.details.length - 1).toBeLessThanOrEqual(88);
    const elements = capture.matrices.reduce((somme, m) => somme + m.origines.length * m.destinations.length, 0);
    expect(elements).toBeLessThanOrEqual(500);
    expect(capture.matrices.length).toBeLessThanOrEqual(30);
    // Aucune fiche lue deux fois (un lieu lu pour un type n'est pas relu pour un autre).
    expect(new Set(capture.details).size).toBe(capture.details.length);
  });

  it("lieu fermé définitivement à l'étape finale : écarté avant la planification et remplacé par le suivant du classement (0055 § 6 point 3)", async () => {
    // Exécution de référence, sans lieu fermé.
    d.etat.brief = "edimbourg-2.json";
    await jusquAEtapeFinale();
    await etapeFinale({ runId: RUN_ID });
    const reference = {
      fiches: capture.details.length,
      lieux: programmeEcrit().positions.size,
    };
    reinitialiser();
    d.etat.brief = "edimbourg-2.json";
    await jusquAEtapeFinale();
    const ferme = { placeId: "" };
    d.composerP0Reel.mockImplementation((garde: unknown, options: OptionsSimulees) => {
      const composition = compositionSimulee(garde, options);
      return {
        ...composition,
        etapeFinale: () => {
          const finale = composition.etapeFinale();
          let fiches = 0;
          return {
            ...finale,
            places: {
              // Deuxième fiche de l'étape (la première est celle du logement) : premier lieu de la série, fermé.
              details: async (placeId: string) => {
                fiches += 1;
                const fiche = await finale.places.details(placeId);
                if (fiches !== 2) return fiche;
                ferme.placeId = placeId;
                return { ...fiche, statut: "CLOSED_PERMANENTLY" as const };
              },
            },
          };
        },
      };
    });
    await etapeFinale({ runId: RUN_ID });
    expect(ferme.placeId).not.toBe("");
    const { positions } = programmeEcrit();
    expect(positions.has(ferme.placeId)).toBe(false);
    expect(JSON.stringify(programmeEcrit().contenu)).not.toContain(ferme.placeId);
    expect(capture.matrices.some((m) => m.origines.includes(ferme.placeId))).toBe(false);
    // Remplacé : une fiche de plus (la marge), autant de lieux au programme.
    expect(capture.details.length).toBe(reference.fiches + 1);
    expect(positions.size).toBe(reference.lieux);
  });

  it("une matrice Routes par jour, chacune avec le logement du jour ; aucun lieu dans deux jours", async () => {
    await jusquAEtapeFinale();
    await etapeFinale({ runId: RUN_ID });
    const logement = capture.details[0];
    expect(capture.matrices.length).toBeGreaterThan(1);
    const vus = new Set<string>();
    for (const matrice of capture.matrices) {
      expect(matrice.origines).toContain(logement);
      for (const placeId of matrice.origines.filter((p) => p !== logement)) {
        expect(vus.has(placeId)).toBe(false);
        vus.add(placeId);
      }
    }
  });

  it("coût des modèles écrit avant le programme (étape sans retour possible ensuite)", async () => {
    await jusquAEtapeFinale();
    const avant = d.etat.cout;
    await etapeFinale({ runId: RUN_ID });
    // Après l'écriture du programme, l'exécution n'est plus en cours : le coût a été écrit avant.
    expect(d.etat.cout).toBeGreaterThan(avant);
  });
});

describe("p0Run, étape finale : arrêts sans programme", () => {
  it("garde d'idempotence (mineur 6 de la PR 348) : étape finale rejouée après expiration, arrêt avant toute composition et tout appel", async () => {
    await jusquAEtapeFinale();
    d.etat.phase = "planification";
    const compositions = d.composerP0Reel.mock.calls.length;
    expect((await refus(etapeFinale({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    expect(d.composerP0Reel.mock.calls.length).toBe(compositions);
    expect(capture.ordre).toEqual([]);
    expect(d.requetesSql).toEqual([]);
  });

  it("étape d'ancrage rejouée après expiration : arrêt avant tout appel (même garde à chaque étape)", async () => {
    await jusquAEtapeFinale();
    const compositions = d.composerP0Reel.mock.calls.length;
    expect((await refus(etapeAncrage({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    expect(d.composerP0Reel.mock.calls.length).toBe(compositions);
  });

  it("écriture refusée par la base (verrou S8) : aucune position ni programme, l'erreur est réduite à son code, coût déjà écrit", async () => {
    await jusquAEtapeFinale();
    d.echecEcritureProgramme = true;
    const erreur = await refus(etapeFinale({ runId: RUN_ID }));
    expect(erreur.message).toBe("pipeline_failed");
    expect(String(erreur.stack)).not.toContain("permission denied");
    expect(d.requetesSql.some((r) => r.texte.startsWith("INSERT INTO prototype.programmes"))).toBe(false);
    expect(d.requetesSql.map((r) => r.texte).at(-1)).toBe("ROLLBACK");
    expect(d.etat.statut).toBe("en_cours");
    expect(d.etat.cout).toBeGreaterThan(0);
  });

  it("erreur d'un fournisseur pendant les fiches : code seul, sans message ni identifiant ; coût écrit ; p0Run clôt l'exécution", async () => {
    capture = {
      requetes: [],
      textSearch: [],
      details: [],
      matrices: [],
      ordre: [],
    };
    d.composerP0Reel.mockImplementation((garde: unknown, options: OptionsSimulees) => {
      const composition = compositionSimulee(garde, options);
      return {
        ...composition,
        etapeFinale: () => {
          const finale = composition.etapeFinale();
          let appels = 0;
          return {
            ...finale,
            places: {
              details: async (placeId: string) => {
                appels += 1;
                if (appels > 3) throw Object.assign(new Error(`${SENTINELLE_ERREUR} ${placeId}`), { code: "upstream_unavailable" });
                return finale.places.details(placeId);
              },
            },
          };
        },
      };
    });
    await etapeRecherche({ runId: RUN_ID });
    await etapeAncrage({ runId: RUN_ID });
    const coutAvant = d.etat.cout;
    const erreur = await refus(etapeFinale({ runId: RUN_ID }));
    expect(erreur.message).toBe("upstream_unavailable");
    for (const texte of [erreur.message, String(erreur.stack), JSON.stringify(erreur)]) {
      expect(texte).not.toContain(SENTINELLE_ERREUR);
      for (const placeId of IDS_GOOGLE) expect(texte).not.toContain(placeId);
    }
    expect(d.etat.cout).toBeGreaterThan(coutAvant);
    expect(d.requetesSql).toEqual([]);
  });

  it("essai d'intégration sur un brief de six jours : plan Routes hors plafond (3 requêtes), arrêt en planification sans fiche de lieu ni Routes", async () => {
    d.etat.mode = "essai";
    await jusquAEtapeFinale();
    expect((await refus(etapeFinale({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    expect(d.ecrituresPhase.slice(-2)).toEqual(["notation", "planification"]);
    // Seuls appels Google : le logement (Text Search et fiche) ; aucune fiche de lieu, aucune matrice.
    expect(capture.ordre.filter((appel) => !appel.startsWith("modele:"))).toEqual(["textSearch", "details"]);
    expect(d.requetesSql).toEqual([]);
  });

  it("première série plus grande que le plafond des fiches (placesDetails − 2 × logements) : arrêt avant toute fiche de lieu", async () => {
    // Mode réel à 12 fiches : 1 pour relire le logement à l'ancrage, 1 à l'étape finale, 10 pour la série de six jours.
    d.modeReel = { ...MODE_REEL, placesDetails: 12 };
    await jusquAEtapeFinale();
    expect((await refus(etapeFinale({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    expect(derniere?.plafonds.find((p) => p.methode === "places_details")?.maxRequetes).toBe(11);
    expect(capture.ordre.filter((appel) => !appel.startsWith("modele:"))).toEqual(["textSearch", "details"]);
    expect(d.requetesSql).toEqual([]);
  });

  it("formule de classement invalide : config_invalid avant toute composition de l'étape finale", async () => {
    await jusquAEtapeFinale();
    d.classement = { ...CLASSEMENT, schema: 99 };
    const compositions = d.composerP0Reel.mock.calls.length;
    expect((await refus(etapeFinale({ runId: RUN_ID }))).message).toBe("config_invalid");
    expect(d.composerP0Reel.mock.calls.length).toBe(compositions);
    expect(capture.ordre).toEqual([]);
  });
});

describe("p0Run, marge de durée (réponse 1 du Tech Lead, PR 348 ; dureeMs 900 s)", () => {
  const T0 = Date.parse("2026-10-15T10:00:00Z");
  const demande = (methode: AppelFacture["methode"]): DemandeReservation =>
    demandeDe(
      {
        nature: "execution",
        executionId: RUN_ID,
        periodes: {
          jour: { du: 0, au: Number.MAX_SAFE_INTEGER },
          mois: { du: 0, au: Number.MAX_SAFE_INTEGER },
        },
      },
      {
        fournisseur: methode === "chat" ? "modeles" : "google",
        methode,
        sku: "sku-test",
        unites: { requetes: 1, elements: methode === "routes_matrix" ? 1 : 0 },
        coutEstimeMicros: 1,
      },
      derniere?.plafonds ?? [],
    );

  /** Registre de l'étape d'ancrage ouverte à `T0` (la famille est refusée juste après, sans appel). */
  async function registreOuvertA(ecouleMs: number): Promise<PortConsommation> {
    d.etat.ecouleMs = ecouleMs;
    d.etat.phase = "recherche";
    d.composerP0Reel.mockImplementation((garde: unknown, options: OptionsSimulees) => {
      compositionSimulee(garde, options);
      return {
        ancrage: () => {
          throw Object.assign(new Error("arrêt du test"), {
            code: "upstream_unavailable",
          });
        },
      };
    });
    vi.setSystemTime(T0);
    await etapeAncrage({ runId: RUN_ID }).catch(() => undefined);
    const usage = derniere?.usage;
    if (usage === undefined) throw new Error("registre non reçu");
    return usage;
  }

  it("échéance : limite de fonction (300 s) moins la marge (30 s) ; un appel dont le délai complet ne tient pas est refusé cap_reached", async () => {
    expect(LIMITE_FONCTION_MS).toBe(300_000);
    expect(MARGE_FIN_ETAPE_MS).toBe(30_000);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const usage = await registreOuvertA(0);
      // Places : 10 s de requête + 2 × 2 s de port ; échéance à T0 + 270 s.
      vi.setSystemTime(T0 + 256_000);
      expect((await usage.reserve(demande("places_details"))).ok).toBe(true);
      vi.setSystemTime(T0 + 256_001);
      expect(await usage.reserve(demande("places_details"))).toEqual({
        ok: false,
        code: "cap_reached",
      });
      expect(await usage.reserve(demande("places_text_search"))).toEqual({
        ok: false,
        code: "cap_reached",
      });
      // Modèle : 120 s + 2 × 2 s ; Routes : 10 s + 2 × 2 s.
      vi.setSystemTime(T0 + 146_001);
      expect(await usage.reserve(demande("chat"))).toEqual({
        ok: false,
        code: "cap_reached",
      });
      expect((await usage.reserve(demande("routes_matrix"))).ok).not.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("durée du mode (900 s) presque écoulée, mesurée par la base : l'échéance la suit, avant la limite de fonction", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 840 s écoulées : il reste 60 s, échéance à T0 + 30 s.
      const usage = await registreOuvertA(840_000);
      vi.setSystemTime(T0 + 16_000);
      expect((await usage.reserve(demande("places_details"))).ok).toBe(true);
      vi.setSystemTime(T0 + 16_001);
      expect(await usage.reserve(demande("places_details"))).toEqual({
        ok: false,
        code: "cap_reached",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("durée épuisée : la première réservation est refusée, aucun appel ne part ; code persisté pipeline_failed (après composition, S4)", async () => {
    d.etat.ecouleMs = 900_000 - 40_000;
    capture = {
      requetes: [],
      textSearch: [],
      details: [],
      matrices: [],
      ordre: [],
    };
    const erreur = await refus(etapeRecherche({ runId: RUN_ID }));
    expect(erreur.message).toBe("pipeline_failed");
    expect(capture.ordre).toEqual([]);
  });
});
