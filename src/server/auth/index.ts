import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { sql } from "drizzle-orm";

import { createDatabase, type Database } from "../../../db/index.ts";
import type { MemberRole } from "@/adapters/types";
import { type CanonicalEmail, isCanonicalEmail } from "@/server/email";
import { serverEnv } from "@/server/env";
import { errorNameOf, logEvent } from "@/server/log";
import { disabledCodeMailer } from "@/server/mail/disabled";
import type { CodeMailer } from "@/server/mail/port";
import { createSmtpCodeMailer } from "@/server/mail/smtp";
import { creerAuth, type InstanceAuth, OrganisationEnSuppressionError } from "@/tenancy/auth";
import { avecAdresse } from "@/tenancy/code-otp";
import { hacherJeton } from "@/tenancy/jetons-haches";
import { CODE_CONNEXION, type EnteteIpDeConfiance, type EnvironnementAuth } from "@/tenancy/options";
import { adhesion, organisationPersonnelle } from "@/tenancy/organisations";

import { envoyerCodeRecu } from "./envoi";
import { type AuthFailureCode, codeEchec } from "./erreurs";
import { reprendreSuppression } from "./reprise";

/**
 * Opérations de la liste blanche (spécification B3, B3b point 4 ; décision 0008) : envoi d'un code de connexion,
 * connexion par code, lecture de la session, déconnexion ; la création de l'utilisateur, de l'organisation
 * personnelle et de l'adhésion `owner` passe par la configuration (`@/tenancy/auth`). Seul dossier, avec
 * `src/tenancy`, autorisé à importer `better-auth`, et seul importateur de `@/tenancy/auth`
 * (`ligne/better-auth-confinement`). L'objet `auth` et `auth.api` ne sont **jamais** exportés, réexportés, passés en
 * argument ni rendus : ce module n'exporte que des fonctions et des types.
 *
 * Aucune route HTTP : les opérations appellent `auth.api.<opération>` directement (vérification 7.6). Le limiteur
 * (`action_rate_limits`) est appelé **avant** ces opérations par les actions (B3c) ; ces fonctions ne le
 * remplacent pas.
 *
 * Erreurs : codes fermés de `API_ERROR_CODES` ; jamais une chaîne de la bibliothèque ; le journal n'écrit que
 * l'action et `error.name` (`auth.operation_failed`).
 */

/** Codes d'échec des opérations (sous-ensemble de `API_ERROR_CODES`, `./erreurs.ts`). */
export type { AuthFailureCode } from "./erreurs";
export type AuthFailure = { readonly ok: false; readonly code: AuthFailureCode };

/** Session ouverte ou lue : identifiants seulement, jamais le jeton. */
export type AuthSession = {
  readonly sessionId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly role: MemberRole;
};

export type AuthOperations = {
  /** Envoie un code de connexion ; aucune ligne `users` n'est créée (B3-PO-1). */
  readonly requestCode: (email: CanonicalEmail) => Promise<{ readonly ok: true } | AuthFailure>;
  /** Vérifie le code ; à la première réussite d'une adresse inconnue, crée le compte et son organisation personnelle. */
  readonly verifyCode: (demande: {
    readonly email: CanonicalEmail;
    readonly code: string;
    readonly headers?: Headers;
  }) => Promise<({ readonly ok: true } & AuthSession) | AuthFailure>;
  /** Lit la session du cookie ; `null` sans session, adhésion absente ou organisation en suppression. */
  readonly readSession: (headers: Headers) => Promise<AuthSession | null>;
  /** Ferme la session du cookie (idempotente). */
  readonly signOut: (headers: Headers) => Promise<{ readonly ok: true } | AuthFailure>;
};

/**
 * Configuration injectée (comme le limiteur, B3a point 6) : les tests passent leur base, leur port d'envoi et leur
 * secret tiré au hasard ; aucune variable d'environnement ne choisit le port.
 */
