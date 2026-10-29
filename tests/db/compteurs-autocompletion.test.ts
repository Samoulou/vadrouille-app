import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { closeAll, connect, connectBaseJetable, type DbClient } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Compteurs quotidiens de la ville par autocomplétion sur la vraie app (plan du MVP, M1f-D ; migration
 * 0021_compteurs_autocompletion ; décision 0129 § 3, modèle de 0020_plafond_emails, 0138 § 11, T1).
 *
 * Aucun code applicatif n'existe encore (M1f) : ces tests éprouvent la table, ses droits et sa politique par SQL, sous
 * `vadrouille_app` puis `SET LOCAL ROLE vadrouille_autocomplete_counter`, avec la forme de réservation que M1f reprendra
 * (ligne du jour par `INSERT (day) … ON CONFLICT DO NOTHING`, puis un seul `UPDATE` conditionnel par action). Seul le
 * rôle de test (`admin`, superutilisateur du conteneur, hors de l'application : aucune migration ne le crée) vide la
 * table et pose des jours passés.
 *
 * La table est globale (aucune `organization_id`) : l'isolation éprouvée ici est celle des rôles. Aucun autre rôle que
 * `vadrouille_autocomplete_counter` ne la lit ni ne l'écrit, et ce rôle n'atteint aucune autre table ; `vadrouille_owner`
 * n'y lit aucune ligne (RLS forcée). Le compteur est global : chaque test le vide d'abord (fichiers de base exécutés en
 * série, aucun autre fichier n'y écrit).
 */

const ROLE = "vadrouille_autocomplete_counter";
const JOUR = "(pg_catalog.now() AT TIME ZONE 'UTC')::date";
const LIGNE_DU_JOUR = `INSERT INTO public.autocomplete_daily_counts (day) VALUES (${JOUR}) ON CONFLICT (day) DO NOTHING`;
type Action = "suggestions" | "choix";
const INCREMENT: Record<Action, string> = {
  suggestions: `UPDATE public.autocomplete_daily_counts SET suggestions = suggestions + 1
    WHERE day = ${JOUR} AND suggestions < $1::integer RETURNING suggestions AS n`,
  choix: `UPDATE public.autocomplete_daily_counts SET choix = choix + 1
    WHERE day = ${JOUR} AND choix < $1::integer RETURNING choix AS n`,
};

let admin: DbClient;
let app: DbClient;

/** Une transaction de `vadrouille_app` sous le rôle des compteurs ; annulée si `fn` lève. */
async function sousRole<T>(client: DbClient, fn: (c: DbClient) => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL ROLE ${ROLE}`);
    const resultat = await fn(client);
    await client.query("COMMIT");
    return resultat;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Réservation d'une action sous un seuil : rend le compteur après incrément, ou `null` (refus, rien d'écrit). */
async function reserver(client: DbClient, action: Action, seuil: number): Promise<number | null> {
  return sousRole(client, async (c) => {
    await c.query(LIGNE_DU_JOUR);
    const { rows } = await c.query(INCREMENT[action], [seuil]);
    return rows.length === 0 ? null : (rows[0].n as number);
  });
}

async function ligneDuJour(): Promise<{ suggestions: number; choix: number } | undefined> {
  const { rows } = await admin.query(`SELECT suggestions, choix FROM public.autocomplete_daily_counts WHERE day = ${JOUR}`);
  return rows[0] as { suggestions: number; choix: number } | undefined;
}

/** Code d'erreur Postgres d'une requête tentée dans une transaction de `client`, annulée ensuite. */
async function codeSous(client: DbClient, sql: string, role?: string): Promise<string | undefined> {
  await client.query("BEGIN");
  try {
    if (role !== undefined) await client.query(`SET LOCAL ROLE ${role}`);
    await client.query(sql);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  } finally {
    await client.query("ROLLBACK");
  }
}

beforeAll(async () => {
  admin = await connect("admin");
  app = await connect("app");
});

beforeEach(async () => {
  await admin.query("DELETE FROM public.autocomplete_daily_counts");
});

afterAll(async () => {
  await admin.query("DELETE FROM public.autocomplete_daily_counts");
  await closeAll();
  await supprimerBases();
});

describe("autocomplétion: forme de la table (0021)", () => {
  it("trois colonnes seulement (jour, suggestions, choix) : aucune saisie, donnée Google, empreinte ni organisation", async () => {
    const { rows } = await admin.query(
      `SELECT attname, pg_catalog.format_type(atttypid, atttypmod) AS type, attnotnull FROM pg_catalog.pg_attribute
       WHERE attrelid = 'public.autocomplete_daily_counts'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum`,
    );
    expect(rows).toEqual([
      { attname: "day", type: "date", attnotnull: true },
      { attname: "suggestions", type: "integer", attnotnull: true },
      { attname: "choix", type: "integer", attnotnull: true },
    ]);
  });

  it("RLS activée et forcée ; une seule politique, pour le seul rôle des compteurs", async () => {
    const rls = await admin.query(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.autocomplete_daily_counts'::regclass",
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const { rows } = await admin.query(
      "SELECT policyname, roles::text[] AS roles, cmd FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'autocomplete_daily_counts'",
    );
    expect(rows).toEqual([{ policyname: "autocomplete_daily_counts_counter", roles: [ROLE], cmd: "ALL" }]);
  });

  it("compteurs positifs ou nuls : la contrainte refuse une valeur négative (23514)", async () => {
    for (const [suggestions, choix] of [
      [-1, 0],
      [0, -1],
    ]) {
      await expect(
        admin.query(`INSERT INTO public.autocomplete_daily_counts (day, suggestions, choix) VALUES (${JOUR}, $1, $2)`, [suggestions, choix]),
      ).rejects.toMatchObject({ code: "23514" });
    }
  });
});

describe("autocomplétion: réservation sous le rôle des compteurs (forme reprise par M1f)", () => {
  it("ligne du jour créée à zéro, incrément jusqu'au seuil, puis refus sans rien écrire ; suggestions et choix indépendants", async () => {
    expect(await reserver(app, "suggestions", 3)).toBe(1);
    expect(await ligneDuJour()).toEqual({ suggestions: 1, choix: 0 });
    expect(await reserver(app, "suggestions", 3)).toBe(2);
    expect(await reserver(app, "suggestions", 3)).toBe(3);
    expect(await reserver(app, "suggestions", 3)).toBeNull();
    expect(await ligneDuJour()).toEqual({ suggestions: 3, choix: 0 });
    // Le plafond des suggestions atteint ne bloque pas les choix, et inversement.
    expect(await reserver(app, "choix", 2)).toBe(1);
    expect(await reserver(app, "choix", 2)).toBe(2);
    expect(await reserver(app, "choix", 2)).toBeNull();
    expect(await ligneDuJour()).toEqual({ suggestions: 3, choix: 2 });
  });

  it("sans dépassement sous la concurrence : 60 réservations parallèles sous un seuil de 40, exactement 40 acceptées", async () => {
    const clients = await Promise.all(Array.from({ length: 12 }, () => connect("app")));
    const issues = await Promise.all(
      clients.map(async (client) => {
        const acceptees: number[] = [];
        for (let i = 0; i < 5; i += 1) {
          const n = await reserver(client, "choix", 40);
          if (n !== null) acceptees.push(n);
        }
        return acceptees;
      }),
    );
    const acceptees = issues.flat();
    expect(acceptees).toHaveLength(40);
    // Chaque réservation acceptée a vu un total distinct : aucun incrément perdu ni doublé.
    expect(new Set(acceptees).size).toBe(40);
    expect(await ligneDuJour()).toEqual({ suggestions: 0, choix: 40 });
  });

  it("purge par le rôle : les jours échus partent, la ligne du jour reste", async () => {
    await admin.query(
      `INSERT INTO public.autocomplete_daily_counts (day, suggestions, choix) SELECT ${JOUR} - n, 5, 1 FROM unnest(ARRAY[0, 1, 7, 8, 40]) AS n`,
    );
    await sousRole(app, (c) => c.query(`DELETE FROM public.autocomplete_daily_counts WHERE day < ${JOUR} - $1::integer`, [7]));
    const { rows } = await admin.query(`SELECT (${JOUR} - day) AS age FROM public.autocomplete_daily_counts ORDER BY day DESC`);
    expect(rows.map((r) => r.age)).toEqual([0, 1, 7]);
  });
});

describe("autocomplétion: droits minimaux et isolation des rôles", () => {
  it("le rôle des compteurs ne modifie jamais le jour, n'insère pas de compteur, ne vide pas la table (42501)", async () => {
    await admin.query(`INSERT INTO public.autocomplete_daily_counts (day) VALUES (${JOUR})`);
    for (const sql of [
      "UPDATE public.autocomplete_daily_counts SET day = day - 1",
      "UPDATE public.autocomplete_daily_counts SET day = day, suggestions = suggestions",
      `INSERT INTO public.autocomplete_daily_counts (day, suggestions) VALUES (${JOUR} - 1, 0)`,
      `INSERT INTO public.autocomplete_daily_counts (day, choix) VALUES (${JOUR} - 1, 0)`,
      "TRUNCATE public.autocomplete_daily_counts",
    ]) {
      expect(await codeSous(app, sql, ROLE), sql).toBe("42501");
    }
    expect(await ligneDuJour()).toEqual({ suggestions: 0, choix: 0 });
  });

  it("le rôle des compteurs n'atteint aucune autre table (plafond des e-mails, limiteur, voyages, forfaits du prototype)", async () => {
    for (const table of ["public.email_daily_counts", "public.action_rate_limits", "public.trips", "public.usage_ledger", "prototype.forfaits"]) {
      expect(await codeSous(app, `SELECT 1 FROM ${table} LIMIT 1`, ROLE), table).toBe("42501");
    }
    const { rows } = await admin.query(
      `SELECT n.nspname || '.' || c.relname AS rel FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p', 'v', 'm') AND n.nspname IN ('public', 'prototype')
         AND (pg_catalog.has_table_privilege($1, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              OR pg_catalog.has_any_column_privilege($1, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))
       ORDER BY 1`,
      [ROLE],
    );
    expect(rows.map((r) => r.rel)).toEqual(["public.autocomplete_daily_counts"]);
  });

  it("aucun autre rôle n'a de droit sur la table ; vadrouille_app sans SET LOCAL ROLE, vadrouille_auth et le rôle du plafond des e-mails sont refusés", async () => {
    const { rows } = await admin.query(
      `SELECT r.rolname FROM pg_catalog.pg_roles r
       WHERE r.rolname LIKE 'vadrouille\\_%' AND r.rolname <> ALL (ARRAY[$1, 'vadrouille_owner'])
         AND (pg_catalog.has_table_privilege(r.oid, 'public.autocomplete_daily_counts', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              OR pg_catalog.has_any_column_privilege(r.oid, 'public.autocomplete_daily_counts', 'SELECT, INSERT, UPDATE, REFERENCES'))
       ORDER BY 1`,
      [ROLE],
    );
    // vadrouille_migrator hérite de vadrouille_owner (propriétaire, RLS forcée : zéro ligne, test suivant).
    expect(rows.map((r) => r.rolname)).toEqual(["vadrouille_migrator"]);
    expect(await codeSous(app, "SELECT 1 FROM public.autocomplete_daily_counts")).toBe("42501");
    expect(await codeSous(app, `INSERT INTO public.autocomplete_daily_counts (day) VALUES (${JOUR})`)).toBe("42501");
    expect(await codeSous(app, "SELECT 1 FROM public.autocomplete_daily_counts", "vadrouille_mail_counter")).toBe("42501");
    expect(await codeSous(await connect("auth"), "SELECT 1 FROM public.autocomplete_daily_counts")).toBe("42501");
  });

  it("vadrouille_owner (pris par vadrouille_migrator) lit zéro ligne : RLS forcée, aucune politique ne le vise", async () => {
    await admin.query(`INSERT INTO public.autocomplete_daily_counts (day, suggestions) VALUES (${JOUR}, 9)`);
    const migrator = await connect("migrator");
    await migrator.query("BEGIN");
    try {
      await migrator.query("SET LOCAL ROLE vadrouille_owner");
      expect(Number((await migrator.query("SELECT count(*) AS n FROM public.autocomplete_daily_counts")).rows[0].n)).toBe(0);
    } finally {
      await migrator.query("ROLLBACK");
    }
    // Le rôle des compteurs, lui, lit la ligne.
    const lue = await sousRole(app, async (c) => (await c.query("SELECT suggestions FROM public.autocomplete_daily_counts")).rows);
    expect(lue).toEqual([{ suggestions: 9 }]);
  });
});

const DOWN_0021 = readFileSync(path.join(process.cwd(), "db/migrations/0021_compteurs_autocompletion.down.sql"), "utf8");

describe("autocomplétion: retour arrière de 0021 (base jetable)", () => {
  it("la descente retire droits et politique, garde la table et ses compteurs ; la réservation est refusée (42501)", async () => {
    const nom = await creerBase("autocompl_retour");
    await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
    const [appJ, adminJ, migrateur] = await Promise.all([connectBaseJetable("app", nom), connectBaseJetable("admin", nom), connectBaseJetable("migrator", nom)]);
    expect(await reserver(appJ, "suggestions", 150)).toBe(1);

    await migrateur.query("BEGIN");
    await migrateur.query(DOWN_0021);
    expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
    await migrateur.query("COMMIT");

    await expect(reserver(appJ, "suggestions", 150)).rejects.toMatchObject({ code: "42501" });
    const { rows } = await adminJ.query("SELECT suggestions, choix FROM public.autocomplete_daily_counts");
    expect(rows).toEqual([{ suggestions: 1, choix: 0 }]);
    const politiques = await adminJ.query("SELECT count(*)::int AS n FROM pg_catalog.pg_policies WHERE tablename = 'autocomplete_daily_counts'");
    expect(politiques.rows[0].n).toBe(0);
    const droits = await adminJ.query(
      `SELECT pg_catalog.has_table_privilege($1, 'public.autocomplete_daily_counts', 'SELECT') AS lecture,
              pg_catalog.has_any_column_privilege($1, 'public.autocomplete_daily_counts', 'INSERT') AS insertion,
              pg_catalog.has_any_column_privilege($1, 'public.autocomplete_daily_counts', 'UPDATE') AS maj,
              pg_catalog.has_table_privilege($1, 'public.autocomplete_daily_counts', 'DELETE') AS suppression`,
      [ROLE],
    );
    expect(droits.rows[0]).toEqual({ lecture: false, insertion: false, maj: false, suppression: false });
    const rls = await adminJ.query(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.autocomplete_daily_counts'::regclass",
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
