import "server-only";

import { z } from "zod";

import { resolveServerEnvironment, type ServerEnvironment } from "./resolve";

/**
 * Environnement serveur fermé par défaut (spécification B3, B3a points 1 et 2 ; amendement de 0017 § 11.0 écrit
 * dans 0006 ; décisions 0050, B3-TL-1 et B3-TL-5, et 0051, points 2, 3 et 6.5 ; B3b : 0077 § 5.1). Importé sous le
 * nom `@/server/env`, seulement par `src/instrumentation.ts`, le limiteur (`src/server/rate-limit.ts`), les opérations
 * de connexion (`src/server/auth/index.ts`) et ses tests (`ligne/server-env-imports`).
 *
 * - `parseServerEnv(env)` : fonction pure, valide l'objet reçu et rend un objet figé, sans aucune chaîne secrète (les
 *   secrets n'y sont que leurs octets décodés) ni clé de fournisseur.
 * - `serverEnv()` : `parseServerEnv(process.env)`, dont seule une réussite est mise en cache (un refus est revalidé, et
 *   levé de nouveau, à l'appel suivant).
 * - `assertServerProcessEnv(env)` : gardes du seul processus serveur, appelée par `register()` seulement.
 *
 * Chaque refus est une `ServerEnvError` qui ne porte que le nom de la variable et un code de règle, sans `cause` :
 * aucune valeur reçue n'atteint un message, une pile ou un journal. Les variables des tâches suivantes (Stripe,
 * modèles, Google) sont validées par la tâche qui les introduit, dans ce module ; seules leurs gardes de refus sans
 * lecture de clé sont posées dès B3a.
 */

/**
 * Variables connues de ce module (liste fermée, reprise par le champ `variable` de `src/server/log.ts`). Écrites en
 * clés d'objet, et nommées ensuite par `V.<NOM>` : un nom de variable n'est jamais un texte de ce module (spécification
 * P0c, section 5, « Noms secrets » : les clés d'objet ne sont pas des textes contrôlés).
 */
const VARIABLES = {
  VADROUILLE_ENV: 0,
  VERCEL_ENV: 0,
  VERCEL: 0,
  HOSTNAME: 0,
  AUTH_ADAPTER: 0,
  TRUSTED_IP_HEADER: 0,
  RATE_LIMIT_HMAC_SECRET: 0,
  BETTER_AUTH_SECRET: 0,
  // B3b (spécification B3, B3a point 1 ; décision 0077 § 5.1) : requises avec `AUTH_ADAPTER=better-auth` ;
  // `EMAIL_TRANSPORT` et `SMTP_URL` : règles de B3b-envoi (décision 0098 § 4), valeurs jamais rendues.
  BETTER_AUTH_URL: 0,
  APP_URL: 0,
  VADROUILLE_DATABASE_URL_AUTH: 0,
  EMAIL_TRANSPORT: 0,
  SMTP_URL: 0,
  // B3b (revue consolidée du head `f0b8c5a`, bloquant 1 ; décision 0082) : variables que Better Auth 1.7.7 lit d'elle-même
  // (origines de confiance, télémétrie, secrets de repli) ; présence refusée partout, quel que soit `AUTH_ADAPTER`.
  BETTER_AUTH_TRUSTED_ORIGINS: 0,
  BETTER_AUTH_TELEMETRY: 0,
  BETTER_AUTH_TELEMETRY_ENDPOINT: 0,
  BETTER_AUTH_TELEMETRY_ID: 0,
  BETTER_AUTH_TELEMETRY_DEBUG: 0,
  BETTER_AUTH_SECRETS: 0,
  AUTH_SECRET: 0,
  SIMULATED_WEBHOOK_SECRET: 0,
  SIMULATED_WEBHOOK_ENABLED: 0,
  VADROUILLE_DATABASE_URL_MIGRATOR: 0,
  VADROUILLE_DB_ADMIN_URL: 0,
  STRIPE_SECRET_KEY: 0,
  STRIPE_PUBLISHABLE_KEY: 0,
  "STRIPE_*": 0,
  // P0r3b (décision 0055, section 1 point 2) : mode réel du prototype ; `P0_*` est le libellé fixe de toute variable
  // de préfixe `P0_` refusée en production (jamais le nom exact).
  P0_REAL_RUNS: 0,
  P0_RUN_TOKEN: 0,
  "P0_*": 0,
} as const;
export type ServerEnvVariable = keyof typeof VARIABLES;
export const SERVER_ENV_VARIABLES: readonly ServerEnvVariable[] = Object.freeze(Object.keys(VARIABLES) as ServerEnvVariable[]);
/** `V.RATE_LIMIT_HMAC_SECRET === "RATE_LIMIT_HMAC_SECRET"`, etc. */
const V = Object.freeze(Object.fromEntries(SERVER_ENV_VARIABLES.map((nom) => [nom, nom]))) as { readonly [K in ServerEnvVariable]: K };

