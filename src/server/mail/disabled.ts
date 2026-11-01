import "server-only";

import { logEvent } from "@/server/log";

import type { CodeMailer, NotificationMailer } from "./port";

/** Refus de l'implémentation désactivée ; ne porte aucune valeur (ni adresse, ni code). */
export class CodeMailerDisabledError extends Error {
  override name = "CodeMailerDisabledError";

  constructor() {
    super("Envoi du code désactivé (spécification B3, B3b point 2).");
  }
}

/**
 * Implémentation désactivée du port d'envoi (spécification B3, B3b point 2 ; décision 0077 § 5.6) : refuse tout
 * envoi, écrit l'événement `email.transport_disabled` sans aucune valeur, n'écrit rien d'autre et ne garde rien en
 * mémoire. C'est l'implémentation retenue dès que `AUTH_ADAPTER=better-auth`, jusqu'à B3b-envoi.
 */
export const disabledCodeMailer: CodeMailer = Object.freeze({
  async sendLoginCode(): Promise<void> {
    logEvent("email.transport_disabled", {}, "warn");
    throw new CodeMailerDisabledError();
  },
});

/**
 * Port des notifications désactivé (M7a) : sans `EMAIL_TRANSPORT`, ou sans `APP_URL` (aucun lien possible). Refuse tout
 * envoi avec l'événement `email.transport_disabled`, sans aucune valeur, comme `disabledCodeMailer`.
 */
export const disabledNotificationMailer: NotificationMailer = Object.freeze({
  async sendApercuPret(): Promise<void> {
    logEvent("email.transport_disabled", {}, "warn");
    throw new CodeMailerDisabledError();
  },
  async sendRappelVeille(): Promise<void> {
    logEvent("email.transport_disabled", {}, "warn");
    throw new CodeMailerDisabledError();
  },
});
