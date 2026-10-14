import { connectionStringFor, DATABASE_URL_VARIABLES, DatabaseGuardError, isProductionForDatabase, MIGRATOR_URL_VARIABLE } from "../../db/connection";
import { migratorConnectionString } from "../../db/migrate";

/**
 * Variables de connexion des tests de base (`pnpm test:db`) ; en CI, posées par le job `db` (mots de passe jetables).
 * Les noms de la base sont des noms secrets (spécification P0c, section 5) : ils ne sont écrits et lus que par
 * `db/connection.ts` et `db/migrate.ts`, dont les tests reprennent les constantes et les lecteurs.
 */
export const DB_ENV = {
  app: DATABASE_URL_VARIABLES.vadrouille_app,
  auth: DATABASE_URL_VARIABLES.vadrouille_auth,
  migrator: MIGRATOR_URL_VARIABLE,
  admin: "VADROUILLE_DB_ADMIN_URL",
  // P0r2 (décision 0046) : rôles du prototype, mots de passe jetables posés par `scripts/ci/db-setup.sh`. Lues
  // directement, comme `admin` : la garde de `db/connection.ts` refuse `vadrouille_prototype` sans `VERCEL_ENV`
  // (D21), ce qui est le cas de la CI ; `vadrouille_prototype_purge` n'a aucun module applicatif (job p0-purge).
  p0: "VADROUILLE_DB_PROTOTYPE_URL",
  p0_purge: "VADROUILLE_DB_PROTOTYPE_PURGE_URL",
} as const;

export type Login = keyof typeof DB_ENV;

/**
 * Rôle d'amorçage nommé dans le test `rôles` (décision 0036, B1-TL-2 ; variable `VADROUILLE_DB_BOOTSTRAP_ROLE`) :
 * superutilisateur `postgres` du conteneur en CI, qui ne reçoit pas de ligne ADMIN. Sa ligne est tolérée, non exigée.
 */
export const BOOTSTRAP_ROLE = process.env.VADROUILLE_DB_BOOTSTRAP_ROLE ?? "postgres";

/**
 * Vrai si la garde de production de `db/connection.ts` (décision 0034) refuse toute connexion dans cet environnement :
 * `readUrl` rend alors `undefined` pour chaque login, et le préalable le signale comme tel, pas comme des variables
 * absentes (revue du head a89d9a5, PR 244, mineur 5).
 */
export const productionGuardActive = (): boolean => isProductionForDatabase(process.env);

/** Adresse de connexion d'un login, ou `undefined` si sa variable n'est pas posée (ou vide) ou en production. */
export function readUrl(login: Login): string | undefined {
  try {
    switch (login) {
      case "app":
        return connectionStringFor("vadrouille_app", process.env);
      case "auth":
        return connectionStringFor("vadrouille_auth", process.env);
      case "migrator":
        return migratorConnectionString(process.env);
      case "admin":
        return process.env.VADROUILLE_DB_ADMIN_URL || undefined;
      case "p0":
        return process.env.VADROUILLE_DB_PROTOTYPE_URL || undefined;
      case "p0_purge":
        return process.env.VADROUILLE_DB_PROTOTYPE_PURGE_URL || undefined;
    }
  } catch (error) {
    // Variable absente (ou garde de production) : le préalable le signale sans valeur (tests/db/global-setup.ts).
    if (error instanceof DatabaseGuardError) return undefined;
    throw error;
  }
}
