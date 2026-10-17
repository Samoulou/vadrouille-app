import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, organization } from "better-auth/plugins";
import { memberAc, ownerAc } from "better-auth/plugins/organization/access";

import { PRODUCT_NAME } from "@/config/site";
import { logEvent } from "@/server/log";

import type { Database } from "../../db/index.ts";
import { fabriqueAdaptateur, MODELES } from "./adaptateur";
import { cleCodeConnexion, secretBetterAuth } from "./cles";
import { hacheurCode } from "./code-otp";
import { CODE_CONNEXION, cookiesSecurises, type EnteteIpDeConfiance, entetesIp, type EnvironnementAuth, PREFIXE_COOKIES, SESSION } from "./options";
import { organisationPersonnelle } from "./organisations";

/**
 * Configuration de Better Auth 1.7.7 (spécification B3, B3b point 2 ; décision 0008 et son amendement par B3b).
 * Importable depuis `src/server/auth/**` seulement (`ligne/better-auth-confinement`) ; l'objet rendu n'en sort jamais.
 *
 * - Adaptateur Drizzle sur le pool `vadrouille_auth` (garde de connexion de B1), enveloppé par la création atomique du
 *   compte (`./creation-compte.ts`, vérification 7.9) et par le hachage des jetons de session (`./jetons-haches.ts`,
 *   B3-TL-9) : `./adaptateur.ts` ; tables de B1, identifiants `uuid`.
 * - `emailOTP` : 6 chiffres, 10 minutes, 3 essais, inscription à la première vérification réussie ; code stocké en
 *   HMAC-SHA-256 à clé lié à l'adresse (`./code-otp.ts`) ; l'envoi passe par le seul rappel `envoyerCode`, fourni par
 *   `src/server/auth` (contrôle refait de l'adresse, puis port `CodeMailer`).
 * - `organization` : rôles `owner` et `member` ; création par l'utilisateur, invitations, changements de rôle, retrait
 *   de membre, mise à jour et suppression d'organisation désactivés (et refusés par les crochets d'organisation).
 * - `nextCookies` (dernier greffon).
 * - Secret : clé dérivée `vadrouille/better-auth/v1` (`./cles.ts`), passée en `secret` **et** en `secrets` : la
 *   bibliothèque ne lit alors ni `BETTER_AUTH_SECRET`, ni `AUTH_SECRET`, ni `BETTER_AUTH_SECRETS` (vérification 7.13).
 * - Aucun gestionnaire HTTP n'est monté (B3b point 3) ; le limiteur intégré, qui ne s'applique qu'à ce gestionnaire
 *   (vérification 7.2), est désactivé ; télémétrie désactivée ; journal redirigé vers `src/server/log.ts` (événement
 *   `auth.library_log`, sans message ni argument).
 */

export type ConfigurationAuth = {
  readonly environment: EnvironnementAuth;
  /** Octets décodés de `BETTER_AUTH_SECRET` (`decodeSecret`, B3-TL-5). Jamais transmis tels quels. */
  readonly secret: Buffer;
  /** `BETTER_AUTH_URL`. */
  readonly baseUrl: string;
  /** `APP_URL`, seule origine de confiance. */
  readonly appUrl: string;
  readonly trustedIpHeader: EnteteIpDeConfiance | null;
  /** Client Drizzle du rôle `vadrouille_auth`. */
  readonly database: Database;
  /** Rappel d'envoi du code (`src/server/auth`) : lève en cas de refus. */
  readonly envoyerCode: (donnees: { readonly email: string; readonly otp: string }) => Promise<void>;
};

/** Création d'une session refusée : organisation personnelle en suppression (handover § 12, étape c). */
export class OrganisationEnSuppressionError extends Error {
  override name = "OrganisationEnSuppressionError";
  readonly userId: string;

  constructor(userId: string) {
    super("Organisation en suppression : aucune session.");
    this.userId = userId;
  }
}

