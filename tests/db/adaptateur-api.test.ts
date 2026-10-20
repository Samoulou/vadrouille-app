import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import { createMockTripAdapter, mockTripAdapter, MOCK_REQUEST_CONTEXT } from "@/adapters/mock";
import type { AdapterContext, TripAdapter } from "@/adapters/types";
import { TripSnapshotSchema, type Day, type DayMap, type DaySnapshot, type Proposal, type Trip, type TripSnapshot } from "@/contracts";
import { budgetParPersonne, destinationColor, voisins } from "@/domain/calculs";
import { optionsDesRepas, pointAvantProposition } from "@/domain/recomposition";
import type { Plage, SourceRelectures } from "@/domain/relectures";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";
import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID } from "@/mocks/edimbourg";
import {
  creerRelecturesVoyages,
  lieuDeTest,
  tableDesRelectures,
  VOYAGES_SIMULES,
  type TableRelectures,
} from "@/mocks/relectures-voyages";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { SQL_CHAINE, creerLectureVoyages, transactionDeLecture } from "@/server/voyages/lecture";
import { creerWithOrg, executeurSql } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { executerContratTripAdapter } from "../support/trip-adapter-contrat";
import {
  convertirVoyagesSimules,
  DETOUR_DE_TEST,
  ecrireVoyage,
  ecrireVoyagesSimules,
  enregistrementConverti,
  type DonneesVoyage,
} from "../support/voyages-en-base";
import { closeAll, connect, createOrg, type DbClient, type Org } from "./helpers";

/**
 * Lecture des voyages et adaptateur `api` sur la base réelle (spécification B6, critères de B6a ; décision 0086,
 * « Conséquences testables »). Organisations créées par `createOrg` (`vadrouille_auth`, réponse de data point 3) ;
 * lignes écrites par `tests/support/voyages-en-base.ts` sous `vadrouille_app` (droit par `vadrouille_webhook`) ;
 * relectures par le double de `src/mocks/relectures-voyages.ts`. Aucune donnée Google : `placeId` du jeu simulé ou
 * sentinelles `test_place_…`, coordonnées fabriquées.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Org;
let b: Org;
let ctxA: AdapterContext;
let ctxB: AdapterContext;
let idsA: Map<string, string>;
let idsB: Map<string, string>;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });

/**
 * Espion des requêtes de la transaction de lecture : texte SQL de chaque `execute`, chaque paramètre lié rendu `$n`
 * (n : rang de sa valeur parmi les valeurs distinctes de la requête), et les valeurs liées.
 */
function espion() {
  const textes: string[] = [];
  const valeurs: unknown[][] = [];
  const texteSql = (requete: unknown): string => {
    const morceaux: string[] = [];
    const liees: unknown[] = [];
    const visiter = (noeud: unknown) => {
      if (noeud === null || typeof noeud !== "object") return;
      const n = noeud as { queryChunks?: unknown[]; value?: unknown };
      if (Array.isArray(n.queryChunks)) n.queryChunks.forEach(visiter);
      else if ("encoder" in n) {
        if (!liees.includes(n.value)) liees.push(n.value);
        morceaux.push(`$${liees.indexOf(n.value) + 1}`);
      } else if (Array.isArray(n.value) && n.value.every((v) => typeof v === "string")) morceaux.push(...(n.value as string[]));
    };
    visiter(requete);
    valeurs.push(liees);
    return morceaux.join("");
  };
  // `execute` de la transaction (objet propre à la transaction) remplacé, le temps du rappel, par une version qui
  // note chaque requête ; rétabli ensuite (le `commit` de drizzle n'est pas une requête des cas d'usage).
  const espionne: typeof withOrg = (ctx, fn) =>
    withOrg(ctx, async (tx) => {
      const original = tx.execute;
      const execute = original.bind(tx);
      const espion = (requete: Parameters<typeof execute>[0]) => {
        textes.push(texteSql(requete));
        return execute(requete);
      };
      tx.execute = espion as typeof tx.execute;
      try {
        return await fn(tx);
      } finally {
        tx.execute = original;
      }
    });
  return { withOrg: espionne, textes, valeurs };
}

/** Adaptateur `api` sur la base de test, double de relectures et espion de requêtes. */
function banc(options: Parameters<typeof creerRelecturesVoyages>[0] = {}) {
  const relectures = creerRelecturesVoyages(options);
  const requetes = espion();
  return { adapter: createApiTripAdapter({ relectures, withOrg: requetes.withOrg }), relectures, requetes };
}

// --- Petits voyages de test ------------------------------------------------------------------------------

const L1 = "test_place_logement_un";
const L2 = "test_place_logement_deux";
type Item = DaySnapshot["items"][number];
const term = (role: "start" | "end", time: string): Item => ({ type: "terminus", role, time, label: "[Hôtel de test]" });
const seg = (mode: "walk" | "transit" | "car", estimated = false): Item => ({ type: "segment", segment: { mode, estimated } });
const etape = (id: string, start: string, end: string, placeId?: string, exceptions: ("toReserve" | "unconfirmed")[] = []): Item => ({
  type: "stop",
  stop: { id, kind: "activity", ...(placeId === undefined ? {} : { placeId }), name: "[Étape de test]", start, end, facts: { costPerPerson: 10 }, exceptions, locked: false },
});
const jour = (index: number, date: string, items: Item[]): DaySnapshot => ({ index, date, items, events: [], travelBudgetMinutes: 90 });

