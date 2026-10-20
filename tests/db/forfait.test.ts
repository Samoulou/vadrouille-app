import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { codePersiste, type Phase } from "@/prototype/arret";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { type Forfait, LIMITES_PROTOTYPE, type LimitesForfait } from "@/server/usage/forfait";
import { type ClientSql, type PoolSql, type ReglesForfait, reserverExecution, reserverRelecture } from "@/server/usage/neon";

import { closeAll, connect, type DbClient } from "./helpers";

/**
 * Port de consommation du prototype, implémentation Neon (décision 0046, D13 point 3, exigence Sécurité S4), sous
 * `vadrouille_prototype`. La plupart des cas tournent dans une transaction **annulée** (le port y ouvre un point de
 * sauvegarde à la place de sa transaction) : aucune exécution du jour réel n'est ainsi gardée (plus de limite d'une
 * exécution par jour, décision 0071). La concurrence et l'échec fermé utilisent de vraies transactions, sur des forfaits de relecture.
 */

const SHA = "b".repeat(40);
const FORFAIT_EXECUTION: Forfait = {
  nature: "execution",
  textSearchRequetes: 90,
  placeDetailsRequetes: 90,
  routesRequetes: 60,
  routesElements: 4000,
  coutGoogleMicros: 21_800_000,
  coutModelesMicros: 3_000_000,
};
const FORFAIT_RELECTURE: Forfait = {
  nature: "relecture",
  textSearchRequetes: 0,
  placeDetailsRequetes: 0,
  routesRequetes: 60,
  routesElements: 60,
  coutGoogleMicros: 300,
  coutModelesMicros: null,
};
/** Limites larges : les cas qui n'éprouvent pas un plafond ne dépendent pas des forfaits déjà validés dans la base. */
const LARGES: LimitesForfait = {
  quotaJourParMethode: 1_000_000_000,
  moisGoogleMicros: Number.MAX_SAFE_INTEGER,
  enveloppeGoogleMicros: Number.MAX_SAFE_INTEGER,
  moisModelesMicros: Number.MAX_SAFE_INTEGER,
  enveloppeModelesMicros: Number.MAX_SAFE_INTEGER,
};
const REGLES: ReglesForfait = { limites: LARGES, uniteQuotaRoutes: "requetes", dureeMaxMs: 900_000 };

let admin: DbClient;
let proto: DbClient;

beforeAll(async () => {
  admin = await connect("admin");
  proto = await connect("p0");
});

afterAll(closeAll);

/** Pool dont la transaction du port devient un point de sauvegarde de la transaction ouverte sur `client`. */
function poolDansTransaction(client: DbClient): PoolSql {
  const traduction = new Map([
    ["BEGIN", "SAVEPOINT forfait"],
    ["COMMIT", "RELEASE SAVEPOINT forfait"],
    ["ROLLBACK", "ROLLBACK TO SAVEPOINT forfait"],
  ]);
  const sql: ClientSql = {
    query: async (texte, valeurs) => client.query(traduction.get(texte) ?? texte, valeurs as unknown[] | undefined),
    release: () => undefined,
  };
  return { connect: async () => sql };
}

/** Pool réel : une connexion `vadrouille_prototype` par réservation, fermée à la libération. */
const poolReel: PoolSql = {
  connect: async () => {
    const client = await connect("p0");
    return { query: (texte, valeurs) => client.query(texte, valeurs as unknown[] | undefined), release: () => void client.end() };
  },
};

async function annulee<T>(fn: (pool: PoolSql) => Promise<T>): Promise<T> {
  await proto.query("BEGIN");
  try {
    return await fn(poolDansTransaction(proto));
  } finally {
    await proto.query("ROLLBACK");
  }
}

const lancer = (pool: PoolSql, regles: ReglesForfait = REGLES) =>
  reserverExecution(pool, { mode: "reel", brief: "brief-test.json", variant: "A", commitSha: SHA, forfait: FORFAIT_EXECUTION }, regles);

