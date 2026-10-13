import "server-only";

/**
 * Barrière de sortie des clients réels (spécification `specs/P0-suite-executions-reelles.md`, « Modules
 * d'environnement étroits » ; décisions 0031 et 0034). Lit **seulement** les variables de déploiement, de proxy et de
 * TLS nommées ci-dessous, et `process.execArgv` ; ne rend **jamais** leur valeur : `{ ok: true }` ou un seul code
 * fermé, contrôlés dans cet ordre (le premier refus l'emporte) :
 * 1. `production_refused` : liste d'autorisation de `VERCEL_ENV` (`preview` ou `development`, comparaison exacte),
 *    `VERCEL_TARGET_ENV` égale si présente (même vide), `VADROUILLE_ENV` différente de `production` ;
 * 2. `proxy_env_refused` : une variable de proxy posée (majuscules ou minuscules) ou `--use-env-proxy` ;
 * 3. `tls_env_refused` : une variable de TLS affaibli posée ou une option TLS interdite de Node.
 *
 * Variable « posée » : présente avec une valeur non vide, sans retrait d'espaces. `NO_PROXY` n'a aucun effet.
 * Lecture paresseuse, à l'appel ; l'environnement est un paramètre (par défaut `process.env`) que les tests injectent.
 * Module pur : aucun import hors de `server-only`.
 */

export const CODES_REFUS_SORTIE = ["production_refused", "proxy_env_refused", "tls_env_refused"] as const;
export type CodeRefusSortie = (typeof CODES_REFUS_SORTIE)[number];

/**
 * Code fermé « clé absente ou vide » des modules étroits `ai.ts` et `grounding.ts` et des clients réels. Écrit une
 * seule fois ici : son texte finit comme un nom secret (régime de confinement, section 5), d'où une seule ligne.
 */
export const CODE_CLE_ABSENTE = "missing_key";
export type CodeCleAbsente = typeof CODE_CLE_ABSENTE;

export type ResultatSortie = { readonly ok: true } | { readonly ok: false; readonly code: CodeRefusSortie };

/** Environnement lu : sous-ensemble en lecture seule de `process.env`. */
export type EnvSortie = Readonly<Record<string, string | undefined>>;

const ENVIRONNEMENTS_ADMIS: readonly string[] = ["preview", "development"];

/** Options de Node qui font passer la sortie par un proxy d'environnement. */
export const OPTIONS_PROXY: readonly string[] = ["--use-env-proxy"];

/** Options de Node qui affaiblissent TLS ou exposent les clés de session (avec ou sans `=valeur`). */
export const OPTIONS_TLS: readonly string[] = [
  "--use-openssl-ca",
  "--use-system-ca",
  "--openssl-config",
  "--openssl-legacy-provider",
  "--openssl-shared-config",
  "--tls-keylog",
  "--tls-min-v1.0",
  "--tls-min-v1.1",
  "--tls-cipher-list",
  "--insecure-http-parser",
];

const posee = (valeur: string | undefined) => valeur !== undefined && valeur !== "";

/**
 * Options présentes dans `NODE_OPTIONS` et `execArgv`, sous leur nom seul (partie avant `=`), guillemets retirés et
 * `_` remplacé par `-` (Node accepte les deux graphies). La comparaison porte sur l'option entière, jamais sur une
 * sous-chaîne.
 */
export function optionsDeNode(nodeOptions: string | undefined, execArgv: readonly string[]): ReadonlySet<string> {
  const jetons = [...(nodeOptions ?? "").split(/\s+/), ...execArgv];
  const options = new Set<string>();
  for (const brut of jetons) {
    const jeton = brut.replace(/^["']+|["']+$/g, "");
    if (!jeton.startsWith("--")) continue;
    const nom = jeton.split("=")[0] ?? "";
    options.add(`--${nom.slice(2).replaceAll("_", "-")}`);
  }
  return options;
}

/** Valeurs lues, jamais rendues : seulement comparées. */
type Lecture = {
  readonly vercelEnv: string | undefined;
  readonly cible: string | undefined;
  readonly vadrouilleEnv: string | undefined;
  readonly proxy: readonly (string | undefined)[];
  readonly tls: readonly (string | undefined)[];
  readonly options: ReadonlySet<string>;
};

function productionRefusee(lu: Lecture): boolean {
  if (lu.vercelEnv === undefined || !ENVIRONNEMENTS_ADMIS.includes(lu.vercelEnv)) return true;
  if (lu.cible !== undefined && lu.cible !== lu.vercelEnv) return true;
  return lu.vadrouilleEnv === "production";
}

const proxyPose = (lu: Lecture) => lu.proxy.some(posee) || OPTIONS_PROXY.some((option) => lu.options.has(option));
const tlsAffaibli = (lu: Lecture) => lu.tls.some(posee) || OPTIONS_TLS.some((option) => lu.options.has(option));

/** Contrôle de sortie, à appeler avant toute lecture de clé et toute connexion. */
export function verifierSortie(env: EnvSortie = process.env, execArgv: readonly string[] = process.execArgv): ResultatSortie {
  const lu: Lecture = {
    vercelEnv: env.VERCEL_ENV,
    cible: env.VERCEL_TARGET_ENV,
    vadrouilleEnv: env.VADROUILLE_ENV,
    proxy: [
      env.HTTP_PROXY,
      env.http_proxy,
      env.HTTPS_PROXY,
      env.https_proxy,
      env.ALL_PROXY,
      env.all_proxy,
      env.NODE_USE_ENV_PROXY,
      env.node_use_env_proxy,
    ],
    tls: [env.NODE_TLS_REJECT_UNAUTHORIZED, env.NODE_EXTRA_CA_CERTS, env.SSL_CERT_FILE, env.SSL_CERT_DIR, env.OPENSSL_CONF, env.SSLKEYLOGFILE],
    options: optionsDeNode(env.NODE_OPTIONS, execArgv),
  };
  if (productionRefusee(lu)) return { ok: false, code: "production_refused" };
  if (proxyPose(lu)) return { ok: false, code: "proxy_env_refused" };
  if (tlsAffaibli(lu)) return { ok: false, code: "tls_env_refused" };
  return { ok: true };
}