function voyage(days: DaySnapshot[], partiel: Partial<DonneesVoyage> = {}): DonneesVoyage {
  const start = days[0]?.date ?? "2027-05-01";
  // Une nuit au moins : un voyage sans nuit n'a aucun logement, et ses terminus ne se résolvent pas.
  const derniere = days.at(-1)?.date ?? start;
  const end = derniere > start ? derniere : new Date(Date.parse(`${start}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return {
    destination: "Testville",
    start,
    end,
    timeZone: "Europe/Zurich",
    travellers: { adults: 2, children: 0 },
    versions: [{ snapshot: TripSnapshotSchema.parse({ days }) }],
    stays: [{ kind: "lodging", placeId: L1, label: "[Hôtel de test]", from: start, to: end }],
    checklist: [],
    runs: [],
    entitlements: [],
    coordonnees: [],
    ...partiel,
  };
}

/** Plages d'un lieu : la même valeur pour toute date. */
class ToutesDates extends Map<string, readonly Plage[] | "inconnu"> {
  constructor(private readonly valeur: readonly Plage[] | "inconnu") {
    super();
  }

  override get(): readonly Plage[] | "inconnu" {
    return this.valeur;
  }
}

/** Table de double : plages connues pour `lieux` (aucune pour `inconnus`), durées données. */
function table(durees: Record<string, number>, lieux: string[], inconnus: string[] = []): TableRelectures {
  const plages = new Map<string, Map<string, readonly Plage[] | "inconnu">>();
  const toutes = (valeur: readonly Plage[] | "inconnu") => new ToutesDates(valeur);
  for (const lieu of lieux) plages.set(lieu, toutes([{ debut: 0, fin: 2880 }]));
  for (const lieu of inconnus) plages.set(lieu, toutes("inconnu"));
  return { plages, durees: new Map(Object.entries(durees)), conflits: [], ecartsPropositions: [] };
}

async function ecrire(org: Org, donnees: DonneesVoyage): Promise<string> {
  return ecrireVoyage(app, org, donnees, admin);
}

/** Copie d'un objet sans les champs nommés. */
function sauf<T extends object>(objet: T, cles: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(objet).filter(([cle]) => !cles.includes(cle)));
}

const raison = (reason: string) => expect.objectContaining({ name: "LectureVoyageError", reason, message: reason });

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  // Voyages sans fuseau (`time_zone_missing`) : lignes antérieures à la migration 0012, reproduites par l'administration.
  admin = await connect("admin");
  a = await createOrg(auth);
  b = await createOrg(auth);
  ctxA = contexte(a);
  ctxB = contexte(b);
  idsA = await ecrireVoyagesSimules(app, a);
  // L'autre organisation : le voyage débloqué (droit, exécution en cours, propositions, coordonnées, brief).
  const debloque = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG_DEBLOQUE_TRIP_ID);
  if (debloque === undefined) throw new Error("voyage débloqué absent");
  idsB = new Map([[EDIMBOURG_DEBLOQUE_TRIP_ID, await ecrire(b, debloque.donnees)]]);
});

afterAll(async () => {
  await db.$client.end();
  await closeAll();
});

describe("adaptateur api : suite de contrat et isolation", () => {
  it("adaptateurs: mock et api passent la même suite de contrat", async () => {
    const { adapter } = banc();
    await executerContratTripAdapter({
      adapter,
      ctx: ctxA,
      autreCtx: ctxB,
      voyages: [...idsA.values()],
      inconnu: "00000000-0000-4000-8000-000000000000",
      jourSansPosition: { tripId: idsA.get("mock_trip_lisbonne") ?? "", index: 1 },
    });
  });

  it("isolation: une organisation ne lit ni ne modifie les voyages d'une autre (lecture, par l'adaptateur api et par la RLS seule)", async () => {
    const { adapter } = banc();
    const voyageB = idsB.get(EDIMBOURG_DEBLOQUE_TRIP_ID) ?? "";
    expect(await adapter.getTrip(ctxA, voyageB)).toBeNull();
    expect(await adapter.getDay(ctxA, voyageB, 1)).toBeNull();
    expect(await adapter.listProposals(ctxA, voyageB)).toEqual([]);
    expect(await adapter.listPreviewSlots(ctxA, voyageB)).toEqual([]);
    expect(await adapter.getDayMap(ctxA, voyageB, 1)).toBeNull();
    expect(await adapter.getTripMap(ctxA, voyageB)).toEqual([]);
    expect((await adapter.listTrips(ctxA)).map((t) => t.id)).not.toContain(voyageB);
    // RLS seule : requêtes sans filtre `organization_id`, écrites ici, sous `withOrg` avec le contexte de A.
    const tables = ["trips", "trip_versions", "checklist_items", "proposals", "generation_runs", "stays", "entitlements", "briefs", "place_coordinates"];
    const vues = await withOrg(ctxA, async (tx) => {
      const executeur = executeurSql(tx);
      const lignes: Record<string, { org: unknown }[]> = {};
      for (const nom of tables) lignes[nom] = (await executeur.query(`SELECT organization_id AS org FROM public.${nom}`)).rows as { org: unknown }[];
      return lignes;
    });
    const vuesDeB = await withOrg(ctxB, async (tx) => {
      const executeur = executeurSql(tx);
      const lignes: Record<string, number> = {};
      for (const nom of tables) lignes[nom] = (await executeur.query(`SELECT organization_id FROM public.${nom}`)).rows.length;
      return lignes;
    });
    for (const nom of tables) {
      expect(vuesDeB[nom], `${nom} : l'organisation B a des lignes`).toBeGreaterThan(0);
      expect(vues[nom]?.length, `${nom} : A a des lignes`).toBeGreaterThan(0);
      expect(vues[nom]?.every((l) => l.org === a.org), nom).toBe(true);
    }
  });

  it("lecture: une transaction de lecture n'écrit pas (SQLSTATE 25006, après set_config)", async () => {
    const erreur = await transactionDeLecture(withOrg, ctxA, async (executeur) => {
      const contexteLu = (await executeur.query("SELECT app_current_org() AS org")).rows[0]?.org;
      expect(contexteLu).toBe(a.org);
      await executeur.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, gen_random_uuid(), 'X', '2027-01-01', '2027-01-02', 1, 'Europe/Paris')",
        [a.org, a.owner],
      );
    }).catch((e: unknown) => e);
    const code = (erreur as { code?: string; cause?: { code?: string } }).cause?.code ?? (erreur as { code?: string }).code;
    expect(code).toBe("25006");
  });

  it("aucun paramètre de contournement : chaque requête des cas d'usage porte organization_id, sauf la lecture des positions", async () => {
    const { adapter, requetes } = banc();
    const tripId = idsA.get(EDIMBOURG_TRIP_ID) ?? "";
    await adapter.listTrips(ctxA);
    await adapter.getTrip(ctxA, tripId);
    await adapter.listProposals(ctxA, tripId);
    await adapter.listPreviewSlots(ctxA, tripId);
    await adapter.getTripMap(ctxA, tripId);
    expect(requetes.textes.length).toBeGreaterThan(0);
    for (const [rang, texte] of requetes.textes.entries()) {
      if (texte === "SET TRANSACTION READ ONLY" || texte.includes("place_coordinates")) continue;
      expect(texte, texte).toContain("organization_id = $1");
      expect(requetes.valeurs[rang]?.[0], texte).toBe(a.org);
    }
  });
});

// --- Recomposition du jeu simulé -----------------------------------------------------------------------

/** Étapes que `mock` rend sans `placeId` (liste fermée de B6a point 7). */
const SANS_LIEU_EDIMBOURG = ["j2-dejeuner", "j2-diner", "j3-excursion-highlands", "j3-diner", "j4-dejeuner", "j4-diner", "j5-dejeuner", "j5-diner", "j6-brunch"];

type Brut = Record<string, unknown>;
const clone = <T>(v: T): T => structuredClone(v);

/** Règle 1 : identifiants et `verifiedAt` retirés ; `placeId` des étapes sans lieu de `mock` retiré (après contrôle de la sentinelle côté api). */
function normaliserStop(stop: Brut, cote: "api" | "mock", sansLieu: ReadonlySet<string>) {
  delete stop.verifiedAt;
  if (sansLieu.has(stop.id as string)) {
    if (cote === "api") expect(stop.placeId).toBe(lieuDeTest(stop.id as string));
    else expect(stop.placeId).toBeUndefined();
    delete stop.placeId;
  }
}

function normaliserJour(day: Day, cote: "api" | "mock", sansLieu: ReadonlySet<string>): Brut {
  const copie = clone(day) as unknown as { items: Brut[]; events: Brut[]; surprise?: Brut };
  for (const item of copie.items) if (item.type === "stop") normaliserStop(item.stop as Brut, cote, sansLieu);
  for (const event of copie.events) normaliserStop(event, cote, sansLieu);
  if (copie.surprise !== undefined) delete copie.surprise.verifiedAt;
  return copie as unknown as Brut;
}

