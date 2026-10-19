import { randomBytes, randomUUID } from "node:crypto";

import pg from "pg";
import { expect } from "vitest";

import { BOOTSTRAP_ROLE, DB_ENV, type Login, readUrl, urlBaseJetable } from "./env";

/**
 * Outils des tests de base (`pnpm test:db`, spécification B1). Chaque test se connecte avec le rôle qu'il éprouve ;
 * aucun test d'isolation ne s'exécute en superutilisateur. La connexion d'administration (superutilisateur du
 * conteneur en CI) ne sert qu'à prouver un refus : garde de connexion, déclencheurs d'ajout seulement.
 */

export { BOOTSTRAP_ROLE, DB_ENV, type Login };

/** Client de `pg` des tests de base : seul ce fichier et le préalable importent `pg` (lignes de capacité de P0c). */
export type DbClient = pg.Client;

export function urlFor(login: Login): string {
  const value = readUrl(login);
  if (!value) throw new Error(`variable ${DB_ENV[login]} absente (voir tests/db/global-setup.ts)`);
  return value;
}

const open: pg.Client[] = [];

export async function connect(login: Login): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: urlFor(login) });
  await client.connect();
  open.push(client);
  return client;
}

/**
 * Exécution d'org_prototype posée par l'administration dans **sa transaction en cours** (déclencheurs désactivés par
 * `SET LOCAL session_replication_role = replica`, puis rétablis) : jour de quota passé tiré au hasard (index « une
 * par jour »), début et statut voulus, organisation au choix (une autre que org_prototype pour éprouver un refus).
 */
export async function poserExecution(
  admin: pg.Client,
  options: { organisation: string; debut?: string; statut?: "en_cours" | "programme_ecrit" | "arretee" },
): Promise<string> {
  const statut = options.statut ?? "en_cours";
  await admin.query("SET LOCAL session_replication_role = replica");
  const { rows } = await admin.query(
    `INSERT INTO prototype.runs (organization_id, quota_day, mode, brief, variant, status, stop_code, started_at, commit_sha)
     VALUES ($1, '1901-01-01'::date + $2::integer, 'reel', 'brief-test.json', 'A', $3, $4, ${options.debut ?? "pg_catalog.now() - interval '1 minute'"}, $5)
     RETURNING id`,
    [options.organisation, Math.floor(Math.random() * 30_000), statut, statut === "arretee" ? "pipeline_failed" : null, "b".repeat(40)],
  );
  await admin.query("SET LOCAL session_replication_role = origin");
  return rows[0].id as string;
}

/** Connexion d'un login à une base jetable des tests des workflows de la base (`tests/db/env.ts`, `urlBaseJetable`). */
export async function connectBaseJetable(login: Login, nom: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: urlBaseJetable(login, nom) });
  await client.connect();
  open.push(client);
  return client;
}

export async function closeAll(): Promise<void> {
  await Promise.all(open.splice(0).map((client) => client.end().catch(() => undefined)));
}

export type Ctx = { org?: string; user?: string };

/** Transaction validée, avec le contexte de 0007 posé comme le fera `withOrg` (B3). */
export async function inTx<T>(client: pg.Client, ctx: Ctx, fn: (c: pg.Client) => Promise<T>, role?: string): Promise<T> {
  await client.query("BEGIN");
  try {
    if (role) await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [
      ctx.org ?? "",
      ctx.user ?? "",
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/** Exécute une instruction dans un point de sauvegarde et renvoie l'erreur Postgres (ou `null`). */
export async function attempt(client: pg.Client, sql: string, params: unknown[] = []): Promise<{ code?: string; rowCount: number | null }> {
  await client.query("SAVEPOINT attempt");
  try {
    const result = await client.query(sql, params);
    await client.query("RELEASE SAVEPOINT attempt");
    return { rowCount: result.rowCount };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    return { code: (error as { code?: string }).code, rowCount: null };
  }
}

/** Refus par la RLS ou par les droits : code SQLSTATE 42501 (insufficient_privilege) dans les deux cas. */
export async function expectRefused(client: pg.Client, sql: string, params: unknown[] = []): Promise<void> {
  const result = await attempt(client, sql, params);
  expect(result.code, sql).toBe("42501");
}

/** Refus par les droits, ou aucune ligne touchée (lignes cachées par la RLS). */
export async function expectNoEffect(client: pg.Client, sql: string, params: unknown[] = []): Promise<void> {
  const result = await attempt(client, sql, params);
  if (result.code !== undefined) expect(result.code, sql).toBe("42501");
  else expect(result.rowCount, sql).toBe(0);
}

export const unique = () => randomUUID().slice(0, 8);

/** Tables métier (handover § 6) : `organization_id NOT NULL`, RLS, politique type pour `vadrouille_app`. */
export const BUSINESS_TABLES = [
  "trips",
  "briefs",
  "stays",
  // B9b (migration 0012_creation_voyage, 0081 B9-TL-6 (b)) : engagements de l'écran 1.
  "trip_commitments",
  "trip_versions",
  "generation_runs",
  "proposals",
  "research_runs",
  "candidates",
  "event_occurrences",
  "feedback",
  "preference_signals",
  "preferences",
  "checklist_items",
  "share_links",
  "usage_ledger",
  "checkouts",
  "billing",
  "entitlements",
] as const;
export type BusinessTable = (typeof BUSINESS_TABLES)[number];

/** Tables purgées par `purge_organization_data` : toutes sauf `billing` et `usage_ledger` (Q48). */
export const PURGED_TABLES = BUSINESS_TABLES.filter((t) => t !== "billing" && t !== "usage_ledger");

export type Org = { org: string; owner: string; email: string };

/** Crée une personne, son organisation personnelle et son adhésion `owner`, sous `vadrouille_auth`. */
export async function createOrg(auth: pg.Client, extraMembers = 0): Promise<Org & { members: string[] }> {
  return inTx(auth, {}, async (c) => {
    const email = `test-${unique()}@exemple.ch`;
    const owner = (await c.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [email])).rows[0].id as string;
    const org = (
      await c.query("INSERT INTO organizations (name, slug, kind) VALUES ('Organisation', $1, 'personal') RETURNING id", [`org-${unique()}`])
    ).rows[0].id as string;
    await c.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')", [org, owner]);
    const members: string[] = [];
    for (let i = 0; i < extraMembers; i++) {
      const member = (await c.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [`membre-${unique()}@exemple.ch`])).rows[0]
        .id as string;
      await c.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'member')", [org, member]);
      members.push(member);
    }
    return { org, owner, email, members };
  });
}

