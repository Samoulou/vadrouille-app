// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PaireRelecture } from "@/adapters/prototype";
import { valeurCookieAcces } from "@/server/p0/acces";
import { creerRelecteurReel, SQL_PURGE_RECENTE, type ClientMatrice, type DependancesRelecteur } from "@/server/p0/relecture";
import { forfaitRelecture, LIMITES_PROTOTYPE, type Forfait, type LimitesForfait } from "@/server/usage/forfait";
import type { ClientSql, PoolSql, ReglesForfait } from "@/server/usage/neon";
import { PLAFONDS_RELECTURE, relectureDuMode, SKUS_FORFAIT } from "@/workflows/p0-run";
import prixGoogle from "../../../prototype/config/prix-google.json";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";

/**
 * Relecteur Routes réel des programmes réels (P0r4, décision 0079) : même barrière que le lancement, purge de moins de
 * 24 h, forfait de relecture réservé (plafond du mois, enveloppe), appels bornés par le registre ; aucun appel Routes ni
 * aucune connexion avant la barrière ; jamais une durée inventée.
 */

const logEvent = vi.fn();
vi.mock("@/server/log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
  errorNameOf: (erreur: unknown) => (erreur instanceof Error ? erreur.name : undefined),
}));
// `poolPrototype` réel jamais atteint : chaque test injecte son pool.
vi.mock("@/server/p0/base", () => ({
  poolPrototype: () => {
    throw new Error("pool réel interdit dans les tests");
  },
}));

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  logEvent.mockClear();
});

const [NOM_CODE = "", NOM_BASE = ""] = Object.keys({ P0_RUN_TOKEN: 0, P0_DATABASE_URL: 0 });
const T0 = Date.UTC(2026, 9, 16, 15);
const CODE = randomBytes(32);
const COOKIE = valeurCookieAcces(CODE, T0);

function preversion(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "p0-reel",
    P0_REAL_RUNS: "enabled",
    [NOM_BASE]: "postgres://exemple.invalid/p0",
    [NOM_CODE]: CODE.toString("hex"),
    ...extra,
  };
}

const TABLE = TablePrixGoogleSchema.parse(prixGoogle);
const FORFAIT: Forfait = forfaitRelecture(TABLE, SKUS_FORFAIT, PLAFONDS_RELECTURE);
const regles = (limites: LimitesForfait = LIMITES_PROTOTYPE): ReglesForfait => ({ limites, uniteQuotaRoutes: "elements", dureeMaxMs: 900_000 });

/** Sommes de la base (`SQL_SOMMES` de `neon.ts`), en micro-USD et en unités. */
type Sommes = { moisGoogle?: number; enveloppeGoogle?: number; jourRoutesElements?: number; jourRoutesRequetes?: number };

