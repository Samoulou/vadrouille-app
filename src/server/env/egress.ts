import "server-only";

/**
 * Barrière de sortie des clients réels (spécification `specs/P0-suite-executions-reelles.md`, « Modules
 * d'environnement étroits » ; décisions 0031 et 0034). Lit **seulement** les variables de déploiement, de proxy et de
 * TLS nommées ci-dessous, et `process.execArgv` ; ne rend **jamais** leur valeur : `{ ok: true }` ou un seul code
 * fermé, contrôlés dans cet ordre (le premier refus l'emporte) :
 * 1. `production_refused` : liste d'autorisation de `VERCEL_ENV` (`preview` ou `development`, comparaison exacte),
 *    `VERCEL_TARGET_ENV` égale si présente (même vide), `VADROUILLE_ENV` différente de `production` (comparaison
 *    normalisée : casse, espaces, NFKC) ;
 * 2. `proxy_env_refused` : une variable de proxy posée (majuscules ou minuscules) ou `--use-env-proxy` ;
 * 3. `tls_env_refused` : une variable de TLS affaibli posée ou une option TLS interdite de Node ; seule exception,
 *    étroite : `NODE_EXTRA_CA_CERTS` égale au fichier d'autorités du runtime de Vercel (décision 0058, ci-dessous).
 * Diagnostic facultatif (décision 0058, ticket 319) : un rappel reçoit le **nom** de la variable ou de l'option en
 * cause (liste fermée `CAUSES_SORTIE`) et la marque de l'exception appliquée ; jamais une valeur.
 *
 * Variable « posée » : présente avec une valeur non vide, sans retrait d'espaces. `NO_PROXY` n'a aucun effet.
 * Lecture paresseuse, à l'appel ; l'environnement est un paramètre (par défaut `process.env`) que les tests injectent.
 * **L'environnement injecté ne peut que resserrer** (décision 0046, D21) : `VERCEL_ENV`, `VERCEL_TARGET_ENV` et
 * `VADROUILLE_ENV` sont aussi lues dans le vrai `process.env`, et `production_refused` est rendu si l'un **ou** l'autre
 * environnement ne passe pas la liste d'autorisation. La table de cas est commune avec la garde de connexion
 * `vadrouille_prototype` de `db/connection.ts` (`tests/support/cas-production-commune.ts`).
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
 *
 * **Formes `--no-…`** (bloquant 3 de la revue du head `335d925`, renvoyé à P0r2 par 0049 T) : Node accepte la forme
 * niée d'une option booléenne (`--no-use-openssl-ca`, `--no_use_env_proxy`), et les options de V8 acceptent aussi
 * `--no` suivi de `_` ou d'une autre graphie. Le sens exact d'une forme niée dépend de l'option et de la version de
 * Node : la barrière ne l'interprète pas et **échoue fermée**. Une forme `--no-X` (préfixes `--no-` répétés compris)
 * ajoute aussi `--X` à l'ensemble : une option interdite reste refusée sous sa forme niée.
 */
