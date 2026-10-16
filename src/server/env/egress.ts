import "server-only";

import type { CodeRefusSortie } from "@/ai/erreurs";

import {
  DIRECTIVES_OPENSSL_CONF,
  examinerOpensslConf,
  FS_OPENSSL_REEL,
  nomSectionOpensslAdmis,
  VERDICTS_OPENSSL_CONF,
  ZONES_OPENSSL_CONF,
  zoneOpensslConf,
  type SystemeFichiersOpenssl,
  type VerdictOpensslConf,
  type ZoneOpensslConf,
} from "./openssl-conf";

/**
 * Barrière de sortie des clients réels (spécification `specs/P0-suite-executions-reelles.md`, « Modules
 * d'environnement étroits » ; décisions 0031 et 0034). Lit **seulement** les variables de déploiement, de proxy et de
 * TLS nommées ci-dessous, `process.execArgv` et, pour 0062, `process.config` ; ne rend **jamais** leur valeur : `{ ok: true }` ou un seul code
 * fermé, contrôlés dans cet ordre (le premier refus l'emporte) :
 * 1. `production_refused` : liste d'autorisation de `VERCEL_ENV` (`preview` ou `development`, comparaison exacte),
 *    `VERCEL_TARGET_ENV` égale si présente (même vide), `VADROUILLE_ENV` différente de `production` (comparaison
 *    normalisée : casse, espaces, NFKC) ;
 * 2. `proxy_env_refused` : une variable de proxy posée (majuscules ou minuscules) ou `--use-env-proxy` ;
 * 3. `tls_env_refused` : une variable de TLS affaibli posée ou une option TLS interdite de Node ; seule exception,
 *    étroite : `OPENSSL_CONF` dont le fichier n'a aucun effet sur Node, en préversion de Vercel (décision 0062,
 *    ci-dessous ; elle remplace l'exception de `NODE_EXTRA_CA_CERTS` de 0058 § 4, retirée), ou dont le fichier est
 *    exactement celui, audité, du runtime Lambda `nodejs24.x` (décision 0065, verdict `contenu_audite`).
 * Diagnostic facultatif (décisions 0058 et 0062) : un rappel reçoit le **nom** de la variable ou de l'option en cause
 * (liste fermée `CAUSES_SORTIE`), la marque de l'exception appliquée et, pour `OPENSSL_CONF`, une classe de racine et un
 * verdict pris dans des listes fermées et, avec le verdict `section_nodejs`, les directives du fichier en jetons d'une
 * liste fermée (0065 § 4 point 3) ; jamais une valeur.
 *
 * Variable « posée » : présente avec une valeur non vide, sans retrait d'espaces. `NO_PROXY` n'a aucun effet.
 * Lecture paresseuse, à l'appel ; l'environnement est un paramètre (par défaut `process.env`) que les tests injectent.
 * **L'environnement injecté ne peut que resserrer** (décision 0046, D21) : `VERCEL_ENV`, `VERCEL_TARGET_ENV` et
 * `VADROUILLE_ENV` sont aussi lues dans le vrai `process.env`, et `production_refused` est rendu si l'un **ou** l'autre
 * environnement ne passe pas la liste d'autorisation. La table de cas est commune avec la garde de connexion
 * `vadrouille_prototype` de `db/connection.ts` (`tests/support/cas-production-commune.ts`).
 * **Module non pur depuis 0062** : il importe `./openssl-conf`, qui fait des lectures **synchrones** du système de
 * fichiers (injectable : quatrième paramètre de `verifierSortie`), seulement quand `OPENSSL_CONF` est posée, que le
 * contrôle TLS est atteint et que les conditions 1.1, 1.2, 1.7 et 1.3 de 0062 § 4 passent (0062 § 5.4). Il lit aussi
 * `process.config` (condition 1.7, cinquième paramètre de `verifierSortie`, injectable) dans le même cas.
 */

/**
 * Codes fermés de la barrière (`CODES_REFUS_SORTIE`) et « clé absente » (`CODE_CLE_ABSENTE`, modules étroits `ai.ts` et
 * `grounding.ts`, clients réels) : définis une seule fois dans `src/ai/erreurs.ts` (décision 0077 § 3 point 1, module
 * sans import) et exportés ici sous le même nom, pour que leurs importateurs ne changent pas.
 */
