import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { type Forfait, type LimitesForfait } from "@/server/usage/forfait";
import { ESSAIS_PAR_HEURE, LONGUEUR_SAISIE_MAX, saisirCodeAcces } from "@/server/p0/acces";
import { verifierGardeEtape } from "@/server/p0/garde";
import { type ClientSql, type PoolSql, reserverExecution } from "@/server/usage/neon";

import { closeAll, connect, type DbClient } from "./helpers";

/**
 * Garde et accès du mode réel sur une vraie base Postgres (P0r3b ; décision 0055, section 1 point 2 et section 2
 * point 3 ; revue du head 6be9299, bloquant 2) : les trois requêtes de `src/server/p0/acces.ts` (verrou consultatif,
 * compte des essais de l'heure glissante, ligne d'essai) et celle de `src/server/p0/garde.ts` (exécution réservée)
 * tournent sous `vadrouille_prototype` (`VADROUILLE_DB_PROTOTYPE_URL`), avec ses droits, la RLS, `make_interval`,
 * `quota_day_at` et `pg_advisory_xact_lock` sous concurrence réelle.
 *
 * - Essais : vraies transactions validées (le verrou et le compte n'ont de sens qu'entre transactions). Avant chaque
 *   cas, l'administration vieillit de deux heures les essais de l'heure écoulée (déclencheurs désactivés pour cette
 *   seule transaction) : chaque cas part d'une fenêtre vide, quel que soit l'ordre des fichiers.
 * - Étapes : transactions annulées. Les exécutions que `vadrouille_prototype` ne peut pas écrire lui-même (autre jour,
 *   début ancien) sont posées par l'administration, déclencheurs désactivés, puis lues sous `SET LOCAL ROLE
 *   vadrouille_prototype` dans la même transaction : mêmes droits et même RLS que la connexion du rôle.
 * Le code est tiré à l'exécution ; les noms secrets sont des clés d'objet (régime de confinement P0c, section 5).
 */

const [NOM_CODE = "", NOM_BASE = ""] = Object.keys({
  P0_RUN_TOKEN: 0,
  P0_DATABASE_URL: 0,
});
const SHA = "c".repeat(40);
const QUINZE_MINUTES = 900_000;
const FORFAIT_EXECUTION: Forfait = {
  nature: "execution",
  textSearchRequetes: 90,
  placeDetailsRequetes: 90,
  routesRequetes: 60,
  routesElements: 4000,
  coutGoogleMicros: 21_800_000,
  coutModelesMicros: 3_000_000,
};

/** Limites larges : la garde d'étape ne dépend pas des forfaits déjà validés dans la base. */
const LARGES: LimitesForfait = {
  quotaJourParMethode: 1_000_000_000,
  moisGoogleMicros: Number.MAX_SAFE_INTEGER,
  enveloppeGoogleMicros: Number.MAX_SAFE_INTEGER,
  moisModelesMicros: Number.MAX_SAFE_INTEGER,
  enveloppeModelesMicros: Number.MAX_SAFE_INTEGER,
};

const code = randomBytes(32);
/** Environnement de la préversion de `p0-reel`, garde ouverte (conditions (1) à (7)). */
const ENV_OUVERT: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "p0-reel",
  P0_REAL_RUNS: "enabled",
  [NOM_BASE]: "postgres://exemple.invalid/p0",
  [NOM_CODE]: code.toString("hex"),
};
const OUVERT = { env: ENV_OUVERT, execArgv: [] as string[] };

let admin: DbClient;
let proto: DbClient;

beforeAll(async () => {
  admin = await connect("admin");
  proto = await connect("p0");
});

afterAll(closeAll);

