import "server-only";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { parse } from "pg-connection-string";

import {
  assertDatabaseAllowed,
  DatabaseGuardError,
  MIGRATOR_URL_VARIABLE,
  sanitizeConnectionError,
  verifyConnectionRole,
} from "./connection.ts";

/**
 * Applique les migrations SQL relues de `db/migrations/` (décision 0006), dans l'ordre du journal de drizzle-kit
 * (`meta/_journal.json`), sous le rôle `vadrouille_migrator` (décision 0007) : `pnpm db:migrate`.
 *
 * - Une transaction par migration ; la migration choisit elle-même `SET LOCAL ROLE vadrouille_owner` et le
 *   `RESET ROLE` final (vérifié avant l'enregistrement).
 * - Journal dans `vadrouille_migrations.applied` (nom, empreinte SHA-256) : une seconde exécution ne fait rien ;
 *   une migration déjà appliquée dont le fichier a changé arrête tout (on n'édite jamais une migration appliquée).
 * - Refus en production (décision 0034) et refus de tout autre rôle que `vadrouille_migrator`, sans `SUPERUSER`
 *   ni `BYPASSRLS`.
 * - Base locale seulement (décision 0056 § 2.8) : tout hôte autre que `localhost`, `127.0.0.1` ou `::1` est refusé
 *   avant la connexion. La base réelle ne reçoit de migration que par `.github/workflows/db-migrate.yml`, qui
 *   n'exécute aucun fichier du dépôt et n'applique que les migrations approuvées.
 * - Aucun message ne contient la chaîne de connexion : une erreur d'ouverture n'en garde que le code
 *   (`sanitizeConnectionError`).
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

/** Hôtes admis par `db/migrate.ts` (décision 0056 § 2.8) : CI et poste local seulement. */
export const MIGRATION_LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1"]);

const NON_LOCAL_HOST =
  "Migrations refusées : db/migrate.ts ne s'applique qu'à une base locale (localhost, 127.0.0.1 ou ::1). " +
  "La base réelle ne reçoit de migration que par le workflow des migrations approuvées (décision 0056).";

/**
 * Refus de tout hôte non local (décision 0056 § 2.8), lu par l'analyseur de chaînes de `pg` (`pg-connection-string`,
 * même version que celle que `pg` résout, vérifié par `tests/unit/db/hote-local-migrations.test.ts`) : hôte de l'URL,
 * `?host=` (qui l'emporte), plusieurs hôtes (`a,b`, refusés tels quels), socket (`/…`), forme `clé=valeur` (lue par
 * cet analyseur comme une adresse relative, d'hôte `base`). Une chaîne sans hôte passe ici : `pg` prend alors `PGHOST`,
 * puis `localhost`, et c'est l'hôte résolu par `pg` qui est contrôlé ensuite (`assertResolvedHostLocal`). Le message
 * ne contient ni la chaîne ni l'hôte.
 */
export function assertMigrationHostLocal(connectionString: string): void {
  let host: string | null | undefined;
  try {
    host = parse(connectionString).host;
  } catch {
    throw new DatabaseGuardError(NON_LOCAL_HOST);
  }
  if (host && !MIGRATION_LOCAL_HOSTS.has(host)) throw new DatabaseGuardError(NON_LOCAL_HOST);
}

/** Hôte que `pg` a résolu pour ce client (chaîne, puis `PGHOST`, puis `localhost`) : même liste, avant la connexion. */
function assertResolvedHostLocal(client: pg.Client): void {
  if (!MIGRATION_LOCAL_HOSTS.has(client.host)) throw new DatabaseGuardError(NON_LOCAL_HOST);
}

/**
 * Lit la variable de connexion de `vadrouille_migrator`, après la garde de production. Lecture par propriété
 * littérale (spécification P0c, section 5, forme 1) ; seul lecteur de cette variable, que l'application ne lit jamais
 * (décisions 0006 et 0029).
 */
export function migratorConnectionString(env: Env): string {
  assertDatabaseAllowed(env);
  const connectionString = env.VADROUILLE_DATABASE_URL_MIGRATOR;
  if (connectionString === undefined || connectionString.trim() === "") {
    throw new DatabaseGuardError(`Migrations impossibles : la variable ${MIGRATOR_URL_VARIABLE} n'est pas posée.`);
  }
  return connectionString;
}

export async function runMigrations(env: Env, migrations: Migration[] = readMigrations()): Promise<MigrationReport> {
  const connectionString = migratorConnectionString(env);
  assertMigrationHostLocal(connectionString);

  const client = new pg.Client({ connectionString });
  assertResolvedHostLocal(client);
  try {
    await client.connect();
  } catch (error) {
    // Code seul, comme la garde applicative : le message de pg peut nommer l'hôte et le port.
    await client.end().catch(() => undefined);
    throw sanitizeConnectionError(error);
  }
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