/** Création d'une session refusée : aucune organisation personnelle. Ne porte aucune valeur. */
export class OrganisationAbsenteError extends Error {
  override name = "OrganisationAbsenteError";

  constructor() {
    super("Organisation personnelle absente : aucune session.");
  }
}

/** Opération d'organisation hors de la liste blanche : refusée. */
export class OperationOrganisationRefuseeError extends Error {
  override name = "OperationOrganisationRefuseeError";

  constructor() {
    super("Opération d'organisation désactivée (décision 0008).");
  }
}

const refuser = async (): Promise<never> => {
  throw new OperationOrganisationRefuseeError();
};

export function creerAuth(config: ConfigurationAuth) {
  const secret = secretBetterAuth(config.secret);
  const database = config.database;

  return betterAuth({
    appName: PRODUCT_NAME,
    baseURL: config.baseUrl,
    trustedOrigins: [config.appUrl],
    secret,
    secrets: [{ version: 1, value: secret }],
    database: fabriqueAdaptateur(database),
    emailAndPassword: { enabled: false },
    user: MODELES.user,
    account: MODELES.account,
    verification: { ...MODELES.verification, disableCleanup: true },
    session: {
      ...MODELES.session,
      expiresIn: SESSION.dureeSecondes,
      updateAge: SESSION.prolongationSecondes,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    logger: {
      level: "warn",
      log: (niveau) => logEvent("auth.library_log", {}, niveau === "error" ? "error" : "warn"),
    },
    advanced: {
      cookiePrefix: PREFIXE_COOKIES,
      useSecureCookies: cookiesSecurises(config.environment),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      ipAddress: { ipAddressHeaders: entetesIp(config.trustedIpHeader), disableIpTracking: false },
      // `validateSchema: false` (décision 0082) : n'arrête que la comparaison du schéma que 1.7.7 lance à l'initialisation
      // (`auth/base.mjs`), qui ne refuse rien et ne fait que journaliser un écart ; le schéma fait foi par
      // `db/schema/auth.ts`, les migrations et les tests de base.
      database: { generateId: "uuid", validateSchema: false },
    },
    databaseHooks: {
      session: {
        create: {
          // IP et agent utilisateur vidés (vérification 7.4) ; organisation personnelle active ; refus si elle est en
          // suppression : la session n'est pas créée et aucun cookie n'est posé (vérification 7.3).
          before: async (session) => {
            const personnelle = await organisationPersonnelle(database, session.userId);
            if (personnelle === null) throw new OrganisationAbsenteError();
            if (personnelle.enSuppression) throw new OrganisationEnSuppressionError(session.userId);
            return { data: { ...session, ipAddress: undefined, userAgent: undefined, activeOrganizationId: personnelle.id } };
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: CODE_CONNEXION.chiffres,
        expiresIn: CODE_CONNEXION.dureeSecondes,
        allowedAttempts: CODE_CONNEXION.essais,
        disableSignUp: false,
        storeOTP: { hash: hacheurCode(cleCodeConnexion(config.secret)) },
        sendVerificationOTP: async ({ email, otp }) => config.envoyerCode({ email, otp }),
      }),
      organization({
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        creatorRole: "owner",
        roles: { owner: ownerAc, member: memberAc },
        organizationHooks: {
          beforeCreateOrganization: refuser,
          beforeUpdateOrganization: refuser,
          beforeDeleteOrganization: refuser,
          beforeAddMember: refuser,
          beforeRemoveMember: refuser,
          beforeUpdateMemberRole: refuser,
          beforeCreateInvitation: refuser,
          beforeAcceptInvitation: refuser,
        },
        schema: {
          organization: {
            modelName: "organizations",
            additionalFields: { kind: { type: "string", required: true, input: false } },
          },
          member: { modelName: "memberships" },
        },
      }),
      nextCookies(),
    ],
  });
}

export type InstanceAuth = ReturnType<typeof creerAuth>;