/** Valeur attendue d'un jour de `mock` après les écarts connus (règle 2) et constatés (listés dans la PR). */
function jourAttendu(trip: Trip, day: Day, convertis: TripSnapshot): Day {
  if (trip.id === EDIMBOURG_DEBLOQUE_TRIP_ID && day.index === 6) {
    // Règle 2 (c) : J6 du voyage débloqué servi comme un jour en préparation sans étape.
    return { index: 6, date: day.date, items: [], events: [], generating: true, travelMinutes: 0, travelBudgetMinutes: day.travelBudgetMinutes };
  }
  const attendu = clone(day);
  if (day.index === 5 && (trip.id === EDIMBOURG_TRIP_ID || trip.id === EDIMBOURG_DEBLOQUE_TRIP_ID)) {
    // Règle 2 (a) : les deux segments entre j5-distillerie et j5-diner valent 70 minutes, `estimated` inchangés.
    let apresDistillerie = false;
    for (const item of attendu.items) {
      if (item.type === "stop") apresDistillerie = item.stop.id === "j5-distillerie";
      if (item.type === "segment" && apresDistillerie) item.segment.minutes = 70;
    }
  }
  // Écart constaté (listé dans la PR) : le budget de `mock` est saisi à la main ; la lecture le calcule par
  // `budgetParPersonne` sur les faits stockés (aucun coût sur la plupart des étapes d'Édimbourg).
  const converti = convertis.days.find((d) => d.index === day.index);
  const budget = converti === undefined ? undefined : budgetParPersonne(converti);
  delete attendu.budgetPerPerson;
  if (budget !== undefined) attendu.budgetPerPerson = budget;
  return attendu;
}

describe("lecture: l'adaptateur api recompose le voyage simulé", () => {
  it("les quatre voyages : getTrip, getDay, listTrips, getDayMap, getTripMap égaux à mock hors des écarts fixés", async () => {
    const { adapter } = banc();
    const convertis = convertirVoyagesSimules();
    const resumesApi = await adapter.listTrips(ctxA);
    const resumesMock = await mockTripAdapter.listTrips(MOCK_REQUEST_CONTEXT);
    const sansLieuTrouves: string[] = [];
    for (const { trip: mock, donnees } of convertis) {
      const tripId = idsA.get(mock.id) ?? "";
      const snapshot = TripSnapshotSchema.parse(donnees.versions.at(-1)?.snapshot);
      const sansLieu = new Set(mock.days.flatMap((d) => d.items.flatMap((i) => (i.type === "stop" && i.stop.placeId === undefined ? [i.stop.id] : []))));
      if (mock.id === EDIMBOURG_TRIP_ID) sansLieuTrouves.push(...sansLieu);
      const api = await adapter.getTrip(ctxA, tripId);
      expect(api, mock.id).not.toBeNull();
      if (api === null) continue;
      // Écart constaté (listé dans la PR) : `destinationColor` de `mock` est saisi à la main ; la lecture le calcule.
      expect(api.destinationColor).toBe(destinationColor(mock.destination));
      const { days: joursApi, checklist: listeApi } = api;
      const { days: joursMock, checklist: listeMock } = mock;
      const champs = ["id", "organizationId", "days", "checklist", "destinationColor"] as const;
      expect(sauf(api, champs), mock.id).toEqual(sauf(mock, champs));
      // Liste « À faire » : identifiants retirés ; ordre de lecture par `id` (aucune colonne d'ordre : question à data).
      const sansId = (liste: Trip["checklist"]) => liste.map((item) => sauf(item, ["id"])).sort((x, y) => String(x.label).localeCompare(String(y.label)));
      expect(sansId(listeApi), mock.id).toEqual(sansId(listeMock));
      expect(joursApi.length).toBe(joursMock.length);
      for (const day of joursMock) {
        const attendu = normaliserJour(jourAttendu(mock, day, snapshot), "mock", sansLieu);
        const lu = joursApi.find((d) => d.index === day.index);
        expect(lu, `${mock.id} J${day.index}`).toBeDefined();
        if (lu === undefined) continue;
        expect(normaliserJour(lu, "api", sansLieu), `${mock.id} J${day.index}`).toEqual(attendu);
        expect(await adapter.getDay(ctxA, tripId, day.index), `${mock.id} getDay J${day.index}`).toEqual(lu);
        // Cartes : égales à mock, terminus d'aéroport au logement (règle 2 (b)).
        const carteMock = await mockTripAdapter.getDayMap(MOCK_REQUEST_CONTEXT, mock.id, day.index);
        const carteApi = await adapter.getDayMap(ctxA, tripId, day.index);
        expect(carteApi === null, `${mock.id} carte J${day.index}`).toBe(carteMock === null);
        if (carteMock !== null && carteApi !== null) expect(carteApi).toEqual(carteAttendue(mock, carteMock, tripId));
      }
      const cartesApi = await adapter.getTripMap(ctxA, tripId);
      const cartesMock = await mockTripAdapter.getTripMap(MOCK_REQUEST_CONTEXT, mock.id);
      expect(cartesApi).toEqual(cartesMock.map((c) => carteAttendue(mock, c, tripId)));
      // Résumé.
      const resumeApi = resumesApi.find((r) => r.id === tripId);
      const resumeMock = resumesMock.find((r) => r.id === mock.id);
      expect(resumeApi, mock.id).toBeDefined();
      expect(resumeMock, mock.id).toBeDefined();
      if (resumeApi !== undefined && resumeMock !== undefined) expect(sauf(resumeApi, ["id", "destinationColor"]), mock.id).toEqual(sauf(resumeMock, ["id", "destinationColor"]));
    }
    expect(sansLieuTrouves.sort()).toEqual([...SANS_LIEU_EDIMBOURG].sort());
  });

  it("propositions : champs stockés égaux à mock ; neighbours, option et minutes égaux au calcul sur le jour converti", async () => {
    const { adapter } = banc();
    const tableDouble = tableDesRelectures();
    const ecarts: string[] = [];
    for (const { trip: mock, donnees } of convertirVoyagesSimules()) {
      const tripId = idsA.get(mock.id) ?? "";
      const snapshot = TripSnapshotSchema.parse(donnees.versions.at(-1)?.snapshot);
      const simule = VOYAGES_SIMULES.find((v) => v.trip.id === mock.id);
      const mockProposals = await mockTripAdapter.listProposals(MOCK_REQUEST_CONTEXT, mock.id);
      const mockSlots = await mockTripAdapter.listPreviewSlots(MOCK_REQUEST_CONTEXT, mock.id);
      const apiProposals = await adapter.listProposals(ctxA, tripId);
      const apiSlots = await adapter.listPreviewSlots(ctxA, tripId);
      const nuits = mock.days.length - 1;
      const logement = donnees.stays[0]?.placeId ?? "";
      const comparer = (liste: Proposal[], lus: Proposal[], etiquette: string) => {
        expect(lus.length, etiquette).toBe(liste.length);
        const options = optionsDesRepas(liste.map((p) => enregistrementConverti(p)));
        liste.forEach((p, rang) => {
          const lu = lus[rang];
          if (lu === undefined) return;
          const day = snapshot.days.find((d) => d.index === p.day);
          if (day === undefined) throw new Error("jour absent");
          // Valeurs calculées attendues : moteur sur le jour converti et le double.
          const neighbours = voisins({ items: day.items }, { time: p.time, stopId: p.stop.id }, CONFIGURATION_MOTEUR);
          const option = options[rang];
          let minutes: number | undefined;
          if (p.travelFromPrevious !== undefined) {
            const depuis = pointAvantProposition(day, p.time, p.stop.id, nuits);
            const de = "lieu" in depuis ? depuis.lieu : logement;
            minutes = tableDouble.durees.get(`${de}|${lu.stop.placeId}|${p.travelFromPrevious.mode}`);
          }
          expect(lu.neighbours, `${etiquette} ${p.id}`).toEqual(neighbours);
          expect(lu.option, `${etiquette} ${p.id}`).toEqual(option);
          expect(lu.travelFromPrevious?.minutes, `${etiquette} ${p.id}`).toBe(minutes);
          if (JSON.stringify(neighbours) !== JSON.stringify(p.neighbours)) ecarts.push(`${etiquette} ${p.id} neighbours`);
          if (JSON.stringify(option) !== JSON.stringify(p.option)) ecarts.push(`${etiquette} ${p.id} option`);
          if (minutes !== p.travelFromPrevious?.minutes) ecarts.push(`${etiquette} ${p.id} minutes ${p.travelFromPrevious?.minutes} → ${minutes}`);
          // Champs stockés.
          const stocke = (x: Proposal, cote: "api" | "mock") => {
            const c = clone(x) as unknown as Brut & { stop: Brut; travelFromPrevious?: Brut };
            delete c.neighbours;
            delete c.option;
            if (c.travelFromPrevious !== undefined) delete c.travelFromPrevious.minutes;
            if (p.detour === undefined) {
              if (cote === "api") expect(c.detour).toBe(DETOUR_DE_TEST);
              delete c.detour;
            }
            normaliserStop(c.stop, cote, new Set(p.stop.placeId === undefined ? [p.stop.id] : []));
            return c;
          };
          expect(stocke(lu, "api"), `${etiquette} ${p.id}`).toEqual(stocke(p, "mock"));
        });
      };
      comparer(mockProposals, apiProposals, `${mock.id} deck`);
      const propositionsApercu = (slots: typeof mockSlots) => slots.flatMap((s) => (s.type === "proposal" ? [s.proposal] : []));
      comparer(propositionsApercu(mockSlots), propositionsApercu(apiSlots), `${mock.id} aperçu`);
      expect(apiSlots.map((s) => (s.type === "noOption" ? s : s.type))).toEqual(mockSlots.map((s) => (s.type === "noOption" ? s : s.type)));
      expect(simule).toBeDefined();
    }
    // Écarts au littéral de `mock` (écrit à la main) : listés dans la PR, sans échec.
    console.info(`propositions : écarts au littéral de mock : ${ecarts.length === 0 ? "aucun" : ecarts.join(" ; ")}`);
  });

  it("le même double sert deux copies d'un voyage écrites avec des uuid différents", async () => {
    const c = await createOrg(auth);
    const edimbourg = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG_TRIP_ID);
    if (edimbourg === undefined) throw new Error("absent");
    const premier = await ecrire(c, edimbourg.donnees);
    const second = await ecrire(c, edimbourg.donnees);
    const { adapter } = banc();
    const lire = async (id: string) => {
      const trip = await adapter.getTrip(contexte(c), id);
      if (trip === null) throw new Error("absent");
      return { ...trip, id: "", checklist: trip.checklist.map((item) => sauf(item, ["id"])).sort((x, y) => String(x.label).localeCompare(String(y.label))) };
    };
    expect(premier).not.toBe(second);
    expect(await lire(second)).toEqual(await lire(premier));
  });
});

