/**
 * Environnement du serveur (amendement de 0017 § 11.0 écrit dans 0006 ; décision 0050, B3-TL-1 point 2 ;
 * spécification B3, B3a point 1). **Seul calcul de l'environnement** du serveur : `src/server/env/index.ts` et
 * `db/connection.ts` (garde de production de 0034) le réutilisent.
 *
 * Module **autonome** : aucun import (ni `zod`, ni `@/…`, ni module de Node, ni `server-only`), parce qu'il est chargé
 * sous Node nu par `pnpm db:migrate` (`db/migrate.ts` → `db/connection.ts` → `../src/server/env/resolve.ts`), où ni
 * l'alias `@/` ni un chemin sans extension ne se résolvent (0050, correction 3). Exception nominative à
 * `ligne/require-server-only` (`eslint.config.mjs`) : il ne lit et ne rend aucun secret.
 */

export type ServerEnvironment = "local" | "ci" | "staging" | "production";

type Env = Readonly<Record<string, string | undefined>>;

/** Erreur levée quand aucune des deux variables n'est déclarée : son message ne porte aucune valeur reçue. */
export class ServerEnvironmentUndeclaredError extends Error {
  override name = "ServerEnvironmentUndeclaredError";

  constructor() {
    super("Environnement du serveur non déclaré : ni VADROUILLE_ENV ni VERCEL_ENV (règle 5 de l'amendement de 0017 § 11.0).");
  }
}

/** Valeurs connues et leur environnement ; toute autre valeur donne `production` (règle 2). */
const CONNUES: ReadonlyMap<string, ServerEnvironment> = new Map([
  ["local", "local"],
  ["development", "local"],
  ["ci", "ci"],
  ["staging", "staging"],
  ["preview", "staging"],
  ["production", "production"],
]);

/** Rang de restriction (règle 3) : `production` > `staging` = `preview` > `ci` > `local` = `development`. */
const ORDRE: readonly ServerEnvironment[] = ["local", "ci", "staging", "production"];

/** Valeur normalisée (`trim().toLowerCase()`), ou `undefined` si absente, vide ou faite d'espaces. */
function declaree(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalisee = value.trim().toLowerCase();
  return normalisee === "" ? undefined : normalisee;
}

/**
 * Règles 1 à 5 : `production` si l'une des deux vaut `production` ou une valeur inconnue ; sinon la plus restrictive
 * des deux ; une seule déclarée : elle (`preview` → `staging`, `development` → `local`) ; aucune : erreur.
 * Fonction pure : ne lit que l'objet reçu.
 */
export function resolveServerEnvironment(env: Env): ServerEnvironment {
  const valeurs = [declaree(env.VADROUILLE_ENV), declaree(env.VERCEL_ENV)].filter((value): value is string => value !== undefined);
  if (valeurs.length === 0) throw new ServerEnvironmentUndeclaredError();
  let resultat: ServerEnvironment = "local";
  for (const valeur of valeurs) {
    // `Map` et non un objet : `constructor` ou `__proto__` ne doivent pas passer pour une valeur connue.
    const environnement = CONNUES.get(valeur) ?? "production";
    if (ORDRE.indexOf(environnement) > ORDRE.indexOf(resultat)) resultat = environnement;
  }
  return resultat;
}
