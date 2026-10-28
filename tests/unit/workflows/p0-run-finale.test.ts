// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

import type { ClientModeles, RequeteModele } from "@/ai/client";
import { creerModelesSimules } from "@/ai/modeles.simule";
import { creerRedigerProgramme } from "@/ai/rediger-programme";
import { creerRedigerRevision } from "@/ai/rediger-revision";
import { lieuxDuProgramme, lireProgramme, ordreEcrit, type ProgrammeIa } from "@/ai/sorties";
import type { PhaseTravail } from "@/contracts/prototype-travail";
import { capacitesAncrage } from "@/grounding/ancrage-zone";
import type { ClientPlaces, ClientRoutes, RequeteMatrice, RequeteTextSearch } from "@/grounding/interfaces";
import { lieuxHorsPartTextSearch, RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import { creerPlacesSimule } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import { zoneDuSejour } from "@/grounding/zone";
import { SQL_TRAJET } from "@/adapters/prototype-ecriture";
import { cleTrajet, pairesDistinctes, pairesDuProgramme, placeIdsDuProgramme, ProgrammeEcritSchema } from "@/prototype/programme-reduit";
import { demandeDe, type AppelFacture, type DemandeReservation, type Plafond, type PortConsommation } from "@/server/usage/port";
import { DELAI_SITE_MS, MARGE_SITE_MS, SITES_DUREE_MAX_MS, type VerificateurSites } from "@/server/p0/sites";
import { DELAI_REQUETE_MS } from "@/server/usage/port";
import { identifiantVoyageSaisi } from "@/domain/identifiant";
import { DUREE_MAX_EXECUTION_MS, etapeProgramme, etapeRevision, LIMITE_FONCTION_MS, MARGE_FIN_ETAPE_MS, MARGE_VERIFICATION_AGENT_MS, p0Revision, p0Run, plafondsGoogleRevision } from "@/workflows/p0-run";

import { lireFixtures } from "../../../scripts/p0/fichiers";
import { clesDe, CLES_INTERDITES, sentinelles } from "../p0/harnais";

/**
 * `etapeProgramme` de `p0Run` (décision 0116 § 3 et § 4 ; 0115 § 3 ; 0055 § 6 ; 0052 § 1 ; 0092), de bout en bout sur
 * les doubles du mode simulé (fixtures commitées d'Édimbourg, dont la sortie simulée du prompt `programme`) : rédaction,
 * vérification, trajets, jusqu'à l'écriture réelle du programme (`ecrireProgramme`) sur un client `pg` simulé. Garde,
 * table de travail (en mémoire, avec la garde d'idempotence de `ecrirePhase`) et composition sont des doubles ; aucun
 * appel réel aux modèles ni à Google, aucune base.
 *
 * Réécriture autorisée par la décision 0116 § 8.2 : l'ancienne version exerçait `etapeRecherche`, `etapeAncrage` et
 * `etapeFinale` ; chaque test porte, dans la PR du lot 1, son ancien et son nouveau nom, à propriété égale.
 */

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const SENTINELLE_ERREUR = "SENTINELLE-MESSAGE-FINALE";
const fixtures = lireFixtures("edimbourg");
const { placeIds: IDS_GOOGLE, autres: AUTRES_GOOGLE } = sentinelles(fixtures);
const PLACE_ID_DE = new Map(Object.entries(fixtures.places.lieux).map(([nom, lieu]) => [nom, lieu.placeId]));
const LOGEMENT = PLACE_ID_DE.get("Vieille ville d'Édimbourg (Old Town)") ?? "";
/** Sortie simulée du prompt `programme` d'`edimbourg-1`, lue comme l'étape la lit, en ordre écrit. */
const PROGRAMME_FIXTURE = ordreEcrit(lireProgramme(JSON.stringify(fixtures.modeles.programme), { arrivee: "2026-11-23", depart: "2026-11-28" }).valeur as ProgrammeIa);

type Capture = {
  requetes: RequeteModele[];
  textSearch: RequeteTextSearch[];
  details: string[];
  matrices: RequeteMatrice[];
  /** Ordre des appels : `modele:<etape>`, `textSearch`, `details`, `routes`. */
  ordre: string[];
};

const d = vi.hoisted(() => ({
  etat: {
    mode: "reel" as "reel" | "essai",
    brief: "edimbourg-1.json",
    statut: "en_cours" as string,
    phase: null as string | null,
    cout: 0,
    clos: undefined as string | undefined,
    /** Ancienneté de l'exécution (décision 0102 § 6) : la garde simulée refuse l'étape au-delà de `dureeMaxMs`. */
    ageMs: 0,
    /** Temps passé (horloge simulée) pendant la relecture de l'exécution, à l'ouverture d'une étape. */
    avanceALaLectureMs: 0,
    /** Plafonds Google réservés relus avec l'exécution (révision, décision 0126 § 2) ; absents par défaut. */
    forfaitGoogle: undefined as undefined | { textSearch: number; details: number; routesRequetes: number; routesElements: number },
  },
  requetesSql: [] as { texte: string; valeurs: readonly unknown[] | undefined }[],
  /** Brief saisi servi par `lireBriefSaisi` (E2E-essai, lot 3) et exécutions dont il a été lu. */
  briefSaisi: null as unknown,
  briefSaisiLus: [] as string[],
  /** Version servie du voyage (lot 4, décision 0126) : contenu relu par `lireVersionCourante`, et voyages demandés. */
  versionServie: null as unknown,
  versionsLues: [] as string[],
  ecrituresPhase: [] as string[],
  composerP0Reel: vi.fn(),
  echecEcritureProgramme: false,
  /** Table des temps conservés présente (migration 0011 appliquée, décision 0092 § 5 point 6). */
  tablePresente: true,
  /** Fiches Place Details sans statut d'établissement (quartier, parc, site naturel ; Q460). */
  sansStatut: false,
  /** Sortie du prompt `programme` servie par le double (celle des fixtures, sauf cas modifié par un test). */
  programme: undefined as unknown,
  /** Contenu servi pour `essai.json`, `mode-reel.json` et `modeles.json` (les fichiers commités, sauf cas modifié). */
  essai: {} as Record<string, unknown>,
  modeReel: {} as Record<string, unknown>,
  modeles: {} as Record<string, unknown>,
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
vi.mock("../../../prototype/config/modeles.json", () => ({
  get default() {
    return d.modeles;
  },
}));

vi.mock("@/server/p0/garde", () => ({
  verifierGardeEtape: async (runId: string, dependances: { dureeMaxMs: number }) =>
    d.etat.ageMs >= dependances.dureeMaxMs ? { ok: false, code: "run_refused" } : { ok: true, garde: Object.freeze({ runId }) },
}));

/** Client `pg` simulé pour `ecrireProgramme` (transaction, positions, programme, statut). */
vi.mock("@/server/p0/base", () => ({
  poolPrototype: () => ({
    connect: async () => ({
      query: async (texte: string, valeurs?: readonly unknown[]) => {
        d.requetesSql.push({ texte, valeurs });
        if (d.echecEcritureProgramme && texte.startsWith("SELECT public.")) throw Object.assign(new Error("permission denied"), { code: "42501" });
        if (texte.startsWith("INSERT INTO prototype.programmes")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
        if (texte.includes("to_regclass(")) return { rows: [{ presente: d.tablePresente }] };
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
vi.mock("@/adapters/prototype-travail", async (importOriginal) => {
  const { supprimerCandidatsDansTransaction, supprimerSecteursDansTransaction, SQL_SUPPRIMER, PHASES_TRAVAIL } = await importOriginal<typeof import("@/adapters/prototype-travail")>();
  const enCours = () => {
    if (d.etat.statut !== "en_cours") throw Object.assign(new Error("execution_absente"), { code: "execution_absente" });
  };
  return {
    supprimerCandidatsDansTransaction,
    supprimerSecteursDansTransaction,
    SQL_SUPPRIMER,
    PHASES_TRAVAIL,
    lireExecution: async () => {
      enCours();
      if (d.etat.avanceALaLectureMs > 0) vi.setSystemTime(Date.now() + d.etat.avanceALaLectureMs);
      return {
        mode: d.etat.mode,
        brief: d.etat.brief,
        variante: "B",
        coutModelesMicros: d.etat.cout,
        jourQuota: "2026-10-12",
        numeroDuJour: 2,
        ...(d.etat.forfaitGoogle === undefined ? {} : { forfaitGoogle: d.etat.forfaitGoogle }),
      };
    },
    ecrirePhase: async (_pool: unknown, _runId: string, phase: PhaseTravail) => {
      enCours();
      const rang = PHASES_TRAVAIL.indexOf(phase);
      if (d.etat.phase !== (rang === 0 ? null : PHASES_TRAVAIL[rang - 1])) throw Object.assign(new Error("phase_deja_passee"), { code: "phase_deja_passee" });
      d.etat.phase = phase;
      d.ecrituresPhase.push(phase);
    },
    ecrireCoutModeles: async (_pool: unknown, _runId: string, micros: number) => {
      enCours();
      d.etat.cout = Math.max(d.etat.cout, Math.ceil(micros / 10_000) * 10_000);
    },
    lireBriefSaisi: async (_pool: unknown, runId: string) => {
      enCours();
      d.briefSaisiLus.push(runId);
      return structuredClone(d.briefSaisi);
    },
    lireVersionCourante: async (_pool: unknown, tripId: string) => {
      d.versionsLues.push(tripId);
      return structuredClone(d.versionServie);
    },
    cloreExecution: async (_pool: unknown, _runId: string, code: string) => {
      if (d.etat.statut !== "en_cours") return;
      d.etat.statut = "arretee";
      d.etat.phase = null;
      d.etat.clos = code;
    },
  };
});

vi.mock("@/server/composition/p0-reel", () => ({ composerP0Reel: d.composerP0Reel }));

let capture: Capture;
const captureVide = (): Capture => ({ requetes: [], textSearch: [], details: [], matrices: [], ordre: [] });

/** Latences simulées (ms) : l'horloge (`Date`, simulée) avance de la latence de chaque appel. Absentes : immobile. */
type Latences = { readonly modele: number; readonly places: number; readonly routes: number };
let latences: Latences | undefined;

async function avecLatence<T>(duree: number | undefined, envoi: () => Promise<T>): Promise<T> {
  const depart = Date.now();
  const reponse = await envoi();
  if (duree !== undefined) vi.setSystemTime(Math.max(Date.now(), depart + duree));
  return reponse;
}

function latenceDe(methode: AppelFacture["methode"]): number | undefined {
  if (latences === undefined) return undefined;
  if (methode === "chat") return latences.modele;
  return methode === "routes_matrix" ? latences.routes : latences.places;
}

/** Port de consommation (registre de l'étape) et plafonds reçus par la dernière composition. */
let derniere: { usage: PortConsommation; plafonds: readonly Plafond[] } | undefined;

type OptionsSimulees = {
  usage: PortConsommation;
  plafonds: readonly Plafond[];
  coutEstimeModelesMicros: number;
  modeles: { routage: never; programme: { modele: string } };
};

/** Modification d'une capacité par un test : fiche, Text Search ou matrice. */
type Retouches = {
  details?: (placeId: string, fiche: () => Promise<Awaited<ReturnType<ClientPlaces["details"]>>>) => Promise<Awaited<ReturnType<ClientPlaces["details"]>>>;
  routes?: ClientRoutes;
  /** Réponse de Text Search remplacée (la requête est capturée et facturée comme les autres). */
  textSearch?: (requete: Parameters<ClientPlaces["textSearch"]>[0], reponse: () => ReturnType<ClientPlaces["textSearch"]>) => ReturnType<ClientPlaces["textSearch"]>;
};
let retouches: Retouches = {};

/**
 * Vérificateur de sites simulé (lot 2a ; 0121 § 4.3) : par défaut, il refuse tout **sans appel** (la sortie simulée
 * d'`edimbourg-1` n'a aucun site) ; un test des sites le remplace. Chaque adresse soumise est capturée.
 */
let sitesSoumis: string[] = [];
let verificateurSites: VerificateurSites = { barriereFermee: false, verifier: async () => ({ ok: false }) };

/**
 * Composition sur les doubles du mode simulé, de même forme que la vraie : chaque appel payant est **réservé** auprès
 * du port de l'étape (registre du forfait de l'étape, avec son échéance) puis confirmé, comme le font les clients réels
 * (D13) ; refusé, il ne part pas. Chaque appel est capturé.
 */
function compositionSimulee(_garde: unknown, options: OptionsSimulees) {
  derniere = { usage: options.usage, plafonds: options.plafonds };
  const periodes = { jour: { du: 0, au: Number.MAX_SAFE_INTEGER }, mois: { du: 0, au: Number.MAX_SAFE_INTEGER } };
  async function facture<T>(appel: AppelFacture, envoi: () => Promise<T>, coutReel: (reponse: T) => number | null = () => null): Promise<T> {
    const reservation = await options.usage.reserve(demandeDe({ nature: "execution", executionId: RUN_ID, periodes }, appel, options.plafonds));
    if (!reservation.ok) throw Object.assign(new Error(reservation.code), { code: reservation.code });
    try {
      const reponse = await avecLatence(latenceDe(appel.methode), envoi);
      await options.usage.confirm(reservation.reservationId, { coutMicros: coutReel(reponse) });
      return reponse;
    } catch (erreur) {
      await options.usage.abandon(reservation.reservationId);
      throw erreur;
    }
  }
  const google = (methode: AppelFacture["methode"], elements = 0): AppelFacture => ({ fournisseur: "google", methode, sku: "sku-test", unites: { requetes: 1, elements }, coutEstimeMicros: 0 });
  const simules = creerModelesSimules({ ...fixtures.modeles, programme: d.programme });
  const modeles: ClientModeles = {
    envoyer: (requete) =>
      facture(
        { fournisseur: "modeles", methode: "chat", sku: requete.modele, unites: { requetes: 1, elements: 0 }, coutEstimeMicros: options.coutEstimeModelesMicros },
        async () => {
          capture.requetes.push(structuredClone(requete));
          capture.ordre.push(`modele:${requete.etape}`);
          return simules.envoyer(requete);
        },
        (reponse) => Math.round(reponse.coutUsd * 1_000_000),
      ),
  };
  const placesSimule = creerPlacesSimule(fixtures.places);
  const details = async (placeId: string) => {
    const fiche = await placesSimule.details(placeId);
    if (d.sansStatut) delete fiche.statut;
    return fiche;
  };
  const places: ClientPlaces = {
    textSearch: (requete) =>
      facture(google("places_text_search"), async () => {
        capture.textSearch.push(structuredClone(requete));
        capture.ordre.push("textSearch");
        return retouches.textSearch === undefined ? placesSimule.textSearch(requete) : retouches.textSearch(requete, () => placesSimule.textSearch(requete));
      }),
    details: (placeId) =>
      facture(google("places_details"), async () => {
        capture.details.push(placeId);
        capture.ordre.push("details");
        return retouches.details === undefined ? details(placeId) : retouches.details(placeId, () => details(placeId));
      }),
  };
  const routesSimule = retouches.routes ?? creerRoutesSimule(fixtures.routes);
  const routes: ClientRoutes = {
    matrice: (requete) =>
      facture(google("routes_matrix", requete.origines.length * requete.destinations.length), async () => {
        capture.matrices.push(structuredClone(requete));
        capture.ordre.push("routes");
        return routesSimule.matrice(requete);
      }),
  };
  return {
    programme: () => ({
      redigerProgramme: creerRedigerProgramme(modeles, { modele: options.modeles.programme.modele, routage: options.modeles.routage }),
      redigerRevision: creerRedigerRevision(modeles, { modele: options.modeles.programme.modele, routage: options.modeles.routage }),
      textSearch: capacitesAncrage(places).textSearch,
      places: { details: (placeId: string) => places.details(placeId) },
      detailsLogement: capacitesAncrage(places).detailsLogement,
      routes,
      verifierSite: {
        get barriereFermee() {
          return verificateurSites.barriereFermee;
        },
        verifier: (adresse: string, signal?: AbortSignal) => {
          sitesSoumis.push(adresse);
          return verificateurSites.verifier(adresse, signal);
        },
      },
    }),
  };
}

const lireConfig = (fichier: string) => JSON.parse(readFileSync(path.join(process.cwd(), "prototype/config", fichier), "utf8")) as Record<string, unknown>;
const ESSAI = lireConfig("essai.json");
const MODE_REEL = lireConfig("mode-reel.json");
const MODELES = lireConfig("modeles.json");

function reinitialiser(): void {
  d.essai = structuredClone(ESSAI);
  d.modeReel = structuredClone(MODE_REEL);
  d.modeles = structuredClone(MODELES);
  d.programme = structuredClone(fixtures.modeles.programme);
  Object.assign(d.etat, { mode: "reel", brief: "edimbourg-1.json", statut: "en_cours", phase: null, cout: 0, clos: undefined, ageMs: 0, avanceALaLectureMs: 0, forfaitGoogle: undefined });
  d.requetesSql.length = 0;
  d.briefSaisi = null;
  d.briefSaisiLus.length = 0;
  d.versionServie = null;
  d.versionsLues.length = 0;
  d.ecrituresPhase.length = 0;
  d.echecEcritureProgramme = false;
  d.tablePresente = true;
  d.sansStatut = false;
  d.composerP0Reel.mockImplementation(compositionSimulee);
  derniere = undefined;
  latences = undefined;
  retouches = {};
  sitesSoumis = [];
  verificateurSites = { barriereFermee: false, verifier: async () => ({ ok: false }) };
  capture = captureVide();
}

beforeEach(() => {
  vi.clearAllMocks();
  reinitialiser();
});

async function refus(promesse: Promise<unknown>): Promise<Error> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(FatalError);
  return erreur as Error;
}

/** Programme écrit : contenu (paramètre lié de l'INSERT) et positions (paramètres de la fonction de la base). */
function programmeEcrit(): { contenu: Record<string, unknown>; positions: Map<string, [number, number]> } {
  const insertion = d.requetesSql.find((r) => r.texte.startsWith("INSERT INTO prototype.programmes"));
  const positions = new Map(
    d.requetesSql.filter((r) => r.texte.startsWith("SELECT public.")).map((r) => [String(r.valeurs?.[1]), [Number(r.valeurs?.[2]), Number(r.valeurs?.[3])] as [number, number]]),
  );
  return { contenu: JSON.parse(String(insertion?.valeurs?.[1])) as Record<string, unknown>, positions };
}

type JourEcrit = { index: number; date: string; items: { type: string; stop?: Record<string, unknown>; from?: string; to?: string; role?: string; time?: string }[] };
const joursEcrits = (): JourEcrit[] => (programmeEcrit().contenu as { trip: { days: JourEcrit[] } }).trip.days;
const etapesEcrites = () => joursEcrits().flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" && item.stop !== undefined ? [item.stop] : [])));
const etapeNommee = (nom: string) => etapesEcrites().filter((stop) => stop.name === nom);

/** Lieux distincts de la sortie simulée, dans l'ordre écrit (ce que l'étape doit chercher). */
const LIEUX_FIXTURE = lieuxDuProgramme(PROGRAMME_FIXTURE, "Édimbourg").lieux;

describe("p0Run, etapeProgramme de bout en bout sur les doubles (décision 0116 § 3)", () => {
  it("p0Run : etapeProgramme ; programme et positions écrits ensemble, exécution programme_ecrit", async () => {
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.etat.clos).toBeUndefined();
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(d.ecrituresPhase).toEqual(["recherche", "ancrage"]);
    const { contenu, positions } = programmeEcrit();
    expect(Object.keys(contenu).sort()).toEqual(["proposals", "schema", "terminus", "trip"]);
    // Positions : exactement les lieux du programme (logement et lieux vérifiés), chacun venant d'une fiche de l'étape (0052 § 1.3).
    const attendus = placeIdsDuProgramme(contenu as never);
    expect(attendus.size).toBeGreaterThan(1);
    expect([...positions.keys()].sort()).toEqual([...attendus].sort());
    const transaction = d.requetesSql.map((r) => r.texte.split(/\s+/)[0]);
    expect(transaction[0]).toBe("BEGIN");
    expect(transaction.at(-1)).toBe("COMMIT");
    // Une journée par date du séjour, dans l'ordre ; les noms affichés sont ceux de l'IA (0115 § 4.3).
    expect(joursEcrits().map((jour) => jour.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]);
    for (const nom of AUTRES_GOOGLE) expect(JSON.stringify(contenu)).not.toContain(nom);
  });

  it("Q460 (diagnostic de l'essai 1) : fiches sans statut d'établissement (logement « quartier », lieux) ; p0Run va jusqu'au programme", async () => {
    d.sansStatut = true;
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.etat.clos).toBeUndefined();
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(capture.details.length).toBeGreaterThan(1);
    expect(placeIdsDuProgramme(programmeEcrit().contenu as never).size).toBeGreaterThan(1);
  });

  it("ordre : rédaction (modèle) avant tout appel Google ; logement (Text Search puis fiche) ; vérification ; Routes en dernier", async () => {
    await etapeProgramme({ runId: RUN_ID });
    expect(capture.ordre[0]).toBe("modele:programme");
    expect(capture.ordre.filter((appel) => appel.startsWith("modele:"))).toEqual(["modele:programme"]);
    expect(capture.ordre.slice(1, 3)).toEqual(["textSearch", "details"]);
    expect(capture.textSearch[0]?.texte).toBe("Vieille ville d'Édimbourg (Old Town), Édimbourg");
    const dernierPlaces = Math.max(capture.ordre.lastIndexOf("details"), capture.ordre.lastIndexOf("textSearch"));
    expect(capture.ordre.indexOf("routes")).toBeGreaterThan(dernierPlaces);
  });

  it("aucune donnée Google dans un prompt (0052 § 1.4, cadrage R1) : ni identifiant, ni nom, adresse, position ou statut de fiche", async () => {
    await etapeProgramme({ runId: RUN_ID });
    expect(capture.requetes.map((r) => r.etape)).toEqual(["programme"]);
    const prompts = JSON.stringify(capture.requetes);
    for (const valeur of [...IDS_GOOGLE, ...AUTRES_GOOGLE]) expect(prompts).not.toContain(valeur);
  });

  it("programme: prompt sans donnée Google (critère A9) : le brief entier, récit et logement compris, et rien d'autre", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const contenu = capture.requetes[0]?.messages.map((message) => message.contenu).join("\n") ?? "";
    const brief = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/edimbourg-1.json"), "utf8")) as { recit: string; logements: { texte: string }[] };
    expect(contenu).toContain(brief.recit);
    expect(contenu).toContain(brief.logements[0]?.texte);
    for (const valeur of [...IDS_GOOGLE, ...AUTRES_GOOGLE, "placeId", "lat", "lng", "minutes"]) expect(contenu).not.toContain(`"${valeur}`);
  });

  it("programme écrit : aucune clé de fiche ni de trajet hors des positions (handover back-end § 8)", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const { contenu } = programmeEcrit();
    const cles = clesDe(contenu);
    for (const interdite of CLES_INTERDITES) expect(cles.has(interdite)).toBe(false);
    for (const valeur of AUTRES_GOOGLE) expect(JSON.stringify(contenu)).not.toContain(valeur);
  });

  it("plafonds de l'étape : forfait entier (Text Search, fiches, Routes) ; une recherche par lieu distinct, une fiche par identifiant distinct ; appels sous ces plafonds", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const plafonds = derniere?.plafonds ?? [];
    expect(plafonds.find((p) => p.methode === "places_text_search")?.maxRequetes).toBe(90);
    expect(plafonds.find((p) => p.methode === "places_details")?.maxRequetes).toBe(90);
    expect(plafonds.find((p) => p.methode === "routes_matrix")).toMatchObject({ maxRequetes: 30, maxElements: 840 });
    // Un logement, puis un lieu distinct par requête (lieux cités deux fois comptés une fois).
    expect(capture.textSearch).toHaveLength(1 + LIEUX_FIXTURE.length);
    expect(new Set(capture.details).size).toBe(capture.details.length);
    const elements = capture.matrices.reduce((somme, m) => somme + m.origines.length * m.destinations.length, 0);
    expect(elements).toBeLessThanOrEqual(840);
    expect(capture.matrices.length).toBeLessThanOrEqual(30);
  });

  it("p0: un lieu cité deux fois, une recherche et une fiche ; chaque créneau qui le cite reçoit le même placeId", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const taverne = PLACE_ID_DE.get("Taverne aux tourtes");
    expect(capture.textSearch.filter((r) => r.texte.startsWith("Taverne aux tourtes,"))).toHaveLength(1);
    expect(capture.details.filter((id) => id === taverne)).toHaveLength(1);
    const etapes = etapeNommee("Taverne aux tourtes");
    expect(etapes).toHaveLength(2);
    for (const etape of etapes) expect(etape.placeId).toBe(taverne);
  });

  it("p0: lieu fermé définitivement, écrit sans placeId, sans position et sans toConfirm écrit", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const ferme = PLACE_ID_DE.get("Maison géorgienne restaurée") ?? "";
    expect(capture.details).toContain(ferme);
    const [etape] = etapeNommee("Maison géorgienne restaurée");
    expect(etape).toBeDefined();
    expect(etape).not.toHaveProperty("placeId");
    expect(etape?.exceptions).toEqual([]);
    const { positions, contenu } = programmeEcrit();
    expect(positions.has(ferme)).toBe(false);
    expect(JSON.stringify(contenu)).not.toContain(ferme);
    expect(capture.matrices.some((m) => m.origines.includes(ferme) || m.destinations.includes(ferme))).toBe(false);
  });

  it("p0: lieu fermé le jour du créneau, placeId gardé, sans badge au lot 1 (aucune fiche relue à l'affichage)", async () => {
    const galerie = PLACE_ID_DE.get("Galerie des portraits") ?? "";
    // Aucune plage d'ouverture, aucun jour : la vérification ne lit pas les horaires (0116 § 4.4).
    retouches.details = async (placeId, fiche) => (placeId === galerie ? { ...(await fiche()), horaires: [] } : fiche());
    await etapeProgramme({ runId: RUN_ID });
    const [etape] = etapeNommee("Galerie des portraits");
    expect(etape?.placeId).toBe(galerie);
    expect(etape?.exceptions).toEqual([]);
    expect(programmeEcrit().positions.has(galerie)).toBe(true);
  });

  it("p0: aucun toConfirm ni verdict écrit dans le programme ni dans le journal", async () => {
    const sorties: string[] = [];
    const espion = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void sorties.push(args.map(String).join(" ")));
    try {
      await etapeProgramme({ runId: RUN_ID });
    } finally {
      espion.mockRestore();
    }
    const contenu = JSON.stringify(programmeEcrit().contenu);
    expect(contenu).not.toContain("toConfirm");
    // Des lieux sans placeId existent bien (fermé définitivement, introuvable), sans aucune trace de leur motif.
    expect(etapesEcrites().some((stop) => stop.placeId === undefined)).toBe(true);
    // Le compteur fermé « unverifiedForCap » (0117) et le nom maison du double introuvable sont retirés avant la recherche des verdicts.
    for (const texte of [contenu, ...sorties]) expect(texte.replaceAll('"unverifiedForCap"', "").replace(/comptoir introuvable du double/gi, "")).not.toMatch(/verifi(?:ed|es)|introuvable|ferme_definitivement|CLOSED_PERMANENTLY|hors_?zone|notFound|outOfZone/i);
    const fin = sorties.map((ligne) => JSON.parse(ligne) as Record<string, unknown>).find((ligne) => ligne.event === "p0.programme_written");
    expect(Object.keys(fin ?? {}).sort()).toEqual(
      // Lot 2a (0121 § 2.3, § 4.3) : les quatre compteurs `sites*` s'ajoutent (des nombres de nos propres requêtes).
      ["days", "daysRemoved", "event", "fieldsRemoved", "level", "modelCalls", "placesToVerify", "slots", "slotsRemoved", "textsCut", "unverifiedForCap", "sitesProposed", "sitesChecked", "sitesRemoved", "sitesUnchecked"].sort(),
    );
    expect(fin).toMatchObject({ days: 6, placesToVerify: LIEUX_FIXTURE.length, unverifiedForCap: 0, modelCalls: 1 });
  });

  it("p0: trajets entre lieux vérifiés seulement (critère A8) : aucun trajet vers ni depuis une étape sans placeId, chaque jour relié à son logement", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const { contenu } = programmeEcrit();
    const paires = pairesDuProgramme(contenu as never);
    for (const liste of paires.jours.values()) for (const paire of liste) expect(paire).not.toBeNull();
    // Chaque segment écrit précède une étape avec placeId ou le retour au logement.
    for (const jour of joursEcrits()) {
      jour.items.forEach((item, rang) => {
        if (item.type !== "segment") return;
        const suivant = jour.items[rang + 1];
        expect(suivant?.type === "terminus" || (suivant?.type === "stop" && typeof suivant.stop?.placeId === "string"), `${jour.date} ${rang}`).toBe(true);
      });
    }
    for (const matrice of capture.matrices) {
      for (const point of [...matrice.origines, ...matrice.destinations]) expect(IDS_GOOGLE).toContain(point);
    }
    expect(capture.matrices.some((m) => m.origines.includes(LOGEMENT))).toBe(true);
  });

  it("coût des modèles écrit avant le programme (étape sans retour possible ensuite)", async () => {
    await etapeProgramme({ runId: RUN_ID });
    expect(d.etat.cout).toBeGreaterThan(0);
    expect(d.etat.statut).toBe("programme_ecrit");
  });

  it("p0: arrivée et départ en terminus, jamais vérifiés", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const [premier] = joursEcrits();
    const dernier = joursEcrits().at(-1);
    expect(premier?.items[0]).toMatchObject({ type: "terminus", role: "start", time: "12:00" });
    expect(dernier?.items.at(-1)).toMatchObject({ type: "terminus", role: "end", time: "16:00" });
    // Seules requêtes Text Search : le logement et les lieux (aucune pour une arrivée ou un départ).
    expect(capture.textSearch.map((r) => r.texte.split(", ")[0])).toEqual(["Vieille ville d'Édimbourg (Old Town)", ...LIEUX_FIXTURE.map((lieu) => lieu.lieu)]);
  });

  it("p0: bons plans en lignes À faire, sans bookingUrl ni sponsored", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const { checklist } = (programmeEcrit().contenu as { trip: { checklist: Record<string, unknown>[] } }).trip;
    expect(checklist).toEqual(
      PROGRAMME_FIXTURE.bonsPlans.map((label, rang) => ({ id: `bon-plan-${rang + 1}`, label, when: { type: "beforeDeparture" }, done: false, sponsored: false })),
    );
  });

  it("programme: une seule requête de modèle par exécution, sans recherche web", async () => {
    await p0Run({ runId: RUN_ID });
    expect(capture.requetes).toHaveLength(1);
    expect(capture.requetes[0]).toMatchObject({ etape: "programme", prompt: { id: "programme" }, modele: "deepseek/deepseek-v4.1-flash", routage: { data_collection: "deny", zdr: true } });
    expect(capture.requetes[0]).not.toHaveProperty("greffonWeb");
  });

  it("workflows: aucune donnée Google dans l'état sérialisé (étendu à etapeProgramme) : entrée et sortie { runId } seules", async () => {
    const sortie = await etapeProgramme({ runId: RUN_ID });
    expect(sortie).toEqual({ runId: RUN_ID });
    const texte = JSON.stringify(sortie);
    for (const valeur of [...IDS_GOOGLE, ...AUTRES_GOOGLE]) expect(texte).not.toContain(valeur);
    expect(JSON.stringify(await p0Run({ runId: RUN_ID }))).toBe(JSON.stringify({ runId: RUN_ID }));
  });
});

describe("programme: ordre écrit, une seule fois avant la vérification (décision 0116 § 1.7)", () => {
  it("programme: ordre écrit unique fixé avant la vérification, debut hors ordre trié, fin avant debut bornée à 23:59, vérification et trajets dans l'ordre écrit", async () => {
    d.programme = {
      jours: [
        {
          date: "2026-11-23",
          creneaux: [
            { debut: "21:00", fin: "01:00", nature: "soiree", lieu: "Pub aux musiciens", pourquoi: "Musique." },
            { debut: "13:00", fin: "14:00", nature: "repas_midi", lieu: "Taverne aux tourtes", pourquoi: "Tourtes." },
            { debut: "15:00", fin: "17:00", nature: "visite", lieu: "Forteresse du rocher", pourquoi: "Château." },
            { debut: "15:00", fin: "16:00", nature: "visite", lieu: "Galerie des portraits", pourquoi: "Portraits." },
          ],
        },
      ],
    };
    await etapeProgramme({ runId: RUN_ID });
    expect(capture.textSearch.slice(1).map((r) => r.texte.split(", ")[0])).toEqual(["Taverne aux tourtes", "Forteresse du rocher", "Galerie des portraits", "Pub aux musiciens"]);
    const etapes = etapesEcrites();
    expect(etapes.map((stop) => [stop.name, stop.start, stop.end])).toEqual([
      ["Taverne aux tourtes", "13:00", "14:00"],
      ["Forteresse du rocher", "15:00", "17:00"],
      ["Galerie des portraits", "15:00", "16:00"],
      ["Pub aux musiciens", "21:00", "23:59"],
    ]);
    // Trajets dans l'ordre écrit : logement, puis chaque étape, puis le logement.
    const ids = ["Taverne aux tourtes", "Forteresse du rocher", "Galerie des portraits", "Pub aux musiciens"].map((nom) => PLACE_ID_DE.get(nom) ?? "");
    const chaine = [LOGEMENT, ...ids, LOGEMENT];
    const paires = pairesDuProgramme(programmeEcrit().contenu as never).jours.get(1) ?? [];
    expect(paires.map((paire) => [paire?.origine, paire?.destination])).toEqual(chaine.slice(1).map((vers, rang) => [chaine[rang], vers]));
  });
});

describe("p0Run, etapeProgramme : temps de trajet conservés (décision 0092 § 4)", () => {
  /** Temps écrits : (clé de la paire, minutes) des `INSERT` de la table des temps, paramètres liés. */
  const tempsEcrits = () =>
    d.requetesSql
      .filter((r) => r.texte === SQL_TRAJET)
      .map((r) => ({ cle: cleTrajet({ mode: r.valeurs?.[1] as never, origine: String(r.valeurs?.[2]), destination: String(r.valeurs?.[3]) }), minutes: r.valeurs?.[4] }));

  it("écrits dans la transaction du programme : seules les paires de pairesDuProgramme, minutes des matrices de l'étape (aucune requête Routes de plus)", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const { contenu } = programmeEcrit();
    const paires = new Set(pairesDistinctes(pairesDuProgramme(contenu as never)).map(cleTrajet));
    const ecrits = tempsEcrits();
    expect(ecrits.length).toBeGreaterThan(0);
    for (const { cle, minutes } of ecrits) {
      expect(paires.has(cle), cle).toBe(true);
      expect(Number.isInteger(minutes) && (minutes as number) >= 0 && (minutes as number) <= 1440).toBe(true);
    }
    expect(new Set(ecrits.map((e) => e.cle)).size).toBe(ecrits.length);
    const routes = creerRoutesSimule(fixtures.routes);
    for (const { cle, minutes } of ecrits) {
      const [mode, origine, destination] = cle.split(":") as [RequeteMatrice["mode"], string, string];
      const reponse = await routes.matrice({ origines: [origine], destinations: [destination], mode });
      expect(minutes, cle).toBe(Math.ceil(Number(reponse.secondes[0]?.[0]) / 60));
      expect(capture.matrices.some((m) => m.mode === mode && m.origines.includes(origine) && m.destinations.includes(destination)), cle).toBe(true);
    }
    const textes = d.requetesSql.map((r) => r.texte);
    const programme = textes.findIndex((t) => t.startsWith("INSERT INTO prototype.programmes"));
    const statut = textes.findIndex((t) => t.startsWith("UPDATE prototype.runs SET status = 'programme_ecrit'"));
    expect(textes.indexOf(SQL_TRAJET)).toBeGreaterThan(programme);
    expect(textes.lastIndexOf(SQL_TRAJET)).toBeLessThan(statut);
  });

  /**
   * Paires de `pairesDuProgramme` qu'aucune matrice de l'exécution ne couvre (0092 § 5). Liste fermée, vide : sur les
   * doubles, toute paire du programme (lignes des journées, trajets depuis et vers les logements) a une durée.
   */
  const PAIRES_NON_COUVERTES: readonly string[] = [];

  it("couverture : toute paire du programme a une durée dans les matrices de l'exécution, logements compris ; seules les paires non couvertes énumérées manquent", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const { contenu } = programmeEcrit();
    const paires = pairesDuProgramme(contenu as never);
    const distinctes = pairesDistinctes(paires);
    expect([...paires.jours.values()].flat().filter((p) => p !== null).length).toBeGreaterThan(0);
    // Aucune proposition au lot 1 (0116 § 5.2) : aucune paire de proposition.
    expect(paires.propositions.size).toBe(0);
    const logements = new Set((contenu as { terminus: { depart: string; arrivee: string }[] }).terminus.flatMap((t) => [t.depart, t.arrivee]));
    expect(distinctes.some((p) => logements.has(p.origine) || logements.has(p.destination))).toBe(true);
    expect(new Set(capture.matrices.map((m) => m.mode)).size).toBe(1);
    const routes = creerRoutesSimule(fixtures.routes);
    const couverte = async (paire: (typeof distinctes)[number]) => {
      for (const matrice of capture.matrices) {
        const a = matrice.origines.indexOf(paire.origine);
        const b = matrice.destinations.indexOf(paire.destination);
        if (matrice.mode !== paire.mode || a < 0 || b < 0) continue;
        const valeur = (await routes.matrice(matrice)).secondes.at(a)?.at(b);
        if (typeof valeur === "number" && Number.isFinite(valeur)) return true;
      }
      return false;
    };
    const nonCouvertes: string[] = [];
    for (const paire of distinctes) if (!(await couverte(paire))) nonCouvertes.push(cleTrajet(paire));
    expect(nonCouvertes.sort()).toEqual([...PAIRES_NON_COUVERTES].sort());
    expect(tempsEcrits().map((e) => e.cle).sort()).toEqual(distinctes.map(cleTrajet).filter((cle) => !nonCouvertes.includes(cle)).sort());
  });

  it("table absente (migration non appliquée) : programme écrit comme avant, aucun temps", async () => {
    d.tablePresente = false;
    await etapeProgramme({ runId: RUN_ID });
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(tempsEcrits()).toEqual([]);
  });

  it("canari : aucun temps conservé dans un prompt, un journal, une trace ni la sortie de l'étape ; seulement dans les paramètres de son INSERT", async () => {
    const sorties: string[] = [];
    const espions = (["log", "info", "warn", "error", "debug", "trace"] as const).map((methode) =>
      vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => {
        sorties.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      }),
    );
    try {
      expect(await etapeProgramme({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    } finally {
      for (const espion of espions) espion.mockRestore();
    }
    const ecrits = tempsEcrits();
    expect(ecrits.length).toBeGreaterThan(0);
    for (const texte of [JSON.stringify(capture.requetes), ...sorties]) {
      for (const { cle, minutes } of ecrits) {
        expect(texte).not.toContain(cle);
        expect(texte).not.toContain(`${cle}=${String(minutes)}`);
      }
      expect(texte).not.toMatch(/"(minutes|travelMinutes|trajets)"\s*:/);
    }
    for (const requete of d.requetesSql.filter((r) => r.texte !== SQL_TRAJET)) {
      for (const { cle } of ecrits) expect(JSON.stringify(requete.valeurs ?? [])).not.toContain(cle);
    }
    expect(clesDe(programmeEcrit().contenu).has("minutes")).toBe(false);
  });
});

describe("p0Run, etapeProgramme : plafonds et arrêts", () => {
  it("garde d'idempotence (mineur 6 de la PR 348) : étape rejouée après expiration (phase recherche ou ancrage déjà écrite), arrêt avant toute composition et tout appel", async () => {
    for (const phase of ["recherche", "ancrage"]) {
      reinitialiser();
      d.etat.phase = phase;
      expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
      expect(d.composerP0Reel).not.toHaveBeenCalled();
      expect(capture.ordre).toEqual([]);
      expect(d.requetesSql).toEqual([]);
      vi.clearAllMocks();
    }
  });

  it("écriture refusée par la base (verrou S8) : aucune position ni programme, l'erreur est réduite à son code, coût déjà écrit", async () => {
    d.echecEcritureProgramme = true;
    const erreur = await refus(etapeProgramme({ runId: RUN_ID }));
    expect(erreur.message).toBe("pipeline_failed");
    expect(String(erreur.stack)).not.toContain("permission denied");
    expect(d.requetesSql.some((r) => r.texte.startsWith("INSERT INTO prototype.programmes"))).toBe(false);
    expect(d.requetesSql.map((r) => r.texte).at(-1)).toBe("ROLLBACK");
    expect(d.etat.statut).toBe("en_cours");
    expect(d.etat.cout).toBeGreaterThan(0);
  });

  it("erreur d'un fournisseur pendant les fiches : code seul, sans message ni identifiant ; coût écrit ; p0Run clôt l'exécution", async () => {
    let appels = 0;
    retouches.details = async (placeId, fiche) => {
      appels += 1;
      if (appels > 3) throw Object.assign(new Error(`${SENTINELLE_ERREUR} ${placeId}`), { code: "upstream_unavailable" });
      return fiche();
    };
    const erreur = await refus(etapeProgramme({ runId: RUN_ID }));
    expect(erreur.message).toBe("upstream_unavailable");
    for (const texte of [erreur.message, String(erreur.stack), JSON.stringify(erreur)]) {
      expect(texte).not.toContain(SENTINELLE_ERREUR);
      for (const placeId of IDS_GOOGLE) expect(texte).not.toContain(placeId);
    }
    expect(d.etat.cout).toBeGreaterThan(0);
    expect(d.requetesSql).toEqual([]);
    reinitialiser();
    let encore = 0;
    retouches.details = async (_placeId, fiche) => {
      encore += 1;
      if (encore > 3) throw Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_unavailable" });
      return fiche();
    };
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.etat.clos).toBe("upstream_unavailable");
  });

  it("essai d'intégration sur un brief de six jours (plafonds de 0073, ceux du mode réel) : p0Run va jusqu'au programme", async () => {
    d.etat.mode = "essai";
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.etat.clos).toBeUndefined();
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(d.ecrituresPhase).toEqual(["recherche", "ancrage"]);
  });

  it("p0: vérification bornée par les plafonds, programme entier écrit (Routes à 3 requêtes et 20 éléments : trajets restants sans durée, jamais un arrêt)", async () => {
    d.etat.mode = "essai";
    d.essai = { ...ESSAI, routesRequetes: 3, routesElements: 20 };
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(capture.matrices.length).toBeLessThanOrEqual(3);
    expect(capture.matrices.reduce((somme, m) => somme + m.origines.length * m.destinations.length, 0)).toBeLessThanOrEqual(20);
    const nombreEtapes = PROGRAMME_FIXTURE.jours.reduce((total, jour) => total + jour.creneaux.filter((c) => c.lieu !== undefined && c.nature !== "arrivee" && c.nature !== "depart").length, 0);
    expect(etapesEcrites()).toHaveLength(nombreEtapes);
    const ecrits = d.requetesSql.filter((r) => r.texte === SQL_TRAJET).length;
    expect(ecrits).toBeLessThan(pairesDistinctes(pairesDuProgramme(programmeEcrit().contenu as never)).length);
  });

  it("p0: part de fiches épuisée : lieux restants sans placeId, programme entier écrit, unverifiedForCap inchangé", async () => {
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    // 6 fiches : une pour le logement, cinq pour les lieux ; la boucle s'arrête avant la sixième.
    d.modeReel = { ...MODE_REEL, placesDetails: 6 };
    await etapeProgramme({ runId: RUN_ID });
    expect(capture.details).toHaveLength(6);
    expect(d.etat.statut).toBe("programme_ecrit");
    const avecPlaceId = etapesEcrites().filter((stop) => stop.placeId !== undefined).length;
    expect(avecPlaceId).toBeGreaterThan(0);
    expect(avecPlaceId).toBeLessThan(etapesEcrites().length);
    const fin = journal.mock.calls.map((appel) => JSON.parse(String(appel[0])) as Record<string, unknown>).find((ligne) => ligne.event === "p0.programme_written");
    journal.mockRestore();
    expect(fin).toMatchObject({ level: "info", unverifiedForCap: 0 });
  });

  it("p0: unverifiedForCap compte seulement les lieux non envoyés faute de part Text Search", async () => {
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    // Essai (12 candidats visés, plafond minimal 17 par le contrôle croisé de 0102 § 5) : 18 requêtes, une pour le
    // logement, dix-sept lieux ; les autres ne partent pas et sont comptés.
    d.etat.mode = "essai";
    d.essai = { ...ESSAI, placesTextSearch: 18 };
    await etapeProgramme({ runId: RUN_ID });
    expect(capture.textSearch).toHaveLength(18);
    expect(LIEUX_FIXTURE.length).toBeGreaterThan(17);
    expect(d.etat.statut).toBe("programme_ecrit");
    const fin = journal.mock.calls.map((appel) => JSON.parse(String(appel[0])) as Record<string, unknown>).find((ligne) => ligne.event === "p0.programme_written");
    journal.mockRestore();
    expect(fin).toMatchObject({ level: "info", placesToVerify: LIEUX_FIXTURE.length, unverifiedForCap: LIEUX_FIXTURE.length - 17 });
    // Les lieux non envoyés sont écrits sans placeId ; les dix-sept premiers de l'ordre écrit ont été cherchés.
    expect(capture.textSearch.slice(1).map((r) => r.texte.split(", ")[0])).toEqual(LIEUX_FIXTURE.slice(0, 17).map((lieu) => lieu.lieu));
  });

  it("journal: compteurs indépendants de l'ancrage", async () => {
    // Même sortie de l'IA, horloge fixe, même part Text Search (essai, 18 requêtes : un logement, dix-sept lieux) ;
    // seul change ce que rend Google : tous les lieux trouvés (fiches lues, la part de fiches peut couper d'abord), puis
    // aucun (aucune fiche). La ligne `p0.programme_written` est identique champ par champ (0117 § 4, revue 1 point 3).
    vi.useFakeTimers({ toFake: ["Date"] });
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const ligneFinale = () => journal.mock.calls.map((appel) => JSON.parse(String(appel[0])) as Record<string, unknown>).find((ligne) => ligne.event === "p0.programme_written");
    const executer = async (aucunTrouve: boolean) => {
      reinitialiser();
      journal.mockClear();
      vi.setSystemTime(Date.parse("2026-10-15T10:00:00Z"));
      d.etat.mode = "essai";
      d.essai = { ...ESSAI, placesTextSearch: 18, placesDetails: 4 };
      let rang = 0;
      // Première requête : le logement (toujours trouvé) ; ensuite, les lieux de l'IA.
      if (aucunTrouve) retouches.textSearch = async (_requete, reponse) => (rang++ === 0 ? reponse() : { placeIds: [] });
      await etapeProgramme({ runId: RUN_ID });
      expect(d.etat.statut).toBe("programme_ecrit");
      return { ligne: ligneFinale(), fiches: capture.details.length, avecPlaceId: etapesEcrites().filter((stop) => stop.placeId !== undefined).length };
    };
    try {
      const tous = await executer(false);
      const aucun = await executer(true);
      // Les deux exécutions diffèrent bien côté Google.
      expect(tous.avecPlaceId).toBeGreaterThan(0);
      expect(aucun.avecPlaceId).toBe(0);
      expect(tous.fiches).toBeGreaterThan(aucun.fiches);
      expect(tous.ligne).toBeDefined();
      expect(Object.keys(aucun.ligne ?? {}).sort()).toEqual(Object.keys(tous.ligne ?? {}).sort());
      for (const [champ, valeur] of Object.entries(tous.ligne ?? {})) expect(aucun.ligne?.[champ], champ).toEqual(valeur);
      // Calculé avant la boucle : lieux − (part Text Search − logements).
      expect(tous.ligne).toMatchObject({ placesToVerify: LIEUX_FIXTURE.length, unverifiedForCap: Math.max(0, LIEUX_FIXTURE.length - 17) });
    } finally {
      journal.mockRestore();
      vi.useRealTimers();
    }
  });

  it("p0: programmeTimeBudgetHit absent du journal tant que la liste fermée ne l'admet pas", async () => {
    // Échéance qui coupe la vérification (même scénario que « échéance proche ») : l'indicateur n'est jamais écrit
    // (0117 § 4 ; revue 1, Q9 : gardé pour plus tard, il relève de la Sécurité).
    vi.useFakeTimers({ toFake: ["Date"] });
    const sorties: string[] = [];
    const journal = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void sorties.push(args.map(String).join(" ")));
    try {
      vi.setSystemTime(Date.parse("2026-10-15T10:00:00Z"));
      latences = { modele: 600_000, places: 15_000, routes: 2_000 };
      await etapeProgramme({ runId: RUN_ID });
      expect(etapesEcrites().some((stop) => stop.placeId === undefined)).toBe(true);
    } finally {
      journal.mockRestore();
      vi.useRealTimers();
    }
    expect(sorties.length).toBeGreaterThan(0);
    for (const ligne of sorties) expect(ligne).not.toMatch(/programmeTimeBudgetHit|TimeBudget/i);
    const fin = sorties.map((ligne) => JSON.parse(ligne) as Record<string, unknown>).find((ligne) => ligne.event === "p0.programme_written");
    expect(fin).toBeDefined();
    expect(fin).not.toHaveProperty("programmeTimeBudgetHit");
  });

  it("vérification: requête des seuls lieu et ville, zone restreinte, aucun autre champ de l'IA", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const [logement, ...lieux] = capture.textSearch;
    expect(logement).toBeDefined();
    // Zone : rectangle autour du logement (0117 § 2), le même pour chaque lieu ; jamais de biais avec la restriction.
    const positionLogement = programmeEcrit().positions.get(LOGEMENT);
    expect(positionLogement).toBeDefined();
    const zone = zoneDuSejour([{ lat: positionLogement![0], lng: positionLogement![1] }], RAYON_BIAIS_METRES);
    expect(lieux).toHaveLength(LIEUX_FIXTURE.length);
    lieux.forEach((requete, rang) => {
      const lieu = LIEUX_FIXTURE.at(rang)!;
      expect(Object.keys(requete).sort()).toEqual(["biais", "restriction", "texte"]);
      expect(requete.biais).toBeNull();
      expect(requete.restriction).toEqual(zone);
      // Texte : « <lieu>, <ville> » (ou la destination du brief), rien d'autre.
      expect(requete.texte).toBe(`${lieu.lieu}, ${lieu.ville ?? "Édimbourg"}`);
    });
    // Aucun autre champ de la sortie de l'IA dans une requête : quartier, pourquoi, conseil, prix, horaires, titres, bons plans.
    const programme = fixtures.modeles.programme as { titre: string; jours: { titre?: string; creneaux: Record<string, unknown>[] }[]; bonsPlans?: unknown[] };
    const autres = new Set<string>([programme.titre, ...JSON.stringify(programme.bonsPlans ?? []).match(/"[^"]{8,}"/g)?.map((t) => t.slice(1, -1)) ?? []]);
    for (const jour of programme.jours) {
      if (jour.titre !== undefined) autres.add(jour.titre);
      for (const creneau of jour.creneaux) {
        for (const champ of ["quartier", "pourquoi", "conseil", "prix", "horaires", "alternative"]) {
          const valeur = creneau[champ];
          if (typeof valeur === "string" && valeur.length > 0) autres.add(valeur);
        }
      }
    }
    expect(autres.size).toBeGreaterThan(3);
    for (const requete of lieux) {
      const [nom] = requete.texte.split(", ");
      for (const texte of autres) if (texte !== nom && texte !== "Édimbourg") expect(requete.texte, texte).not.toContain(texte);
    }
  });

  it("p0: unverifiedForCap calculé avant la boucle : max(0, lieux − (part Text Search − logements))", () => {
    expect(lieuxHorsPartTextSearch(20, 18, 1)).toBe(3);
    expect(lieuxHorsPartTextSearch(10, 18, 1)).toBe(0);
    expect(lieuxHorsPartTextSearch(5, 2, 3)).toBe(5);
    expect(lieuxHorsPartTextSearch(0, 0, 0)).toBe(0);
  });

  it("p0: un appel d'ancrage par lieu, part et échéance contrôlées avant chaque appel", async () => {
    d.etat.mode = "essai";
    d.essai = { ...ESSAI, placesTextSearch: 17 };
    await etapeProgramme({ runId: RUN_ID });
    // Le registre n'a jamais eu à refuser : aucun appel au-delà de la part (le contrôle précède chaque appel).
    expect(capture.textSearch).toHaveLength(17);
    for (const requete of capture.textSearch.slice(1)) expect(requete.texte.split(", ")).toHaveLength(2);
    expect(d.etat.statut).toBe("programme_ecrit");
  });

  it("lancement : plafond de recherche nul (placesTextSearch − 2 × logements ≤ 0), briefTientDansLeMode refuse le brief (contrôle du lancement inchangé au lot 1)", async () => {
    d.modeReel = { ...MODE_REEL, placesTextSearch: 6 };
    const brut = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/edimbourg-1.json"), "utf8")) as Record<string, unknown>;
    const logements = [1, 2, 2].map((nuits, rang) => ({ texte: `Logement ${rang + 1}`, nuits }));
    vi.resetModules();
    vi.doMock("../../../prototype/briefs/edimbourg-1.json", () => ({ default: { ...brut, logements } }));
    const recherche = lireConfig("recherche.json");
    vi.doMock("../../../prototype/config/recherche.json", () => ({ default: { ...recherche, ciblesParCreneau: { activity: 1, meal: 1, evening: 1 }, totalCandidats: 1 } }));
    try {
      const p0 = await import("@/workflows/p0-run");
      expect(p0.briefTientDansLeMode("reel", "edimbourg-1.json")).toBe(false);
    } finally {
      vi.doUnmock("../../../prototype/briefs/edimbourg-1.json");
      vi.doUnmock("../../../prototype/config/recherche.json");
      vi.resetModules();
    }
  });

  it("configuration des modèles invalide (zdr absent, 0116 § 2.2) : config_invalid avant toute composition", async () => {
    d.modeles = { ...MODELES, routage: { data_collection: "deny" } };
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("config_invalid");
    expect(d.composerP0Reel).not.toHaveBeenCalled();
    expect(capture.ordre).toEqual([]);
  });
});

