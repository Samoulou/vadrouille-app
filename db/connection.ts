import "server-only";

import pg from "pg";

// Chemin relatif avec extension : seule forme que Node résout sous `pnpm db:migrate` (décision 0050, B3-TL-1 point 2).
import { resolveServerEnvironment } from "../src/server/env/resolve.ts";

/**
 * Seul point d'entrée des connexions applicatives à la base (spécification B1, « Garde de connexion » ;
 * décision B1-PO-6). Deux gardes, testées :
 * 1. **Production** (décision 0034, « Garde préalable à toute fusion ») : `main` est déployé automatiquement sur une
 *    adresse publique ; tant que la mise en public n'a pas eu sa passe de sécurité, aucune connexion n'est ouverte
 *    quand `resolveServerEnvironment` (`src/server/env/resolve.ts`) rend `production` : `VERCEL_ENV` ou
 *    `VADROUILLE_ENV` vaut `production` après `trim().toLowerCase()`, ou l'une a une valeur inconnue (B3a, A13).
 *    **L'environnement injecté ne peut que resserrer** (décision 0046, D21) : `VERCEL_ENV` et `VADROUILLE_ENV` sont
 *    aussi lues dans le vrai `process.env`. Pour `vadrouille_prototype` (variable `P0_DATABASE_URL`, P0r2), la règle
 *    est la **liste d'autorisation** de la barrière `egress` (`VERCEL_ENV` exactement `preview` ou `development`,
 *    `VERCEL_TARGET_ENV` égale si présente, `VADROUILLE_ENV` différente de `production`), appliquée à l'environnement
 *    injecté **et** au vrai `process.env` : sans `VERCEL_ENV` (CI, poste, runner), aucune connexion du prototype. Les
 *    deux gardes restent distinctes (`db/` n'importe de `src/server/env/` que `resolve.ts`, autonome et sans secret,
 *    B3a) ; leur table de cas est commune
 *    (`tests/support/cas-production-commune.ts`).
 * 2. **Rôle** : à chaque nouvelle connexion physique du pool, avant toute requête, `session_user` et `current_user`
 *    doivent être le rôle attendu (`vadrouille_app`, `vadrouille_auth` ou `vadrouille_prototype`), et ce rôle ne doit avoir ni `SUPERUSER`
 *    ni `BYPASSRLS`. Sinon le pool refuse définitivement de servir (une erreur transitoire du contrôle, elle, ne rend
 *    pas le refus définitif). C'est ce qui rend vraie la règle de 0029 (« l'application ne lit jamais ces
 *    identifiants » d'administration) même si une variable est mal posée.
 * Aucun message d'erreur ne contient la chaîne de connexion, l'hôte ni un mot de passe : une erreur de `pg` à
 * l'ouverture ou pendant le contrôle est remplacée par une `DatabaseConnectionError` qui n'en garde que le code, et
 * l'erreur d'une connexion inactive (évènement `error` du pool) n'est journalisée que par son code. Les refus de rôle
 * ne nomment que le rôle attendu, jamais le rôle reçu.
 */

export type AppDatabaseRole = "vadrouille_app" | "vadrouille_auth" | "vadrouille_prototype";

/**
 * Variables de connexion (décision 0036, B1-TL-3) : des noms que l'intégration Neon de Vercel ne pose jamais (elle
 * injecte `DATABASE_URL` avec l'identifiant propriétaire). `DATABASE_URL` n'est jamais lue. `P0_DATABASE_URL` :
 * rôle `vadrouille_prototype`, posée sur la seule préversion de `p0-reel` (0046 S5, après 0052).
 */
export const DATABASE_URL_VARIABLES = {
  vadrouille_app: "VADROUILLE_DATABASE_URL",
  vadrouille_auth: "VADROUILLE_DATABASE_URL_AUTH",
  vadrouille_prototype: "P0_DATABASE_URL",
} as const satisfies Record<AppDatabaseRole, string>;

/** Réservée à l'environnement des migrations (décision 0006) : jamais lue par l'application. */
export const MIGRATOR_URL_VARIABLE = "VADROUILLE_DATABASE_URL_MIGRATOR";

type Env = Readonly<Record<string, string | undefined>>;

export class DatabaseGuardError extends Error {
  override name = "DatabaseGuardError";
}

/**
 * Échec transitoire d'ouverture ou de contrôle d'une connexion (réseau, délai, authentification). Le message de `pg`
 * peut nommer l'hôte et le port : il n'est pas repris. Seul son code (`ECONNREFUSED`, code SQLSTATE…) est gardé, sans
 * `cause`, pour qu'aucun journal ne reçoive l'adresse.
 */
export class DatabaseConnectionError extends Error {
  override name = "DatabaseConnectionError";
  readonly code: string;

  constructor(code: string) {
    super(`Connexion à la base impossible (code ${code}) : erreur d'ouverture ou de contrôle, la demande suivante réessaie.`);
    this.code = code;
  }
}