export type AuthOperationsConfig = {
  readonly environment: EnvironnementAuth;
  /** Octets décodés de `BETTER_AUTH_SECRET` ; `null` : chaque opération rend `provider_error` (critère C6). */
  readonly secret: Buffer | null;
  readonly baseUrl: string;
  readonly appUrl: string;
  readonly trustedIpHeader: EnteteIpDeConfiance | null;
  /** Client Drizzle de `vadrouille_auth` : bibliothèque, crochets, purges et lectures de contexte. */
  readonly database: Database;
  /** Second client de `vadrouille_auth`, réservé au verrou de vérification (aucune attente sur le pool principal). */
  readonly verrous: Database;
  readonly mailer: CodeMailer;
  /** Reçoit chaque `Set-Cookie` de la bibliothèque (tests ; hors requête Next.js, `nextCookies` ne pose rien). */
  readonly onSetCookie?: (setCookie: string) => void;
};

/** Lignes purgées au plus par table et par appel (purge technique par lot borné, handover § 12). */
const LOT_PURGE = 100;
/** Attente maximale du verrou de vérification d'une adresse. */
const ATTENTE_VERROU = "5s";
/**
 * Bornes des pools de B3b (revue consolidée du head `f0b8c5a`, mineur 1) : connexions plafonnées, attente d'une
 * connexion et durée d'une requête bornées. Le garde-fou contre un afflux reste le limiteur par adresse (B3c).
 */
const POOL_OPERATIONS = { max: 10, connectionTimeoutMillis: 5_000, query_timeout: 10_000 } as const;
const POOL_VERROUS = { max: 5, connectionTimeoutMillis: 5_000, query_timeout: 10_000 } as const;
/** Durée maximale d'une opération tenue sous le verrou d'une adresse (envoi ou vérification). */
const DUREE_SOUS_VERROU_MS = 20_000;
/** Forme d'un code de connexion : 6 chiffres ASCII (B3-PO-4). */
const FORME_CODE = /^[0-9]{6}$/;

/** Le délai d'une opération tenue sous verrou est dépassé ; ne porte aucune valeur. */
class DelaiDepasseError extends Error {
  override name = "DelaiDepasseError";

  constructor() {
    super("Délai dépassé.");
  }
}

/**
 * Rejette après `ms` si `promesse` n'est pas réglée ; la transaction englobante (et son verrou) est alors annulée. Better
 * Auth 1.7.7 n'accepte aucun signal d'annulation sur `auth.api` : l'opération en cours n'est pas interrompue et peut
 * finir hors du verrou (revue consolidée du head `ed79edb` de la PR 446, mineur 3 ; noté dans 0008, vérification 7.11).
 * Risque borné par `query_timeout` (10 s) et par le limiteur des actions (B3c).
 */
function avecDelai<T>(promesse: Promise<T>, ms: number): Promise<T> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, rejeter) => {
    minuterie = setTimeout(() => rejeter(new DelaiDepasseError()), ms);
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuterie));
}

const echec = (code: AuthFailureCode): AuthFailure => Object.freeze({ ok: false, code });
const identifiantCode = (email: CanonicalEmail) => `sign-in-otp-${email}`;