export { CODE_CLE_ABSENTE, CODES_REFUS_SORTIE, type CodeCleAbsente, type CodeRefusSortie } from "@/ai/erreurs";

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
 * production est refusé. `OPENSSL_CONF` : condition 1.2 de 0062 § 4 (seule lecture ajoutée par 0062).
 */
const deploiementReel = (): Deploiement & Pick<Lecture, "vercel"> & { readonly opensslConf: string | undefined } => ({
  vercelEnv: process.env.VERCEL_ENV,
  cible: process.env.VERCEL_TARGET_ENV,
  vadrouilleEnv: process.env.VADROUILLE_ENV,
  vercel: process.env.VERCEL,
  opensslConf: process.env.OPENSSL_CONF,
});

/**
 * `VADROUILLE_ENV` est une liste de **refus** (0046 D21) : la comparaison est donc normalisée (NFKC, espaces retirés,
 * casse ignorée), pour que `Production`, ` production` ou `PRODUCTION\n` soient refusés comme `production` (mineur de
 * la revue du head `353bb20`). `VERCEL_ENV` reste une liste d'autorisation à comparaison exacte.
 */
const normaliserEnv = (valeur: string) => valeur.normalize("NFKC").trim().toLowerCase();

/**
 * Exception bornée de la décision 0062 (ticket 341) : `OPENSSL_CONF` posée est admise si, et seulement si,
 * 1.1. `VERCEL` vaut `1` et `VERCEL_ENV` vaut `preview`, dans l'environnement lu **et** dans le vrai `process.env`
 *      (D21 : l'environnement injecté ne peut que resserrer), comparaison exacte ;
 * 1.2. la valeur lue est identique à celle du vrai `process.env`, toutes deux lues à l'appel (cohérence des deux
 *      lectures seulement : Node a lu `OPENSSL_CONF` au démarrage, risque résiduel (b) de 0062 § 6) ;
 * 1.7. la construction de Node lit la section `nodejs_conf` : `configNode` (`process.config` par défaut) passe
 *      `nomSectionOpensslAdmis` (`./openssl-conf.ts`) ; jugée avant le chemin, sans accès au système de fichiers ;
 * 1.3 à 1.6. le chemin et le fichier passent l'examen d'`examinerOpensslConf` (`./openssl-conf.ts`).
 * Le fichier n'est lu que si 1.1, 1.2, 1.7 et 1.3 passent. Rend la classe de racine et le verdict fermé et, avec
 * `section_nodejs`, les directives en jetons (0065 § 4 point 3) ; jamais une valeur.
 */
function examenOpensslConf(
  lu: Lecture,
  fs: SystemeFichiersOpenssl,
  configNode: unknown,
): { readonly zone: ZoneOpensslConf; readonly verdict: VerdictOpensslConf; readonly directives?: string } | undefined {
  const valeur = lu.tls.OPENSSL_CONF;
  if (valeur === undefined || !posee(valeur)) return undefined;
  const reel = deploiementReel();
  const zone = zoneOpensslConf(valeur);
  if (lu.vercel !== "1" || lu.vercelEnv !== "preview" || reel.vercel !== "1" || reel.vercelEnv !== "preview") {
    return { zone, verdict: "hors_preview" };
  }
  if (reel.opensslConf !== valeur) return { zone, verdict: "env_differente" };
  if (!nomSectionOpensslAdmis(configNode)) return { zone, verdict: "nom_section_refuse" };
  return examinerOpensslConf(valeur, fs);
}

/** Premier nom posé d'une famille de variables (clé de la lecture), jamais sa valeur. */
const premierePosee = (famille: Readonly<Record<string, string | undefined>>, ignorer?: string): string | undefined =>
  Object.entries(famille).find(([nom, valeur]) => nom !== ignorer && posee(valeur))?.[0];

const causeProxy = (lu: Lecture): string | undefined =>
  premierePosee(lu.proxy) ?? OPTIONS_PROXY.find((option) => lu.options.has(option));
const causeTls = (lu: Lecture, exception: boolean): string | undefined =>
  premierePosee(lu.tls, exception ? "OPENSSL_CONF" : undefined) ?? OPTIONS_TLS.find((option) => lu.options.has(option));

/**
 * Marque de l'exception bornée de 0062, quand elle a été appliquée (remplace `vercel_runtime_ca` de 0058) : verdict
 * `admis` (0062) ou `contenu_audite` (0065 § 4 point 2).
 */
export const EXCEPTION_OPENSSL_CONF = "vercel_runtime_openssl_conf";