describe("p0Run, échéance de l'étape (0075, décision 0102 § 6 ; 0116 § 3.5) et garde d'ancienneté", () => {
  const T0 = Date.parse("2026-10-15T10:00:00Z");
  const demande = (methode: AppelFacture["methode"]): DemandeReservation =>
    demandeDe(
      { nature: "execution", executionId: RUN_ID, periodes: { jour: { du: 0, au: Number.MAX_SAFE_INTEGER }, mois: { du: 0, au: Number.MAX_SAFE_INTEGER } } },
      { fournisseur: methode === "chat" ? "modeles" : "google", methode, sku: "sku-test", unites: { requetes: 1, elements: methode === "routes_matrix" ? 1 : 0 }, coutEstimeMicros: 1 },
      derniere?.plafonds ?? [],
    );

  /** Registre de l'étape ouverte à `T0` (la famille est refusée juste après, sans appel). */
  async function registreOuvert(): Promise<PortConsommation> {
    d.composerP0Reel.mockImplementation((garde: unknown, options: OptionsSimulees) => {
      compositionSimulee(garde, options);
      return {
        programme: () => {
          throw Object.assign(new Error("arrêt du test"), { code: "upstream_unavailable" });
        },
      };
    });
    vi.setSystemTime(T0);
    await etapeProgramme({ runId: RUN_ID }).catch(() => undefined);
    const usage = derniere?.usage;
    if (usage === undefined) throw new Error("registre non reçu");
    return usage;
  }

  it("échéance (0075, 0102 § 6) : la limite de fonction (800 s) moins la marge (30 s), sans durée d'exécution ni part d'autres étapes ; un appel dont le délai complet ne tient pas est refusé cap_reached", async () => {
    expect(LIMITE_FONCTION_MS).toBe(800_000);
    expect(MARGE_FIN_ETAPE_MS).toBe(30_000);
    expect("RESERVE_ETAPES_SUIVANTES_MS" in (await import("@/workflows/p0-run"))).toBe(false);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const usage = await registreOuvert();
      // Étape ouverte à T0 : échéance à T0 + 770 s. Places : 10 s de requête + 2 × 2 s de port.
      vi.setSystemTime(T0 + 756_000);
      expect((await usage.reserve(demande("places_details"))).ok).toBe(true);
      vi.setSystemTime(T0 + 756_001);
      expect(await usage.reserve(demande("places_details"))).toEqual({ ok: false, code: "cap_reached" });
      expect(await usage.reserve(demande("places_text_search"))).toEqual({ ok: false, code: "cap_reached" });
      expect((await usage.reserve(demande("routes_matrix"))).ok).not.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("programme: délai de la requête programme à 300 s dans l'échéance de l'étape (300 s + 2 × 2 s de port ; 770 s)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const usage = await registreOuvert();
      vi.setSystemTime(T0 + 466_000);
      expect((await usage.reserve(demande("chat"))).ok).toBe(true);
      vi.setSystemTime(T0 + 466_001);
      expect(await usage.reserve(demande("chat"))).toEqual({ ok: false, code: "cap_reached" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("une exécution plus vieille que DUREE_MAX_EXECUTION_MS (3 × 800 s = 40 min, valeur en attente de Samuel) est refusée par la garde, avant toute composition et tout appel", async () => {
    expect(DUREE_MAX_EXECUTION_MS).toBe(3 * LIMITE_FONCTION_MS);
    expect(DUREE_MAX_EXECUTION_MS).toBe(2_400_000);
    d.etat.ageMs = DUREE_MAX_EXECUTION_MS;
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("real_mode_unavailable");
    expect(d.composerP0Reel).not.toHaveBeenCalled();
    expect(capture.ordre).toEqual([]);
  });

  it("échéance déjà passée à la première réservation : aucun appel ne part ; code persisté pipeline_failed (après composition, S4)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    d.etat.avanceALaLectureMs = LIMITE_FONCTION_MS - MARGE_FIN_ETAPE_MS + 1;
    vi.setSystemTime(T0);
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
      expect(capture.ordre).toEqual([]);
      const ligne = journal.mock.calls.map((appel) => String(appel[0])).find((texte) => texte.includes("p0.programme_written"));
      expect(JSON.parse(String(ligne))).toMatchObject({ level: "warn", days: 0, modelCalls: 1 });
    } finally {
      journal.mockRestore();
      vi.useRealTimers();
    }
  });

  it("p0: échéance proche, réserve de trajets tenue, lieux restants sans placeId et programme entier écrit, unverifiedForCap inchangé", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      vi.setSystemTime(T0);
      // Rédaction de 600 s, puis 15 s par appel Places : la vérification s'arrête avant d'entamer la réserve de trajets.
      latences = { modele: 600_000, places: 15_000, routes: 2_000 };
      expect(await etapeProgramme({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
      expect(d.etat.statut).toBe("programme_ecrit");
      expect(capture.textSearch.length - 1).toBeLessThan(LIEUX_FIXTURE.length);
      // Les trajets ont eu leur temps : au moins une matrice, aucune refusée par l'échéance.
      expect(capture.matrices.length).toBeGreaterThan(0);
      const fin = journal.mock.calls.map((appel) => JSON.parse(String(appel[0])) as Record<string, unknown>).find((ligne) => ligne.event === "p0.programme_written");
      expect(fin).toMatchObject({ level: "info", unverifiedForCap: 0 });
      expect(etapesEcrites().some((stop) => stop.placeId === undefined)).toBe(true);
      expect(MARGE_VERIFICATION_AGENT_MS).toBe(1_000);
    } finally {
      journal.mockRestore();
      vi.useRealTimers();
    }
  });
});

/**
 * `edimbourg-1.json` (6 jours) de bout en bout sous l'échéance de 0075 (770 s, décision 0102 § 6), avec des latences
 * simulées. L'horloge simulée avance de la latence de chaque appel. Aucun appel réel.
 */
describe("p0Run, edimbourg-1.json sous l'échéance (ticket 407, 0075)", () => {
  const T0 = Date.parse("2026-10-16T16:05:30Z");

  it.each([
    { cas: "typique", latences: { modele: 60_000, places: 500, routes: 1_500 } },
    { cas: "lent", latences: { modele: 180_000, places: 1_000, routes: 3_000 } },
    { cas: "très lent", latences: { modele: 290_000, places: 3_000, routes: 8_000 } },
  ])("latences $cas : programme écrit, l'étape sous son échéance de 770 s", async ({ latences: choisies }) => {
    latences = choisies;
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    try {
      expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
      expect(d.etat.clos).toBeUndefined();
      expect(d.etat.statut).toBe("programme_ecrit");
      expect((Date.now() - T0) / 1000).toBeLessThanOrEqual(770);
      expect(placeIdsDuProgramme(programmeEcrit().contenu as never).size).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
      journal.mockRestore();
    }
  });
});

describe("p0Run, journal p0.step_failed de etape() (ticket 493, décision 0090 § 3 point 8)", () => {
  /** Lignes `p0.step_failed` écrites (niveaux error et warn), lues en JSON. */
  function espionnerJournal() {
    const lignes: Record<string, unknown>[] = [];
    const garder = (ligne: unknown) => {
      const texte = String(ligne);
      if (texte.includes('"p0.step_failed"')) lignes.push(JSON.parse(texte) as Record<string, unknown>);
    };
    espions.push(vi.spyOn(console, "error").mockImplementation(garder), vi.spyOn(console, "log").mockImplementation(garder));
    return lignes;
  }
  const espions: { mockRestore: () => void }[] = [];
  afterEach(() => {
    for (const espion of espions.splice(0)) espion.mockRestore();
  });

  const invalide = () => Object.assign(new Error(SENTINELLE_ERREUR), { name: "ErreurClientGoogle", code: "invalid_response" });

  it.each([
    ["ancrage", "fiches"],
    ["planification", "routes"],
  ] as const)("échec à la phase %s (%s) : phase et code d'origine (invalid_response) journalisés avant la réduction (pipeline_failed)", async (phase, capacite) => {
    if (capacite === "fiches") {
      let appels = 0;
      retouches.details = async (_placeId, fiche) => {
        appels += 1;
        if (appels > 3) throw invalide();
        return fiche();
      };
    } else retouches.routes = { matrice: async () => Promise.reject(invalide()) };
    const lignes = espionnerJournal();
    const erreur = await refus(etapeProgramme({ runId: RUN_ID }));
    expect(erreur.message).toBe("pipeline_failed");
    expect(lignes).toEqual([{ level: "error", event: "p0.step_failed", phase, errorName: "ErreurClientGoogle", failureCode: "invalid_response" }]);
    expect(JSON.stringify(lignes)).not.toContain(SENTINELLE_ERREUR);
    for (const placeId of IDS_GOOGLE) expect(JSON.stringify(lignes)).not.toContain(placeId);
  });

  it("échec à la phase recherche (sortie illisible) : code interne model_output_invalid journalisé ; aucun message", async () => {
    d.programme = { jours: [] };
    const lignes = espionnerJournal();
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    expect(lignes).toEqual([{ level: "error", event: "p0.step_failed", phase: "recherche", errorName: "ArretEtape", failureCode: "pipeline_failed" }]);
  });

  it("échec à la phase ecriture : cette phase journalisée", async () => {
    d.echecEcritureProgramme = true;
    const lignes = espionnerJournal();
    expect((await refus(etapeProgramme({ runId: RUN_ID }))).message).toBe("pipeline_failed");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ level: "error", event: "p0.step_failed", phase: "ecriture" });
    expect(JSON.stringify(lignes)).not.toContain("permission denied");
  });

  it("étape réussie : aucune ligne p0.step_failed", async () => {
    const lignes = espionnerJournal();
    expect(await etapeProgramme({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(lignes).toEqual([]);
  });
});

/** Sites ajoutés à la sortie simulée d'`edimbourg-1` (lot 2a) : adresses fictives, dont des cas refusés. */
const SITES_FIXTURE: Readonly<Record<string, string>> = {
  "Forteresse du rocher": "https://www.forteresse.example.org/visite?utm=ia#billets",
  "Palais au bout de la grande rue": "https://palais.example.org/",
  // Cité deux fois (midi le premier jour, soir le cinquième) : vérifié une fois.
  "Taverne aux tourtes": "https://taverne.example.org/",
  // Forme refusée (http) : champ retiré, compté dans fieldsRemoved.
  "Grande rue pavée de la vieille ville": "http://grande-rue.example.org/",
  // Refusé par la vérification (statut hors 2xx simulé).
  "Colline aux trois belvédères": "https://colline.example.org/",
  // Lieu introuvable par Text Search : son site vérifié est gardé quand même (PPI-PO-10).
  "Comptoir introuvable du double": "https://comptoir.example.org/",
};
const SITES_GARDES = ["https://www.forteresse.example.org/visite", "https://palais.example.org/", "https://taverne.example.org/", "https://comptoir.example.org/"];

function avecSites(): void {
  const programme = d.programme as { jours: { creneaux: { lieu?: string; site?: string }[] }[] };
  for (const jour of programme.jours) for (const creneau of jour.creneaux) if (creneau.lieu !== undefined && creneau.lieu in SITES_FIXTURE) creneau.site = SITES_FIXTURE[creneau.lieu];
  verificateurSites = { barriereFermee: false, verifier: async (adresse) => ({ ok: !adresse.includes("colline") }) };
}

/** Journal capturé : chaque ligne écrite par `console.log`, lue en JSON (gardée après la restauration de l'espion). */
function capturerJournal() {
  const lignes: Record<string, unknown>[] = [];
  const espion = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void lignes.push(JSON.parse(String(args[0])) as Record<string, unknown>));
  return { lignes, espion, mockRestore: () => espion.mockRestore(), mockClear: () => void lignes.splice(0) };
}
const lignesJournal = (journal: { lignes: Record<string, unknown>[] }) => journal.lignes;

describe("p0Run, etapeProgramme : sites de l'activité (lot 2a, spécification § 11 ; 0121 § 2 ; 0122)", () => {
  it("p0: source écrite depuis le site vérifié (adresse réduite de l'IA, libellé sans www., aucun verifiedAt)", async () => {
    avecSites();
    const journal = capturerJournal();
    try {
      await etapeProgramme({ runId: RUN_ID });
    } finally {
      journal.mockRestore();
    }
    expect(d.etat.statut).toBe("programme_ecrit");
    expect([...sitesSoumis].sort()).toEqual([...SITES_GARDES, "https://colline.example.org/"].sort());
    const sources = new Map(etapesEcrites().map((stop) => [String(stop.name), stop.source]));
    expect(sources.get("Forteresse du rocher")).toEqual({ label: "forteresse.example.org", url: "https://www.forteresse.example.org/visite" });
    expect(sources.get("Palais au bout de la grande rue")).toEqual({ label: "palais.example.org", url: "https://palais.example.org/" });
    expect(etapeNommee("Taverne aux tourtes").map((stop) => stop.source)).toEqual([
      { label: "taverne.example.org", url: "https://taverne.example.org/" },
      { label: "taverne.example.org", url: "https://taverne.example.org/" },
    ]);
    expect(sources.get("Grande rue pavée de la vieille ville")).toBeUndefined();
    expect(sources.get("Colline aux trois belvédères")).toBeUndefined();
    const comptoir = etapeNommee("Comptoir introuvable du double")[0]!;
    expect(comptoir.placeId).toBeUndefined();
    expect(comptoir.source).toEqual({ label: "comptoir.example.org", url: "https://comptoir.example.org/" });
    for (const stop of etapesEcrites()) expect(stop).not.toHaveProperty("verifiedAt");
    // Contrôle final (0122 § 2.2 point 4) : le contenu écrit passe le schéma unique du programme écrit, sources comprises.
    const relu = ProgrammeEcritSchema.parse(programmeEcrit().contenu);
    expect(relu.trip.days.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "stop" && ligne.stop.source ? [ligne.stop.source.url] : []))).sort()).toEqual(
      ["https://www.forteresse.example.org/visite", "https://palais.example.org/", "https://taverne.example.org/", "https://taverne.example.org/", "https://comptoir.example.org/"].sort(),
    );
    // Seules les étapes avec un site gardé ont une source ; aucune autre étape n'en reçoit.
    expect(etapesEcrites().filter((stop) => stop.source !== undefined)).toHaveLength(5);
    const fin = lignesJournal(journal).find((ligne) => ligne.event === "p0.programme_written");
    expect(fin).toMatchObject({ sitesProposed: 5, sitesChecked: 5, sitesRemoved: 1, sitesUnchecked: 0 });
  });

  it("journal: compteurs de sites indépendants de l'ancrage (A20, extension du test 0117)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const journal = capturerJournal();
    const executer = async (aucunTrouve: boolean) => {
      reinitialiser();
      avecSites();
      journal.mockClear();
      vi.setSystemTime(Date.parse("2026-10-15T10:00:00Z"));
      let rang = 0;
      if (aucunTrouve) retouches.textSearch = async (_requete, reponse) => (rang++ === 0 ? reponse() : { placeIds: [] });
      await etapeProgramme({ runId: RUN_ID });
      expect(d.etat.statut).toBe("programme_ecrit");
      return {
        ligne: lignesJournal(journal).find((ligne) => ligne.event === "p0.programme_written"),
        soumis: [...sitesSoumis].sort(),
        sources: etapesEcrites().map((stop) => [stop.name, stop.source ?? null]),
        avecPlaceId: etapesEcrites().filter((stop) => stop.placeId !== undefined).length,
      };
    };
    try {
      const tous = await executer(false);
      const aucun = await executer(true);
      expect(tous.avecPlaceId).toBeGreaterThan(0);
      expect(aucun.avecPlaceId).toBe(0);
      // Mêmes requêtes de sites, mêmes source écrites, mêmes compteurs sites* (et relations).
      expect(aucun.soumis).toEqual(tous.soumis);
      expect(aucun.sources).toEqual(tous.sources);
      for (const champ of ["sitesProposed", "sitesChecked", "sitesRemoved", "sitesUnchecked", "fieldsRemoved"]) expect(aucun.ligne?.[champ], champ).toEqual(tous.ligne?.[champ]);
      const c = tous.ligne as Record<string, number>;
      expect(c.sitesProposed).toBe(c.sitesChecked! + c.sitesUnchecked!);
      expect(c.sitesRemoved).toBeLessThanOrEqual(c.sitesChecked!);
    } finally {
      journal.mockRestore();
      vi.useRealTimers();
    }
  });

  it("sites: aucune réponse stockée ni journalisée (programme, journal, état, prompts)", async () => {
    avecSites();
    const SENTINELLE = "SENTINELLE-REPONSE-SITE";
    // Vérificateur fautif qui rendrait statut, en-têtes et adresse de redirection : rien de tout cela ne sort.
    verificateurSites = {
      barriereFermee: false,
      verifier: async () => ({ ok: true, statut: 299, entetes: { server: SENTINELLE }, location: `https://${SENTINELLE}.example.org/` }) as { ok: boolean },
    };
    const sorties: string[] = [];
    const journal = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void sorties.push(args.map(String).join(" ")));
    let etat: unknown;
    try {
      etat = await etapeProgramme({ runId: RUN_ID });
    } finally {
      journal.mockRestore();
    }
    expect(etat).toEqual({ runId: RUN_ID });
    const ecrit = JSON.stringify(d.requetesSql);
    expect(ecrit).not.toContain(SENTINELLE);
    expect(ecrit).not.toMatch(/"(statut|status|entetes|headers|location)"/);
    for (const ligne of sorties) {
      expect(ligne).not.toContain(SENTINELLE);
      expect(ligne).not.toMatch(/example\.org|https?:/);
    }
    // Le prompt est construit avant toute lecture : aucune adresse de site n'y entre.
    for (const requete of capture.requetes) expect(JSON.stringify(requete)).not.toMatch(/example\.org/);
    // L'adresse brute de l'IA (avec paramètres) n'est jamais écrite.
    expect(ecrit).not.toContain("utm=ia");
  });

  it("sites: aucune requête hors mode réel (barrière fermée : rien soumis, tout sitesUnchecked, programme entier écrit)", async () => {
    avecSites();
    verificateurSites = { barriereFermee: true, verifier: async () => ({ ok: true }) };
    const journal = capturerJournal();
    try {
      await etapeProgramme({ runId: RUN_ID });
    } finally {
      journal.mockRestore();
    }
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(sitesSoumis).toEqual([]);
    expect(etapesEcrites().every((stop) => stop.source === undefined)).toBe(true);
    const fin = lignesJournal(journal).find((ligne) => ligne.event === "p0.programme_written");
    expect(fin).toMatchObject({ sitesProposed: 5, sitesChecked: 0, sitesRemoved: 0, sitesUnchecked: 5 });
  });

  // A19 (`specs/P0-programme-par-ia.md` § 11.3 point 5 et A19, amendement 3) ; 0121 § 2.1 : borne des sites
  // `limiteSites = min(début + 60 s, échéance − réserve des trajets)`, calculée une fois au lancement ; une adresse n'est
  // soumise que si `maintenant + 5 s + marge` tient avant elle. Rédaction de 600 s + T ms, logement (Text Search et
  // fiche) à 15 s chacun : la vérification commence à 630 s + T ; échéance 770 s ; réserve de trajets 10 × 10 s (Routes
  // prévues d'edimbourg-1 au mode réel) ; borne = 670 s < 630 s + T + 60 s. À T = 34 000 ms, 664 s + 5 s + 1 s = 670 s
  // tient encore (toutes soumises) ; à T = 34 001 ms, plus rien (toutes `sitesUnchecked`), alors que la borne des 60 s
  // seule les aurait admises. Programme entier écrit dans les deux cas.
  it("p0: échéance proche, vérification des sites raccourcie, programme entier écrit", async () => {
    const T0 = Date.parse("2026-10-15T10:00:00Z");
    const reserve = 10 * DELAI_REQUETE_MS.routes;
    const echeance = LIMITE_FONCTION_MS - MARGE_FIN_ETAPE_MS;
    // Rang exact de l'épreuve : la borne de l'échéance est la plus courte, et la limite tombe sur la dernière milliseconde.
    expect(echeance - reserve).toBeLessThan(630_000 + 34_000 + SITES_DUREE_MAX_MS);
    expect(630_000 + 34_000 + DELAI_SITE_MS + MARGE_SITE_MS).toBe(echeance - reserve);
    const lancer = async (redactionMs: number) => {
      reinitialiser();
      avecSites();
      verificateurSites = { barriereFermee: false, verifier: async () => ({ ok: true }) };
      vi.useFakeTimers({ toFake: ["Date"] });
      const journal = capturerJournal();
      try {
        vi.setSystemTime(T0);
        latences = { modele: redactionMs, places: 15_000, routes: 2_000 };
        expect(await etapeProgramme({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
      } finally {
        journal.mockRestore();
        vi.useRealTimers();
      }
      expect(d.etat.statut).toBe("programme_ecrit");
      return lignesJournal(journal).find((ligne) => ligne.event === "p0.programme_written") as Record<string, number>;
    };

    const tient = await lancer(600_000 + 34_000);
    expect(sitesSoumis).toHaveLength(5);
    expect(tient).toMatchObject({ sitesProposed: 5, sitesChecked: 5, sitesRemoved: 0, sitesUnchecked: 0 });
    expect(etapesEcrites().filter((stop) => stop.source !== undefined).length).toBeGreaterThan(0);

    const raccourcie = await lancer(600_000 + 34_001);
    expect(sitesSoumis).toEqual([]);
    expect(raccourcie).toMatchObject({ sitesProposed: 5, sitesChecked: 0, sitesRemoved: 0, sitesUnchecked: 5 });
    expect(etapesEcrites().every((stop) => stop.source === undefined)).toBe(true);
    expect(etapesEcrites().length).toBeGreaterThan(0);
  });

  it("sites: erreur de la vérification des lieux : vérifications de sites abandonnées et attendues, relations vraies dans la ligne d'échec", async () => {
    avecSites();
    // Les sites attendent l'abandon ; une fiche lève : l'étape abandonne les sites, puis journalise et s'arrête.
    verificateurSites = {
      barriereFermee: false,
      verifier: (_adresse, signal) => new Promise((resolve) => signal?.addEventListener("abort", () => resolve({ ok: true }), { once: true })),
    };
    retouches.details = async () => Promise.reject(Object.assign(new Error(SENTINELLE_ERREUR), { code: "upstream_unavailable" }));
    const journal = capturerJournal();
    try {
      await refus(etapeProgramme({ runId: RUN_ID }));
    } finally {
      journal.mockRestore();
    }
    expect(d.requetesSql.some((r) => r.texte.startsWith("INSERT INTO prototype.programmes"))).toBe(false);
    const fin = lignesJournal(journal).find((ligne) => ligne.event === "p0.programme_written") as Record<string, number> | undefined;
    expect(fin).toBeDefined();
    expect(fin!.sitesProposed).toBe(5);
    expect(fin!.sitesProposed).toBe(fin!.sitesChecked! + fin!.sitesUnchecked!);
    // En cours à l'abandon : vérifiées et refusées, jamais gardées.
    expect(fin!.sitesRemoved).toBe(fin!.sitesChecked);
    expect(JSON.stringify(fin)).not.toContain(SENTINELLE_ERREUR);
  });
});

describe("p0Run sur un brief saisi dans l'app (E2E-essai, lot 3, critère 4 ; décision 0125 § 3)", () => {
  const BRIEF_FICHIER = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/edimbourg-1.json"), "utf8")) as Record<string, unknown>;
  const RECIT = "Récit saisi dans l'app : on aime les ruelles médiévales et les pubs où l'on joue de la musique.";

  beforeEach(() => {
    d.etat.mode = "essai";
    d.etat.brief = "saisi";
    d.briefSaisi = { ...BRIEF_FICHIER, recit: RECIT };
  });

  it("brief lu en base pour cette exécution ; programme écrit sous l'identifiant connu au lancement", async () => {
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(d.briefSaisiLus.length).toBeGreaterThan(0);
    expect(new Set(d.briefSaisiLus)).toEqual(new Set([RUN_ID]));
    expect((programmeEcrit().contenu as { trip: { id: string } }).trip.id).toBe(identifiantVoyageSaisi("Édimbourg", RUN_ID));
  });

  it("requête programme : le récit saisi entre les bornes de données, zdr et data_collection deny (0117 S5, Q557)", async () => {
    await etapeProgramme({ runId: RUN_ID });
    expect(capture.requetes).toHaveLength(1);
    expect(capture.requetes[0]).toMatchObject({ etape: "programme", routage: { data_collection: "deny", zdr: true } });
    const contenu = capture.requetes[0]?.messages.map((message) => message.contenu).join("\n") ?? "";
    expect(contenu).toContain(RECIT);
  });

  it("aucun appel de l'agent de recherche web pour un brief saisi (revue de la PR 704, Sécurité 3) : seule la capacité programme est lue, une requête programme sans greffon web", async () => {
    const lues: string[] = [];
    d.composerP0Reel.mockImplementation((garde: unknown, options: OptionsSimulees) => {
      const composition = compositionSimulee(garde, options);
      return {
        agent: () => {
          lues.push("agent");
          throw new Error("l'agent de recherche web ne doit pas être composé pour un brief saisi");
        },
        ancrage: () => {
          lues.push("ancrage");
          throw new Error("l'ancrage ne doit pas être composé pour un brief saisi");
        },
        etapeFinale: () => {
          lues.push("etapeFinale");
          throw new Error("l'étape finale ne doit pas être composé pour un brief saisi");
        },
        programme: () => (lues.push("programme"), composition.programme()),
      };
    });
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(new Set(lues)).toEqual(new Set(["programme"]));
    expect(capture.requetes.map((requete) => requete.etape)).toEqual(["programme"]);
    // Requête de modèle sans aucun champ de recherche web (ni `plugins` ni greffon) : ses clés sont exactement celles de `RequeteModele`.
    expect(Object.keys(capture.requetes[0] ?? {}).sort()).toEqual(["etape", "messages", "modele", "prompt", "routage"]);
  });

  it("canari : aucune donnée Google dans le prompt avec un brief saisi", async () => {
    await etapeProgramme({ runId: RUN_ID });
    const prompts = JSON.stringify(capture.requetes);
    for (const valeur of [...IDS_GOOGLE, ...AUTRES_GOOGLE]) expect(prompts).not.toContain(valeur);
    expect(capture.details.length).toBeGreaterThan(1);
  });

  it("brief saisi refusé par BriefSchema (e-mail dans le récit) : brief_invalid avant toute composition et tout appel", async () => {
    d.briefSaisi = { ...BRIEF_FICHIER, recit: "Écrivez-moi à personne@example.com pour tout le séjour." };
    await refus(etapeProgramme({ runId: RUN_ID }));
    expect(d.composerP0Reel).not.toHaveBeenCalled();
    expect(capture.requetes).toHaveLength(0);
  });
});

describe("p0Revision : « Pas pour moi » change le programme (E2E-essai, lot 4 ; décision 0126)", () => {
  const BRIEF_FICHIER = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/edimbourg-1.json"), "utf8")) as Record<string, unknown>;
  const TRIP_ID = identifiantVoyageSaisi("Édimbourg", RUN_ID);
  const ECARTEE = "Forteresse du rocher";
  const AIMEE = "Taverne aux tourtes";
  let idEcartee = "";
  let idAimee = "";

  /** Première version écrite par `etapeProgramme` (brief saisi), servie ensuite comme version courante. */
  beforeEach(async () => {
    d.etat.mode = "essai";
    d.etat.brief = "saisi";
    d.briefSaisi = structuredClone(BRIEF_FICHIER);
    await etapeProgramme({ runId: RUN_ID });
    d.versionServie = programmeEcrit().contenu;
    idEcartee = String(etapeNommee(ECARTEE)[0]?.id);
    idAimee = String(etapeNommee(AIMEE)[0]?.id);
    // Nouvelle exécution de révision (même double de base) : table de travail, capture et SQL remis à zéro.
    Object.assign(d.etat, { statut: "en_cours", phase: null, cout: 0, clos: undefined });
    d.requetesSql.length = 0;
    d.ecrituresPhase.length = 0;
    capture = captureVide();
  });

  it("version servie relue ; le lieu « Pas pour moi » est absent de la nouvelle version, écrite sous le même voyage", async () => {
    expect(idEcartee).toMatch(/^j\d+-\d+$/);
    expect(await p0Revision({ runId: RUN_ID, tripId: TRIP_ID, pasPourMoi: [idEcartee], jAime: [idAimee] })).toEqual({ runId: RUN_ID });
    expect(d.etat.clos).toBeUndefined();
    expect(d.etat.statut).toBe("programme_ecrit");
    expect(d.versionsLues).toEqual([TRIP_ID]);
    expect((programmeEcrit().contenu as { trip: { id: string } }).trip.id).toBe(TRIP_ID);
    // La sortie simulée redonne le lieu écarté : le filet du code le retire (critère « absente de la nouvelle version »).
    expect(etapeNommee(ECARTEE)).toHaveLength(0);
    expect(etapeNommee(AIMEE).length).toBeGreaterThan(0);
    expect(capture.textSearch.some((r) => r.texte.startsWith(`${ECARTEE},`))).toBe(false);
  });

  it("une requête revision (zdr, data_collection deny) : textes de l'IA et choix, aucune donnée Google ni verdict (canari)", async () => {
    await etapeRevision({ runId: RUN_ID, tripId: TRIP_ID, pasPourMoi: [idEcartee], jAime: [idAimee] });
    expect(capture.requetes).toHaveLength(1);
    expect(capture.requetes[0]).toMatchObject({ etape: "programme", prompt: { id: "revision", version: 2 }, routage: { data_collection: "deny", zdr: true } });
    const contenu = capture.requetes[0]?.messages.map((message) => message.contenu).join("\n") ?? "";
    expect(contenu).toContain(ECARTEE);
    expect(contenu).toContain(`"pasPourMoi":["${idEcartee}"]`);
    const prompts = JSON.stringify(capture.requetes);
    for (const valeur of [...IDS_GOOGLE, ...AUTRES_GOOGLE]) expect(prompts).not.toContain(valeur);
    for (const cle of ["placeId", "lat", "lng", "minutes", "exceptions", "toConfirm", "toReserve", "source", "locked", "segment", "durationMinutes"]) {
      expect(contenu).not.toContain(`"${cle}"`);
    }
  });

  it("choix mal formés, version d'un autre voyage ou sans étape écartée : brief_invalid avant toute requête", async () => {
    await refus(etapeRevision({ runId: RUN_ID, tripId: TRIP_ID, pasPourMoi: ["ChIJ-SENTINELLE"], jAime: [] }));
    await refus(etapeRevision({ runId: RUN_ID, tripId: TRIP_ID, pasPourMoi: [idEcartee], jAime: [idEcartee] }));
    await refus(etapeRevision({ runId: RUN_ID, tripId: TRIP_ID, pasPourMoi: ["j99-99"], jAime: [] }));
    d.versionServie = null;
    await refus(etapeRevision({ runId: RUN_ID, tripId: TRIP_ID, pasPourMoi: [idEcartee], jAime: [] }));
    expect(capture.requetes).toHaveLength(0);
    expect(d.requetesSql.some((r) => r.texte.startsWith("INSERT INTO prototype.programmes"))).toBe(false);
  });

  it("plafonds Google d'une révision (mineur 9 de la revue de la PR 717) : besoin de la version servie, sous le mode ; la révision tient dedans", async () => {
    const plafonds = plafondsGoogleRevision("essai", d.versionServie, TRIP_ID, 1);
    expect(plafonds).not.toBeNull();
    expect(plafonds!.textSearch).toBeLessThan(90);
    expect(plafonds!.routesElements).toBeLessThan(840);
    expect(plafondsGoogleRevision("essai", d.versionServie, "proto_autre_44444444444444448444444444444444", 1)).toBeNull();
    expect(plafondsGoogleRevision("essai", { trip: { id: TRIP_ID } }, TRIP_ID, 1)).toBeNull();
    d.etat.forfaitGoogle = plafonds!;
    await etapeRevision({ runId: RUN_ID, tripId: TRIP_ID, pasPourMoi: [idEcartee], jAime: [idAimee] });
    expect(d.etat.statut).toBe("programme_ecrit");
    // Plafonds de l'étape : ceux réservés, jamais ceux du mode.
    const lus = derniere?.plafonds ?? [];
    expect(lus.find((p) => p.methode === "places_text_search")?.maxRequetes).toBe(plafonds!.textSearch);
    expect(lus.find((p) => p.methode === "routes_matrix")).toMatchObject({ maxRequetes: plafonds!.routesRequetes, maxElements: plafonds!.routesElements });
    // Toute la version vérifiée sous ces plafonds : aucun lieu laissé sans placeId faute de part.
    expect(capture.textSearch.length).toBeLessThanOrEqual(plafonds!.textSearch);
    const elements = capture.matrices.reduce((somme, m) => somme + m.origines.length * m.destinations.length, 0);
    expect(elements).toBeLessThanOrEqual(plafonds!.routesElements);
    // Mêmes lieux sans placeId que la première version (vérifiée aux plafonds du mode) : ceux que le double ne trouve pas.
    const sansPlaceId = (jours: JourEcrit[]) =>
      jours.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" && item.stop !== undefined && item.stop.placeId === undefined ? [String(item.stop.name)] : []))).sort();
    expect(sansPlaceId(joursEcrits())).toEqual(sansPlaceId((d.versionServie as { trip: { days: JourEcrit[] } }).trip.days).filter((nom) => nom !== ECARTEE));
  });

  it("révision arrêtée : etapeClore, aucune nouvelle version écrite (la précédente reste servie)", async () => {
    d.programme = { jours: [{ date: "2026-11-23", creneaux: [{ debut: "15:00", nature: "visite", lieu: ECARTEE, pourquoi: "Encore." }] }] };
    expect(await p0Revision({ runId: RUN_ID, tripId: TRIP_ID, pasPourMoi: [idEcartee], jAime: [] })).toEqual({ runId: RUN_ID });
    expect(d.etat.statut).toBe("arretee");
    // Code persisté comme une sortie illisible de `programme` (même règle que `etapeProgramme`).
    expect(d.etat.clos).toBe("pipeline_failed");
    expect(d.requetesSql.some((r) => r.texte.startsWith("INSERT INTO prototype.programmes"))).toBe(false);
  });
});
