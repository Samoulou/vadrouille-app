import "server-only";

import { createHmac } from "node:crypto";

import type { Result } from "@/contracts";
import {
  RATE_LIMIT_PURGE_BATCH,
  RATE_LIMIT_ROWS_ALERT,
  RATE_LIMIT_ROWS_ALERT_INTERVAL_MS,
  RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitKind,
  type RateLimitRule,
} from "@/server/config/limites";
import { type CanonicalEmail, isCanonicalEmail, rateLimitEmailKey } from "@/server/email";
import { parseServerEnv, rateLimitSettings, ServerEnvError, serverEnv, type TrustedIpHeader } from "@/server/env";
import { type HeadersLike, trustedIpKey } from "@/server/ip";
import { errorNameOf, logEvent } from "@/server/log";

import { createDatabase } from "../../db/index.ts";

/**
 * Limiteur maison (spécification B3, B3a point 6 ; décisions 0050, B3-TL-6 et amendement de 0007, et 0051, points
 * 4.5 et 6.2) sur `action_rate_limits`, par le pool de `vadrouille_app` de `db/` (garde de production de 0034
 * comprise) et `SET LOCAL ROLE vadrouille_limiter` dans une transaction.
 *
 * - Clé : HMAC-SHA-256 (octets décodés de `RATE_LIMIT_HMAC_SECRET`) du message `rl/v1/<action>/<fenêtre>s/<espèce>`,
 *   en hexadécimal minuscule ; aucune adresse IP ni e-mail en clair, ni en base ni au-delà de l'appel.
 * - Fenêtre fixe à l'horloge de la base (`now()`) : un `INSERT … ON CONFLICT` par clé, dans l'ordre fixe des règles
 *   (adresse IP, puis e-mail, puis voyage ; décision 0147 § 6.4 point 1) ; l'incrément s'arrête à la première clé au-dessus
 *   de son seuil (0051 point 6.2.2).
 * - Espèce `trip` (M5d-1, décision 0147 § 6.4 point 1) : identifiant `uuid` du voyage, exigé dès que l'action a une règle
 *   `trip` (sinon refus fermé, `rate_limit.failed`, `errorName: "MissingTripId"`), contrôlé dans l'organisation par
 *   l'appelant **avant** le limiteur ; message `rl/v1/<action>/<fenêtre>s/trip/<tripId>`, clé HMAC comme les autres.
 * - Purge à l'écriture, dans une transaction distincte ouverte après la validation de l'incrément, par lot de 100,
 *   les plus anciennes `expires_at` d'abord ; un échec de la purge ne change ni l'incrément ni la décision.
 * - Échec fermé : variable du limiteur absente ou invalide, erreur de base, adresse non canonique → `rate_limited`
 *   avec `retryable: true`, jamais une absence de limite ; aucune erreur ne remonte non rattrapée (0051 point 6.1.2).
 * - Compteurs durables : rien en mémoire du processus, hors de l'étouffement de l'alerte du plafond de lignes.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Client et pool minimaux (`pg.PoolClient`, `pg.Pool`). */
export type RateLimitClient = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(error?: Error | boolean): void;
};
export type RateLimitPool = { connect(): Promise<RateLimitClient> };

export type RateLimitRequest = {
  /** Nom d'action de la configuration (`^[a-z][a-z0-9-]{0,47}$`). */
  readonly action: string;
  /** En-têtes de la requête : seul l'en-tête de confiance configuré est lu. */
  readonly headers: HeadersLike;
  /** Adresse canonique (`parseEmailAddress`), exigée si l'action a une règle par e-mail. */
  readonly email?: CanonicalEmail;
  /**
   * Identifiant `uuid` du voyage, exigé si l'action a une règle par voyage (0147 § 6.4 point 1) ; contrôlé dans
   * l'organisation par l'appelant avant le limiteur. Écrit en minuscules dans le message.
   */
  readonly tripId?: string;
};

export type RateLimiterOptions = {
  /** Règles par action ; un nom d'action propre à chaque test isole ses compteurs. */
  readonly config?: RateLimitConfig;
  /** Environnement injecté, validé par `parseServerEnv` (sinon `serverEnv()`). */
  readonly env?: Env;
  /** Pool injecté (sinon le pool de `vadrouille_app` de `db/`, créé au premier appel). */
  readonly pool?: RateLimitPool;
  readonly purgeBatch?: number;
  readonly rowsAlert?: number;
  /** Crochet de test : appelé dans la transaction de purge, avant la suppression. */
  readonly beforePurge?: () => void | Promise<void>;
};

/**
 * Verdict détaillé (M5d-1, décision 0147 § 12 S1 point 5 : `limite` et `limite_voyage` distingués au journal) : admis, ou
 * refusé avec l'espèce de la règle au-delà de son seuil ; sans `kind` pour un refus fermé (configuration, environnement,
 * base, entrée). Aucune valeur personnelle.
 */