describe("p0: forfait réservé en base, plusieurs exécutions par jour (0071)", () => {
  it("le lancement écrit une ligne runs en cours et son forfait, valeurs posées par la base ; un second lancement du jour réussit avec un autre runId", async () => {
    await annulee(async (pool) => {
      const premier = await lancer(pool);
      expect(premier.ok).toBe(true);
      if (!premier.ok) return;
      const run = await proto.query(
        "SELECT status, phase, stop_code, cost_models_micros, organization_id::text, quota_day = prototype.quota_day_at(now()) AS jour FROM prototype.runs WHERE id = $1",
        [premier.runId],
      );
      expect(run.rows[0]).toEqual({ status: "en_cours", phase: null, stop_code: null, cost_models_micros: null, organization_id: PROTOTYPE_ORG_ID, jour: true });
      const forfait = await proto.query(
        `SELECT nature, text_search_requests, place_details_requests, routes_requests, routes_elements, google_cost_micros::int, models_cost_micros::int,
                created_at = (SELECT started_at FROM prototype.runs WHERE id = $1) AS meme_instant
         FROM prototype.forfaits WHERE run_id = $1`,
        [premier.runId],
      );
      expect(forfait.rows).toEqual([
        {
          nature: "execution",
          text_search_requests: 90,
          place_details_requests: 90,
          routes_requests: 60,
          routes_elements: 4000,
          google_cost_micros: 21_800_000,
          models_cost_micros: 3_000_000,
          meme_instant: true,
        },
      ]);
      const second = await lancer(pool);
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.runId).not.toBe(premier.runId);
      expect(Number((await proto.query("SELECT count(*) AS n FROM prototype.forfaits WHERE nature = 'execution' AND created_at = now()")).rows[0].n)).toBe(2);
    });
  });

  it("plafonds : quota du jour, enveloppe et mois refusent sans rien écrire", async () => {
    await annulee(async (pool) => {
      const sommes = (await proto.query("SELECT count(*) AS n FROM prototype.forfaits")).rows[0].n;
      const cas: [Partial<LimitesForfait>, string][] = [
        [{ quotaJourParMethode: 89 }, "daily_quota_insufficient"],
        [{ enveloppeGoogleMicros: 1 }, "envelope_reached"],
        [{ enveloppeModelesMicros: 1 }, "envelope_reached"],
        [{ moisGoogleMicros: 1 }, "cap_reached"],
        [{ moisModelesMicros: 1 }, "cap_reached"],
      ];
      for (const [limite, code] of cas) {
        expect(await lancer(pool, { ...REGLES, limites: { ...LARGES, ...limite } }), JSON.stringify(limite)).toEqual({ ok: false, code });
      }
      expect((await proto.query("SELECT count(*) AS n FROM prototype.forfaits")).rows[0].n).toBe(sommes);
      // Unité « éléments » pour Routes (Q330 : aucun seuil du jour, 3 000 éléments par minute) : un forfait de 4 000 éléments
      // ne tient pas dans le quota d'une minute, refusé sans rien écrire.
      expect(await lancer(pool, { ...REGLES, limites: { ...LIMITES_PROTOTYPE, enveloppeGoogleMicros: Number.MAX_SAFE_INTEGER, moisGoogleMicros: Number.MAX_SAFE_INTEGER }, uniteQuotaRoutes: "elements" })).toEqual({
        ok: false,
        code: "daily_quota_insufficient",
      });
    });
  });

  it("p0: réservation atomique du forfait (deux lancements simultanés qui dépasseraient un plafond : un seul réussit)", async () => {
    const jour = await proto.query("SELECT COALESCE(SUM(routes_requests), 0)::int AS n FROM prototype.forfaits WHERE quota_day = prototype.quota_day_at(now())");
    // Quota du jour fixé pour qu'une seule relecture de 60 requêtes passe.
    const regles: ReglesForfait = { ...REGLES, limites: { ...LARGES, quotaJourParMethode: Number(jour.rows[0].n) + 90 } };
    const avant = Number((await proto.query("SELECT count(*) AS n FROM prototype.forfaits")).rows[0].n);
    const resultats = await Promise.all([reserverRelecture(poolReel, FORFAIT_RELECTURE, regles), reserverRelecture(poolReel, FORFAIT_RELECTURE, regles)]);
    expect(resultats.filter((r) => r.ok)).toHaveLength(1);
    expect(resultats.filter((r) => !r.ok)).toEqual([{ ok: false, code: "daily_quota_insufficient" }]);
    expect(Number((await proto.query("SELECT count(*) AS n FROM prototype.forfaits")).rows[0].n)).toBe(avant + 1);
  });

  it("p0: réservation atomique du forfait, échec fermé : base injoignable ou requête en erreur → usage_unavailable, rien d'écrit", async () => {
    const injoignable: PoolSql = { connect: async () => Promise.reject(new Error("ECONNREFUSED")) };
    expect(await reserverRelecture(injoignable, FORFAIT_RELECTURE, REGLES)).toEqual({ ok: false, code: "usage_unavailable" });
    const avant = Number((await proto.query("SELECT count(*) AS n FROM prototype.forfaits")).rows[0].n);
    let appels = 0;
    const enErreur: PoolSql = {
      connect: async () => {
        const reel = await poolReel.connect();
        return {
          query: async (texte, valeurs) => {
            appels += 1;
            if (texte.startsWith("INSERT INTO prototype.forfaits")) throw new Error("panne");
            return reel.query(texte, valeurs);
          },
          release: reel.release,
        };
      },
    };
    expect(await reserverRelecture(enErreur, FORFAIT_RELECTURE, REGLES)).toEqual({ ok: false, code: "usage_unavailable" });
    expect(appels).toBeGreaterThan(3);
    expect(Number((await proto.query("SELECT count(*) AS n FROM prototype.forfaits")).rows[0].n)).toBe(avant);
    // Forfait d'une autre nature : refusé avant toute connexion.
    expect(await reserverRelecture(injoignable, FORFAIT_EXECUTION, REGLES)).toEqual({ ok: false, code: "usage_unavailable" });
  });

  it("p0: exécution orpheline close au lancement suivant", async () => {
    // Deux exécutions en cours d'un jour passé, posées par l'administration (déclencheurs désactivés pour cette seule
    // transaction) : l'une au-delà de dureeMaxMs + 5 min, l'autre en deçà.
    await admin.query("BEGIN");
    let orpheline: string;
    let recente: string;
    try {
      await admin.query("SET LOCAL session_replication_role = replica");
      const poser = async (age: string, jour: number) =>
        (
          await admin.query(
            `INSERT INTO prototype.runs (organization_id, quota_day, mode, brief, variant, status, phase, cost_models_micros, started_at, commit_sha)
             VALUES ($1, DATE '1999-01-01' + $2::int, 'essai', 'brief-test.json', 'A', 'en_cours', 'notation', 120000, now() - $3::interval, $4) RETURNING id`,
            [PROTOTYPE_ORG_ID, jour, age, SHA],
          )
        ).rows[0].id as string;
      const base = Math.floor(Math.random() * 300) * 2;
      orpheline = await poser("21 minutes", base);
      recente = await poser("19 minutes", base + 1);
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }
    await annulee(async (pool) => {
      expect((await lancer(pool)).ok).toBe(true);
      const { rows } = await proto.query("SELECT id::text, status, stop_code, phase, cost_models_micros FROM prototype.runs WHERE id = ANY($1::uuid[]) ORDER BY started_at", [
        [orpheline, recente],
      ]);
      expect(rows).toEqual([
        { id: orpheline, status: "arretee", stop_code: "pipeline_failed", phase: null, cost_models_micros: null },
        { id: recente, status: "en_cours", stop_code: null, phase: "notation", cost_models_micros: "120000" },
      ]);
    });
  });

  it("p0: le prototype n'écrit jamais dans usage_ledger", async () => {
    await annulee(async (pool) => {
      expect((await lancer(pool)).ok).toBe(true);
      expect((await reserverRelecture(pool, FORFAIT_RELECTURE, REGLES)).ok).toBe(true);
    });
    const { rows } = await admin.query("SELECT count(*) AS n FROM public.usage_ledger WHERE organization_id = $1", [PROTOTYPE_ORG_ID]);
    expect(Number(rows[0].n)).toBe(0);
    const droits = await proto.query(
      "SELECT pg_catalog.has_table_privilege('vadrouille_prototype', 'public.usage_ledger', 'INSERT') OR pg_catalog.has_any_column_privilege('vadrouille_prototype', 'public.usage_ledger', 'INSERT') AS insert",
    );
    expect(droits.rows[0].insert).toBe(false);
  });
});

