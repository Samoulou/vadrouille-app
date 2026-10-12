import "server-only";

import pg from "pg";

/**
 * Seul point d'entrée des connexions applicatives à la base (spécification B1, « Garde de connexion » ;
 * décision B1-PO-6). Deux gardes, testées :
 * 1. **Production** (décision 0034, « Garde préalable à toute fusion ») : `main` est déployé automatiquement sur une
 *    adresse publique ; tant que la mise en public n'a pas eu sa passe de sécurité, aucune connexion n'est ouverte
 *    quand `VERCEL_ENV` ou `VADROUILLE_ENV` vaut `production` (comparaison après `trim().toLowerCase()`).
 * 2. **Rôle** : à chaque nouvelle connexion physique du pool, avant toute requête, `session_user` et `current_user`
 *    doivent être le rôle attendu (`vadrouille_app` ou `vadrouille_auth`), et ce rôle ne doit avoir ni `SUPERUSER`
 *    ni `BYPASSRLS`. Sinon le pool refuse définitivement de servir (une erreur transitoire du contrôle, elle, ne rend
 *    pas le refus définitif). C'est ce qui rend vraie la règle de 0029 (« l'application ne lit jamais ces
 *    identifiants » d'administration) même si une variable est mal posée.
 * Aucun message d'erreur ne contient la chaîne de connexion ni un mot de passe.
 */

export type AppDatabaseRole = "vadrouille_app" | "vadrouille_auth";

/**
 * Variables de connexion (proposition B1-TL-3, en attente du Tech Lead) : des noms que l'intégration Neon de Vercel
 * ne peut pas poser (elle injecte `DATABASE_URL` avec l'identifiant propriétaire). `DATABASE_URL` n'est jamais lue.
 */
export const DATABASE_URL_VARIABLES = {
  vadrouille_app: "VADROUILLE_DATABASE_URL",
  vadrouille_auth: "VADROUILLE_DATABASE_URL_AUTH",
} as const satisfies Record<AppDatabaseRole, string>;

/** Réservée à l'environnement des migrations (décision 0006) : jamais lue par l'application. */
export const MIGRATOR_URL_VARIABLE = "VADROUILLE_DATABASE_URL_MIGRATOR";

type Env = Readonly<Record<string, string | undefined>>;

export class DatabaseGuardError extends Error {
  override name = "DatabaseGuardError";
}

/** Vrai pour un déploiement de production, quel que soit l'hébergeur (décisions 0017 § 11.0 et 0034). */
export function isProductionForDatabase(env: Env): boolean {
  return [env.VERCEL_ENV, env.VADROUILLE_ENV].some((value) => value?.trim().toLowerCase() === "production");
}

/** Refus de toute connexion en production (décision 0034). À appeler avant de lire une variable de connexion. */
export function assertDatabaseAllowed(env: Env): void {
  if (isProductionForDatabase(env)) {
    throw new DatabaseGuardError(
      "Connexion à la base refusée : déploiement de production (décision 0034, aucune connexion avant la passe de sécurité de la mise en public).",
    );
  }
}

/** Lit la variable de connexion d'un rôle, après la garde de production. */
export function connectionStringFor(role: AppDatabaseRole, env: Env): string {
  assertDatabaseAllowed(env);
  const name = DATABASE_URL_VARIABLES[role];
  const value = env[name];
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
  if (row.session_user !== expectedRole || row.current_user !== expectedRole) {
    const received = row.session_user === row.current_user ? row.session_user : `${row.session_user} (rôle courant ${row.current_user})`;
    throw new DatabaseGuardError(
      `Connexion à la base refusée : rôle « ${received} » au lieu de « ${expectedRole} » (spécification B1, garde de connexion).`,
    );
  }
  if (row.rolsuper || row.rolbypassrls) {
    throw new DatabaseGuardError(
      `Connexion à la base refusée : le rôle « ${row.session_user} » a SUPERUSER ou BYPASSRLS (décision 0007).`,
    );
  }
}

type ConnectCallback = ((err: Error) => void) | ((err: null, c: pg.Client) => void);
type LooseConnectCallback = (err: Error | null, c?: pg.Client) => void;

/**
 * Pool dont chaque connexion physique est contrôlée avant de servir. Après un premier refus de fond
 * (`DatabaseGuardError` : mauvais rôle, attribut d'administration), le pool refuse toute nouvelle demande, même si
 * la connexion suivante passerait (une variable mal posée ne se « répare » pas en cours d'exécution). Une erreur
 * transitoire du contrôle (réseau, délai) ferme la connexion et remonte telle quelle, sans rendre le refus
 * définitif : la demande suivante refait le contrôle.
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
        await super.connect();
        try {
          await verifyConnectionRole(this, role);
        } catch (error) {
          if (error instanceof DatabaseGuardError) refusal = error;
          await this.end().catch(() => undefined);
          throw error;
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

  return new pg.Pool({ ...options, connectionString, Client: GuardedClient });
}
