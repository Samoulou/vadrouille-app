import { fail, ok, type CodeRequest, type CodeVerification, type Result, type Session } from "@/contracts";
import { BETTER_AUTH_CONFIG } from "@/server/auth/config";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";

import type { AdapterContext, AuthAdapter, MemberRole } from "./types";

export { BETTER_AUTH_CONFIG };

/**
 * Adaptateur `better-auth` (spécification B3, B3c points 1 à 3 ; décisions 0008 et 0077 § 5.6) : implémente
 * `AuthAdapter` en déléguant aux opérations de la liste blanche (`src/server/auth`), sans jamais toucher la bibliothèque.
 *
 * Ordre des contrôles de `requestCode` et `verifyCode` (B3c point 2), appelés par les actions de `compte.ts` après leur
 * `parseInput` : 1. `parseEmailAddress` (liste blanche de caractères, forme canonique), refus `validation_failed`
 * **sans** écriture du limiteur ni appel de la bibliothèque ou du port d'envoi ; 2. limiteur (adresse IP de confiance,
 * puis e-mail canonique), refus `rate_limited` (`retryable: true`) sans appel de l'opération ; 3. opération, qui ne
 * reçoit que la forme canonique. Aucune organisation n'est reçue du client : la session vient du cookie seul.
 *
 * Erreurs : codes de `API_ERROR_CODES` seulement (tableau de `src/server/auth/erreurs.ts`) ; `provider_error` porte
 * `retryable: true` ; aucune valeur reçue, aucun message de la bibliothèque ni du port d'envoi dans une réponse.
 *
 * **Branchement au démarrage** (sur le modèle de `brancherLectureProgrammesReels`, décision 0074) : ce module n'importe
 * ni la bibliothèque, ni la base, ni le limiteur (régime de confinement : les doubles de `@/adapters` chargent le module
 * réel, qui ne doit atteindre aucun module à capacité). `src/instrumentation.ts` branche, quand `AUTH_ADAPTER` vaut
 * `better-auth`, les opérations de `authOperations()`, `checkRateLimit` et `getServerRequestContext()`. Non branché
 * (tests, `next build`) : chaque opération rend `provider_error` et le contexte de session lève (échec fermé).
 */

/** Échec d'une opération de la liste blanche (forme de `AuthFailure`, `src/server/auth`). */
export type EchecConnexion = { readonly ok: false; readonly code: "invalid_code" | "code_expired" | "too_many_attempts" | "unauthenticated" | "provider_error" };
export type SessionOuverte = { readonly sessionId: string; readonly userId: string; readonly organizationId: string; readonly role: MemberRole };

/** Opérations de la liste blanche (forme de `AuthOperations`, `src/server/auth`) : seules celles que l'adaptateur appelle. */
export interface OperationsConnexion {
  requestCode(email: CanonicalEmail): Promise<{ readonly ok: true } | EchecConnexion>;
  verifyCode(demande: { readonly email: CanonicalEmail; readonly code: string; readonly headers?: Headers }): Promise<({ readonly ok: true } & SessionOuverte) | EchecConnexion>;
  readSession(headers: Headers): Promise<SessionOuverte | null>;
  signOut(headers: Headers): Promise<{ readonly ok: true } | EchecConnexion>;
}

/** Demande au limiteur (forme de `RateLimitRequest`, `src/server/rate-limit.ts`). */
export type DemandeLimiteur = { readonly action: string; readonly headers: Headers; readonly email?: CanonicalEmail };
export type Limiteur = (demande: DemandeLimiteur) => Promise<Result<void>>;

/** Noms d'action du limiteur (`src/server/config/limites.ts`). */
export type BetterAuthLimitActions = { readonly requestCode: string; readonly verifyCode: string };
const ACTIONS_PAR_DEFAUT: BetterAuthLimitActions = Object.freeze({ requestCode: "request-code", verifyCode: "verify-code" });