/** Scénario de sentinelles (0046 D24, S4) : déroulement simulé, puis lignes lues après la fin de l'exécution. */
type Scenario = {
  readonly nom: string;
  /** Nombre de candidats, et nombre de candidats résolus (`place_id`). */
  readonly candidats: number;
  readonly resolus: number;
  readonly phases: readonly Phase[];
  /** Coût des modèles écrit à la fin de chaque étape (micro-USD, cent supérieur). */
  readonly couts: readonly number[];
  /** Code levé par l'étape qui échoue ; absent : programme écrit. */
  readonly code?: string;
};

const SCENARIOS: readonly Scenario[] = [
  { nom: "a", candidats: 12, resolus: 12, phases: ["recherche", "ancrage", "notation", "planification", "raisons", "validation", "ecriture"], couts: [40000, 80000, 2_000_000, 2_400_000, 2_600_000, 2_700_000, 2_710_000] },
  { nom: "b", candidats: 12, resolus: 0, phases: ["recherche", "ancrage"], couts: [30000, 30000], code: "place_not_found" },
  { nom: "c", candidats: 9, resolus: 4, phases: ["recherche", "ancrage", "notation", "planification"], couts: [50000, 60000, 900_000, 950_000], code: "lodging_unresolved" },
  { nom: "d", candidats: 12, resolus: 12, phases: ["recherche", "ancrage", "notation", "planification"], couts: [40000, 80000, 2_000_000, 2_100_000], code: "cap_reached" },
  { nom: "e", candidats: 0, resolus: 0, phases: ["recherche"], couts: [10000], code: "internal_error" },
  { nom: "f", candidats: 0, resolus: 0, phases: ["recherche"], couts: [20000], code: "upstream_unavailable" },
  { nom: "g", candidats: 12, resolus: 11, phases: ["recherche", "ancrage", "notation", "planification"], couts: [40000, 70000, 1_900_000, 1_950_000], code: "upstream_unavailable" },
];