/** Erreur de `pg` réduite à son code : `DatabaseGuardError` passe telle quelle, tout le reste est emballé. */
export function sanitizeConnectionError(error: unknown): DatabaseGuardError | DatabaseConnectionError {
  if (error instanceof DatabaseGuardError || error instanceof DatabaseConnectionError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  return new DatabaseConnectionError(typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "inconnu");
}

/**
 * Vrai si `resolveServerEnvironment` (`src/server/env/resolve.ts`, seul calcul de l'environnement du serveur ;
 * spécification B3, B3a point 1 et critère A13) rend `production` : `production` dans l'une des deux variables, après
 * `trim().toLowerCase()`, ou une valeur inconnue (ce qui ne peut que fermer davantage).
 *
 * **Aucune variable déclarée → faux** (figé, décision 0050, mineur 15) : les scripts locaux de B1 (`pnpm db:migrate`,
 * `pnpm test:db`) ne déclarent pas d'environnement, et la garde de production ne peut pas lire un environnement que
 * rien ne déclare ; le serveur, lui, refuse de démarrer sans environnement déclaré (`register()`, `src/instrumentation.ts`).
 */
function production(resoudre: () => string): boolean {
  try {
    return resoudre() === "production";
  } catch {
    return false;
  }
}

/**
 * Vrai pour un déploiement de production, quel que soit l'hébergeur (décisions 0017 § 11.0 et 0034) : liste de refus,
 * appliquée à l'environnement injecté **et** au vrai `process.env` (0046 D21 : l'environnement injecté ne peut que
 * resserrer).
 */
export function isProductionForDatabase(env: Env): boolean {
  return production(() => resolveServerEnvironment(env)) || production(() => resolveServerEnvironment(process.env));
}

const ENVIRONNEMENTS_PROTOTYPE: readonly string[] = ["preview", "development"];

/** Liste d'autorisation de la barrière `egress` (0046 D21, verdict Sécurité), recopiée ici : `db/` n'importe de `src/` que `resolve.ts`. */
const deploiementAdmis = (vercelEnv: string | undefined, cible: string | undefined, vadrouilleEnv: string | undefined): boolean =>
  vercelEnv !== undefined &&
  ENVIRONNEMENTS_PROTOTYPE.includes(vercelEnv) &&
  (cible === undefined || cible === vercelEnv) &&
  (vadrouilleEnv === undefined || vadrouilleEnv.normalize("NFKC").trim().toLowerCase() !== "production");

/**
 * Vrai si une connexion `vadrouille_prototype` est admise : liste d'autorisation vérifiée sur l'environnement injecté
 * **et** sur le vrai `process.env` (0046 D21). Sans `VERCEL_ENV` (CI, poste, runner) : refusée.
 */
export function prototypeDatabaseAllowed(env: Env): boolean {
  return (
    deploiementAdmis(env.VERCEL_ENV, env.VERCEL_TARGET_ENV, env.VADROUILLE_ENV) &&
    deploiementAdmis(process.env.VERCEL_ENV, process.env.VERCEL_TARGET_ENV, process.env.VADROUILLE_ENV)
  );
}

/** Refus de toute connexion en production (décision 0034). À appeler avant de lire une variable de connexion. */
export function assertDatabaseAllowed(env: Env): void {
  if (isProductionForDatabase(env)) {
    throw new DatabaseGuardError(
      "Connexion à la base refusée : déploiement de production (décision 0034, aucune connexion avant la passe de sécurité de la mise en public).",
    );
  }
}

/**
 * Lit la variable de connexion d'un rôle, après la garde de production (et, pour `vadrouille_prototype`, après la
 * liste d'autorisation de D21).
 */
export function connectionStringFor(role: AppDatabaseRole, env: Env): string {
  assertDatabaseAllowed(env);
  if (role === "vadrouille_prototype" && !prototypeDatabaseAllowed(env)) {
    throw new DatabaseGuardError(
      "Connexion à la base refusée : le rôle « vadrouille_prototype » n'est admis que sur une préversion ou en développement (décision 0046, D21).",
    );
  }
  const name = DATABASE_URL_VARIABLES[role];
  // Lecture par propriété littérale (spécification P0c, section 5, forme 1) : seul module, avec `db/migrate.ts`, où
  // un nom secret de la base peut être lu (lignes de `tests/unit/confinement/listes/process.ts`).
  const value =
    role === "vadrouille_app" ? env.VADROUILLE_DATABASE_URL : role === "vadrouille_auth" ? env.VADROUILLE_DATABASE_URL_AUTH : env.P0_DATABASE_URL;
  if (value === undefined || value.trim() === "") {
    throw new DatabaseGuardError(`Connexion à la base impossible : la variable ${name} n'est pas posée.`);
  }
  return value;
}

type RoleRow = { current_user: string; session_user: string; rolsuper: boolean; rolbypassrls: boolean };

/**
 * Contrôle d'une connexion ouverte : `session_user` (le rôle authentifié) et `current_user` sont tous deux le rôle
 * attendu, et ce rôle n'a ni SUPERUSER ni BYPASSRLS. Comparer `current_user` seul ne suffit pas : une connexion
 * superutilisateur ouverte avec `options=-c role=vadrouille_app` (ou suivie d'un `SET ROLE`) aurait le bon
 * `current_user`, passerait la garde, puis pourrait revenir à son rôle de session par `RESET ROLE`.
 */
export async function verifyConnectionRole(
  client: { query: (sql: string) => Promise<{ rows: unknown[] }> },
  expectedRole: string,
): Promise<void> {
  const { rows } = await client.query(
    "SELECT current_user::text AS current_user, session_user::text AS session_user, r.rolsuper, r.rolbypassrls FROM pg_catalog.pg_roles AS r WHERE r.rolname = session_user",
  );
  const row = rows[0] as RoleRow | undefined;
  if (!row) {
    throw new DatabaseGuardError("Connexion à la base refusée : rôle de connexion introuvable.");
  }
  // Les messages ne nomment que le rôle attendu : le rôle reçu (un compte d'administration mal posé, par exemple)
  // n'entre jamais dans un journal.
  if (row.session_user !== expectedRole) {
    throw new DatabaseGuardError(
      `Connexion à la base refusée : le rôle de session n'est pas « ${expectedRole} » (spécification B1, garde de connexion).`,
    );
  }
  if (row.current_user !== expectedRole) {
    throw new DatabaseGuardError(
      `Connexion à la base refusée : le rôle courant n'est pas « ${expectedRole} » (spécification B1, garde de connexion).`,
    );
  }
  if (row.rolsuper || row.rolbypassrls) {
    throw new DatabaseGuardError(
      `Connexion à la base refusée : le rôle « ${expectedRole} » a SUPERUSER ou BYPASSRLS (décision 0007).`,
    );
  }
}

type ConnectCallback = ((err: Error) => void) | ((err: null, c: pg.Client) => void);
type LooseConnectCallback = (err: Error | null, c?: pg.Client) => void;

/** Message journalisé quand une connexion inactive du pool tombe : code seul, ni hôte ni mot de passe. */
export function idleConnectionErrorMessage(error: unknown): string {
  const sanitized = sanitizeConnectionError(error);
  const code = sanitized instanceof DatabaseConnectionError ? sanitized.code : "garde";
  return `Connexion inactive à la base perdue (code ${code}) : le pool la retire, la demande suivante en ouvre une autre.`;
}

/**
 * Pool dont chaque connexion physique est contrôlée avant de servir. Après un premier refus de fond
 * (`DatabaseGuardError` : mauvais rôle, attribut d'administration), le pool refuse toute nouvelle demande, même si
 * la connexion suivante passerait (une variable mal posée ne se « répare » pas en cours d'exécution). Une erreur
 * transitoire de l'ouverture ou du contrôle (réseau, délai) ferme la connexion et remonte comme
 * `DatabaseConnectionError` (code seul, ni hôte ni mot de passe), sans rendre le refus définitif : la demande
 * suivante refait le contrôle.
 *
 * Une erreur d'authentification à l'ouverture (`28P01`, `28000`, `42501`…) reste transitoire, à dessein : elle ne
 * révèle pas un rôle d'administration (le contrôle n'a pas eu lieu) et peut venir d'une rotation de mot de passe en
 * cours ; la rendre définitive obligerait à redémarrer le processus après la rotation. Elle remonte comme les autres,
 * code seul.
 *
 * Le pool a un écouteur `error` : `pg` émet cet évènement quand une connexion inactive tombe (suspension ou
 * redémarrage du calcul Neon). Sans écouteur, Node lèverait une exception non interceptée et le processus tomberait ;
 * avec lui, la connexion est retirée par `pg`, et seul le code de l'erreur est journalisé
 * (`idleConnectionErrorMessage`), jamais son message d'origine, qui peut nommer l'hôte.
 */
export function createGuardedPool(role: AppDatabaseRole, env: Env, options: Omit<pg.PoolConfig, "connectionString" | "Client"> = {}): pg.Pool {
  const connectionString = connectionStringFor(role, env);
  let refusal: DatabaseGuardError | undefined;

  class GuardedClient extends pg.Client {
    override connect(): Promise<pg.Client>;
    override connect(callback: ConnectCallback): void;
    override connect(callback?: ConnectCallback): Promise<pg.Client> | void {
      const ready = (async () => {
        if (refusal) throw refusal;
        try {
          await super.connect();
        } catch (error) {
          throw sanitizeConnectionError(error);
        }
        try {
          await verifyConnectionRole(this, role);
        } catch (error) {
          if (error instanceof DatabaseGuardError) refusal = error;
          await this.end().catch(() => undefined);
          throw sanitizeConnectionError(error);
        }
        return this;
      })();
      if (callback) {
        const done = callback as LooseConnectCallback;
        ready.then((client) => done(null, client), (error: Error) => done(error));
        return;
      }
      return ready;
    }
  }

  const pool = new pg.Pool({ ...options, connectionString, Client: GuardedClient });
  pool.on("error", (error) => {
    console.warn(idleConnectionErrorMessage(error));
  });
  return pool;
}