export type RateLimitVerdict = { readonly ok: true } | { readonly ok: false; readonly kind?: RateLimitKind };

export type RateLimiter = {
  check(request: RateLimitRequest): Promise<Result<void>>;
  /** Même contrôle, mêmes écritures que `check` ; rend l'espèce de la règle qui refuse. */
  verdict(request: RateLimitRequest): Promise<RateLimitVerdict>;
};

const ACTION = /^[a-z][a-z0-9-]{0,47}$/;
/** Identifiant de voyage admis dans une espèce `trip` : `uuid` (36 caractères, tirets aux places fixes). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS: Result<void> = Object.freeze({ ok: false, error: Object.freeze({ code: "rate_limited", retryable: true }) }) as Result<void>;
const ADMIS: Result<void> = Object.freeze({ ok: true, value: undefined });
const REFUS_FERME: RateLimitVerdict = Object.freeze({ ok: false });
const VERDICT_ADMIS: RateLimitVerdict = Object.freeze({ ok: true });

/** Rang fixe d'évaluation des espèces (0147 § 6.4 point 1) : adresse IP, puis e-mail, puis voyage. */
const RANG_ESPECE: Readonly<Record<RateLimitKind, number>> = Object.freeze({ ip: 0, email: 1, trip: 2 });

/** Règles dans l'ordre fixe d'évaluation : par espèce, puis dans l'ordre de la configuration (tri stable). */
export function reglesOrdonnees(regles: readonly RateLimitRule[]): RateLimitRule[] {
  return [...regles].sort((a, b) => RANG_ESPECE[a.kind] - RANG_ESPECE[b.kind]);
}

/** Message à préfixe de domaine (B3-TL-6 point 1) ; l'espèce est `ip/<clé>`, `email/<clé>`, `trip/<uuid>` ou `no-trusted-ip`. */
export function rateLimitMessage(action: string, windowSeconds: number, species: string): string {
  return `rl/v1/${action}/${windowSeconds}s/${species}`;
}

