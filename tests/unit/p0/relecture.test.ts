// @vitest-environment node
import { randomBytes } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPrototypeAdapterReel, type PaireRelecture, type SourceProgrammesReels } from "@/adapters/prototype";
import { TripSchema } from "@/contracts";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { cleTrajet, pairesDistinctes, pairesDuProgramme, ProgrammeReduitSchema, PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { valeurCookieAcces } from "@/server/p0/acces";
import { creerCadence, ErreurBudgetRoutes } from "@/grounding/budget-routes";
import type { PointRoutes } from "@/grounding/interfaces";
import { cadenceRelecture, creerRelecteurReel, SQL_PURGE_RECENTE, type ClientMatrice, type DependancesRelecteur } from "@/server/p0/relecture";
import { forfaitRelecture, LIMITES_PROTOTYPE, QUOTA_ROUTES_ELEMENTS_PAR_MINUTE, type Forfait, type LimitesForfait } from "@/server/usage/forfait";
import type { ClientSql, PoolSql, ReglesForfait } from "@/server/usage/neon";
import { DUREE_MAX_EXECUTION_MS, PLAFONDS_RELECTURE, relectureDuMode, SKUS_FORFAIT } from "@/workflows/p0-run";
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
  const requetes: { origines: readonly PointRoutes[]; destinations: readonly PointRoutes[]; mode: string }[] = [];
  const client: ClientMatrice = {
    async matrice(requete) {
      requetes.push(requete);
      // P0 ne passe que des `placeId` (0087 § 3.2 : un centre maison n'arrive jamais ici).
      return { secondes: requete.origines.map((o) => requete.destinations.map((d) => secondes(String(o), String(d)))) };
    },
  };
  return { client, requetes };
}

/** Cadence propre au test, sans attente (le test de la cadence partagée injecte la sienne). */
const cadenceLibre = () => creerCadence(QUOTA_ROUTES_ELEMENTS_PAR_MINUTE, { maintenant: () => 0, attendre: async () => undefined });

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
    cadence: async () => cadenceLibre(),
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
  ])("%s atteint : quota_reached, aucun appel Routes (l'adaptateur affiche la journée sans ces temps, décision 0092 § 5)", async (_cas, sommes) => {
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
    const petit: Forfait = forfaitRelecture(TABLE, SKUS_FORFAIT, { placesTextSearch: 0, placesDetails: 0, routesRequetes: 1, routesElements: 1 });
    let usage: Parameters<NonNullable<DependancesRelecteur["routes"]>>[1] | undefined;
    const r = creerRelecteurReel({
      env: preversion(),
      execArgv: [],
      maintenant: () => T0,
      cookie: async () => COOKIE,
      pool: () => poolSimule().pool,
      relecture: async () => ({ forfait: petit, regles: regles() }),
      cadence: async () => cadenceLibre(),
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
    expect(lu!.regles).toEqual({ limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: "elements", dureeMaxMs: DUREE_MAX_EXECUTION_MS });
    expect(relectureDuMode()).toEqual(lu);
  });
});

