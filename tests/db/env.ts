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
  // B8c (décision 0060 § 4) : rôle de purge du MVP, `vadrouille_coords_purge`, mot de passe jetable posé par
  // `scripts/ci/db-setup.sh` ; aucun module applicatif (job coords-purge).
  coords_purge: "VADROUILLE_DB_COORDS_PURGE_URL",
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
      case "coords_purge":
        return process.env.VADROUILLE_DB_COORDS_PURGE_URL || undefined;
    }
  } catch (error) {
    // Variable absente (ou garde de production) : le préalable le signale sans valeur (tests/db/global-setup.ts).
    if (error instanceof DatabaseGuardError) return undefined;
    throw error;
  }
}

const HOTES_LOCAUX = new Set(["127.0.0.1", "localhost"]);
const NOM_BASE = /^[a-z0-9_]{1,63}$/;

/**
 * Nom de la base migrée, lu dans une adresse de connexion : seulement sur `127.0.0.1` ou `localhost` (CI et poste
 * local), jamais la base réelle ; nom de 63 caractères au plus (limite des identifiants de PostgreSQL).
 */
function baseLocale(url: string): string {
  const adresse = new URL(url);
  if (!HOTES_LOCAUX.has(adresse.hostname)) throw new Error("base jetable : hôte autre que 127.0.0.1 ou localhost refusé");
  const modele = decodeURIComponent(adresse.pathname.replace(/^\//, ""));
  if (!NOM_BASE.test(modele)) throw new Error("base jetable : nom de base hors forme ou de plus de 63 caractères");
  return modele;
}

/**
 * Bases jetables des tests des workflows de la base (décisions 0056 et 0057, « Tests imposés » ; harnais confié à la
 * PR du workflow par Q412) : `<base>_<suffixe>`, créées vides par le test sur le même serveur, puis supprimées.
 * `127.0.0.1` ou `localhost` seulement, nom de 63 caractères au plus.
 */
export function nomBaseJetable(url: string, suffixe: string): string {
  if (!/^[a-z0-9_]{1,20}$/.test(suffixe)) throw new Error("base jetable : suffixe hors forme");
  const modele = baseLocale(url);
  const nom = `${modele}_${suffixe}`;
  if (!NOM_BASE.test(nom)) throw new Error("base jetable : nom de plus de 63 caractères");
  return nom;
}

/** Adresse d'un login sur une base jetable. */
export function urlBaseJetable(login: Login, nom: string): string {
  const url = readUrl(login);
  if (url === undefined) throw new Error(`variable ${DB_ENV[login]} absente (voir tests/db/global-setup.ts)`);
  baseLocale(url);
  if (!NOM_BASE.test(nom)) throw new Error("base jetable : nom hors forme");
  const adresse = new URL(url);
  adresse.pathname = `/${nom}`;
  return adresse.toString();
}