/** Clé stockée : HMAC-SHA-256 du message, en hexadécimal minuscule (64 caractères). */
export function rateLimitKey(secret: Buffer, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

const INCREMENT = `INSERT INTO action_rate_limits AS l (key, window_start, expires_at, count)
VALUES ($1, now(), now() + make_interval(secs => $2::double precision), 1)
ON CONFLICT (key) DO UPDATE SET
  window_start = CASE WHEN l.expires_at <= now() THEN now() ELSE l.window_start END,
  expires_at = CASE WHEN l.expires_at <= now() THEN now() + make_interval(secs => $2::double precision) ELSE l.expires_at END,
  count = CASE WHEN l.expires_at <= now() THEN 1 ELSE l.count + 1 END
RETURNING count`;

const PURGE = `DELETE FROM action_rate_limits WHERE key IN (
  SELECT key FROM action_rate_limits WHERE expires_at <= now() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
)`;

const ESTIMATION = "SELECT reltuples::bigint AS n FROM pg_catalog.pg_class WHERE oid = 'public.action_rate_limits'::regclass";

/** Pool de `vadrouille_app` de `db/` (fabrique gardée de `db/connection.ts`, environnement lu à l'appel). */
const poolParDefaut = (): RateLimitPool => createDatabase("vadrouille_app").$client;

async function rollback(client: RateLimitClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const config = options.config ?? RATE_LIMITS;
  const lot = options.purgeBatch ?? RATE_LIMIT_PURGE_BATCH;
  const plafond = options.rowsAlert ?? RATE_LIMIT_ROWS_ALERT;
  let pool: RateLimitPool | undefined = options.pool;
  let derniereAlerte: number | undefined;

  /** Réglages du limiteur, ou `null` (échec fermé) : configuration invalide, ou variable du limiteur absente. */
  const reglages = (action: string): { secret: Buffer; trustedIpHeader: TrustedIpHeader | null } | null => {
    try {
      return rateLimitSettings(options.env === undefined ? serverEnv() : parseServerEnv(options.env));
    } catch (error) {
      if (error instanceof ServerEnvError) {
        if (error.rule === "missing") logEvent("config_missing", { action, variable: error.variable }, "error");
        else logEvent("config_invalid", { action, variable: error.variable, rule: error.rule }, "error");
      } else logEvent("rate_limit.failed", { action, errorName: errorNameOf(error) }, "error");
      return null;
    }
  };

  async function purger(): Promise<void> {
    let client: RateLimitClient | undefined;
    try {
      client = await (pool ??= poolParDefaut()).connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE vadrouille_limiter");
      await options.beforePurge?.();
      await client.query(PURGE, [lot]);
      const estimation = Number(((await client.query(ESTIMATION)).rows[0] as { n?: unknown } | undefined)?.n);
      await client.query("COMMIT");
      // `-1` : table jamais analysée, estimation inconnue, aucun événement.
      if (Number.isSafeInteger(estimation) && estimation >= 0 && estimation > plafond) {
        const maintenant = Date.now();
        if (derniereAlerte === undefined || maintenant - derniereAlerte >= RATE_LIMIT_ROWS_ALERT_INTERVAL_MS) {
          derniereAlerte = maintenant;
          logEvent("rate_limit.rows_high", { rows: estimation }, "warn");
        }
      }
      client.release();
    } catch (error) {
      if (client) {
        await rollback(client);
        client.release(error instanceof Error ? error : true);
      }
      logEvent("rate_limit.purge_failed", { errorName: errorNameOf(error) }, "warn");
    }
  }

  async function verdict(request: RateLimitRequest): Promise<RateLimitVerdict> {
    const { action } = request;
    const configurees = ACTION.test(action) && Object.hasOwn(config, action) ? config[action] : undefined;
    if (configurees === undefined || configurees.length === 0) {
      logEvent("rate_limit.failed", { errorName: "UnknownAction" }, "error");
      return REFUS_FERME;
    }
    const regles = reglesOrdonnees(configurees);
    const env = reglages(action);
    if (env === null) return REFUS_FERME;
    // Défense en profondeur (0051 point 4.5) : le limiteur ne normalise rien, il refuse une adresse non canonique.
    const avecEmail = regles.some((regle) => regle.kind === "email");
    const cleEmail = request.email !== undefined && isCanonicalEmail(request.email) ? rateLimitEmailKey(request.email) : null;
    if (avecEmail && cleEmail === null) {
      logEvent("rate_limit.failed", { action, errorName: "NonCanonicalEmail" }, "error");
      return REFUS_FERME;
    }
    // Espèce `trip` (0147 § 6.4 point 1) : identifiant `uuid` exigé, sinon refus fermé.
    const avecVoyage = regles.some((regle) => regle.kind === "trip");
    const voyage = typeof request.tripId === "string" && UUID.test(request.tripId) ? request.tripId.toLowerCase() : null;
    if (avecVoyage && voyage === null) {
      logEvent("rate_limit.failed", { action, errorName: "MissingTripId" }, "error");
      return REFUS_FERME;
    }

    const ip = trustedIpKey(request.headers, env.trustedIpHeader);
    if (ip === null) logEvent("rate_limit.no_trusted_ip", { action }, "warn");
    const secret = env.secret;
    const cles = regles.map((regle) => {
      const espece =
        regle.kind === "ip" ? (ip === null ? "no-trusted-ip" : `ip/${ip}`) : regle.kind === "email" ? `email/${cleEmail}` : `trip/${voyage}`;
      return { cle: rateLimitKey(secret, rateLimitMessage(action, regle.windowSeconds, espece)), regle };
    });

    let refusee: RateLimitKind | undefined;
    let client: RateLimitClient | undefined;
    try {
      client = await (pool ??= poolParDefaut()).connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE vadrouille_limiter");
      for (const { cle, regle } of cles) {
        const ligne = (await client.query(INCREMENT, [cle, regle.windowSeconds])).rows[0] as { count?: unknown } | undefined;
        const compte = Number(ligne?.count);
        // Au-delà du seuil (ou compteur illisible) : refus, et les clés suivantes ne sont ni lues ni incrémentées.
        if (!Number.isSafeInteger(compte) || compte > regle.threshold) {
          refusee = regle.kind;
          break;
        }
      }
      await client.query("COMMIT");
      client.release();
    } catch (error) {
      if (client) {
        await rollback(client);
        client.release(error instanceof Error ? error : true);
      }
      logEvent("rate_limit.failed", { action, errorName: errorNameOf(error) }, "error");
      return REFUS_FERME;
    }
    await purger();
    return refusee === undefined ? VERDICT_ADMIS : Object.freeze({ ok: false, kind: refusee });
  }

  async function check(request: RateLimitRequest): Promise<Result<void>> {
    return (await verdict(request)).ok ? ADMIS : REFUS;
  }

  return { check, verdict };
}

let limiteurParDefaut: RateLimiter | undefined;

/** Limiteur du serveur (configuration de `src/server/config/limites.ts`, `serverEnv()`, pool de `vadrouille_app`). */
export function checkRateLimit(request: RateLimitRequest): Promise<Result<void>> {
  return (limiteurParDefaut ??= createRateLimiter()).check(request);
}

/** Même limiteur, verdict détaillé (espèce de la règle qui refuse ; M5d-1, `lieu.recherche`). */
export function verdictRateLimit(request: RateLimitRequest): Promise<RateLimitVerdict> {
  return (limiteurParDefaut ??= createRateLimiter()).verdict(request);
}