/** Codes de règle (0050, B3-TL-1 point 3). */
export const SERVER_ENV_RULES = [
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
] as const;
export type ServerEnvRule = (typeof SERVER_ENV_RULES)[number];

/** Refus de configuration : nom de la variable et code de règle seulement, jamais une valeur, jamais de `cause`. */
export class ServerEnvError extends Error {
  override name = "ServerEnvError";
  readonly variable: ServerEnvVariable;
  readonly rule: ServerEnvRule;

  constructor(variable: ServerEnvVariable, rule: ServerEnvRule) {
    super(`Configuration du serveur refusée : ${variable} (règle ${rule}).`);
    this.variable = variable;
    this.rule = rule;
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/** Seule valeur admise de `TRUSTED_IP_HEADER` (0051 point 2.1) : posée et réécrite par Vercel. */
export const TRUSTED_IP_HEADERS = ["x-vercel-forwarded-for"] as const;
export type TrustedIpHeader = (typeof TRUSTED_IP_HEADERS)[number];

/**
 * Réglages de la connexion réelle (B3b), présents seulement avec `AUTH_ADAPTER=better-auth`, admis en `local` et `ci`
 * seulement (B3-TL-2) : octets décodés de `BETTER_AUTH_SECRET` (jamais la chaîne), `BETTER_AUTH_URL` et `APP_URL`.
 */
export type BetterAuthSettings = {
  readonly environment: "local" | "ci";
  readonly secret: Buffer;
  readonly baseUrl: string;
  readonly appUrl: string;
};

/** Hôtes de la liste fermée de `SMTP_URL` (décision 0098 § 2.3), en minuscules ; `mailpit` en `ci` seulement. */
const HOTES_SMTP = [
  { texte: "localhost", hote: "localhost" },
  { texte: "127.0.0.1", hote: "127.0.0.1" },
  { texte: "[::1]", hote: "::1" },
  { texte: "mailpit", hote: "mailpit" },
] as const;
export type SmtpHost = (typeof HOTES_SMTP)[number]["hote"];

/**
 * Transport d'e-mail SMTP (B3b-envoi ; décision 0098 § 2.3 et § 4 point 5) : l'hôte est **la constante de la liste
 * fermée**, jamais le texte de l'URL (`::1` sans crochets), le port un entier. Aucun autre champ ; la chaîne brute de
 * `SMTP_URL` ne sort pas de ce module.
 */
export type SmtpSettings = { readonly host: SmtpHost; readonly port: number };

/** Configuration validée. Aucune chaîne secrète : les secrets n'y sont que leurs octets décodés. */
export type ServerEnv = {
  readonly environment: ServerEnvironment;
  readonly authAdapter: "mock" | "better-auth";
  /** `null` avec `AUTH_ADAPTER=mock`. */
  readonly betterAuth: BetterAuthSettings | null;
  /** En-tête d'adresse IP de confiance, normalisé ; `null` : compartiment commun (absent). */
  readonly trustedIpHeader: TrustedIpHeader | null;
  /** Octets décodés de `RATE_LIMIT_HMAC_SECRET` ; `null` si absente (le limiteur échoue alors fermé, à l'usage). */
  readonly rateLimitHmacSecret: Buffer | null;
  /** `null` ⇔ `EMAIL_TRANSPORT` absente : port d'envoi désactivé, aucun envoi implicite (B3b-envoi-PO-2). */
  readonly smtp: SmtpSettings | null;
};

/** « Présente » : définie et non vide après `trim()` (tableau « requis quand » de la spécification). */
const presente = (value: string | undefined): value is string => value !== undefined && value.trim() !== "";

// --- SMTP_URL (B3b-envoi ; décision 0098 § 2) ---------------------------------------------------------------

/**
 * Forme stricte de la chaîne brute (0098 § 2.2), contrôlée **avant** `new URL()` : `smtp://` en minuscules, hôte
 * IPv6 entre crochets (hexadécimal et `:`) ou lettres ASCII, chiffres et points, `:`, port en chiffres sans zéro de
 * tête, puis rien ou un unique `/`. Aucun autre caractère : ni `@`, `%`, `\`, `?`, `#`, espace, contrôle, ni hors ASCII.
 */
const FORME_SMTP = /^smtp:\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.]+):([1-9][0-9]{0,4})\/?$/;