/** Carte de `mock` attendue sur `api` : identifiant du voyage, terminus d'aéroport au logement (règle 2 (b)). */
function carteAttendue(mock: Trip, carte: DayMap, tripId: string): DayMap {
  const hotel = edimbourgCarte.find((m) => m.dayIndex === 2)?.points.find((p) => p.ref.type === "terminus" && p.ref.role === "start");
  const points = carte.points.map((point) => {
    const aeroport =
      point.ref.type === "terminus" &&
      ((point.ref.role === "start" && carte.dayIndex === 1) || (point.ref.role === "end" && carte.dayIndex === mock.days.length));
    return aeroport && hotel !== undefined ? { ...point, lat: hotel.lat, lng: hotel.lng } : point;
  });
  return { ...carte, tripId, points };
}

// --- Champs calculés, relectures -----------------------------------------------------------------------

describe("lecture: relectures", () => {
  it("lecture: les champs calculés sont recomposés et validés : deux lectures, deux appels ; refus et exception en erreur fermée", async () => {
    const tripId = idsA.get(EDIMBOURG_TRIP_ID) ?? "";
    const { adapter, relectures } = banc();
    await adapter.getDay(ctxA, tripId, 2);
    await adapter.getDay(ctxA, tripId, 2);
    expect(relectures.appels()).toBe(2);
    for (const refus of ["quota_reached", "unavailable"] as const) {
      const { adapter: refuse } = banc({ refus });
      await expect(refuse.getDay(ctxA, tripId, 2)).rejects.toEqual(raison(refus));
      await expect(refuse.getTrip(ctxA, tripId)).rejects.toEqual(raison(refus));
      await expect(refuse.listProposals(ctxA, tripId)).rejects.toEqual(raison(refus));
    }
    // relectures: refus levé par le port : exception lue comme `unavailable`, sans message d'origine.
    const { adapter: leve } = banc({ leve: true });
    await expect(leve.getDay(ctxA, tripId, 2)).rejects.toEqual(raison("unavailable"));
  });

  it("relectures: un appel par lecture ; jamais pour listTrips, getDayMap ni getTripMap", async () => {
    const tripId = idsA.get(EDIMBOURG_TRIP_ID) ?? "";
    const { adapter, relectures } = banc();
    await adapter.getTrip(ctxA, tripId);
    expect(relectures.appels()).toBe(1);
    await adapter.listTrips(ctxA);
    await adapter.getDayMap(ctxA, tripId, 1);
    await adapter.getTripMap(ctxA, tripId);
    expect(relectures.appels()).toBe(1);
  });

  it("relectures: la demande couvre l'assemblage : un double privé d'une seule entrée de la demande fait lever une erreur fermée", async () => {
    const tripId = idsA.get(EDIMBOURG_TRIP_ID) ?? "";
    const { adapter } = banc({ filtrerDemande: (d) => ({ ...d, trajets: d.trajets.slice(1) }) });
    await expect(adapter.getDay(ctxA, tripId, 2)).rejects.toEqual(raison("travel_unknown"));
    // Un lieu retiré de la demande : un lieu non relu n'est plus à confirmer (0100 § 4.2), donc la sortie seule ne trahit
    // plus le défaut ; le double compte les lieux interrogés hors de la demande et le test échoue s'il y en a (0100 § 4.3).
    const { adapter: sansLieu, relectures: doubleSansLieu } = banc({ filtrerDemande: (d) => ({ ...d, lieux: d.lieux.slice(1) }) });
    await sansLieu.getDay(ctxA, tripId, 2);
    expect(doubleSansLieu.lieuxHorsDemande().length).toBeGreaterThan(0);
    const { adapter: complet, relectures: doubleComplet } = banc();
    await complet.getDay(ctxA, tripId, 2);
    await complet.getTrip(ctxA, tripId);
    await complet.listProposals(ctxA, tripId);
    expect(doubleComplet.lieuxHorsDemande()).toEqual([]);
  });

  it("lecture: le contexte et la portée de chaque méthode atteignent la source (0100 § 3.2 point 1)", async () => {
    const tripId = idsA.get(EDIMBOURG_TRIP_ID) ?? "";
    const { adapter, relectures } = banc();
    const attendus = [
      ["getDay", "jour", () => adapter.getDay(ctxA, tripId, 2)],
      ["listProposals", "jour", () => adapter.listProposals(ctxA, tripId)],
      ["listPreviewSlots", "jour", () => adapter.listPreviewSlots(ctxA, tripId)],
      ["getTrip", "voyage", () => adapter.getTrip(ctxA, tripId)],
    ] as const;
    for (const [nom, portee, appeler] of attendus) {
      await appeler();
      const voyage = relectures.dernierVoyage();
      expect(voyage?.portee, nom).toBe(portee);
      expect(voyage?.contexte.tripId, nom).toBe(tripId);
      expect(voyage?.contexte.organizationId, nom).toBe(a.org);
      expect(voyage?.sejoursParNuit.length, nom).toBe(voyage?.logementsParNuit.length);
    }
  });

  it("lecture: Mes voyages ne relit rien, en un nombre constant de requêtes, sans lire place_coordinates ni proposals", async () => {
    const { adapter, relectures, requetes } = banc();
    await adapter.listTrips(ctxA);
    expect(relectures.appels()).toBe(0);
    const nombre = requetes.textes.length;
    expect(requetes.textes.some((t) => t.includes("place_coordinates") || t.includes("proposals"))).toBe(false);
    await ecrire(a, voyage([jour(1, "2027-06-01", [term("start", "09:00"), term("end", "18:00")])], { destination: "Requêtes" }));
    requetes.textes.length = 0;
    await adapter.listTrips(ctxA);
    expect(requetes.textes.length).toBe(nombre);
  });

  it("lecture: les cartes ne relisent rien, ne lisent ni proposals ni checklist_items, en un nombre de requêtes indépendant du nombre de jours", async () => {
    const { adapter, relectures, requetes } = banc();
    await adapter.getTripMap(ctxA, idsA.get(EDIMBOURG_TRIP_ID) ?? "");
    const pourSixJours = requetes.textes.length;
    await adapter.getDayMap(ctxA, idsA.get(EDIMBOURG_TRIP_ID) ?? "", 2);
    expect(relectures.appels()).toBe(0);
    expect(requetes.textes.some((t) => t.includes("proposals") || t.includes("checklist_items"))).toBe(false);
    requetes.textes.length = 0;
    await adapter.getTripMap(ctxA, idsA.get("mock_trip_lisbonne") ?? "");
    expect(requetes.textes.length).toBeLessThanOrEqual(pourSixJours);
    expect(requetes.textes.filter((t) => t.includes("place_coordinates")).length).toBeLessThanOrEqual(1);
  });
});