beforeEach(() => {
  // La barrière de sortie lit aussi le déploiement du processus (D21 : l'environnement injecté ne peut que resserrer).
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Pool réel : une connexion `vadrouille_prototype` par saisie, fermée à la libération. */
const poolReel: PoolSql = {
  connect: async () => {
    const client = await connect("p0");
    return { query: (texte, valeurs) => client.query(texte, valeurs as unknown[] | undefined), release: () => void client.end() };
  },
};

/**
 * Pool réel dont chaque connexion, après sa lecture de `prototype.run_attempts`, attend que `n` lectures aient eu lieu
 * (ou 250 ms) : la course entre le compte et l'écriture est ouverte au plus large.
 */
function poolSynchronise(n: number): PoolSql {
  let lectures = 0;
  let liberer: () => void = () => undefined;
  const toutes = new Promise<void>((resolve) => {
    liberer = resolve;
  });
  return {
    connect: async () => {
      const client = await connect("p0");
      return {
        query: async (texte, valeurs) => {
          const resultat = await client.query(texte, valeurs as unknown[] | undefined);
          if (texte.startsWith("SELECT pg_catalog.count(*)")) {
            lectures += 1;
            if (lectures >= n) liberer();
            await Promise.race([toutes, new Promise((resolve) => setTimeout(resolve, 250))]);
          }
          return resultat;
        },
        release: () => void client.end(),
      };
    },
  };
}

/** Pool dont chaque requête passe par `client`, dans la transaction déjà ouverte sur lui (aucun BEGIN ni COMMIT). */
function poolSur(client: DbClient): PoolSql {
  const sql: ClientSql = {
    query: async (texte, valeurs) => client.query(texte, valeurs as unknown[] | undefined),
    release: () => undefined,
  };
  return { connect: async () => sql };
}

// --- Essais du code -------------------------------------------------------------------------------------------

/** Vide la fenêtre glissante : les essais de l'heure écoulée reculent de deux heures (administration, validé). */
async function viderFenetre(): Promise<void> {
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL session_replication_role = replica");
    await admin.query(
      "UPDATE prototype.run_attempts SET created_at = created_at - interval '2 hours' WHERE created_at > pg_catalog.now() - interval '2 hours'",
    );
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Essais posés par l'administration il y a `minutes` minutes (déclencheurs désactivés : `created_at` gardé), validés. */
async function poserEssais(nombre: number, minutes: number): Promise<void> {
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL session_replication_role = replica");
    for (let i = 0; i < nombre; i += 1) {
      await admin.query(
        `INSERT INTO prototype.run_attempts (organization_id, resultat, created_at, expires_at)
         VALUES ($1, 'refuse', pg_catalog.now() - pg_catalog.make_interval(mins => $2::int), pg_catalog.now() + interval '1 day')`,
        [PROTOTYPE_ORG_ID, minutes],
      );
    }
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Essais de la fenêtre glissante (60 minutes), par résultat. */
async function essaisDeLHeure(): Promise<{ accepte: number; refuse: number }> {
  const lignes = await admin.query(
    "SELECT resultat, pg_catalog.count(*)::int AS n FROM prototype.run_attempts WHERE created_at > pg_catalog.now() - interval '60 minutes' GROUP BY resultat",
  );
  const compte = { accepte: 0, refuse: 0 };
  for (const ligne of lignes.rows as { resultat: "accepte" | "refuse"; n: number }[]) compte[ligne.resultat] = ligne.n;
  return compte;
}

describe("p0: essais du code d'accès sur la base (vadrouille_prototype)", () => {
  beforeEach(viderFenetre);
  afterAll(viderFenetre);

  it("bon code → cookie et une ligne « accepte » ; mauvais code → invalid_code et une ligne « refuse » ; aucune autre colonne écrite", async () => {
    const accepte = await saisirCodeAcces(code.toString("hex"), () => poolReel, OUVERT);
    expect(accepte.ok).toBe(true);
    expect(await saisirCodeAcces(randomBytes(32).toString("hex"), () => poolReel, OUVERT)).toEqual({ ok: false, code: "invalid_code" });
    expect(await essaisDeLHeure()).toEqual({ accepte: 1, refuse: 1 });
    const lignes = await admin.query(
      `SELECT organization_id::text, expires_at = created_at + interval '24 hours' AS expiration
       FROM prototype.run_attempts WHERE created_at > pg_catalog.now() - interval '60 minutes'`,
    );
    expect(lignes.rows).toEqual([
      { organization_id: PROTOTYPE_ORG_ID, expiration: true },
      { organization_id: PROTOTYPE_ORG_ID, expiration: true },
    ]);
  });

  it("6 saisies simultanées (connexions distinctes) : 5 lignes au plus, exactement un too_many_attempts", async () => {
    // Chaque saisie attend, après son compte, que les autres aient compté aussi (250 ms au plus) : sans le verrou
    // consultatif, les six comptes liraient la même fenêtre vide et six lignes seraient écrites.
    const pool = poolSynchronise(ESSAIS_PAR_HEURE + 1);
    const saisies = Array.from({ length: ESSAIS_PAR_HEURE + 1 }, () => saisirCodeAcces(randomBytes(32).toString("hex"), () => pool, OUVERT));
    const resultats = await Promise.all(saisies);
    const codes = resultats.map((r) => (r.ok ? "ok" : r.code)).sort();
    expect(codes).toEqual([...Array<string>(ESSAIS_PAR_HEURE).fill("invalid_code"), "too_many_attempts"].sort());
    expect(await essaisDeLHeure()).toEqual({ accepte: 0, refuse: ESSAIS_PAR_HEURE });
    // Le bon code ne passe plus : refusé sans comparaison ni ligne nouvelle.
    expect(await saisirCodeAcces(code.toString("hex"), () => poolReel, OUVERT)).toEqual({ ok: false, code: "too_many_attempts" });
    expect(await essaisDeLHeure()).toEqual({ accepte: 0, refuse: ESSAIS_PAR_HEURE });
  });

  it(`saisie de plus de ${LONGUEUR_SAISIE_MAX} caractères : refusée et comptée`, async () => {
    for (const saisie of ["a".repeat(LONGUEUR_SAISIE_MAX + 1), code.toString("hex").repeat(5)]) {
      expect(await saisirCodeAcces(saisie, () => poolReel, OUVERT)).toEqual({ ok: false, code: "invalid_code" });
    }
    expect(await essaisDeLHeure()).toEqual({ accepte: 0, refuse: 2 });
  });

  it("un essai de plus d'une heure n'est pas compté ; un essai de moins d'une heure l'est", async () => {
    await poserEssais(ESSAIS_PAR_HEURE, 61);
    expect(await saisirCodeAcces(code.toString("hex"), () => poolReel, OUVERT)).toMatchObject({ ok: true });
    await viderFenetre();
    await poserEssais(ESSAIS_PAR_HEURE, 59);
    expect(await saisirCodeAcces(code.toString("hex"), () => poolReel, OUVERT)).toEqual({ ok: false, code: "too_many_attempts" });
    expect(await essaisDeLHeure()).toEqual({ accepte: 0, refuse: ESSAIS_PAR_HEURE });
  });
});

// --- Garde à l'entrée d'une étape ---------------------------------------------------------------------------

/** Transaction de `vadrouille_prototype`, toujours annulée ; le port de réservation y ouvre un point de sauvegarde. */
async function annuleeProto<T>(fn: () => Promise<T>): Promise<T> {
  await proto.query("BEGIN");
  try {
    return await fn();
  } finally {
    await proto.query("ROLLBACK");
  }
}

/** Pool du port de réservation : sa transaction devient un point de sauvegarde de la transaction ouverte sur `proto`. */
function poolReservation(client: DbClient): PoolSql {
  const traduction = new Map([
    ["BEGIN", "SAVEPOINT reservation"],
    ["COMMIT", "RELEASE SAVEPOINT reservation"],
    ["ROLLBACK", "ROLLBACK TO SAVEPOINT reservation"],
  ]);
  return {
    connect: async () => ({
      query: async (texte, valeurs) => client.query(traduction.get(texte) ?? texte, valeurs as unknown[] | undefined),
      release: () => undefined,
    }),
  };
}

const reserver = async () => {
  const lancement = await reserverExecution(
    poolReservation(proto),
    { mode: "reel", brief: "brief-test.json", variant: "A", commitSha: SHA, forfait: FORFAIT_EXECUTION },
    { limites: LARGES, uniteQuotaRoutes: "requetes", dureeMaxMs: QUINZE_MINUTES },
  );
  if (!lancement.ok) throw new Error(`réservation refusée : ${lancement.code}`);
  return lancement.runId;
};

const etape = (runId: string, client: DbClient, dureeMaxMs = QUINZE_MINUTES) => verifierGardeEtape(runId, { ...OUVERT, pool: () => poolSur(client), dureeMaxMs });

/**
 * Exécution posée par l'administration (déclencheurs désactivés : `quota_day` et `started_at` gardés), avec ou sans
 * forfait d'exécution, puis passage sous `vadrouille_prototype` pour la lecture. Transaction annulée.
 */
async function poseeParAdministration(
  colonnes: { quotaDay: string; startedAt: string; status?: string; forfait?: "execution" | null },
  fn: (runId: string) => Promise<void>,
): Promise<void> {
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL session_replication_role = replica");
    const status = colonnes.status ?? "en_cours";
    const runId = (
      await admin.query(
        `INSERT INTO prototype.runs (organization_id, quota_day, mode, brief, variant, status, stop_code, started_at, commit_sha)
         VALUES ($1, ${colonnes.quotaDay}, 'reel', 'brief-test.json', 'A', $2, $3, ${colonnes.startedAt}, $4) RETURNING id::text`,
        [PROTOTYPE_ORG_ID, status, status === "arretee" ? "pipeline_failed" : null, SHA],
      )
    ).rows[0].id as string;
    if (colonnes.forfait !== null) {
      await admin.query(
        `INSERT INTO prototype.forfaits (organization_id, nature, run_id, quota_day, text_search_requests, place_details_requests, routes_requests,
                                         routes_elements, google_cost_micros, models_cost_micros, created_at)
         SELECT r.organization_id, 'execution', r.id, r.quota_day, 90, 90, 60, 4000, 21800000, 3000000, r.started_at FROM prototype.runs r WHERE r.id = $1`,
        [runId],
      );
    }
    await admin.query("SET LOCAL ROLE vadrouille_prototype");
    expect((await admin.query("SELECT current_user AS role")).rows[0].role).toBe("vadrouille_prototype");
    await fn(runId);
  } finally {
    await admin.query("ROLLBACK");
  }
}

const AUJOURDHUI = "prototype.quota_day_at(pg_catalog.now())";

describe("p0: garde d'une étape sur la base (vadrouille_prototype)", () => {
  it("exécution réservée par le lancement, en_cours, du jour, forfait d'exécution, dans la durée → garde ouverte", async () => {
    await annuleeProto(async () => {
      const runId = await reserver();
      expect(await etape(runId, proto)).toEqual({ ok: true, garde: { runId } });
    });
  });

  it("exécution réservée puis arrêtée → run_refused", async () => {
    await annuleeProto(async () => {
      const runId = await reserver();
      expect(await etape(runId, proto)).toMatchObject({ ok: true });
      await proto.query("UPDATE prototype.runs SET status = 'arretee', stop_code = 'pipeline_failed', phase = NULL, cost_models_micros = NULL WHERE id = $1", [runId]);
      expect(await etape(runId, proto)).toEqual({ ok: false, code: "run_refused" });
    });
  });

  it("exécution sans forfait → run_refused", async () => {
    await annuleeProto(async () => {
      const runId = (await proto.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('reel', 'brief-test.json', 'A', $1) RETURNING id::text", [SHA])).rows[0]
        .id as string;
      expect(await etape(runId, proto)).toEqual({ ok: false, code: "run_refused" });
    });
    await poseeParAdministration({ quotaDay: AUJOURDHUI, startedAt: "pg_catalog.now()", forfait: null }, async (runId) => {
      expect(await etape(runId, admin)).toEqual({ ok: false, code: "run_refused" });
    });
  });

  it("exécution inconnue → run_refused", async () => {
    await annuleeProto(async () => {
      expect(await etape("00000000-0000-4000-8000-000000000000", proto)).toEqual({ ok: false, code: "run_refused" });
    });
  });

  it("exécution d'un autre jour de quota, en cours et récente → run_refused", async () => {
    for (const jour of [`${AUJOURDHUI} - 1`, `${AUJOURDHUI} + 1`]) {
      await poseeParAdministration({ quotaDay: jour, startedAt: "pg_catalog.now()" }, async (runId) => {
        expect(await etape(runId, admin), jour).toEqual({ ok: false, code: "run_refused" });
      });
    }
  });

  it("durée maximale dépassée → run_refused ; la même exécution passe avec une durée plus longue (make_interval en millisecondes)", async () => {
    await poseeParAdministration({ quotaDay: AUJOURDHUI, startedAt: "pg_catalog.now() - interval '16 minutes'" }, async (runId) => {
      expect(await etape(runId, admin)).toEqual({ ok: false, code: "run_refused" });
      expect(await etape(runId, admin, 20 * 60_000)).toEqual({ ok: true, garde: { runId } });
    });
    await poseeParAdministration({ quotaDay: AUJOURDHUI, startedAt: "pg_catalog.now() - interval '14 minutes'" }, async (runId) => {
      expect(await etape(runId, admin)).toEqual({ ok: true, garde: { runId } });
    });
  });

  it("exécution terminée posée par l'administration, du jour et récente → run_refused", async () => {
    await poseeParAdministration({ quotaDay: AUJOURDHUI, startedAt: "pg_catalog.now()", status: "arretee" }, async (runId) => {
      expect(await etape(runId, admin)).toEqual({ ok: false, code: "run_refused" });
    });
  });
});
