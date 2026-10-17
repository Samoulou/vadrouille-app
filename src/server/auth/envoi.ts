import "server-only";

import { parseEmailAddress } from "@/server/email";
import { logEvent } from "@/server/log";
import type { CodeMailer } from "@/server/mail/port";
import { CODE_CONNEXION } from "@/tenancy/options";

/** Adresse reçue de la bibliothèque refusée par le contrôle refait ; ne porte aucune valeur. */
export class AdresseRefuseeError extends Error {
  override name = "AdresseRefuseeError";

  constructor() {
    super("Adresse refusée avant l'envoi du code.");
  }
}

/**
 * Rappel d'envoi du greffon `emailOTP` (spécification B3, B3b point 2) : refait le contrôle de `parseEmailAddress`
 * sur l'adresse **reçue de la bibliothèque** (elle doit être déjà canonique, rendue à l'identique : décision 0051
 * § 4.5) ; un refus écrit `email.address_refused` sans valeur et lève, sans appeler le port. Sinon, seul le port
 * `CodeMailer` est appelé, avec la forme canonique, le code et sa durée en minutes. Exporté pour son test (injection
 * d'une adresse non canonique, critère B13) ; jamais réexporté par `./index.ts`.
 */
export async function envoyerCodeRecu(mailer: CodeMailer, recu: { readonly email: string; readonly otp: string }): Promise<void> {
  const lu = parseEmailAddress(recu.email);
  if (!lu.ok || lu.email !== recu.email) {
    logEvent("email.address_refused", {}, "warn");
    throw new AdresseRefuseeError();
  }
  await mailer.sendLoginCode({ to: lu.email, code: recu.otp, expiresInMinutes: CODE_CONNEXION.dureeSecondes / 60 });
}