export interface BetterAuthAdapterOptions {
  /** Opérations de la liste blanche (`authOperations()` sur le serveur ; configuration injectée dans les tests). */
  operations: () => OperationsConnexion | Promise<OperationsConnexion>;
  /** En-têtes de la requête : cookie de session et en-tête d'adresse IP de confiance (`next/headers` sur le serveur). */
  headers: () => Headers | Promise<Headers>;
  /** Limiteur (`checkRateLimit` sur le serveur ; limiteur injecté dans les tests). */
  limiter: Limiteur;
  /** Noms d'action du limiteur ; un nom propre à chaque test isole ses compteurs (critère C4). */
  actions?: BetterAuthLimitActions;
}

/**
 * En-têtes transmis aux opérations (revue consolidée du head `2b80bd7` de la PR 452, mineur 4 ; aligné sur
 * `cookieSeulement` de `src/server/session.ts`) : le cookie de session seul pour `readSession` et `signOut` ; pour
 * `verifyCode`, le cookie et `x-vercel-forwarded-for`, seul en-tête d'adresse IP que la bibliothèque peut lire
 * (`TRUSTED_IP_HEADERS` de `src/server/env`, `advanced.ipAddress.ipAddressHeaders`, décision 0008). Le limiteur reçoit
 * les en-têtes de la requête : il ne lit que l'en-tête de confiance configuré (`src/server/ip.ts`).
 */
const ENTETES_SESSION = ["cookie"] as const;
const ENTETES_VERIFICATION = ["cookie", "x-vercel-forwarded-for"] as const;

function enTetesRetenus(source: Headers, noms: readonly string[]): Headers {
  const retenus = new Headers();
  for (const nom of noms) {
    const valeur = source.get(nom);
    if (valeur !== null) retenus.set(nom, valeur);
  }
  return retenus;
}

/** `provider_error` porte toujours `retryable: true` (B3-PO-4). */
const REFUS_FOURNISSEUR = Object.freeze({ ok: false, error: Object.freeze({ code: "provider_error", retryable: true }) }) as Result<never>;

function echec<T>(failure: EchecConnexion): Result<T> {
  return failure.code === "provider_error" ? REFUS_FOURNISSEUR : fail(failure.code);
}

/** Copie fermée de la session : identifiants seulement, jamais le jeton ni le rôle (B3-PO-9). */
function versSession(session: SessionOuverte): Session {
  return { sessionId: session.sessionId, userId: session.userId, organizationId: session.organizationId };
}

export function createBetterAuthAdapter(options: BetterAuthAdapterOptions): AuthAdapter {
  const actions = options.actions ?? ACTIONS_PAR_DEFAUT;

  return {
    config: BETTER_AUTH_CONFIG,
    mode: "real",

    async requestCode({ email }: CodeRequest): Promise<Result<{ sent: true }>> {
      const lu = parseEmailAddress(email);
      if (!lu.ok) return fail("validation_failed", "email");
      try {
        const headers = await options.headers();
        const limite = await options.limiter({ action: actions.requestCode, headers, email: lu.email });
        if (!limite.ok) return limite;
        const resultat = await (await options.operations()).requestCode(lu.email);
        return resultat.ok ? ok({ sent: true }) : echec(resultat);
      } catch {
        return REFUS_FOURNISSEUR;
      }
    },

    async verifyCode({ email, code }: CodeVerification): Promise<Result<Session>> {
      const lu = parseEmailAddress(email);
      if (!lu.ok) return fail("validation_failed", "email");
      try {
        const headers = await options.headers();
        const limite = await options.limiter({ action: actions.verifyCode, headers, email: lu.email });
        if (!limite.ok) return limite;
        const resultat = await (await options.operations()).verifyCode({ email: lu.email, code, headers: enTetesRetenus(headers, ENTETES_VERIFICATION) });
        return resultat.ok ? ok(versSession(resultat)) : echec(resultat);
      } catch {
        return REFUS_FOURNISSEUR;
      }
    },

    // `getSession` et `signOut` sans `try/catch` (revue consolidée du head `2b80bd7` de la PR 452, mineur 11) : le
    // contrat `AuthAdapter` les type sans `Result` (`Session | null`, `void`) ; une panne doit rester distincte d'une
    // absence de session, donc lever. Chaque appelant ferme : `hasSession` rend `false`, `signOut` (action) et
    // `createTrip` rendent `provider_error`, le contexte de page passe par `contexteDeSessionBranche` (page d'erreur).
    async getSession(): Promise<Session | null> {
      const session = await (await options.operations()).readSession(enTetesRetenus(await options.headers(), ENTETES_SESSION));
      return session === null ? null : versSession(session);
    },

    async signOut(): Promise<void> {
      const resultat = await (await options.operations()).signOut(enTetesRetenus(await options.headers(), ENTETES_SESSION));
      if (!resultat.ok) throw new ConnexionIndisponibleError();
    },
  };
}