export function optionsDeNode(nodeOptions: string | undefined, execArgv: readonly string[]): ReadonlySet<string> {
  const jetons = [...(nodeOptions ?? "").split(/\s+/), ...execArgv];
  const options = new Set<string>();
  for (const brut of jetons) {
    const jeton = brut.replace(/^["']+|["']+$/g, "");
    if (!jeton.startsWith("--")) continue;
    const nom = `--${(jeton.split("=")[0] ?? "").slice(2).replaceAll("_", "-")}`;
    options.add(nom);
    let base = nom;
    while (base.startsWith("--no-")) {
      base = `--${base.slice("--no-".length)}`;
      options.add(base);
    }
  }
  return options;
}

/** Valeurs lues, jamais rendues : seulement comparées. Les noms des variables sont les clés des objets. */
type Lecture = {
  readonly vercelEnv: string | undefined;
  readonly cible: string | undefined;
  readonly vadrouilleEnv: string | undefined;
  readonly vercel: string | undefined;
  readonly proxy: Readonly<Record<string, string | undefined>>;
  readonly tls: Readonly<Record<string, string | undefined>>;
  readonly options: ReadonlySet<string>;
};

/** Variables de déploiement d'un environnement : la liste d'autorisation porte sur elles seules. */
type Deploiement = Pick<Lecture, "vercelEnv" | "cible" | "vadrouilleEnv">;

function productionRefusee(lu: Deploiement): boolean {
  if (lu.vercelEnv === undefined || !ENVIRONNEMENTS_ADMIS.includes(lu.vercelEnv)) return true;
  if (lu.cible !== undefined && lu.cible !== lu.vercelEnv) return true;
  return lu.vadrouilleEnv !== undefined && normaliserEnv(lu.vadrouilleEnv) === "production";
}

/**
 * Variables de déploiement du **vrai** `process.env` (0046 D21), lues par propriété littérale à chaque appel, quel que
 * soit l'`env` reçu : un appelant qui passerait `{ ...process.env, VERCEL_ENV: "preview" }` sur un déploiement de
 * production est refusé.
 */
const deploiementReel = (): Deploiement & Pick<Lecture, "vercel"> => ({
  vercelEnv: process.env.VERCEL_ENV,
  cible: process.env.VERCEL_TARGET_ENV,
  vadrouilleEnv: process.env.VADROUILLE_ENV,
  vercel: process.env.VERCEL,
});

/**
 * `VADROUILLE_ENV` est une liste de **refus** (0046 D21) : la comparaison est donc normalisée (NFKC, espaces retirés,
 * casse ignorée), pour que `Production`, ` production` ou `PRODUCTION\n` soient refusés comme `production` (mineur de
 * la revue du head `353bb20`). `VERCEL_ENV` reste une liste d'autorisation à comparaison exacte.
 */
const normaliserEnv = (valeur: string) => valeur.normalize("NFKC").trim().toLowerCase();

/**
 * Exception étroite de la décision 0058 (ticket 319) : `NODE_EXTRA_CA_CERTS` **exactement** égale au fichier des
 * autorités d'Amazon du runtime Node de Lambda, sur lequel reposent les fonctions de Vercel (documentation AWS,
 * « CA certificate loading »). Ce fichier n'**ajoute** que des autorités d'Amazon, qui exécute déjà la fonction ; il
 * est dans l'arborescence du runtime, que la fonction ne peut pas écrire. Admise seulement si `VERCEL` vaut `1` et
 * `VERCEL_ENV` vaut `preview`, dans l'environnement lu **et** dans le vrai `process.env` (D21 : l'environnement injecté
 * ne peut que resserrer). Comparaison exacte, sans `trim()` ni normalisation ; toute autre valeur reste refusée, et
 * aucune autre variable ni option TLS n'a d'exception.
 */
export const CHEMIN_CA_RUNTIME_VERCEL = "/var/runtime/ca-cert.pem";

function exceptionCaRuntime(lu: Lecture): boolean {
  const reel = deploiementReel();
  return (
    lu.tls.NODE_EXTRA_CA_CERTS === CHEMIN_CA_RUNTIME_VERCEL &&
    lu.vercel === "1" &&
    lu.vercelEnv === "preview" &&
    reel.vercel === "1" &&
    reel.vercelEnv === "preview"
  );
}

/** Premier nom posé d'une famille de variables (clé de la lecture), jamais sa valeur. */
const premierePosee = (famille: Readonly<Record<string, string | undefined>>, ignorer?: string): string | undefined =>
  Object.entries(famille).find(([nom, valeur]) => nom !== ignorer && posee(valeur))?.[0];

const causeProxy = (lu: Lecture): string | undefined =>
  premierePosee(lu.proxy) ?? OPTIONS_PROXY.find((option) => lu.options.has(option));
const causeTls = (lu: Lecture, exception: boolean): string | undefined =>
  premierePosee(lu.tls, exception ? "NODE_EXTRA_CA_CERTS" : undefined) ?? OPTIONS_TLS.find((option) => lu.options.has(option));

/** Marque de l'exception étroite de 0058, quand elle a été appliquée. */
export const EXCEPTION_CA_RUNTIME = "vercel_runtime_ca";

/**
 * Diagnostic de la barrière (décision 0058) : `cause`, nom de la première variable ou option de proxy ou de TLS en
 * cause (liste fermée `CAUSES_SORTIE`) ; `exception`, marque de l'exception étroite appliquée. Jamais une valeur.
 */
export type DiagnosticSortie = { readonly cause?: string; readonly exception?: typeof EXCEPTION_CA_RUNTIME };

/**
 * Noms qu'un diagnostic peut rendre (liste fermée) : variables de proxy et de TLS lues par `verifierSortie`, options
 * interdites de Node. Le test de ce module vérifie que chaque nom posé seul est rendu tel quel ; le journal
 * (`src/server/log.ts`, champ `cause`) en tient une copie, dont l'égalité est vérifiée par le test de la garde.
 */
export const CAUSES_SORTIE: readonly string[] = [
  ...Object.keys({
    HTTP_PROXY: 0,
    http_proxy: 0,
    HTTPS_PROXY: 0,
    https_proxy: 0,
    ALL_PROXY: 0,
    all_proxy: 0,
    NODE_USE_ENV_PROXY: 0,
    node_use_env_proxy: 0,
  }),
  ...OPTIONS_PROXY,
  ...Object.keys({
    NODE_TLS_REJECT_UNAUTHORIZED: 0,
    NODE_EXTRA_CA_CERTS: 0,
    SSL_CERT_FILE: 0,
    SSL_CERT_DIR: 0,
    OPENSSL_CONF: 0,
    SSLKEYLOGFILE: 0,
  }),
  ...OPTIONS_TLS,
];

/**
 * Contrôle de sortie, à appeler avant toute lecture de clé et toute connexion. `diagnostic` (facultatif, décision
 * 0058) reçoit, hors refus de production, le nom de la cause et la marque de l'exception : rien d'autre.
 */
export function verifierSortie(
  env: EnvSortie = process.env,
  execArgv: readonly string[] = process.execArgv,
  diagnostic?: (resultat: DiagnosticSortie) => void,
): ResultatSortie {
  const lu: Lecture = {
    vercelEnv: env.VERCEL_ENV,
    cible: env.VERCEL_TARGET_ENV,
    vadrouilleEnv: env.VADROUILLE_ENV,
    vercel: env.VERCEL,
    proxy: {
      HTTP_PROXY: env.HTTP_PROXY,
      http_proxy: env.http_proxy,
      HTTPS_PROXY: env.HTTPS_PROXY,
      https_proxy: env.https_proxy,
      ALL_PROXY: env.ALL_PROXY,
      all_proxy: env.all_proxy,
      NODE_USE_ENV_PROXY: env.NODE_USE_ENV_PROXY,
      node_use_env_proxy: env.node_use_env_proxy,
    },
    tls: {
      NODE_TLS_REJECT_UNAUTHORIZED: env.NODE_TLS_REJECT_UNAUTHORIZED,
      NODE_EXTRA_CA_CERTS: env.NODE_EXTRA_CA_CERTS,
      SSL_CERT_FILE: env.SSL_CERT_FILE,
      SSL_CERT_DIR: env.SSL_CERT_DIR,
      OPENSSL_CONF: env.OPENSSL_CONF,
      SSLKEYLOGFILE: env.SSLKEYLOGFILE,
    },
    options: optionsDeNode(env.NODE_OPTIONS, execArgv),
  };
  if (productionRefusee(lu) || productionRefusee(deploiementReel())) return { ok: false, code: "production_refused" };
  const exception = exceptionCaRuntime(lu);
  const proxy = causeProxy(lu);
  const tls = causeTls(lu, exception);
  const cause = proxy ?? tls;
  diagnostic?.({ ...(cause === undefined ? {} : { cause }), ...(exception ? { exception: EXCEPTION_CA_RUNTIME } : {}) });
  if (proxy !== undefined) return { ok: false, code: "proxy_env_refused" };
  if (tls !== undefined) return { ok: false, code: "tls_env_refused" };
  return { ok: true };
}
