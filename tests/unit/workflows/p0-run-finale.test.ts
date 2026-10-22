// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

import type { ClientModeles, RequeteModele } from "@/ai/client";
import { creerModelesSimules } from "@/ai/modeles.simule";
import { creerRedigerProgramme } from "@/ai/rediger-programme";
import { lieuxDuProgramme, lireProgramme, ordreEcrit, type ProgrammeIa } from "@/ai/sorties";
import type { PhaseTravail } from "@/contracts/prototype-travail";
import { capacitesAncrage } from "@/grounding/ancrage-zone";
import type { ClientPlaces, ClientRoutes, RequeteMatrice, RequeteTextSearch } from "@/grounding/interfaces";
import { lieuxHorsPartTextSearch, RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import { creerPlacesSimule } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import { zoneDuSejour } from "@/grounding/zone";
import { SQL_TRAJET } from "@/adapters/prototype-ecriture";
import { cleTrajet, pairesDistinctes, pairesDuProgramme, placeIdsDuProgramme } from "@/prototype/programme-reduit";
import { demandeDe, type AppelFacture, type DemandeReservation, type Plafond, type PortConsommation } from "@/server/usage/port";
import { DUREE_MAX_EXECUTION_MS, etapeProgramme, LIMITE_FONCTION_MS, MARGE_FIN_ETAPE_MS, MARGE_VERIFICATION_AGENT_MS, p0Run } from "@/workflows/p0-run";

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
  },
  requetesSql: [] as { texte: string; valeurs: readonly unknown[] | undefined }[],
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
      return { mode: d.etat.mode, brief: d.etat.brief, variante: "B", coutModelesMicros: d.etat.cout, jourQuota: "2026-10-12", numeroDuJour: 2 };
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
      textSearch: capacitesAncrage(places).textSearch,
      places: { details: (placeId: string) => places.details(placeId) },
      detailsLogement: capacitesAncrage(places).detailsLogement,
      routes,
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
  Object.assign(d.etat, { mode: "reel", brief: "edimbourg-1.json", statut: "en_cours", phase: null, cout: 0, clos: undefined, ageMs: 0, avanceALaLectureMs: 0 });
  d.requetesSql.length = 0;
  d.ecrituresPhase.length = 0;
  d.echecEcritureProgramme = false;
  d.tablePresente = true;
  d.sansStatut = false;
  d.composerP0Reel.mockImplementation(compositionSimulee);
  derniere = undefined;
  latences = undefined;
  retouches = {};
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
      ["days", "daysRemoved", "event", "fieldsRemoved", "level", "modelCalls", "placesToVerify", "slots", "slotsRemoved", "textsCut", "unverifiedForCap"].sort(),
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