export const token = () => randomBytes(32);

/** Instantané de test minimal. */
export const SNAPSHOT = { days: [{ index: 1, date: "2027-05-01", items: [], events: [] }] };

/**
 * Insertion d'une ligne valide dans chaque table métier, pour une organisation et un voyage donnés. Les
 * insertions croisées des tests d'isolation réutilisent ces gabarits : seule la RLS ou un droit peut les refuser.
 */
export function insertSql(table: BusinessTable, ids: SeedIds): { sql: string; params: unknown[] } {
  const { org, owner, trip, generationRun, researchRun, billing } = ids;
  switch (table) {
    case "trips":
      return {
        // Fuseau obligatoire depuis B9b (migration 0012_creation_voyage, 0081 B9-TL-6 (d)).
        sql: "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, $3, 'Édimbourg', '2027-05-01', '2027-05-06', 2, 'Europe/London') RETURNING id",
        params: [org, owner, randomUUID()],
      };
    case "briefs":
      return {
        sql: "INSERT INTO briefs (organization_id, trip_id, version, story) VALUES ($1, $2, $3, 'Récit de test') RETURNING id",
        params: [org, trip, Math.floor(Math.random() * 1e9)],
      };
    case "stays":
      return {
        sql: "INSERT INTO stays (organization_id, trip_id, kind, label, from_date, to_date) VALUES ($1, $2, 'lodging', 'Hôtel de test', '2027-05-01', '2027-05-06') RETURNING id",
        params: [org, trip],
      };
    case "trip_commitments":
      return {
        sql: "INSERT INTO trip_commitments (organization_id, trip_id, rank, kind, label, date, start_time, end_time) VALUES ($1, $2, $3, 'flight', 'Vol de test', '2027-05-01', '09:00', '11:00') RETURNING id",
        params: [org, trip, Math.floor(Math.random() * 30_000)],
      };
    case "trip_versions":
      return {
        sql: "INSERT INTO trip_versions (organization_id, trip_id, version, request_id, snapshot, author_kind) VALUES ($1, $2, $3, $4, $5, 'engine') RETURNING id",
        params: [org, trip, Math.floor(Math.random() * 1e9) + 1, randomUUID(), JSON.stringify(SNAPSHOT)],
      };
    case "generation_runs":
      return {
        sql: "INSERT INTO generation_runs (organization_id, trip_id, kind, phase) VALUES ($1, $2, 'preview', 'preparing') RETURNING id",
        params: [org, trip],
      };
    case "proposals":
      return {
        sql: "INSERT INTO proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind) VALUES ($1, $2, $3, 'preview', $4, 'noOption', 1, '10:00', 'activity') RETURNING id",
        params: [org, trip, generationRun, Math.floor(Math.random() * 1e9) + 1],
      };
    case "research_runs":
      return {
        sql: "INSERT INTO research_runs (organization_id, trip_id, generation_run_id) VALUES ($1, $2, $3) RETURNING id",
        params: [org, trip, generationRun],
      };
    case "candidates":
      return {
        sql: `INSERT INTO candidates (organization_id, trip_id, research_run_id, kind, name, facts, sources) VALUES ($1, $2, $3, 'place', 'Lieu de test', '{"area": "Leith"}', '[{"label": "Site", "url": "https://exemple.ch", "checkedOn": "2026-10-01"}]') RETURNING id`,
        params: [org, trip, researchRun],
      };
    case "event_occurrences":
      return {
        sql: "INSERT INTO event_occurrences (organization_id, trip_id, starts_at, timezone, source_url, status) VALUES ($1, $2, '2027-05-02T18:00:00Z', 'Europe/London', 'https://exemple.ch/evenement', 'confirmed') RETURNING id",
        params: [org, trip],
      };
    case "feedback":
      return {
        sql: "INSERT INTO feedback (organization_id, trip_id, reason, scope, created_by) VALUES ($1, $2, 'closed', 'trip', $3) RETURNING id",
        params: [org, trip, owner],
      };
    case "preference_signals":
      return {
        sql: "INSERT INTO preference_signals (organization_id, trip_id, request_id, signal, origin) VALUES ($1, $2, $3, 'like', 'gesture') RETURNING id",
        params: [org, trip, randomUUID()],
      };
    case "preferences":
      return {
        sql: "INSERT INTO preferences (organization_id, user_id, category, value, consented_at) VALUES ($1, $2, 'museum', 'like', now()) RETURNING id",
        params: [org, owner],
      };
    case "checklist_items":
      return {
        sql: `INSERT INTO checklist_items (organization_id, trip_id, kind, label, moment, booking_url) VALUES ($1, $2, 'reservation', 'Réserver le dîner', '{"type": "beforeDeparture"}', 'https://exemple.ch/reserver') RETURNING id`,
        params: [org, trip],
      };
    case "share_links":
      return {
        sql: "INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at, revoked_at) VALUES ($1, $2, $3, $4, now() + interval '30 days', now()) RETURNING id",
        params: [org, trip, token(), owner],
      };
    case "usage_ledger":
      return {
        // Ligne de forfait (B7c, migration 0010_usage_forfait : `usage_ledger_forfait_only_check`).
        sql: "INSERT INTO usage_ledger (organization_id, trip_id, step, provider, sku, units, cost_estimate_micros) VALUES ($1, $2, 'forfait', 'google', 'test', 1, 10) RETURNING id",
        params: [org, trip],
      };
    case "checkouts":
      return {
        sql: "INSERT INTO checkouts (organization_id, trip_id, request_id, price_variant, amount_cents, currency, method, created_by) VALUES ($1, $2, $3, 'chf_29', 2900, 'CHF', 'twint', $4) RETURNING id",
        params: [org, trip, randomUUID(), owner],
      };
    case "billing":
      return {
        sql: "INSERT INTO billing (organization_id, stripe_event_id, type, livemode, outcome) VALUES ($1, $2, 'checkout.session.completed', false, 'granted') RETURNING id",
        params: [org, `evt_${unique()}${unique()}`],
      };
    case "entitlements":
      return {
        sql: "INSERT INTO entitlements (organization_id, trip_id, kind, billing_id) VALUES ($1, $2, 'tripUnlocked', $3) RETURNING id",
        params: [org, trip, billing],
      };
  }
}