/** Code d'erreur de Better Auth (`APIError#body.code`), lu sans jamais lire le message. */
function codeBibliotheque(erreur: unknown): string | undefined {
  if (typeof erreur !== "object" || erreur === null || !("body" in erreur)) return undefined;
  const corps = (erreur as { body?: unknown }).body;
  if (typeof corps !== "object" || corps === null || !("code" in corps)) return undefined;
  const code = (corps as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function journaliserEchec(action: string, erreur: unknown): AuthFailure {
  const errorName = errorNameOf(erreur);
  logEvent("auth.operation_failed", errorName === undefined ? { action } : { action, errorName }, "error");
  return echec("provider_error");
}

/**
 * État de l'envoi de l'appel en cours. Better Auth 1.7.7 avale l'erreur du rappel d'envoi (`runInBackgroundOrAwait`
 * la journalise et rend un succès) : le rappel note ici l'envoi ou l'erreur, et `requestCode` en tire `provider_error`.
 */
type EtatEnvoi = { envoye: boolean; erreur: unknown };

export function createAuthOperations(config: AuthOperationsConfig): AuthOperations {
  const { database } = config;
  const secret = config.secret;
  const envoiCourant = new AsyncLocalStorage<EtatEnvoi>();
  let instance: InstanceAuth | undefined;
  const auth = (): InstanceAuth | null => {
    if (secret === null) return null;
    instance ??= creerAuth({
      environment: config.environment,
      secret,
      baseUrl: config.baseUrl,
      appUrl: config.appUrl,
      trustedIpHeader: config.trustedIpHeader,
      database,
      envoyerCode: async (recu) => {
        const etat = envoiCourant.getStore();
        try {
          await envoyerCodeRecu(config.mailer, recu);
          if (etat !== undefined) etat.envoye = true;
        } catch (erreur) {
          if (etat !== undefined) etat.erreur = erreur;
          throw erreur;
        }
      },
    });
    return instance;
  };
  const transmettreCookies = (headers: Headers) => {
    if (config.onSetCookie === undefined) return;
    for (const valeur of headers.getSetCookie()) config.onSetCookie(valeur);
  };

  /** Verrou de transaction de l'adresse (`identifiant`), attente bornée par `lock_timeout`. */
  async function verrouiller(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], identifiant: string): Promise<void> {
    await tx.execute(sql`SELECT set_config('lock_timeout', ${ATTENTE_VERROU}, true)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${identifiant}, 0))`);
  }

  /**
   * Purge technique, par lot borné : vérifications et sessions expirées (vérification 7.5). `garder` : identifiant de
   * vérification de l'appel en cours, épargné pour que `verifyCode` puisse répondre `code_expired`. Ne lève jamais.
   */
  async function purger(garder = ""): Promise<void> {
    try {
      await database.execute(
        sql`DELETE FROM verifications WHERE id IN (SELECT id FROM verifications WHERE expires_at < now() AND identifier <> ${garder} ORDER BY expires_at LIMIT ${LOT_PURGE})`,
      );
      await database.execute(sql`DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < now() ORDER BY expires_at LIMIT ${LOT_PURGE})`);
    } catch (erreur) {
      const errorName = errorNameOf(erreur);
      logEvent("auth.purge_failed", errorName === undefined ? {} : { errorName }, "warn");
    }
  }

  /** Défense en profondeur (0051 § 4.5) : la valeur reçue doit être déjà canonique. */
  function adresseAdmise(email: CanonicalEmail): boolean {
    if (isCanonicalEmail(email)) return true;
    logEvent("email.address_refused", {}, "warn");
    return false;
  }

  async function requestCode(email: CanonicalEmail): Promise<{ readonly ok: true } | AuthFailure> {
    const a = auth();
    if (a === null) return journaliserEchec("request-code", undefined);
    if (!adresseAdmise(email)) return echec("provider_error");
    const identifiant = identifiantCode(email);
    try {
      await purger();
      // Sous le verrou de l'adresse (revue du head `f0b8c5a`, mineur 2) : la suppression préalable et l'envoi ne se
      // croisent ni avec un autre `requestCode` ni avec un `verifyCode` de la même adresse ; il ne reste qu'une ligne.
      await config.verrous.transaction(async (tx) => {
        await verrouiller(tx, identifiant);
        // Un nouveau code remplace l'ancien et remet les essais à zéro (B3-PO-5, vérification 7.7).
        await database.execute(sql`DELETE FROM verifications WHERE identifier = ${identifiant}`);
        const etat: EtatEnvoi = { envoye: false, erreur: undefined };
        await avecDelai(
          envoiCourant.run(etat, () => avecAdresse(email, () => a.api.sendVerificationOTP({ body: { email, type: "sign-in" } }))),
          DUREE_SOUS_VERROU_MS,
        );
        if (!etat.envoye) throw etat.erreur ?? new EnvoiNonFaitError();
      });
      return Object.freeze({ ok: true });
    } catch (erreur) {
      // Envoi refusé ou en panne : aucun code utilisable ne reste en base.
      await database.execute(sql`DELETE FROM verifications WHERE identifier = ${identifiant}`).catch(() => undefined);
      return journaliserEchec("request-code", erreur);
    }
  }

  async function sessionDuJeton(jeton: string): Promise<string | null> {
    const resultat = await database.execute<{ id: string }>(sql`SELECT id FROM sessions WHERE token = ${hacherJeton(jeton)} LIMIT 1`);
    return resultat.rows[0]?.id ?? null;
  }

  async function verifyCode(demande: {
    readonly email: CanonicalEmail;
    readonly code: string;
    readonly headers?: Headers;
  }): Promise<({ readonly ok: true } & AuthSession) | AuthFailure> {
    const a = auth();
    if (a === null) return journaliserEchec("verify-code", undefined);
    const { email, code } = demande;
    if (!adresseAdmise(email)) return echec("provider_error");
    // Forme contrôlée avant toute connexion et tout verrou (revue du head `f0b8c5a`, mineur 3) : aucun essai compté.
    if (!FORME_CODE.test(code)) return echec("invalid_code");
    const identifiant = identifiantCode(email);
    try {
      await purger(identifiant);
      // Verrou par adresse (vérifications 7.11 et 7.12, décision 0082) : la ligne de vérification est relue sous le
      // verrou avant tout appel à la bibliothèque. Ce n'est pas une barrière anti-contournement (la consommation de
      // 1.7.7 est déjà atomique) : le verrou rend déterministe la réponse exigée par B1. Au-delà de 3 essais, la ligne
      // reste et chaque essai rend `too_many_attempts`, code juste compris, jusqu'à un nouveau code ou l'expiration.
      return await config.verrous.transaction(async (tx) => {
        await verrouiller(tx, identifiant);
        const lu = await tx.execute<{ value: string; expiree: boolean }>(
          sql`SELECT value, expires_at <= now() AS expiree FROM verifications WHERE identifier = ${identifiant} ORDER BY created_at DESC LIMIT 1`,
        );
        const ligne = lu.rows[0];
        if (ligne === undefined) return echec("invalid_code");
        if (ligne.expiree) return echec("code_expired");
        const essais = Number.parseInt(ligne.value.slice(ligne.value.lastIndexOf(":") + 1), 10);
        if (!Number.isSafeInteger(essais) || essais >= CODE_CONNEXION.essais) return echec("too_many_attempts");
        return avecDelai(connecter(a, email, code, demande.headers ?? new Headers()), DUREE_SOUS_VERROU_MS);
      });
    } catch (erreur) {
      return journaliserEchec("verify-code", erreur);
    }
  }

  async function connecter(
    a: InstanceAuth,
    email: CanonicalEmail,
    code: string,
    headers: Headers,
  ): Promise<({ readonly ok: true } & AuthSession) | AuthFailure> {
    let reponse;
    try {
      reponse = await avecAdresse(email, () => a.api.signInEmailOTP({ body: { email, otp: code }, headers, returnHeaders: true }));
    } catch (erreur) {
      if (erreur instanceof OrganisationEnSuppressionError) {
        // Handover § 12 : (c) aucune session ni cookie ; (d) reprise de la suppression (B11) ; (e) `unauthenticated`.
        await reprendreSuppression(erreur.userId);
        return echec("unauthenticated");
      }
      // Seul tableau de correspondance (B3c point 3, `./erreurs.ts`) ; tout autre cas : `provider_error`.
      const code = codeEchec(codeBibliotheque(erreur));
      return code === undefined ? journaliserEchec("verify-code", erreur) : echec(code);
    }
    transmettreCookies(reponse.headers);
    const userId = reponse.response.user.id;
    const [sessionId, personnelle] = await Promise.all([sessionDuJeton(reponse.response.token), organisationPersonnelle(database, userId)]);
    if (sessionId === null || personnelle === null) return journaliserEchec("verify-code", undefined);
    return Object.freeze({ ok: true, sessionId, userId, organizationId: personnelle.id, role: "owner" });
  }

  async function readSession(headers: Headers): Promise<AuthSession | null> {
    const a = auth();
    if (a === null) return null;
    try {
      const lu = await a.api.getSession({ headers, query: { disableCookieCache: true }, returnHeaders: true });
      transmettreCookies(lu.headers);
      const session = lu.response?.session;
      if (!session) return null;
      const organizationId: unknown = session.activeOrganizationId;
      if (typeof organizationId !== "string") return null;
      const membre = await adhesion(database, organizationId, session.userId);
      if (membre === null || membre.enSuppression) return null;
      return Object.freeze({ sessionId: session.id, userId: session.userId, organizationId, role: membre.role });
    } catch (erreur) {
      journaliserEchec("get-session", erreur);
      return null;
    }
  }

  async function signOut(headers: Headers): Promise<{ readonly ok: true } | AuthFailure> {
    const a = auth();
    if (a === null) return journaliserEchec("sign-out", undefined);
    try {
      const sortie = await a.api.signOut({ headers, returnHeaders: true });
      transmettreCookies(sortie.headers);
      return Object.freeze({ ok: true });
    } catch (erreur) {
      return journaliserEchec("sign-out", erreur);
    }
  }

  return Object.freeze({ requestCode, verifyCode, readSession, signOut });
}

let parDefaut: AuthOperations | undefined;

/**
 * Opérations du serveur : configuration de `serverEnv()` (`AUTH_ADAPTER=better-auth`, admis en `local` et `ci`
 * seulement, B3-TL-2), pools `vadrouille_auth` de `db/index.ts`, port d'envoi désactivé (`disabledCodeMailer`)
 * sans `EMAIL_TRANSPORT`, SMTP vers Mailpit (`createSmtpCodeMailer`, B3b-envoi, décision 0098) avec
 * `EMAIL_TRANSPORT=smtp`. Lève une `ServerEnvError` (sans valeur) si la configuration est refusée ou si l'adaptateur
 * n'est pas `better-auth`.
 */
export function authOperations(): AuthOperations {
  if (parDefaut !== undefined) return parDefaut;
  const env = serverEnv();
  if (env.authAdapter !== "better-auth" || env.betterAuth === null) throw new AuthNotConfiguredError();
  parDefaut = createAuthOperations({
    environment: env.betterAuth.environment,
    secret: env.betterAuth.secret,
    baseUrl: env.betterAuth.baseUrl,
    appUrl: env.betterAuth.appUrl,
    trustedIpHeader: env.trustedIpHeader,
    database: createDatabase("vadrouille_auth", undefined, POOL_OPERATIONS),
    verrous: createDatabase("vadrouille_auth", undefined, POOL_VERROUS),
    mailer: env.smtp === null ? disabledCodeMailer : createSmtpCodeMailer(env.smtp),
  });
  return parDefaut;
}

/** Le rappel d'envoi n'a pas été appelé ; ne porte aucune valeur. */
class EnvoiNonFaitError extends Error {
  override name = "EnvoiNonFaitError";

  constructor() {
    super("Code non envoyé.");
  }
}

/** `AUTH_ADAPTER` n'est pas `better-auth` : aucune opération réelle. Ne porte aucune valeur. */
export class AuthNotConfiguredError extends Error {
  override name = "AuthNotConfiguredError";

  constructor() {
    super("Connexion réelle non configurée (AUTH_ADAPTER).");
  }
}