describe("p0: cadence Routes unique par processus pour la relecture (3 000 éléments par minute)", () => {
  it("plusieurs relectures simultanées partagent la cadence : au-delà du maximum de la minute, les requêtes attendent", async () => {
    // Horloge injectée : l'attente avance le temps virtuel ; cadence réduite à 4 éléments par minute pour le test.
    let maintenant = 0;
    const attentes: number[] = [];
    const cadence = creerCadence(4, {
      maintenant: () => maintenant,
      attendre: async (ms) => {
        attentes.push(ms);
        // Le temps avance après les tâches en cours (macrotâche) : les requêtes déjà admises partent à leur instant.
        await new Promise((resolve) => setTimeout(resolve, 0));
        maintenant += ms;
      },
    });
    const departs: { instant: number; elements: number }[] = [];
    const client: ClientMatrice = {
      async matrice(requete) {
        departs.push({ instant: maintenant, elements: requete.origines.length * requete.destinations.length });
        return { secondes: requete.origines.map(() => requete.destinations.map(() => 120)) };
      },
    };
    const lecteurs = Array.from({ length: 3 }, () =>
      creerRelecteurReel({
        env: preversion(),
        execArgv: [],
        maintenant: () => T0,
        cookie: async () => COOKIE,
        pool: () => poolSimule().pool,
        relecture: async () => ({ forfait: FORFAIT, regles: regles() }),
        routes: async () => client,
        cadence: async () => cadence,
      }),
    );
    // Trois relectures de deux éléments chacune (deux origines distinctes) : 6 éléments pour un maximum de 4.
    const deux: PaireRelecture[] = [
      { origine: "lieu_a", destination: "lieu_b", mode: "walk" },
      { origine: "lieu_b", destination: "lieu_c", mode: "walk" },
    ];
    const resultats = await Promise.all(lecteurs.map((l) => l.relireJournee(deux)));
    expect(resultats.every((r) => r.ok)).toBe(true);
    expect(departs.reduce((t, d) => t + d.elements, 0)).toBe(6);
    // Jamais plus de 4 éléments dans une minute glissante ; au moins une requête a attendu la minute suivante.
    for (const depart of departs) {
      const fenetre = departs.filter((d) => d.instant > depart.instant - 60_000 && d.instant <= depart.instant);
      expect(fenetre.reduce((t, d) => t + d.elements, 0)).toBeLessThanOrEqual(4);
    }
    expect(attentes.length).toBeGreaterThan(0);
    expect(Math.max(...departs.map((d) => d.instant))).toBeGreaterThanOrEqual(60_000);
  });

  it("cadence par défaut : une seule instance par processus, au quota de 3 000 éléments par minute", async () => {
    const cadence = await cadenceRelecture();
    expect(await cadenceRelecture()).toBe(cadence);
    expect(QUOTA_ROUTES_ELEMENTS_PAR_MINUTE).toBe(3_000);
    await expect(cadence.reserver(QUOTA_ROUTES_ELEMENTS_PAR_MINUTE + 1)).rejects.toBeInstanceOf(ErreurBudgetRoutes);
  });
});

describe("p0: relecture, cas limites (mineurs 1 et 2 de la revue du head e79fbed)", () => {
  it("daily_quota_insufficient (forfait au-delà du quota d'une minute) n'est pas un plafond atteint : unavailable", async () => {
    const enorme: Forfait = forfaitRelecture(TABLE, SKUS_FORFAIT, { placesTextSearch: 0, placesDetails: 0, routesRequetes: 1, routesElements: QUOTA_ROUTES_ELEMENTS_PAR_MINUTE + 1 });
    const base = poolSimule();
    const { relecteur: r, fabrique } = relecteur({ pool: () => base.pool, relecture: async () => ({ forfait: enorme, regles: regles() }) });
    expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "unavailable" });
    expect(fabrique).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith("p0.read_unavailable", { errorName: "ReservationImpossible" }, "warn");
  });

  it("cookie illisible hors portée de requête : refus fermé, aucune connexion, aucune erreur levée", async () => {
    const base = poolSimule();
    const { relecteur: r, fabrique } = relecteur({
      pool: () => base.pool,
      cookie: async () => {
        throw new Error("cookies() hors de la portée d'une requête");
      },
    });
    expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "unavailable" });
    expect(base.connect).not.toHaveBeenCalled();
    expect(fabrique).not.toHaveBeenCalled();
  });
});