/** Marques d'exception qu'un diagnostic peut rendre (liste fermée ; copie dans `src/server/log.ts`). */
export const EXCEPTIONS_SORTIE: readonly string[] = [EXCEPTION_OPENSSL_CONF];

/** Classes de racine et verdicts de l'examen d'`OPENSSL_CONF` (0062 § 5.1 ; copies dans `src/server/log.ts`). */
export const ZONES_SORTIE: readonly string[] = ZONES_OPENSSL_CONF;
export const VERDICTS_SORTIE: readonly string[] = VERDICTS_OPENSSL_CONF;
/** Jetons des directives d'un fichier `section_nodejs` (0065 § 4 point 3 ; copie dans `src/server/log.ts`). */
export const DIRECTIVES_SORTIE: readonly string[] = DIRECTIVES_OPENSSL_CONF;

/** Verdicts qui ouvrent l'exception : `admis` (0062) et `contenu_audite` (0065 § 4 point 2). */
const VERDICTS_EXCEPTION: ReadonlySet<VerdictOpensslConf> = new Set(["admis", "contenu_audite"]);

/**
 * Diagnostic de la barrière (décisions 0058 et 0062) : `cause`, nom de la première variable ou option de proxy ou de TLS
 * en cause (liste fermée `CAUSES_SORTIE`) ; `exception`, marque de l'exception appliquée ; `openssl_conf_zone` et
 * `openssl_conf_verdict`, rendus seulement si le contrôle TLS est atteint et qu'`OPENSSL_CONF` est posée dans
 * l'environnement lu (0062 § 5.1) ; `openssl_conf_directives`, rendu seulement avec le verdict `section_nodejs` (0065
 * § 4 point 3) : jetons d'une liste fermée, sans doublon, triés, séparés par `,`. Jamais une valeur, une longueur, un
 * condensat ni un préfixe de valeur.
 */
export type DiagnosticSortie = {
  readonly cause?: string;
  readonly exception?: typeof EXCEPTION_OPENSSL_CONF;
  readonly openssl_conf_zone?: ZoneOpensslConf;
  readonly openssl_conf_verdict?: VerdictOpensslConf;
  readonly openssl_conf_directives?: string;
};

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
 * Contrôle de sortie, à appeler avant toute lecture de clé et toute connexion. `diagnostic` (facultatif, décisions
 * 0058 et 0062) reçoit, hors refus de production, le nom de la cause, la marque de l'exception et, pour `OPENSSL_CONF`,
 * la classe de racine et le verdict : rien d'autre. `fs` (facultatif, 0062 § 7.2) : système de fichiers de l'examen
 * d'`OPENSSL_CONF`, injecté par les tests ; les appelants ne le passent pas. `configNode` (facultatif, condition 1.7 de
 * 0062 § 4) : configuration de construction de Node (`process.config`), injectée par les tests ; les appelants ne la
 * passent pas.
 */
export function verifierSortie(
  env: EnvSortie = process.env,
  execArgv: readonly string[] = process.execArgv,
  diagnostic?: (resultat: DiagnosticSortie) => void,
  fs: SystemeFichiersOpenssl = FS_OPENSSL_REEL,
  configNode: unknown = process.config,
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
  const proxy = causeProxy(lu);
  if (proxy !== undefined) {
    // Refus de proxy : le fichier d'`OPENSSL_CONF` n'est pas lu, et les champs `openssl_conf_*` sont absents.
    diagnostic?.({ cause: proxy });
    return { ok: false, code: "proxy_env_refused" };
  }
  const examen = examenOpensslConf(lu, fs, configNode);
  const exception = examen !== undefined && VERDICTS_EXCEPTION.has(examen.verdict);
  const tls = causeTls(lu, exception);
  diagnostic?.({
    ...(tls === undefined ? {} : { cause: tls }),
    ...(exception ? { exception: EXCEPTION_OPENSSL_CONF } : {}),
    ...(examen === undefined ? {} : { openssl_conf_zone: examen.zone, openssl_conf_verdict: examen.verdict }),
    // Chaîne vide (fichier sans aucune directive) jamais transmise : bloquant 1 de la revue du head `e7fe172`, 0065 § 7.
    ...(examen?.verdict === "section_nodejs" && examen.directives !== undefined && examen.directives !== ""
      ? { openssl_conf_directives: examen.directives }
      : {}),
  });
  if (tls !== undefined) return { ok: false, code: "tls_env_refused" };
  return { ok: true };
}