/**
 * Contrôle de `SMTP_URL` (0098 § 2.2 puis § 2.3) : forme de la chaîne brute, puis recoupement par `new URL()`
 * (schéma exact, identifiants, `search`, `hash` et chemin vides, port écrit), puis liste fermée (hôte mis en
 * minuscules par **notre** code : pour un schéma non spécial, `URL` laisse l'hôte tel quel). Rend `null` au moindre
 * écart ; ne copie, ne rend ni ne journalise la chaîne.
 */
function analyserSmtp(valeur: string, environment: ServerEnvironment): SmtpSettings | null {
  const brute = valeur.trim();
  const forme = FORME_SMTP.exec(brute);
  if (forme === null) return null;
  const port = Number(forme[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!URL.canParse(brute)) return null;
  const url = new URL(brute);
  if (url.protocol !== "smtp:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return null;
  if (url.pathname !== "" && url.pathname !== "/") return null;
  if (url.port === "" || Number(url.port) !== port) return null;
  const hote = url.hostname.toLowerCase();
  const admis = HOTES_SMTP.find((entree) => entree.texte === hote);
  if (admis === undefined) return null;
  if (admis.hote === "mailpit" && environment !== "ci") return null;
  return Object.freeze({ host: admis.hote, port });
}

// --- Secrets (B3-TL-5, 0051 point 3) ------------------------------------------------------------------------

/** Mots refusés, répétés ou non jusqu'à la longueur (0050, B3-TL-5 point 3) ; liste à allonger sans décision nouvelle. */
const MOTS_TRIVIAUX: readonly string[] = Object.keys({ changeme: 0, secret: 0, password: 0, test: 0, example: 0, vadrouille: 0 });
const OCTETS_MIN = 32;
const OCTETS_DISTINCTS_MIN = 16;

const HEXADECIMAL = /^[0-9a-fA-F]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Vrai si `texte` est un préfixe de la répétition d'un mot de la liste (`changemechangem…`). */
function repetitionDeMot(texte: string): boolean {
  if (texte.length === 0) return false;
  return MOTS_TRIVIAUX.some((mot) => mot.repeat(Math.ceil(texte.length / mot.length)).slice(0, texte.length) === texte);
}

/** Octets formés par la répétition d'un préfixe d'au plus la moitié de leur longueur (un octet répété compris). */
function repetitionDeBloc(octets: Buffer): boolean {
  for (let periode = 1; periode <= octets.length / 2; periode += 1) {
    if (octets.subarray(periode).equals(octets.subarray(0, octets.length - periode))) return true;
  }
  return false;
}

/** Suite arithmétique d'octets : pas constant modulo 256, croissant ou décroissant. */
function suiteArithmetique(octets: Buffer): boolean {
  let precedent: number | undefined;
  let pas: number | undefined;
  for (const octet of octets) {
    if (precedent !== undefined) {
      const ecart = (octet - precedent + 256) % 256;
      if (pas === undefined) pas = ecart;
      else if (ecart !== pas) return false;
    }
    precedent = octet;
  }
  return true;
}

/** Décodage strict, sans `trim()` : hexadécimal d'abord, sinon base64 ou base64url avec aller-retour exact. */
function decoder(value: string): Buffer | null {
  if (value.length % 2 === 0 && HEXADECIMAL.test(value)) return Buffer.from(value, "hex");
  if (value.length % 4 === 0 && BASE64.test(value)) {
    const octets = Buffer.from(value, "base64");
    return octets.toString("base64") === value ? octets : null;
  }
  if (value.length % 4 !== 1 && BASE64URL.test(value)) {
    const octets = Buffer.from(value, "base64url");
    return octets.toString("base64url") === value ? octets : null;
  }
  return null;
}

/**
 * Seule fonction de lecture d'un secret (0050, B3-TL-5 point 1 ; 0051 point 3) : renvoie les octets décodés, ou lève
 * une `ServerEnvError` dans l'ordre décodage → longueur → motifs triviaux → octets distincts. L'unicité est contrôlée
 * par l'appelant, sur les octets. Exportée pour `src/server/env/p0.ts` seulement (décision 0055, section 1 point 2 :
 * le code d'accès du mode réel et sa saisie passent par cette même fonction) ; `ligne/server-env-imports` ne laisse
 * importer ce module qu'à ses importateurs nommés et aux modules de `src/server/env/`.
 */
export function decodeSecret(name: ServerEnvVariable, value: string): Buffer {
  const octets = decoder(value);
  if (octets === null) throw new ServerEnvError(name, "secret_encoding");
  if (octets.length < OCTETS_MIN) throw new ServerEnvError(name, "secret_too_short");
  if (
    repetitionDeMot(value.toLowerCase()) ||
    repetitionDeBloc(octets) ||
    suiteArithmetique(octets) ||
    repetitionDeMot(octets.toString("latin1").toLowerCase())
  ) {
    throw new ServerEnvError(name, "secret_trivial");
  }
  if (new Set(octets).size < OCTETS_DISTINCTS_MIN) throw new ServerEnvError(name, "secret_trivial");
  return octets;
}

// --- Schéma ------------------------------------------------------------------------------------------------

/** Forme brute des variables lues (le schéma n'est pas strict : l'environnement porte d'autres variables). */
const ServerEnvSchema = z.object({
  AUTH_ADAPTER: z.string().optional(),
  TRUSTED_IP_HEADER: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  VERCEL: z.string().optional(),
  RATE_LIMIT_HMAC_SECRET: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  APP_URL: z.string().optional(),
  SIMULATED_WEBHOOK_SECRET: z.string().optional(),
  SIMULATED_WEBHOOK_ENABLED: z.string().optional(),
  P0_REAL_RUNS: z.string().optional(),
  P0_RUN_TOKEN: z.string().optional(),
});

/** URL absolue `http:` ou `https:`, sans identifiants ni fragment ; rendue normalisée (`URL#origin`), ou `null`. */
function origineHttp(valeur: string): string | null {
  if (!URL.canParse(valeur)) return null;
  const url = new URL(valeur);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "" || url.hash !== "") return null;
  if (url.pathname !== "/" || url.search !== "") return null;
  return url.origin;
}

/** Préfixes de production des clés Stripe, comparés après `trim()` et sans tenir compte de la casse (handover § 2). */
const PREFIXES_STRIPE_PRODUCTION = ["sk_live_", "pk_live_", "rk_live_"] as const;

/** Garde de préfixe d'une variable `STRIPE_*` présente : la valeur n'est comparée qu'à des préfixes, jamais rendue. */
function verifierStripe(nom: string, valeur: string): void {
  const variable: ServerEnvVariable = nom === V.STRIPE_SECRET_KEY || nom === V.STRIPE_PUBLISHABLE_KEY ? nom : V["STRIPE_*"];
  const normalisee = valeur.trim().toLowerCase();
  if (PREFIXES_STRIPE_PRODUCTION.some((prefixe) => normalisee.startsWith(prefixe))) throw new ServerEnvError(variable, "production_prefix");
  if (nom === V.STRIPE_SECRET_KEY && !valeur.startsWith("sk_test_") && !valeur.startsWith("rk_test_")) {
    throw new ServerEnvError(variable, "invalid_value");
  }
  if (nom === V.STRIPE_PUBLISHABLE_KEY && !valeur.startsWith("pk_test_")) throw new ServerEnvError(variable, "invalid_value");
}

/** Vrai derrière Vercel : `VERCEL_ENV` présente et `VERCEL` exactement `1` après `trim()` (0051 point 2.2). */
const surVercel = (vercelEnv: string | undefined, vercel: string | undefined) => presente(vercelEnv) && vercel?.trim() === "1";

/**
 * Valide l'environnement reçu (tableau « requis quand » de la spécification B3, B3a point 1) et rend la configuration
 * figée. Fonction pure : ne lit que l'objet reçu, par propriété littérale (et, pour `STRIPE_*`, par le seul parcours de
 * ses entrées) ; il n'est passé entier qu'à `resolveServerEnvironment`. Lève une `ServerEnvError` au premier refus.
 */
export function parseServerEnv(env: Env): ServerEnv {
  let environment: ServerEnvironment;
  try {
    environment = resolveServerEnvironment(env);
  } catch {
    throw new ServerEnvError(V.VADROUILLE_ENV, "missing");
  }
  const lu = ServerEnvSchema.safeParse({
    AUTH_ADAPTER: env.AUTH_ADAPTER,
    TRUSTED_IP_HEADER: env.TRUSTED_IP_HEADER,
    VERCEL_ENV: env.VERCEL_ENV,
    VERCEL: env.VERCEL,
    RATE_LIMIT_HMAC_SECRET: env.RATE_LIMIT_HMAC_SECRET,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    APP_URL: env.APP_URL,
    SIMULATED_WEBHOOK_SECRET: env.SIMULATED_WEBHOOK_SECRET,
    SIMULATED_WEBHOOK_ENABLED: env.SIMULATED_WEBHOOK_ENABLED,
    P0_REAL_RUNS: env.P0_REAL_RUNS,
    P0_RUN_TOKEN: env.P0_RUN_TOKEN,
  });
  // Une issue de Zod peut porter l'entrée reçue : seul le nom de la variable est gardé, jamais le message.
  if (!lu.success) {
    const champ = lu.error.issues.at(0)?.path.at(0);
    throw new ServerEnvError(SERVER_ENV_VARIABLES.find((nom) => nom === champ) ?? V.VADROUILLE_ENV, "invalid_value");
  }
  const brut = lu.data;

  // EMAIL_TRANSPORT et SMTP_URL (B3b-envoi ; décision 0098 § 4, qui remplace le refus de 0077 § 5.1). Ordre : présence
  // (`!== undefined` : une valeur vide ou d'espaces est présente), puis refus en `staging` et `production` **et sur
  // Vercel quel que soit `VADROUILLE_ENV`**, sans examiner la valeur ; la suite (valeurs, adaptateur) vient après le
  // choix de `AUTH_ADAPTER`. Aucune valeur n'est copiée, rendue, journalisée ni jointe à une erreur.
  if (env.EMAIL_TRANSPORT !== undefined || env.SMTP_URL !== undefined) {
    if (environment === "staging" || environment === "production" || surVercel(brut.VERCEL_ENV, brut.VERCEL)) {
      throw new ServerEnvError(env.EMAIL_TRANSPORT !== undefined ? V.EMAIL_TRANSPORT : V.SMTP_URL, "forbidden");
    }
  }

  // Variables lues par Better Auth 1.7.7 sans passer par nos options (revue consolidée du head `f0b8c5a`, bloquant 1 ;
  // décision 0082) : `BETTER_AUTH_TRUSTED_ORIGINS` ajoute des origines de confiance à `trustedOrigins` ;
  // `BETTER_AUTH_TELEMETRY*` peut réactiver la télémétrie malgré `telemetry.enabled: false` et l'envoyer vers une adresse
  // externe ; `BETTER_AUTH_SECRETS` et `AUTH_SECRET` sont des secrets de repli que la configuration rend inutiles (7.13).
  // Présence refusée dans les quatre environnements, `AUTH_ADAPTER=mock` compris ; présence seulement, valeur jamais lue.
  if (env.BETTER_AUTH_TRUSTED_ORIGINS !== undefined) throw new ServerEnvError(V.BETTER_AUTH_TRUSTED_ORIGINS, "forbidden");
  if (env.BETTER_AUTH_TELEMETRY !== undefined) throw new ServerEnvError(V.BETTER_AUTH_TELEMETRY, "forbidden");
  if (env.BETTER_AUTH_TELEMETRY_ENDPOINT !== undefined) throw new ServerEnvError(V.BETTER_AUTH_TELEMETRY_ENDPOINT, "forbidden");
  if (env.BETTER_AUTH_TELEMETRY_ID !== undefined) throw new ServerEnvError(V.BETTER_AUTH_TELEMETRY_ID, "forbidden");
  if (env.BETTER_AUTH_TELEMETRY_DEBUG !== undefined) throw new ServerEnvError(V.BETTER_AUTH_TELEMETRY_DEBUG, "forbidden");
  if (env.BETTER_AUTH_SECRETS !== undefined) throw new ServerEnvError(V.BETTER_AUTH_SECRETS, "forbidden");
  if (env.AUTH_SECRET !== undefined) throw new ServerEnvError(V.AUTH_SECRET, "forbidden");

  // AUTH_ADAPTER (même normalisation que `adapterChoice` : `trim()`, vide = `mock`) : `better-auth` admis en `local`
  // et `ci` seulement, `forbidden` en `staging` et `production` (B3-TL-2, 0077 § 5.1) ; toute autre valeur est
  // inconnue. `assertAuthAdapter` (src/adapters/auth-guard.ts) est amendée par B3c.
  const choix = brut.AUTH_ADAPTER?.trim() || "mock";
  if (choix !== "mock" && choix !== "better-auth") throw new ServerEnvError(V.AUTH_ADAPTER, "invalid_value");
  if (choix === "better-auth" && environment !== "local" && environment !== "ci") throw new ServerEnvError(V.AUTH_ADAPTER, "forbidden");

  // EMAIL_TRANSPORT (0098 § 4 points 3 à 6) : exactement `smtp` après `trim()` (minuscules), avec
  // `AUTH_ADAPTER=better-auth` en `local` ou `ci` seulement ; `SMTP_URL` requise avec lui, refusée sans lui.
  let smtp: SmtpSettings | null = null;
  if (env.EMAIL_TRANSPORT !== undefined) {
    if (env.EMAIL_TRANSPORT.trim() !== "smtp") throw new ServerEnvError(V.EMAIL_TRANSPORT, "invalid_value");
    if (choix !== "better-auth" || (environment !== "local" && environment !== "ci")) throw new ServerEnvError(V.EMAIL_TRANSPORT, "forbidden");
    if (env.SMTP_URL === undefined) throw new ServerEnvError(V.SMTP_URL, "missing");
    smtp = analyserSmtp(env.SMTP_URL, environment);
    if (smtp === null) throw new ServerEnvError(V.SMTP_URL, "invalid_value");
  } else if (env.SMTP_URL !== undefined) {
    throw new ServerEnvError(V.SMTP_URL, "forbidden");
  }

  // TRUSTED_IP_HEADER (B3a point 5 ; 0051 point 2).
  let trustedIpHeader: TrustedIpHeader | null = null;
  if (presente(brut.TRUSTED_IP_HEADER)) {
    const normalise = brut.TRUSTED_IP_HEADER.trim().toLowerCase();
    const admis = TRUSTED_IP_HEADERS.find((entete) => entete === normalise);
    if (admis === undefined) throw new ServerEnvError(V.TRUSTED_IP_HEADER, "untrusted_header");
    if (environment === "local") throw new ServerEnvError(V.TRUSTED_IP_HEADER, "header_outside_vercel");
    if ((environment === "staging" || environment === "production") && !surVercel(brut.VERCEL_ENV, brut.VERCEL)) {
      throw new ServerEnvError(V.TRUSTED_IP_HEADER, "header_outside_vercel");
    }
    trustedIpHeader = admis;
  }

  // Parcours des noms de l'objet reçu, un seul (0050, « Lignes du régime de confinement ») ; aucun nom de ces deux
  // familles n'est lu par propriété littérale :
  // - `P0_*` (P0r3b ; décision 0055, section 1 point 2 ; spécification `specs/P0-suite-2.md`, l. 148) : toute variable
  //   dont le nom commence par `P0_` (préfixe exact, sensible à la casse) refuse le démarrage en production dès que
  //   **la clé** est présente, vide ou faite d'espaces comprise (revue du head 6be9299, mineur 8) ; sa valeur n'est
  //   jamais lue ici ; le refus porte le libellé fixe `P0_*`, jamais le nom exact ni la valeur ;
  // - `STRIPE_*` : garde des préfixes de production (B3a), sur les valeurs présentes.
  for (const nom in env) {
    if (nom.startsWith("P0_")) {
      if (environment === "production") throw new ServerEnvError(V["P0_*"], "forbidden");
      continue;
    }
    if (!nom.startsWith("STRIPE_")) continue;
    const valeur = env[nom];
    if (presente(valeur)) verifierStripe(nom, valeur);
  }

  // `P0_REAL_RUNS` présente : `enabled` seulement, comparaison exacte, sans `trim()` (0055, section 1 point 2).
  if (presente(brut.P0_REAL_RUNS) && brut.P0_REAL_RUNS !== "enabled") throw new ServerEnvError(V.P0_REAL_RUNS, "invalid_value");

  // Secrets : tout secret présent est décodé et contrôlé, utilisé ou non (0051 point 3.6), puis l'unicité est
  // comparée sur les octets décodés de tous les secrets présents (0051 point 3.5).
  const secrets: [ServerEnvVariable, string | undefined][] = [
    [V.RATE_LIMIT_HMAC_SECRET, brut.RATE_LIMIT_HMAC_SECRET],
    [V.BETTER_AUTH_SECRET, brut.BETTER_AUTH_SECRET],
    [V.SIMULATED_WEBHOOK_SECRET, brut.SIMULATED_WEBHOOK_SECRET],
    // Code d'accès du mode réel (0055, section 1 point 2 ; S-1 point 1) : décodé, contrôlé et unique comme les autres.
    [V.P0_RUN_TOKEN, brut.P0_RUN_TOKEN],
  ];
  const decodes: Buffer[] = [];
  let rateLimitHmacSecret: Buffer | null = null;
  let betterAuthSecret: Buffer | null = null;
  for (const [nom, valeur] of secrets) {
    if (!presente(valeur)) continue;
    const octets = decodeSecret(nom, valeur);
    if (decodes.some((autre) => autre.equals(octets))) throw new ServerEnvError(nom, "secret_duplicate");
    decodes.push(octets);
    if (nom === V.RATE_LIMIT_HMAC_SECRET) rateLimitHmacSecret = octets;
    if (nom === V.BETTER_AUTH_SECRET) betterAuthSecret = octets;
  }

  // Connexion réelle (B3b) : secret, URL de la bibliothèque, URL de l'application et URL de connexion du rôle
  // `vadrouille_auth` requis au démarrage ; cette dernière n'est lue que pour sa présence (sa valeur n'est lue que par
  // `db/connection.ts`). Avec `mock`, ces variables sont ignorées, sauf le secret, validé s'il est présent (0051 § 3.6).
  let betterAuth: BetterAuthSettings | null = null;
  if (choix === "better-auth" && (environment === "local" || environment === "ci")) {
    if (betterAuthSecret === null) throw new ServerEnvError(V.BETTER_AUTH_SECRET, "missing");
    if (!presente(brut.BETTER_AUTH_URL)) throw new ServerEnvError(V.BETTER_AUTH_URL, "missing");
    const baseUrl = origineHttp(brut.BETTER_AUTH_URL.trim());
    if (baseUrl === null) throw new ServerEnvError(V.BETTER_AUTH_URL, "invalid_value");
    if (!presente(brut.APP_URL)) throw new ServerEnvError(V.APP_URL, "missing");
    const appUrl = origineHttp(brut.APP_URL.trim());
    if (appUrl === null) throw new ServerEnvError(V.APP_URL, "invalid_value");
    if (!presente(env.VADROUILLE_DATABASE_URL_AUTH)) throw new ServerEnvError(V.VADROUILLE_DATABASE_URL_AUTH, "missing");
    betterAuth = Object.freeze({ environment, secret: betterAuthSecret, baseUrl, appUrl });
  }

  if (environment === "production" && brut.SIMULATED_WEBHOOK_ENABLED?.trim().toLowerCase() === "true") {
    throw new ServerEnvError(V.SIMULATED_WEBHOOK_ENABLED, "forbidden");
  }

  return Object.freeze({ environment, authAdapter: choix, betterAuth, trustedIpHeader, rateLimitHmacSecret, smtp });
}

/**
 * Variables du limiteur exigées **à l'usage** (tableau « requis quand » de la spécification B3) : le secret partout,
 * l'en-tête de confiance en `staging` et `production`. Lève `missing` pour la variable absente ; le limiteur échoue
 * alors fermé (`rate_limited`, `retryable: true`) et écrit `config_missing` avec le seul nom de la variable.
 */
export function rateLimitSettings(env: ServerEnv): { readonly secret: Buffer; readonly trustedIpHeader: TrustedIpHeader | null } {
  if (env.rateLimitHmacSecret === null) throw new ServerEnvError(V.RATE_LIMIT_HMAC_SECRET, "missing");
  if ((env.environment === "staging" || env.environment === "production") && env.trustedIpHeader === null) {
    throw new ServerEnvError(V.TRUSTED_IP_HEADER, "missing");
  }
  return { secret: env.rateLimitHmacSecret, trustedIpHeader: env.trustedIpHeader };
}

/** Adresses d'écoute de la boucle locale, seules admises en `ci` avec `TRUSTED_IP_HEADER` (0051 point 2.3). */
const BOUCLE_LOCALE = ["127.0.0.1", "::1", "localhost"] as const;

/**
 * Gardes du seul processus serveur (spécification B3, B3a point 1 ; 0050, B3-TL-1 point 2 ; 0051 point 2.3), appelée
 * par `register()` seulement, jamais par `parseServerEnv` ni `serverEnv()` : les processus de test reçoivent ces
 * variables d'outillage sans être refusés. Lecture de présence seulement : aucune valeur n'est copiée ni rendue.
 */
export function assertServerProcessEnv(env: Env): void {
  if (presente(env.VADROUILLE_DATABASE_URL_MIGRATOR)) throw new ServerEnvError(V.VADROUILLE_DATABASE_URL_MIGRATOR, "forbidden");
  if (presente(env.VADROUILLE_DB_ADMIN_URL)) throw new ServerEnvError(V.VADROUILLE_DB_ADMIN_URL, "forbidden");
  let environment: ServerEnvironment;
  try {
    environment = resolveServerEnvironment(env);
  } catch {
    throw new ServerEnvError(V.VADROUILLE_ENV, "missing");
  }
  if (environment === "ci" && presente(env.TRUSTED_IP_HEADER)) {
    const ecoute = env.HOSTNAME?.trim();
    if (!BOUCLE_LOCALE.some((adresse) => adresse === ecoute)) throw new ServerEnvError(V.TRUSTED_IP_HEADER, "header_outside_vercel");
  }
}

let enCache: ServerEnv | undefined;

/** `parseServerEnv(process.env)` ; seule une réussite est mise en cache (0050, correction 3, mineur 11). */
export function serverEnv(): ServerEnv {
  if (enCache === undefined) enCache = parseServerEnv(process.env);
  return enCache;
}