/** Connexion réelle non branchée, ou déconnexion en échec ; ne porte aucune valeur. */
export class ConnexionIndisponibleError extends Error {
  override name = "ConnexionIndisponibleError";

  constructor() {
    super("Connexion réelle indisponible.");
  }
}

/** Ce que `src/instrumentation.ts` branche au démarrage. */
export interface ConnexionReelle {
  /** `authOperations()` de `src/server/auth` (pools créés au premier appel). */
  operations: () => OperationsConnexion;
  /** `checkRateLimit` de `src/server/rate-limit.ts`. */
  limiter: Limiteur;
  /** `getServerRequestContext()` de `src/server/session.ts`. */
  contexte: () => Promise<AdapterContext | null>;
}

const CONNEXION_KEY = Symbol.for("vadrouille.connexion-reelle");
const holder = globalThis as typeof globalThis & { [CONNEXION_KEY]?: ConnexionReelle };

/** Second branchement refusé : la connexion branchée au démarrage n'est jamais remplacée ; ne porte aucune valeur. */
export class ConnexionDejaBrancheeError extends Error {
  override name = "ConnexionDejaBrancheeError";

  constructor() {
    super("Connexion réelle déjà branchée.");
  }
}

/**
 * Branche la connexion réelle (appelé une fois, au démarrage, par `src/instrumentation.ts`). Sur `globalThis` : Next.js
 * charge une copie de ce module par route.
 *
 * Point d'injection verrouillé (revue consolidée du head `2b80bd7` de la PR 452, bloquant 2) : hors de `tests/`, seuls
 * ce module et `src/instrumentation.ts` le nomment (`tests/unit/auth/points-injection.test.ts`). Un second branchement
 * lève `ConnexionDejaBrancheeError` sans rien remplacer : un module chargé après le démarrage ne peut pas substituer
 * ses opérations, son limiteur ou son contexte de session (organisation) à ceux du serveur.
 */
export function brancherConnexionReelle(connexion: ConnexionReelle): void {
  if (holder[CONNEXION_KEY] !== undefined) throw new ConnexionDejaBrancheeError();
  holder[CONNEXION_KEY] = connexion;
}

/**
 * Remise à zéro du branchement, **réservée aux tests** : hors de `tests/`, seul ce module la nomme
 * (`tests/unit/auth/points-injection.test.ts`). Le serveur ne l'appelle jamais.
 */
export function debrancherConnexionReellePourTests(): void {
  delete holder[CONNEXION_KEY];
}

function branchee(): ConnexionReelle {
  const connexion = holder[CONNEXION_KEY];
  if (connexion === undefined) throw new ConnexionIndisponibleError();
  return connexion;
}

/** Contexte de la session de la requête (`getServerRequestContext()`, branché) ; non branché : lève. */
export function contexteDeSessionBranche(): Promise<AdapterContext | null> {
  return branchee().contexte();
}

/** Adaptateur du serveur : connexion branchée au démarrage, en-têtes de la requête Next.js. */
export function betterAuthServerAdapter(): AuthAdapter {
  return createBetterAuthAdapter({
    operations: () => branchee().operations(),
    headers: async () => new Headers(await (await import("next/headers")).headers()),
    limiter: (demande) => branchee().limiter(demande),
  });
}