type Lignes = { runs: Record<string, unknown>; forfaits: Record<string, unknown>; autres: Record<string, number> };

async function derouler(scenario: Scenario): Promise<Lignes> {
  return annulee(async (pool) => {
    const lancement = await lancer(pool);
    if (!lancement.ok) throw new Error(`lancement refusé : ${lancement.code}`);
    const run = lancement.runId;
    for (let i = 0; i < scenario.phases.length; i++) {
      await proto.query("UPDATE prototype.runs SET phase = $2, cost_models_micros = $3 WHERE id = $1", [run, scenario.phases[i], scenario.couts[i]]);
      if (scenario.phases[i] === "recherche") {
        // Candidats de la recherche, `place_id` pour les candidats résolus (table de travail, vivante pendant l'exécution).
        for (let c = 1; c <= scenario.candidats; c++) {
          const cle = `c_${String(c).padStart(3, "0")}`;
          await proto.query("INSERT INTO prototype.run_candidates (run_id, cle, candidat, place_id) VALUES ($1, $2, $3, $4)", [
            run,
            cle,
            { id: cle, nom: "Lieu", resume: "Résumé.", aReserver: false },
            c <= scenario.resolus ? `ChIJsentinelle${cle}` : null,
          ]);
        }
      }
    }
    if (scenario.code === undefined) {
      await proto.query(`INSERT INTO prototype.programmes (run_id, contenu) VALUES ($1, '{"schema": 1, "trip": {}, "proposals": [], "terminus": []}')`, [run]);
      await proto.query("UPDATE prototype.runs SET status = 'programme_ecrit', phase = NULL, cost_models_micros = NULL WHERE id = $1", [run]);
    } else {
      await proto.query("UPDATE prototype.runs SET status = 'arretee', stop_code = $2, phase = NULL, cost_models_micros = NULL WHERE id = $1", [run, codePersiste(scenario.code, true)]);
    }
    // Fin de l'exécution : la table de travail est vidée.
    await proto.query("DELETE FROM prototype.run_candidates WHERE run_id = $1", [run]);
    const runs = (await proto.query("SELECT * FROM prototype.runs WHERE id = $1", [run])).rows[0] as Record<string, unknown>;
    const forfaits = (await proto.query("SELECT * FROM prototype.forfaits WHERE run_id = $1", [run])).rows[0] as Record<string, unknown>;
    const autres = {
      run_candidates: Number((await proto.query("SELECT count(*) AS n FROM prototype.run_candidates WHERE run_id = $1", [run])).rows[0].n),
      programmes: Number((await proto.query("SELECT count(*) AS n FROM prototype.programmes WHERE run_id = $1", [run])).rows[0].n),
    };
    return { runs, forfaits, autres };
  });
}