export type SeedIds = Org & {
  trip: string;
  generationRun?: string;
  researchRun?: string;
  billing?: string;
  rows: Partial<Record<BusinessTable, string>>;
};

/**
 * Une organisation et une ligne dans chaque table métier, écrites par les rôles prévus : `vadrouille_app` avec le
 * contexte de l'organisation, `vadrouille_webhook` (SET LOCAL ROLE) pour `billing` et `entitlements`.
 */
export async function seedOrganization(auth: pg.Client, app: pg.Client): Promise<SeedIds> {
  const base = await createOrg(auth);
  const ctx = { org: base.org, user: base.owner };
  const ids = await inTx(app, ctx, async (c) => {
    const seed: SeedIds = { ...base, trip: "", rows: {} };
    const insert = async (table: BusinessTable) => {
      const { sql, params } = insertSql(table, seed);
      const id = (await c.query(sql, params)).rows[0].id as string;
      seed.rows[table] = id;
      return id;
    };
    seed.trip = await insert("trips");
    seed.generationRun = await insert("generation_runs");
    seed.researchRun = await insert("research_runs");
    for (const table of ["briefs", "stays", "trip_commitments", "trip_versions", "proposals", "candidates", "event_occurrences", "feedback", "preference_signals", "preferences", "checklist_items", "share_links", "usage_ledger", "checkouts"] as const) {
      await insert(table);
    }
    await c.query("UPDATE trips SET current_version = (SELECT version FROM trip_versions WHERE id = $1) WHERE id = $2", [
      seed.rows.trip_versions,
      seed.trip,
    ]);
    return seed;
  });
  await inTx(
    app,
    ctx,
    async (c) => {
      const billing = insertSql("billing", ids);
      ids.billing = (await c.query(billing.sql, billing.params)).rows[0].id as string;
      ids.rows.billing = ids.billing;
      const entitlement = insertSql("entitlements", ids);
      ids.rows.entitlements = (await c.query(entitlement.sql, entitlement.params)).rows[0].id as string;
    },
    "vadrouille_webhook",
  );
  return ids;
}

/** Nombre de lignes d'une organisation dans une table, vu par `vadrouille_app` avec le contexte de cette organisation. */
export async function countAs(app: pg.Client, ctx: Ctx, table: string): Promise<number> {
  return inTx(app, ctx, async (c) => Number((await c.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n));
}