describe("p0: Google indisponible à la lecture (ticket 826)", () => {
  const TRIP_ID = "proto_test_20261012_1";
  const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };
  const DOSSIER = realpathSync(join(process.cwd(), "prototype", "programmes-test"));
  const programme = ProgrammeReduitSchema.parse(JSON.parse(readFileSync(join(DOSSIER, `${TRIP_ID}.json`), "utf8")));

  /** Client Routes qui refuse chaque requête comme Google le 2026-10-28 (429, `upstream_rate_limited`). */
  function routesRefusees(code: "upstream_rate_limited" | "upstream_unavailable" | "upstream_timeout" = "upstream_rate_limited") {
    const requetes: { origines: readonly PointRoutes[]; destinations: readonly PointRoutes[]; mode: string }[] = [];
    const client: ClientMatrice = {
      async matrice(requete) {
        requetes.push(requete);
        throw new ErreurClientGoogle(code, code === "upstream_rate_limited" ? 429 : undefined);
      },
    };
    return { client, requetes };
  }

  it.each(["upstream_rate_limited", "upstream_unavailable", "upstream_timeout"] as const)(
    "%s : refus `unavailable`, journal avec le nom et le code fermé de l'erreur, jamais un lieu ni un message",
    async (code) => {
      const { relecteur: r } = relecteur({ pool: () => poolSimule().pool }, routesRefusees(code));
      expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "unavailable" });
      expect(logEvent).toHaveBeenCalledWith("p0.read_unavailable", { errorName: "ErreurClientGoogle", failureCode: code }, "warn");
      expect(JSON.stringify(logEvent.mock.calls)).not.toMatch(/lieu_|429/);
    },
  );

  it("ligne du journal : `failureCode` admis sur `p0.read_unavailable`, aucun champ retiré ; une autre erreur n'a pas de code", async () => {
    const { formatLogLine } = await vi.importActual<typeof import("@/server/log")>("@/server/log");
    expect(JSON.parse(formatLogLine("p0.read_unavailable", { errorName: "ErreurClientGoogle", failureCode: "upstream_rate_limited" }, "warn"))).toEqual({
      level: "warn",
      event: "p0.read_unavailable",
      errorName: "ErreurClientGoogle",
      failureCode: "upstream_rate_limited",
    });
    const autre = Object.assign(new Error("secret"), { name: "ErreurInterne", code: "upstream_rate_limited" });
    const { relecteur: r } = relecteur({ pool: () => poolSimule().pool }, { client: { matrice: async () => Promise.reject(autre) }, requetes: [] });
    expect(await r.relireJournee(PAIRES)).toEqual({ ok: false, raison: "unavailable" });
    expect(logEvent).toHaveBeenCalledWith("p0.read_unavailable", { errorName: "ErreurInterne" }, "warn");
  });

  it("voyage existant : séjour, journées et carte servis avec ce qui est en base ; durées non conservées absentes, rien d'écrit", async () => {
    const paires = pairesDistinctes(pairesDuProgramme(programme));
    expect(paires.length).toBeGreaterThan(1);
    // Une paire conservée (temps écrit par `p0Run`) : gardée ; toutes les autres seraient relues, Google refuse.
    const conservee = paires[0]!;
    const trajets = new Map([[cleTrajet(conservee), 7]]);
    const conserver = vi.fn(async () => undefined);
    const source: SourceProgrammesReels = {
      lister: async () => [{ programme, trajets, conserver }],
      lire: async (id) => (id === TRIP_ID ? { programme, trajets, conserver } : null),
    };
    const routes = routesRefusees();
    const { relecteur: r } = relecteur({ pool: () => poolSimule().pool }, routes);
    const adapter = createPrototypeAdapterReel({ programmes: source, relecteurs: { trajets: r } });

    const trip = await adapter.getTrip(ctx, TRIP_ID);
    expect(trip).not.toBeNull();
    expect(TripSchema.safeParse(trip).success).toBe(true);
    expect(trip!.days).toHaveLength(programme.trip.days.length);
    const segments = trip!.days.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "segment" ? [ligne.segment] : [])));
    expect(segments.length).toBeGreaterThan(1);
    // Jamais une durée inventée : la durée conservée (7 min) ou aucune.
    expect(segments.every((segment) => segment.minutes === null || segment.minutes === 7)).toBe(true);
    expect(segments.some((segment) => segment.minutes === null)).toBe(true);
    expect(routes.requetes.length).toBeGreaterThan(0);

    const jour = await adapter.getDay(ctx, TRIP_ID, programme.trip.days[0]!.index);
    expect(jour).not.toBeNull();
    expect(jour!.travelMinutes).toBeNull();
    // Positions lues en base (aucun appel Google) : la carte reste servie, carte Google seulement.
    const carte = await adapter.getDayMap(ctx, TRIP_ID, programme.trip.days[0]!.index);
    expect(carte?.points.length).toBeGreaterThan(0);
    expect((await adapter.listTrips(ctx)).map((resume) => resume.id)).toEqual([TRIP_ID]);
    // Rien n'est conservé après une relecture refusée (0109) : aucune durée fausse écrite.
    expect(conserver).not.toHaveBeenCalled();
  });
});
