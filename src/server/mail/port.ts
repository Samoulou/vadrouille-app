import "server-only";

import type { CanonicalEmail } from "@/server/email";

/**
 * Port d'envoi du code de connexion (spécification B3, B3b point 2 ; noms fixés par la décision 0077 § 5.6). Une seule
 * opération : le destinataire est la forme canonique rendue par `parseEmailAddress` (type de marque), le code et sa
 * durée de validité. Le port ne reçoit ni objet, ni corps, ni en-tête, ni option de transport : la composition du
 * message et son envoi appartiennent à l'implémentation (B3b-envoi).
 *
 * Implémentations : `disabledCodeMailer` (`./disabled.ts`), retenue sans `EMAIL_TRANSPORT` ; `createSmtpCodeMailer`
 * (`./smtp.ts`, B3b-envoi), SMTP vers Mailpit seulement, avec `EMAIL_TRANSPORT=smtp` ; `createResendCodeMailer`
 * (`./resend.ts`, B3d, décision 0138), envoi réel par l'API de Resend, avec `EMAIL_TRANSPORT=resend` dans le seul cas
 * admis ; un double de capture hors de `src/` pour les tests (`tests/support/capture-code-mailer.ts`). Le port est
 * **injecté** dans la configuration de `src/server/auth`, jamais choisi par une variable d'environnement.
 *
 * Contrat : un refus ou une panne **lève** (l'opération de `src/server/auth` rend alors `provider_error`) ; le message
 * de l'erreur levée n'est jamais journalisé (seul `error.name` peut l'être, `src/server/log.ts`). Seule exception :
 * `CodeMailerCapError` (plafond global du jour atteint, ou quota du fournisseur atteint), que `src/server/auth` traduit
 * en `email_cap_reached` (`retryable: false` ; spécification B3d, point 4).
 */
export type LoginCodeMessage = {
  readonly to: CanonicalEmail;
  readonly code: string;
  readonly expiresInMinutes: number;
};

export interface CodeMailer {
  sendLoginCode(message: LoginCodeMessage): Promise<void>;
}

/**
 * Message du port refusé avant tout appel du transport (adresse, forme du code, enveloppe) ; ne porte aucune valeur (ni
 * adresse, ni code). Partagé par `./smtp.ts` (qui le réexporte) et `./resend.ts`.
 */
export class CodeMailerRefusalError extends Error {
  override name = "CodeMailerRefusalError";

  constructor() {
    super("Envoi du code refusé avant le transport.");
  }
}

/**
 * Plafond des envois atteint (spécification B3d, point 4 ; décision 0138 § 7) : plafond global du jour refusé avant tout
 * appel du transport, ou quota quotidien ou mensuel du fournisseur. Nom fixe, message fixe, aucune valeur ni `cause`.
 * Défini avec le port pour que `src/server/auth/erreurs.ts` le reconnaisse sans importer une implémentation.
 */
export class CodeMailerCapError extends Error {
  override name = "CodeMailerCapError";

  constructor() {
    super("Plafond des envois du jour atteint.");
  }
}

/**
 * Plafond global indisponible (base, configuration) : échec fermé, aucun envoi (spécification B3d, point 3). Aucune
 * valeur. Défini avec le port (M7a) pour que les deux transports le lèvent sans s'importer l'un l'autre ; `./resend.ts`
 * le réexporte.
 */
export class PlafondIndisponibleError extends Error {
  override name = "PlafondIndisponibleError";

  constructor() {
    super("Plafond des envois indisponible.");
  }
}

/**
 * Message « propositions prêtes » (M7a ; plan `docs/plans/mvp-etapes-1-9.md`, étape 7) : la forme canonique de l'adresse
 * du compte, l'origine de l'application (`APP_URL` validée par `parseServerEnv`) et l'identifiant du voyage (`uuid`).
 * Le lien est construit par la préparation commune (`preparerMessageApercu`), jamais reçu tout fait ; le message ne
 * porte ni destination, ni date, ni lieu, ni aucun contenu du programme, ni aucune donnée Google.
 */
export type ApercuPretMessage = {
  readonly to: CanonicalEmail;
  readonly origine: string;
  readonly tripId: string;
};

/**
 * Port d'envoi des notifications (M7a) : une opération, l'e-mail « propositions prêtes ». Mêmes règles que `CodeMailer` :
 * un refus ou une panne **lève** une erreur de nom fixe, sans valeur ; `CodeMailerCapError` dit le plafond atteint.
 * Implémentations : `createSmtpNotificationMailer` (`./smtp.ts`, Mailpit en `local` et `ci`) et
 * `createResendNotificationMailer` (`./resend.ts`, cas admis de 0138 § 3 seulement), choisies par la composition de
 * `src/server/auth/index.ts` comme le port du code ; `disabledNotificationMailer` (`./disabled.ts`) sans transport.
 */
export interface NotificationMailer {
  sendApercuPret(message: ApercuPretMessage): Promise<void>;
}