/** Pool `vadrouille_prototype` simulé : purge, sommes des forfaits et insertion du forfait de relecture. */
function poolSimule({ purgeRecente = true, sommes = {} as Sommes } = {}) {
  const requetes: string[] = [];
  const client: ClientSql = {
    async query(texte) {
      requetes.push(texte);
      if (texte === SQL_PURGE_RECENTE) return { rows: [{ recente: purgeRecente }] };
      if (texte.includes("FROM bornes AS b LEFT JOIN prototype.forfaits")) {
        return {
          rows: [
            {
              jour_text_search: 0,
              jour_place_details: 0,
              jour_routes_requetes: sommes.jourRoutesRequetes ?? 0,
              jour_routes_elements: sommes.jourRoutesElements ?? 0,
              mois_google: sommes.moisGoogle ?? 0,
              enveloppe_google: sommes.enveloppeGoogle ?? 0,
              mois_modeles: 0,
              enveloppe_modeles: 0,
            },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const connect = vi.fn(async () => client);
  const pool: PoolSql = { connect };
  return { pool, requetes, connect, forfaitInscrit: () => requetes.some((r) => r.startsWith("INSERT INTO prototype.forfaits")) };
}

/** Client Routes double : durée en secondes par paire, requêtes enregistrées. */
function routesSimulees(secondes: (origine: string, destination: string) => number | null = () => 600) {
  const requetes: { origines: string[]; destinations: string[]; mode: string }[] = [];
  const client: ClientMatrice = {
    async matrice(requete) {
      requetes.push(requete);
      return { secondes: requete.origines.map((o) => requete.destinations.map((d) => secondes(o, d))) };
    },
  };
  return { client, requetes };
}

const PAIRES: PaireRelecture[] = [
  { origine: "lieu_hotel", destination: "lieu_musee", mode: "walk" },
  { origine: "lieu_musee", destination: "lieu_cafe", mode: "walk" },
  { origine: "lieu_cafe", destination: "lieu_hotel", mode: "transit" },
  { origine: "lieu_hotel", destination: "lieu_parc", mode: "walk" },
];

function relecteur(extra: Partial<DependancesRelecteur> & { pool?: () => PoolSql } = {}, routes = routesSimulees()) {
  const fabrique = vi.fn(async () => routes.client);
  const r = creerRelecteurReel({
    env: preversion(),
    execArgv: [],
    maintenant: () => T0,
    cookie: async () => COOKIE,
    relecture: async () => ({ forfait: FORFAIT, regles: regles() }),
    routes: fabrique,
    ...extra,
  });
  return { relecteur: r, fabrique, routes };
}

describe("p0: lecture sans barrière : refus et aucun appel Routes (relecture, exigence 4)", () => {
  it.each<[string, Partial<DependancesRelecteur>]>([
    ["sans cookie", { cookie: async () => undefined }],
    ["cookie signé par un autre code", { cookie: async () => valeurCookieAcces(randomBytes(32), T0) }],
    ["cookie expiré", { maintenant: () => T0 + 12 * 3_600_000 }],
    ["autre branche", { env: preversion({ VERCEL_GIT_COMMIT_REF: "main" }) }],
    ["mode réel non activé", { env: preversion({ P0_REAL_RUNS: undefined }) }],
    ["production", { env: preversion({ VERCEL_ENV: "production" }) }],
    ["CI", { env: preversion({ CI: "true" }) }],
  ])("%s : refus, aucune connexion, aucun forfait, aucun client Routes", async (_cas, extra) => {
    const base = poolSimule();
    const relecture = vi.fn(async () => ({ forfait: FORFAIT, regles: regles() }));
    const { relecteur: r, fabrique } = relecteur({ ...extra, pool: () => base.pool, relecture });
    expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "unavailable" });
    expect(base.connect).not.toHaveBeenCalled();
    expect(relecture).not.toHaveBeenCalled();
    expect(fabrique).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("p0: relecture refusée si la dernière purge a plus de 24 h", () => {
  it("purge absente ou de plus de 24 h (calculé par la base) : refus, aucun forfait réservé, aucun appel Routes", async () => {
    const base = poolSimule({ purgeRecente: false });
    const { relecteur: r, fabrique } = relecteur({ pool: () => base.pool });
    expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "unavailable" });
    expect(base.requetes).toEqual([SQL_PURGE_RECENTE]);
    expect(base.forfaitInscrit()).toBe(false);
    expect(fabrique).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith("p0.read_unavailable", { errorName: "PurgeAncienne" }, "warn");
    expect(SQL_PURGE_RECENTE).toContain("interval '24 hours'");
    expect(SQL_PURGE_RECENTE).toContain("FROM prototype.purges");
    expect(SQL_PURGE_RECENTE).toContain("COALESCE(");
  });
});

describe("p0: relecture refusée si le plafond Google du mois ou l'enveloppe est atteint", () => {
  const limites: LimitesForfait = { ...LIMITES_PROTOTYPE, moisGoogleMicros: 20_000_000, enveloppeGoogleMicros: 40_000_000 };

  it.each<[string, Sommes]>([
    ["plafond du mois", { moisGoogle: 20_000_000 - FORFAIT.coutGoogleMicros + 1 }],
    ["enveloppe jusqu'à G0", { enveloppeGoogle: 40_000_000 }],
  ])("%s atteint : quota_reached, aucun appel Routes (l'adaptateur affiche l'état d'erreur)", async (_cas, sommes) => {
    const base = poolSimule({ sommes });
    const { relecteur: r, fabrique } = relecteur({ pool: () => base.pool, relecture: async () => ({ forfait: FORFAIT, regles: regles(limites) }) });
    expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "quota_reached" });
    expect(base.forfaitInscrit()).toBe(false);
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("aucun refus au titre d'un seuil Routes par jour (Q330) : relecture faite malgré un jour très chargé", async () => {
    const base = poolSimule({ sommes: { jourRoutesElements: 1_000_000, jourRoutesRequetes: 100_000 } });
    const { relecteur: r, fabrique } = relecteur({ pool: () => base.pool, relecture: async () => ({ forfait: FORFAIT, regles: regles(limites) }) });
    expect((await r.relireJournee(PAIRES)).ok).toBe(true);
    expect(base.forfaitInscrit()).toBe(true);
    expect(fabrique).toHaveBeenCalledTimes(1);
  });

  it("configuration de la relecture refusée : refus sans connexion", async () => {
    const base = poolSimule();
    const { relecteur: r, fabrique } = relecteur({ pool: () => base.pool, relecture: async () => null });
    expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "unavailable" });
    expect(base.connect).not.toHaveBeenCalled();
    expect(fabrique).not.toHaveBeenCalled();
  });
});

describe("p0: relecture Routes réelle (P0r4)", () => {
  it("barrière, purge et forfait : une requête par (mode, origine), un élément par trajet distinct, minutes arrondies au-dessus", async () => {
    const base = poolSimule();
    const routes = routesSimulees((o, d) => (o === "lieu_musee" ? 61 : d === "lieu_parc" ? null : 600));
    const doublee = [...PAIRES.slice(0, 3), PAIRES[0]!];
    const { relecteur: r } = relecteur({ pool: () => base.pool }, routes);
    expect(await r.relireJournee(doublee)).toEqual({ ok: true, minutes: [10, 2, 10, 10] });
    expect(routes.requetes).toHaveLength(3);
    expect(routes.requetes.reduce((total, q) => total + q.origines.length * q.destinations.length, 0)).toBe(3);
    expect(base.requetes[0]).toBe(SQL_PURGE_RECENTE);
    expect(base.forfaitInscrit()).toBe(true);
  });

  it("aucun itinéraire : la relecture échoue (jamais une durée inventée)", async () => {
    const routes = routesSimulees((_o, d) => (d === "lieu_parc" ? null : 600));
    const { relecteur: r } = relecteur({ pool: () => poolSimule().pool }, routes);
    expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "unavailable" });
  });

  it("client Routes en refus de réservation (registre du forfait) : quota_reached ; autre erreur : unavailable, nom seul au journal", async () => {
    for (const [code, raison] of [
      ["cap_reached", "quota_reached"],
      ["upstream_unavailable", "unavailable"],
    ] as const) {
      const erreur = Object.assign(new Error(`secret ${code}`), { name: "ErreurClientGoogle", code });
      const client: ClientMatrice = { matrice: async () => Promise.reject(erreur) };
      const { relecteur: r } = relecteur({ pool: () => poolSimule().pool }, { client, requetes: [] });
      expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison });
    }
    expect(JSON.stringify(logEvent.mock.calls)).not.toMatch(/secret|lieu_/);
  });

  it("le registre du forfait borne les appels : au-delà de ses requêtes, la réservation est refusée", async () => {
    const petit: Forfait = forfaitRelecture(TABLE, SKUS_FORFAIT, { routesRequetes: 1, routesElements: 1 });
    let usage: Parameters<NonNullable<DependancesRelecteur["routes"]>>[1] | undefined;
    const r = creerRelecteurReel({
      env: preversion(),
      execArgv: [],
      maintenant: () => T0,
      cookie: async () => COOKIE,
      pool: () => poolSimule().pool,
      relecture: async () => ({ forfait: petit, regles: regles() }),
      routes: async (_garde, port) => {
        usage = port;
        return routesSimulees().client;
      },
    });
    expect((await r.relireJournee(PAIRES.slice(0, 1))).ok).toBe(true);
    expect(usage).toBeDefined();
    const demande = {
      nature: "relecture" as const,
      fournisseur: "google" as const,
      methode: "routes_matrix" as const,
      sku: "routes_matrix_essentials",
      unites: { requetes: 1, elements: 1 },
      coutEstimeMicros: 5_000,
      executionId: null,
      periodes: { jour: { du: 0, au: 1 }, mois: { du: 0, au: 1 } },
      plafonds: [],
    };
    expect((await usage!.reserve(demande)).ok).toBe(true);
    expect(await usage!.reserve(demande)).toEqual({ ok: false, code: "cap_reached" });
  });

  it("journée sans trajet : aucune barrière franchie, aucun appel", async () => {
    const base = poolSimule();
    const { relecteur: r, fabrique } = relecteur({ pool: () => base.pool });
    expect(await r.relireJournee([])).toEqual({ ok: true, minutes: [] });
    expect(base.connect).not.toHaveBeenCalled();
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("forfait de relecture du pont p0Run : Routes seulement, 40 éléments au prix plein (0,20 USD), constant (S4)", () => {
    const lu = relectureDuMode();
    expect(lu).not.toBeNull();
    expect(lu!.forfait).toEqual({
      nature: "relecture",
      textSearchRequetes: 0,
      placeDetailsRequetes: 0,
      routesRequetes: 40,
      routesElements: 40,
      coutGoogleMicros: 200_000,
      coutModelesMicros: null,
    });
    expect(lu!.regles).toEqual({ limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: "elements", dureeMaxMs: 900_000 });
    expect(relectureDuMode()).toEqual(lu);
  });
});
