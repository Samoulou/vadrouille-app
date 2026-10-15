import "server-only";

import { API_ERROR_CODES } from "@/contracts/values";

/**
 * Journal structuré du serveur (spécification B3, B3a point 7 ; décision 0050, B3-TL-7 ; 0051 point 6.1). Seul point
 * d'écriture des journaux de B3 : une ligne JSON par événement, par `console.log` (`info`, `warn`) ou `console.error`
 * (`error`), sans dépendance ni niveau `debug`.
 *
 * Liste blanche par construction : le nom d'événement est pris dans une union fermée, contrôlée aussi à l'exécution
 * (un nom inconnu est remplacé par `log.unknown_event`, sans le nom reçu) ; seuls les champs ci-dessous sont admis, et
 * une valeur qui ne suit pas le motif de son champ est **retirée** (jamais tronquée ni remplacée) ; le nombre de champs
 * retirés est écrit dans `dropped`. Aucun message ni pile d'erreur n'est jamais écrit : d'une erreur, seul `error.name`
 * peut l'être (`errorName`).
 */

export const LOG_EVENTS = [
  "config_missing",
  "config_invalid",
  "rate_limit.no_trusted_ip",
  "rate_limit.purge_failed",
  "rate_limit.rows_high",
  "rate_limit.failed",
  // P0r3b (décision 0055, section 1 points 2 et 3) : garde du mode réel fermée ; champ `guard` (code fermé), depuis
  // 0058 `cause` et `exception`, depuis 0062 `openssl_conf_zone` et `openssl_conf_verdict`, depuis 0065
  // `openssl_conf_directives` (listes fermées, jamais une valeur).
  "p0.guard_closed",
  "log.unknown_event",
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

export type LogLevel = "info" | "warn" | "error";

/** Champs admis. `variable` : nom de la liste fermée de `src/server/env/index.ts` ; `rule` : code de règle de B3-TL-1. */
export type LogFields = {
  readonly code?: string;
  readonly action?: string;
  readonly variable?: string;
  readonly rule?: string;
  readonly durationMs?: number;
  readonly rows?: number;
  readonly environment?: string;
  readonly errorName?: string;
  /** Code fermé de la garde du mode réel (`src/server/p0/garde.ts`), jamais une valeur. */
  readonly guard?: string;
  /** Nom de la variable ou de l'option de proxy ou de TLS en cause (décision 0058), jamais une valeur. */
  readonly cause?: string;
  /** Marque de l'exception de la barrière de sortie (décision 0062) : `vercel_runtime_openssl_conf` seulement. */
  readonly exception?: string;
  /** Classe de racine du chemin d'`OPENSSL_CONF` (décision 0062 § 5.1, liste fermée de 7 valeurs), jamais le chemin. */
  readonly openssl_conf_zone?: string;
  /** Verdict fermé de l'examen d'`OPENSSL_CONF` (décision 0062 § 5.1). */
  readonly openssl_conf_verdict?: string;
  /**
   * Directives d'un fichier `section_nodejs` (décision 0065 § 4 point 3) : jetons de `LOG_OPENSSL_CONF_DIRECTIVES`,
   * sans doublon, séparés par `,` ; jamais une valeur, un nom de section ni un nom de groupe.
   */
  readonly openssl_conf_directives?: string;
};

/**
 * Noms de variables admis dans le champ `variable` : même liste fermée que `SERVER_ENV_VARIABLES`
 * (`src/server/env/index.ts`, que ce module n'importe pas : `ligne/server-env-imports`) ; l'égalité des deux listes est
 * vérifiée par le test du module de journal. Écrits en clés d'objet : un nom de variable n'est jamais un texte du
 * journal (spécification P0c, section 5, « Noms secrets »).
 */
const VARIABLES_ADMISES: ReadonlySet<string> = new Set(
  Object.keys({
    VADROUILLE_ENV: 0,
    VERCEL_ENV: 0,
    VERCEL: 0,
    HOSTNAME: 0,
    AUTH_ADAPTER: 0,
    TRUSTED_IP_HEADER: 0,
    RATE_LIMIT_HMAC_SECRET: 0,
    BETTER_AUTH_SECRET: 0,
    SIMULATED_WEBHOOK_SECRET: 0,
    SIMULATED_WEBHOOK_ENABLED: 0,
    VADROUILLE_DATABASE_URL_MIGRATOR: 0,
    VADROUILLE_DB_ADMIN_URL: 0,
    STRIPE_SECRET_KEY: 0,
    STRIPE_PUBLISHABLE_KEY: 0,
    "STRIPE_*": 0,
    P0_REAL_RUNS: 0,
    P0_RUN_TOKEN: 0,
    "P0_*": 0,
  }),
);

/** Noms de variables du champ `variable`, pour le test d'égalité avec `src/server/env/index.ts`. */
export const LOG_VARIABLES: readonly string[] = [...VARIABLES_ADMISES];

const REGLES = new Set([
  "missing",
  "forbidden",
  "invalid_value",
  "production_prefix",
  "secret_too_short",
  "secret_encoding",
  "secret_trivial",
  "secret_duplicate",
  "untrusted_header",
  "header_outside_vercel",
]);
/**
 * Codes de la garde fermée du mode réel (décision 0055, section 1 point 2) : ceux de `lireEnvP0`
 * (`src/server/env/p0.ts`, que ce module n'importe pas : `ligne/server-env-imports`) et ceux de la garde
 * (`src/server/p0/garde.ts`) ; l'égalité des listes est vérifiée par le test de la garde.
 */
export const LOG_GUARD_CODES: readonly string[] = [
  "production_refused",
  "proxy_env_refused",
  "tls_env_refused",
  "environment_refused",
  "ci_refused",
  "branch_refused",
  "real_runs_disabled",
  "database_missing",
  "access_code_missing",
  "access_code_invalid",
  "production_deployment",
];
const GARDES: ReadonlySet<string> = new Set(LOG_GUARD_CODES);
/**
 * Causes admises dans le champ `cause` (décision 0058, ticket 319) : noms de la liste fermée `CAUSES_SORTIE` de la
 * barrière de sortie (`src/server/env/egress.ts`, que ce module n'importe pas : `ligne/server-env-imports`) ; l'égalité
 * des deux listes est vérifiée par le test de la barrière. Des noms, jamais des valeurs.
 */
export const LOG_EXIT_CAUSES: readonly string[] = [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
  "NODE_USE_ENV_PROXY",
  "node_use_env_proxy",
  "--use-env-proxy",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "OPENSSL_CONF",
  "SSLKEYLOGFILE",
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
const CAUSES: ReadonlySet<string> = new Set(LOG_EXIT_CAUSES);
/**
 * Marques d'exception (`exception`), classes de racine (`openssl_conf_zone`) et verdicts (`openssl_conf_verdict`) de la
 * barrière de sortie (décision 0062 § 5) : copies des listes fermées d'`egress.ts` (que ce module n'importe pas :
 * `ligne/server-env-imports`) ; l'égalité est vérifiée par le test de la garde.
 */
export const LOG_EXIT_EXCEPTIONS: readonly string[] = ["vercel_runtime_openssl_conf"];
export const LOG_OPENSSL_CONF_ZONES: readonly string[] = ["dev_null", "etc", "usr", "var_runtime", "var_lang", "opt", "autre"];
export const LOG_OPENSSL_CONF_VERDICTS: readonly string[] = [
  "hors_preview",
  "env_differente",
  "nom_section_refuse",
  "chemin_refuse",
  "fichier_refuse",
  "inclusion_refusee",
  "section_nodejs",
  "contenu_audite",
  "admis",
];
/**
 * Jetons admis dans `openssl_conf_directives` (décision 0065 § 4 point 3 et § 5 point 4) : copie de
 * `DIRECTIVES_OPENSSL_CONF` (`src/server/env/openssl-conf.ts`) ; l'égalité est vérifiée par le test de la garde.
 */
export const LOG_OPENSSL_CONF_DIRECTIVES: readonly string[] = [
  "nodejs_conf",
  "openssl_conf",
  "ssl_conf",
  "system_default",
  "providers",
  "alg_section",
  "default_properties",
  "engines",
  "random",
  "activate",
  "module",
  "minprotocol",
  "maxprotocol",
  "protocol",
  "cipherstring",
  "ciphersuites",
  "options",
  "verifymode",
  "verifycafile",
  "verifycapath",
  "verifycastore",
  "chaincafile",
  "chaincapath",
  "chaincastore",
  "requestcafile",
  "signaturealgorithms",
  "clientsignaturealgorithms",
  "groups_admis",
  "groups_autres",
  "include",
  "pragma",
  "autre",
];
const EXCEPTIONS: ReadonlySet<string> = new Set(LOG_EXIT_EXCEPTIONS);
const ZONES_OPENSSL: ReadonlySet<string> = new Set(LOG_OPENSSL_CONF_ZONES);
const VERDICTS_OPENSSL: ReadonlySet<string> = new Set(LOG_OPENSSL_CONF_VERDICTS);
const DIRECTIVES_OPENSSL: ReadonlySet<string> = new Set(LOG_OPENSSL_CONF_DIRECTIVES);
const ENVIRONNEMENTS = new Set(["local", "ci", "staging", "production"]);
const CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);
const ACTION = /^[a-z][a-z0-9-]{0,47}$/;
const NOM_ERREUR = /^[A-Za-z]{1,40}$/;

const entierPositif = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0;
const chaine = (valeur: unknown): valeur is string => typeof valeur === "string";

/**
 * `openssl_conf_directives` (0065 § 5 point 4) : forme `jeton(,jeton)*`, chaque jeton dans la liste fermée, sans
 * doublon. Toute autre valeur (chaîne vide comprise) est retirée.
 */
function directivesAdmises(valeur: unknown): boolean {
  if (!chaine(valeur) || !/^[a-z_]+(?:,[a-z_]+)*$/.test(valeur)) return false;
  const jetons = valeur.split(",");
  return new Set(jetons).size === jetons.length && jetons.every((jeton) => DIRECTIVES_OPENSSL.has(jeton));
}

/** Contrôle de chaque champ admis ; tout autre champ est retiré. */
const CONTROLES: ReadonlyMap<string, (valeur: unknown) => boolean> = new Map<keyof LogFields, (valeur: unknown) => boolean>([
  ["code", (v) => chaine(v) && CODES.has(v)],
  ["action", (v) => chaine(v) && ACTION.test(v)],
  ["variable", (v) => chaine(v) && VARIABLES_ADMISES.has(v)],
  ["rule", (v) => chaine(v) && REGLES.has(v)],
  ["durationMs", entierPositif],
  ["rows", entierPositif],
  ["environment", (v) => chaine(v) && ENVIRONNEMENTS.has(v)],
  ["errorName", (v) => chaine(v) && NOM_ERREUR.test(v)],
  ["guard", (v) => chaine(v) && GARDES.has(v)],
  ["cause", (v) => chaine(v) && CAUSES.has(v)],
  ["exception", (v) => chaine(v) && EXCEPTIONS.has(v)],
  ["openssl_conf_zone", (v) => chaine(v) && ZONES_OPENSSL.has(v)],
  ["openssl_conf_verdict", (v) => chaine(v) && VERDICTS_OPENSSL.has(v)],
  ["openssl_conf_directives", directivesAdmises],
]);

const EVENEMENTS: ReadonlySet<string> = new Set(LOG_EVENTS);

/** Nom d'une erreur (`error.name` seulement, jamais `message`, `code` ni `cause`), ou `undefined`. */
export function errorNameOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" && NOM_ERREUR.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Ligne écrite pour un événement : champs filtrés, `dropped` si des champs ont été retirés. */
export function formatLogLine(event: string, fields: object = {}, level: LogLevel = "info"): string {
  const ligne: Record<string, unknown> = { level, event: EVENEMENTS.has(event) ? event : "log.unknown_event" };
  let retires = 0;
  for (const [cle, valeur] of Object.entries(fields)) {
    const controle = CONTROLES.get(cle);
    if (controle !== undefined && controle(valeur)) ligne[cle] = valeur;
    else retires += 1;
  }
  if (retires > 0) ligne.dropped = retires;
  return JSON.stringify(ligne);
}

/** Écrit un événement. Ne lève jamais : une entrée inattendue est retirée, pas écrite. */
export function logEvent(event: LogEvent, fields: LogFields = {}, level: LogLevel = "info"): void {
  let ligne: string;
  try {
    ligne = formatLogLine(event, fields, level);
  } catch {
    ligne = JSON.stringify({ level, event: "log.unknown_event", dropped: 1 });
  }
  if (level === "error") console.error(ligne);
  else console.log(ligne);
}