const sans = (ligne: Record<string, unknown>, cles: readonly string[]) => Object.fromEntries(Object.entries(ligne).filter(([cle]) => !cles.includes(cle)));

describe("p0: aucun compteur d'ancrage en base (S4)", () => {
  it("forfaits identiques ; runs de (b) à (e) identiques, (f) et (g) identiques ; seul le programme de (a) reste", async () => {
    const lignes = new Map<string, Lignes>();
    for (const scenario of SCENARIOS) lignes.set(scenario.nom, await derouler(scenario));
    const de = (nom: string) => lignes.get(nom)!;

    const forfaits = SCENARIOS.map((s) => sans(de(s.nom).forfaits, ["id", "run_id", "quota_day", "created_at"]));
    for (const f of forfaits) expect(f).toEqual(forfaits[0]);

    const finRuns = (nom: string) => sans(de(nom).runs, ["id", "quota_day", "started_at"]);
    for (const nom of ["c", "d", "e"]) expect(finRuns(nom), nom).toEqual(finRuns("b"));
    expect(finRuns("b")).toMatchObject({ status: "arretee", stop_code: "pipeline_failed", phase: null, cost_models_micros: null });
    expect(finRuns("g")).toEqual(finRuns("f"));
    expect(finRuns("f")).toMatchObject({ status: "arretee", stop_code: "upstream_unavailable", phase: null, cost_models_micros: null });
    expect(finRuns("a")).toMatchObject({ status: "programme_ecrit", stop_code: null, phase: null, cost_models_micros: null });
    // Aucune colonne d'heure de fin ni de durée.
    expect(Object.keys(de("a").runs).filter((c) => /ended|duree|duration|fin/.test(c))).toEqual([]);

    for (const scenario of SCENARIOS) {
      expect(de(scenario.nom).autres, scenario.nom).toEqual({ run_candidates: 0, programmes: scenario.code === undefined ? 1 : 0 });
    }
  });
});