describe("lecture: champs du voyage", () => {
  it("lecture: Trip.unlocked vient de entitlements seulement", async () => {
    const days = [jour(1, "2027-07-01", [term("start", "09:00"), term("end", "18:00")])];
    const durees = { [`${L1}|${L1}|walk`]: 0 };
    const { adapter } = banc({ table: table(durees, []) });
    const debloque = await ecrire(a, voyage(days, { destination: "Débloqué", entitlements: ["tripUnlocked"] }));
    const apercu = await ecrire(a, voyage(days, { destination: "Aperçu", entitlements: ["preview"] }));
    const aucun = await ecrire(a, voyage(days, { destination: "Aucun" }));
    const resumes = await adapter.listTrips(ctxA);
    for (const [id, attendu] of [[debloque, true], [apercu, false], [aucun, false]] as const) {
      expect((await adapter.getTrip(ctxA, id))?.unlocked).toBe(attendu);
      expect(resumes.find((r) => r.id === id)?.unlocked).toBe(attendu);
    }
  });

  it("lecture: verifiedAt reconstitué depuis la chaîne des versions, en une requête", async () => {
    const lieux = ["test_place_va", "test_place_vb", "test_place_vc", "test_place_vd"];
    const v1 = [jour(1, "2027-08-01", [term("start", "09:00"), seg("walk"), etape("a", "10:00", "11:00", lieux[0]), seg("walk"), etape("b", "12:00", "13:00", lieux[1]), seg("walk"), etape("c", "14:00", "15:00", lieux[2]), seg("walk"), term("end", "18:00")])];
    const deplace = [jour(1, "2027-08-01", [term("start", "09:00"), seg("walk"), etape("a", "10:00", "11:00", lieux[0]), seg("walk"), etape("b", "12:30", "13:30", lieux[1]), seg("walk"), etape("c", "14:00", "15:00", lieux[2]), seg("walk"), term("end", "18:00")])];
    const remplace = [jour(1, "2027-08-01", [term("start", "09:00"), seg("walk"), etape("a", "10:00", "11:00", lieux[0]), seg("walk"), etape("b", "12:30", "13:30", lieux[1]), seg("walk"), etape("d", "14:00", "15:00", lieux[3]), seg("walk"), term("end", "18:00")])];
    const surprise = { id: "s", placeId: "test_place_vs", name: "[Idée]", facts: {}, reason: "[Raison]", source: { label: "[Source]", url: "https://example.org/test" } };
    const avec = (days: DaySnapshot[], idee = surprise) => TripSnapshotSchema.parse({ days: days.map((d) => ({ ...d, surprise: idee })) });
    const tripId = await ecrire(
      a,
      voyage(v1, {
        destination: "Versions",
        // 23:30 UTC le 1er : le 2 dans le fuseau du voyage (Europe/Zurich).
        versions: [
          { snapshot: avec(v1), createdAt: "2026-10-01T23:30:00Z" },
          { snapshot: avec(deplace), createdAt: "2026-10-05T10:00:00Z" },
          { snapshot: avec(remplace, { ...surprise, placeId: "test_place_vs2" }), createdAt: "2026-10-09T10:00:00Z" },
        ],
      }),
    );
    const chaine = [L1, lieux[0], lieux[1], lieux[3], L1];
    const durees: Record<string, number> = Object.fromEntries(chaine.slice(1).map((vers, i) => [`${chaine[i] ?? ""}|${vers ?? ""}|walk`, 5]));
    const { adapter, requetes } = banc({ table: table(durees, [...lieux, "test_place_vs", "test_place_vs2"]) });
    const day = await adapter.getDay(ctxA, tripId, 1);
    const dates = Object.fromEntries((day?.items ?? []).flatMap((i) => (i.type === "stop" ? [[i.stop.id, i.stop.verifiedAt]] : [])));
    expect(dates).toEqual({ a: "2026-10-02", b: "2026-10-05", d: "2026-10-09" });
    expect(day?.surprise?.verifiedAt).toBe("2026-10-09");
    expect(requetes.textes.filter((t) => t.includes("trip_versions")).length).toBe(1);
  });

  it("lecture: verifiedAt en une requête : mesure de la chaîne des parents (3 et 50 versions)", async () => {
    const days = [jour(1, "2027-09-01", [term("start", "09:00"), term("end", "18:00")])];
    const snapshot = TripSnapshotSchema.parse({ days });
    const mesures: string[] = [];
    for (const n of [3, 50]) {
      const tripId = await ecrire(a, voyage(days, { destination: `Chaîne ${n}`, versions: Array.from({ length: n }, () => ({ snapshot })) }));
      const { adapter, requetes } = banc({ table: table({ [`${L1}|${L1}|walk`]: 0 }, []) });
      await adapter.getDay(ctxA, tripId, 1);
      expect(requetes.textes.filter((t) => t.includes("trip_versions")).length).toBe(1);
      const plan = await withOrg(ctxA, async (tx) => {
        const executeur = executeurSql(tx);
        const lignes = (await executeur.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${SQL_CHAINE}`, [a.org, tripId, n])).rows;
        type Noeud = { "Node Type"?: string; "Index Name"?: string; "Relation Name"?: string; Plans?: Noeud[] };
        const json = lignes[0]?.["QUERY PLAN"] as { "Execution Time": number; Plan: Noeud }[];
        const parcours: string[] = [];
        const visiter = (noeud: Noeud | undefined) => {
          if (noeud === undefined) return;
          if (noeud["Relation Name"] === "trip_versions") parcours.push(`${noeud["Node Type"] ?? "?"}${noeud["Index Name"] === undefined ? "" : ` ${noeud["Index Name"]}`}`);
          noeud.Plans?.forEach(visiter);
        };
        visiter(json[0]?.Plan);
        const nombre = (await executeur.query(SQL_CHAINE, [a.org, tripId, n])).rows.length;
        return { duree: json[0]?.["Execution Time"] ?? -1, nombre, parcours };
      });
      expect(plan.nombre).toBe(n);
      mesures.push(`${n} versions : ${plan.nombre} lignes, ${plan.duree.toFixed(3)} ms, trip_versions : ${plan.parcours.join(", ")}`);
    }
    console.info(`verifiedAt : mesure de la chaîne des parents (une requête récursive) : ${mesures.join(" ; ")}`);
  });
});

describe("lecture: logements, trajets, toConfirm, jour en préparation", () => {
  const P = ["test_place_ta", "test_place_tb"];

  it("lecture: terminus rattachés aux logements (borne exclusive de to_date)", async () => {
    const days = [1, 2, 3].map((i) =>
      jour(i, `2027-10-0${i}`, [term("start", "09:00"), seg("walk"), etape(`t${i}`, "10:00", "11:00", P[0]), seg("walk"), term("end", "18:00")]),
    );
    const stays: DonneesVoyage["stays"] = [
      { kind: "lodging", placeId: L1, label: "[Hôtel un]", from: "2027-10-01", to: "2027-10-02" },
      { kind: "lodging", placeId: L2, label: "[Hôtel deux]", from: "2027-10-02", to: "2027-10-03" },
    ];
    const coordonnees = [
      { placeId: L1, lat: 46.1, lng: 6.1 },
      { placeId: L2, lat: 46.2, lng: 6.2 },
      { placeId: P[0] ?? "", lat: 46.3, lng: 6.3 },
    ];
    const tripId = await ecrire(a, voyage(days, { destination: "Logements", stays, coordonnees }));
    const { adapter } = banc();
    const position = (carte: DayMap | null, role: "start" | "end") => carte?.points.find((p) => p.ref.type === "terminus" && p.ref.role === role);
    const j1 = await adapter.getDayMap(ctxA, tripId, 1);
    const j2 = await adapter.getDayMap(ctxA, tripId, 2);
    const j3 = await adapter.getDayMap(ctxA, tripId, 3);
    expect(position(j1, "start")).toMatchObject({ lat: 46.1, lng: 6.1 });
    expect(position(j2, "start")).toMatchObject({ lat: 46.1, lng: 6.1 });
    expect(position(j2, "end")).toMatchObject({ lat: 46.2, lng: 6.2 });
    expect(position(j3, "end")).toMatchObject({ lat: 46.2, lng: 6.2 });

    // Logement sans place_id : aucun point pour son terminus, carte lisible ; trajets du jour en erreur (travel_unknown).
    const sansLieu = await ecrire(a, voyage(days, { destination: "Quartier", coordonnees, stays: [{ ...stays[0]!, kind: "neighbourhood", placeId: null }, stays[1]!] }));
    const carte = await adapter.getDayMap(ctxA, sansLieu, 1);
    expect(position(carte, "start")).toBeUndefined();
    expect(carte?.points.some((p) => p.ref.type === "stop")).toBe(true);
    const durees = { [`${L2}|${P[0]}|walk`]: 5, [`${P[0]}|${L2}|walk`]: 5 };
    await expect(banc({ table: table(durees, P) }).adapter.getDay(ctxA, sansLieu, 1)).rejects.toEqual(raison("travel_unknown"));

    // Nuit sans ligne (ligne qui ne couvre aucune nuit : to_date = from_date), ou deux lignes : stay_missing.
    for (const lignes of [
      [{ ...stays[0]!, to: "2027-10-01" }, stays[1]!],
      [stays[0]!, stays[1]!, { ...stays[1]!, placeId: L1 }],
    ]) {
      const id = await ecrire(a, voyage(days, { destination: "Nuits", stays: lignes }));
      await expect(adapter.getDay(ctxA, id, 2)).rejects.toEqual(raison("stay_missing"));
      await expect(adapter.getDayMap(ctxA, id, 2)).rejects.toEqual(raison("stay_missing"));
      await expect(adapter.getTripMap(ctxA, id)).rejects.toEqual(raison("stay_missing"));
    }
  });

  it("lecture: trajets : mode stocké, points avec lieu, modes admis par la mobilité, estimated stocké", async () => {
    // Segment voisin d'une étape sans placeId : mesuré entre les points avec lieu qui l'encadrent (P0 → P1).
    const items = [term("start", "09:00"), seg("walk"), etape("x", "10:00", "11:00", P[0]), seg("walk", true), etape("sans", "11:30", "12:00"), seg("walk"), etape("y", "13:00", "14:00", P[1]), seg("car"), term("end", "18:00")];
    const days = [jour(1, "2027-11-01", items)];
    const durees = {
      [`${L1}|${P[0]}|walk`]: 10,
      [`${P[0]}|${P[1]}|walk`]: 30,
      [`${P[0]}|${P[1]}|car`]: 8,
      [`${P[1]}|${L1}|car`]: 12,
    };
    const lire = async (mobility: string | null | undefined) => {
      const id = await ecrire(a, voyage(days, { destination: "Trajets", ...(mobility === undefined ? {} : { mobility }) }));
      return banc({ table: table(durees, P) }).adapter.getDay(ctxA, id, 1);
    };
    const sansRestriction = await lire(null);
    const segments = (sansRestriction?.items ?? []).flatMap((i) => (i.type === "segment" ? [i.segment] : []));
    expect(segments).toEqual([
      { mode: "walk", minutes: 10, estimated: false },
      { mode: "walk", minutes: 30, estimated: true },
      { mode: "walk", minutes: 30, estimated: false },
      { mode: "car", minutes: 12, estimated: false },
    ]);
    // Trois modes : la voiture est plus rapide de P0 à P1 (8) ; le retour n'est connu qu'en voiture.
    expect(sansRestriction?.travelMinutes).toBe(10 + 8 + 12);
    expect((await lire(undefined))?.travelMinutes).toBe(30);
    expect((await lire(""))?.travelMinutes).toBe(30);
    // Mobilité `walk,transit` : pas de voiture, le retour (voiture seulement) est inconnu.
    await expect(lire("walk,transit")).rejects.toEqual(raison("travel_unknown"));
    expect((await lire("walk,transit,car"))?.travelMinutes).toBe(30);
    for (const invalide of ["transit,walk", "walk,walk", " walk", "walk,", "walk,plane"]) await expect(lire(invalide), invalide).rejects.toEqual(raison("mobility_invalid"));

    // lecture: estimated stocké ou relu (0100 § 6.1) : `stocké || estimee`. Une durée relue estimée n'est jamais présentée
    // comme mesurée ; un `estimated` stocké vrai reste vrai quand la relecture répond `estimee: false`.
    const id = await ecrire(a, voyage(days, { destination: "Estimé" }));
    const base = table(durees, P);
    const inverse: SourceRelectures = {
      async pour(voyageLu, demande) {
        const reponse = await creerRelecturesVoyages({ table: base }).pour(voyageLu, demande);
        if (!reponse.ok) return reponse;
        const { relectures } = reponse;
        return {
          ok: true,
          relectures: { ...relectures, duree: (d, v, m) => { const r = relectures.duree(d, v, m); return r === "inconnu" ? r : { ...r, estimee: true }; } },
        };
      },
    };
    const day = await createApiTripAdapter({ relectures: inverse, withOrg }).getDay(ctxA, id, 1);
    expect((day?.items ?? []).flatMap((i) => (i.type === "segment" ? [i.segment.estimated] : []))).toEqual([true, true, true, true]);
    const mesuree = await createApiTripAdapter({ relectures: creerRelecturesVoyages({ table: base }), withOrg }).getDay(ctxA, id, 1);
    expect((mesuree?.items ?? []).flatMap((i) => (i.type === "segment" ? [i.segment.estimated] : []))).toEqual([false, true, false, false]);
  });

  it("lecture: toConfirm dans la limite de deux badges", async () => {
    const items = [
      term("start", "09:00"),
      seg("walk"),
      etape("zero", "10:00", "11:00", P[0]),
      seg("walk"),
      etape("une", "11:30", "12:00", P[0], ["toReserve"]),
      seg("walk"),
      etape("deux", "13:00", "14:00", P[0], ["toReserve", "unconfirmed"]),
      seg("walk"),
      term("end", "18:00"),
    ];
    const id = await ecrire(a, voyage([jour(1, "2027-12-01", items)], { destination: "Badges" }));
    const durees = { [`${L1}|${P[0]}|walk`]: 5, [`${P[0]}|${P[0]}|walk`]: 0, [`${P[0]}|${L1}|walk`]: 5 };
    const day = await banc({ table: table(durees, [], [P[0] ?? ""]) }).adapter.getDay(ctxA, id, 1);
    const exceptions = Object.fromEntries((day?.items ?? []).flatMap((i) => (i.type === "stop" ? [[i.stop.id, i.stop.exceptions]] : [])));
    expect(exceptions).toEqual({ zero: ["toConfirm"], une: ["toReserve", "toConfirm"], deux: ["toReserve", "unconfirmed"] });
  });

  it("lecture: jour en préparation (exécution batch non terminée), puis aucun après finished_at", async () => {
    const days = [
      jour(1, "2028-01-01", [term("start", "09:00"), seg("walk"), etape("p", "10:00", "11:00", P[0]), seg("walk"), term("end", "18:00")]),
      jour(2, "2028-01-02", [term("start", "09:00"), term("end", "18:00")]),
    ];
    const coordonnees = [{ placeId: L1, lat: 46.1, lng: 6.1 }, { placeId: P[0] ?? "", lat: 46.3, lng: 6.3 }];
    const id = await ecrire(a, voyage(days, { destination: "Préparation", coordonnees, runs: [{ kind: "batch", finished: false, propositions: [] }] }));
    const durees = { [`${L1}|${P[0]}|walk`]: 5, [`${P[0]}|${L1}|walk`]: 5, [`${L1}|${L1}|walk`]: 0 };
    const { adapter, relectures } = banc({ table: table(durees, P) });
    const j2 = await adapter.getDay(ctxA, id, 2);
    expect(j2).toEqual({ index: 2, date: "2028-01-02", items: days[1]?.items, events: [], generating: true, travelMinutes: 0, travelBudgetMinutes: 90 });
    expect(relectures.appels()).toBe(0);
    expect((await adapter.getDay(ctxA, id, 1))?.generating).toBe(false);
    expect(await adapter.getDayMap(ctxA, id, 2)).toBeNull();
    expect((await adapter.getTripMap(ctxA, id)).map((c) => c.dayIndex)).toEqual([1]);
    await app.query("BEGIN");
    await app.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [a.org, a.owner]);
    await app.query("UPDATE generation_runs SET finished_at = now() WHERE organization_id = $1 AND trip_id = $2", [a.org, id]);
    await app.query("COMMIT");
    const trip = await adapter.getTrip(ctxA, id);
    expect(trip?.days.map((d) => d.generating)).toEqual([false, false]);
  });

  it("lecture: trajet d'une proposition : depuis le dernier point avec lieu avant son heure (logement sinon)", async () => {
    const days = [jour(1, "2028-02-01", [term("start", "09:00"), seg("walk"), etape("m", "10:00", "11:00", P[0]), seg("walk"), term("end", "18:00")])];
    const proposition = (id: string, time: string, avecTrajet: boolean) => ({
      id,
      kind: "activity" as const,
      day: 1,
      time,
      stop: { id: `${id}-etape`, kind: "activity" as const, placeId: P[1], name: "[Proposition]", start: time, end: time, facts: {}, exceptions: [], locked: false },
      category: "museum" as const,
      ...(avecTrajet ? { travelFromPrevious: { mode: "transit" as const, estimated: false } } : {}),
      detour: "[Détour]",
    });
    const lignes = [proposition("avant", "09:30", true), proposition("apres", "12:00", true), proposition("sans", "13:00", false)].map((content, i) => ({
      phase: "deck" as const,
      position: i + 1,
      slotType: "proposal" as const,
      day: 1,
      time: content.time,
      kind: "activity" as const,
      content,
    }));
    const id = await ecrire(a, voyage(days, { destination: "Propositions", runs: [{ kind: "preview", finished: true, propositions: lignes }] }));
    const durees = { [`${L1}|${P[1]}|transit`]: 7, [`${P[0]}|${P[1]}|transit`]: 11 };
    const lues = await banc({ table: table(durees, P) }).adapter.listProposals(ctxA, id);
    expect(lues.map((p) => p.travelFromPrevious?.minutes)).toEqual([7, 11, undefined]);
    expect(lues[2]).not.toHaveProperty("travelFromPrevious");
  });
});

describe("lecture: identifiants, données incohérentes, voyages sans version", () => {
  it("lecture: identifiant inconnu ou mal formé", async () => {
    const { adapter, requetes } = banc();
    for (const id of ["mock_trip_edimbourg", "pas-un-uuid"]) {
      expect(await adapter.getTrip(ctxA, id)).toBeNull();
      expect(await adapter.getDay(ctxA, id, 1)).toBeNull();
      expect(await adapter.listProposals(ctxA, id)).toEqual([]);
      expect(await adapter.listPreviewSlots(ctxA, id)).toEqual([]);
      expect(await adapter.getDayMap(ctxA, id, 1)).toBeNull();
      expect(await adapter.getTripMap(ctxA, id)).toEqual([]);
    }
    expect(requetes.textes).toEqual([]);
    const inconnu = "11111111-1111-4111-8111-111111111111";
    expect(await adapter.getTrip(ctxA, inconnu)).toBeNull();
    expect(await adapter.listProposals(ctxA, inconnu)).toEqual([]);
  });

  it("lecture: une donnée incohérente est une erreur (événement et reason journalisés, sans valeur)", async () => {
    const days = [jour(1, "2028-03-01", [term("start", "09:00"), seg("walk"), etape("e", "10:00", "11:00", P0), seg("walk"), term("end", "18:00")])];
    const durees = { [`${L1}|${P0}|walk`]: 5, [`${P0}|${L1}|walk`]: 5, [`${L1}|${P0}|transit`]: 5 };
    const { adapter } = banc({ table: table(durees, [P0]) });
    const ligne = (content: unknown, day = 1) => ({ phase: "deck" as const, position: 1, slotType: "proposal" as const, day, time: "10:00", kind: "activity" as const, content });
    const record = {
      id: "r",
      kind: "activity",
      day: 1,
      time: "10:00",
      stop: { id: "r-etape", kind: "activity", placeId: P0, name: "[R]", start: "10:00", facts: {}, exceptions: [], locked: false },
      category: "museum",
      detour: "[D]",
    };
    const sansLieu = { ...record, stop: { ...record.stop, placeId: undefined }, travelFromPrevious: { mode: "walk", estimated: false } };
    const cas: [string, DonneesVoyage, (id: string) => Promise<unknown>][] = [
      ["time_zone_missing", voyage(days, { timeZone: null }), (id) => adapter.getTrip(ctxA, id)],
      ["snapshot_invalid", voyage(days, { versions: [{ snapshot: { days: [{ ...days[0], items: [etape("t", "10:00", "11:00", P0, ["toConfirm" as "toReserve"])] }] } }] }), (id) => adapter.getTrip(ctxA, id)],
      ["checklist_orphan", voyage(days, { checklist: [{ label: "[Orpheline]", moment: { type: "beforeDeparture" }, done: false, sponsored: false, stopId: "absente" }] }), (id) => adapter.getTrip(ctxA, id)],
      ["proposal_invalid", voyage(days, { runs: [{ kind: "preview", finished: true, propositions: [ligne({ ...record, category: "inconnue" })] }] }), (id) => adapter.listProposals(ctxA, id)],
      ["proposal_day_missing", voyage(days, { runs: [{ kind: "preview", finished: true, propositions: [ligne({ ...record, day: 4 }, 4)] }] }), (id) => adapter.listProposals(ctxA, id)],
      ["proposal_invalid", voyage(days, { runs: [{ kind: "preview", finished: true, propositions: [ligne(sansLieu)] }] }), (id) => adapter.listProposals(ctxA, id)],
    ];
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const [attendue, donnees, lecture] of cas) {
        const id = await ecrire(a, { ...donnees, destination: `Incohérent ${attendue}` });
        erreurs.mockClear();
        await expect(lecture(id), attendue).rejects.toEqual(raison(attendue));
        const lignes = erreurs.mock.calls.map(([texte]) => JSON.parse(String(texte)) as Record<string, unknown>);
        expect(lignes, attendue).toEqual([expect.objectContaining({ level: "error", event: "voyages.read_failed", reason: attendue, tripId: id })]);
        expect(JSON.stringify(lignes)).not.toContain(P0);
        expect(lignes[0]).not.toHaveProperty("dropped");
      }
    } finally {
      erreurs.mockRestore();
    }
  });

  it("lecture: Mes voyages et un fuseau manquant", async () => {
    const org = await createOrg(auth);
    const ctx = contexte(org);
    const days = [jour(1, "2028-04-01", [term("start", "09:00"), term("end", "18:00")])];
    const visible = await ecrireVoyage(app, org, voyage(days, { destination: "Visible" }));
    await ecrireVoyage(app, org, voyage(days, { destination: "En création", timeZone: null, currentVersion: null }), admin);
    const { adapter } = banc();
    expect((await adapter.listTrips(ctx)).map((t) => t.id)).toEqual([visible]);
    await ecrireVoyage(app, org, voyage(days, { destination: "Fuseau nul", timeZone: null }), admin);
    await expect(adapter.listTrips(ctx)).rejects.toEqual(raison("time_zone_missing"));
  });

  it("lecture: propositions sans version courante", async () => {
    const edimbourg = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG_TRIP_ID);
    if (edimbourg === undefined) throw new Error("absent");
    const id = await ecrire(a, { ...edimbourg.donnees, destination: "Sans version", currentVersion: null });
    const { adapter, relectures } = banc();
    expect(await adapter.listPreviewSlots(ctxA, id)).toEqual([]);
    expect(await adapter.listProposals(ctxA, id)).toEqual([]);
    expect(await adapter.getTrip(ctxA, id)).toBeNull();
    expect(relectures.appels()).toBe(0);
  });
});

const P0 = "test_place_incoherent";

describe("adaptateur mock inchangé", () => {
  it("la fabrique de mock reste celle de la suite (aucun cas propre à un adaptateur dans la suite)", () => {
    const adapter: TripAdapter = createMockTripAdapter();
    expect(Object.keys(adapter).sort()).toEqual(Object.keys(banc().adapter).sort());
    void creerLectureVoyages;
  });
});
