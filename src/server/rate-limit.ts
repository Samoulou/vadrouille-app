import "server-only";

import { createHmac } from "node:crypto";

import type { Result } from "@/contracts";
import { RATE_LIMIT_PURGE_BATCH, RATE_LIMIT_ROWS_ALERT, RATE_LIMIT_ROWS_ALERT_INTERVAL_MS, RATE_LIMITS, type RateLimitConfig } from "@/server/config/limites";
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
 *   (adresse IP, puis e-mail) ; l'incrément s'arrête à la première clé au-dessus de son seuil (0051 point 6.2.2).
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

export type RateLimiter = { check(request: RateLimitRequest): Promise<Result<void>> };

const ACTION = /^[a-z][a-z0-9-]{0,47}$/;
const REFUS: Result<void> = Object.freeze({ ok: false, error: Object.freeze({ code: "rate_limited", retryable: true }) }) as Result<void>;
const ADMIS: Result<void> = Object.freeze({ ok: true, value: undefined });

/** Message à préfixe de domaine (B3-TL-6 point 1) ; l'espèce est `ip/<clé>`, `email/<clé>` ou `no-trusted-ip`. */
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

  async function check(request: RateLimitRequest): Promise<Result<void>> {
    const { action } = request;
    const regles = ACTION.test(action) && Object.hasOwn(config, action) ? config[action] : undefined;
    if (regles === undefined || regles.length === 0) {
      logEvent("rate_limit.failed", { errorName: "UnknownAction" }, "error");
      return REFUS;
    }
    const env = reglages(action);
    if (env === null) return REFUS;
    // Défense en profondeur (0051 point 4.5) : le limiteur ne normalise rien, il refuse une adresse non canonique.
    const avecEmail = regles.some((regle) => regle.kind === "email");
    const cleEmail = request.email !== undefined && isCanonicalEmail(request.email) ? rateLimitEmailKey(request.email) : null;
    if (avecEmail && cleEmail === null) {
      logEvent("rate_limit.failed", { action, errorName: "NonCanonicalEmail" }, "error");
      return REFUS;
    }

    const ip = trustedIpKey(request.headers, env.trustedIpHeader);
    if (ip === null) logEvent("rate_limit.no_trusted_ip", { action }, "warn");
    const secret = env.secret;
    const cles = regles.map((regle) => {
      const espece =
        regle.kind === "ip" ? (ip === null ? "no-trusted-ip" : `ip/${ip}`) : `email/${cleEmail}`;
      return { cle: rateLimitKey(secret, rateLimitMessage(action, regle.windowSeconds, espece)), regle };
    });

    let refuse = false;
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
          refuse = true;
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
      return REFUS;
    }
    await purger();
    return refuse ? REFUS : ADMIS;
  }

  return { check };
}

let limiteurParDefaut: RateLimiter | undefined;

/** Limiteur du serveur (configuration de `src/server/config/limites.ts`, `serverEnv()`, pool de `vadrouille_app`). */
export function checkRateLimit(request: RateLimitRequest): Promise<Result<void>> {
  return (limiteurParDefaut ??= createRateLimiter()).check(request);
}
