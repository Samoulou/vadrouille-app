import "server-only";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { assertDatabaseAllowed, DatabaseGuardError, MIGRATOR_URL_VARIABLE, verifyConnectionRole } from "./connection.ts";

/**
 * Applique les migrations SQL relues de `db/migrations/` (décision 0006), dans l'ordre du journal de drizzle-kit
 * (`meta/_journal.json`), sous le rôle `vadrouille_migrator` (décision 0007) : `pnpm db:migrate`.
 *
 * - Une transaction par migration ; la migration choisit elle-même `SET LOCAL ROLE vadrouille_owner` et le
 *   `RESET ROLE` final (vérifié avant l'enregistrement).
 * - Journal dans `vadrouille_migrations.applied` (nom, empreinte SHA-256) : une seconde exécution ne fait rien ;
 *   une migration déjà appliquée dont le fichier a changé arrête tout (on n'édite jamais une migration appliquée).
 * - Refus en production (décision 0034) et refus de tout autre rôle que `vadrouille_migrator`, sans `SUPERUSER`
 *   ni `BYPASSRLS`. Aucun message ne contient la chaîne de connexion.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const MIGRATOR_ROLE = "vadrouille_migrator";

type Env = Readonly<Record<string, string | undefined>>;
type Journal = { entries: { idx: number; tag: string }[] };

export type Migration = { tag: string; sql: string; sha256: string };

/** Migrations du dépôt, dans l'ordre du journal. */
export function readMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as Journal;
  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map(({ tag }) => {
      const sql = readFileSync(join(dir, `${tag}.sql`), "utf8");
      return { tag, sql, sha256: createHash("sha256").update(sql).digest("hex") };
    });
}

export type MigrationReport = { applied: string[]; skipped: string[] };

export async function runMigrations(env: Env, migrations: Migration[] = readMigrations()): Promise<MigrationReport> {
  assertDatabaseAllowed(env);
  const connectionString = env[MIGRATOR_URL_VARIABLE];
  if (connectionString === undefined || connectionString.trim() === "") {
    throw new DatabaseGuardError(`Migrations impossibles : la variable ${MIGRATOR_URL_VARIABLE} n'est pas posée.`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    // Même contrôle que la garde applicative (session_user et current_user, ni SUPERUSER ni BYPASSRLS).
    await verifyConnectionRole(client, MIGRATOR_ROLE);

    await client.query(
      "CREATE TABLE IF NOT EXISTS vadrouille_migrations.applied (tag text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );

    const report: MigrationReport = { applied: [], skipped: [] };
    for (const migration of migrations) {
      await client.query("BEGIN");
      try {
        // Un seul migrateur à la fois.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('vadrouille_migrations'))");
        const done = await client.query<{ sha256: string }>("SELECT sha256 FROM vadrouille_migrations.applied WHERE tag = $1", [
          migration.tag,
        ]);
        const previous = done.rows[0];
        if (previous) {
          if (previous.sha256 !== migration.sha256) {
            throw new DatabaseGuardError(
              `Migration ${migration.tag} déjà appliquée mais modifiée depuis : écrire une nouvelle migration (db/README.md).`,
            );
          }
          await client.query("COMMIT");
          report.skipped.push(migration.tag);
          continue;
        }
        await client.query(migration.sql);
        const role = await client.query<{ current_user: string }>("SELECT current_user::text AS current_user");
        if (role.rows[0]?.current_user !== MIGRATOR_ROLE) {
          throw new DatabaseGuardError(`Migration ${migration.tag} : elle doit se terminer par RESET ROLE.`);
        }
        await client.query("INSERT INTO vadrouille_migrations.applied (tag, sha256) VALUES ($1, $2)", [migration.tag, migration.sha256]);
        await client.query("COMMIT");
        report.applied.push(migration.tag);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
    return report;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations(process.env).then(
    ({ applied, skipped }) => {
      console.log(`Migrations appliquées : ${applied.length} (${applied.join(", ") || "aucune"}) ; déjà présentes : ${skipped.length}.`);
    },
    (error: unknown) => {
      // Message seul : jamais l'objet d'erreur complet, qui pourrait porter des paramètres de connexion.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Échec des migrations : ${message}`);
      process.exitCode = 1;
    },
  );
}
