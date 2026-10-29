import "server-only";

import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { logEvent } from "@/server/log";

import { checkEnvelope, type DonneesMessage, type MessageControle } from "./enveloppe";
import { CodeMailerRefusalError, type LoginCodeMessage } from "./port";

/**
 * Chemin d'avant-transport du port d'envoi du code, **commun** aux implémentations SMTP (`./smtp.ts`) et Resend
 * (`./resend.ts`) : seule définition des contrôles de sûreté que la décision 0138 C2 veut identiques sur les deux
 * transports (spécification B3b-envoi, points 4.1 à 4.3 ; B3d, point 1). Aucun appel du transport, aucune clé lue,
 * aucune réservation : l'appelant ne fait tout cela qu'après le retour de cette fonction (ordre C2, étapes 4 et
 * suivantes).
 *
 * Ordre, chaque refus levant `CodeMailerRefusalError` (sans valeur) et arrêtant tout ce qui suit :
 * 1. contrôle refait de l'adresse par `parseEmailAddress` (forme canonique exacte) → `email.address_refused` ;
 * 2. forme du code (6 chiffres ASCII, B3-PO-4) et durée (entier ≥ 1) : refus sans événement ;
 * 3. construction des quatre champs (texte de B3b-envoi-PO-1, expéditeur fourni par l'appelant) ;
 * 4. `checkEnvelope` contre `{ from: expediteur, to: forme canonique }` → `email.envelope_refused`.
 *
 * Rend la **copie contrôlée** : l'appelant envoie ce message-là, et non ses propres données.
 */

export type AvantTransportDeps = {
  /** Contrôle de l'adresse reçue ; réservé aux doubles de test (critères E5 et R3), aucun appel de production. */
  readonly adresseAdmise?: (to: string) => boolean;
  /** Réservé aux doubles de test (critère R3) : altère les données avant `checkEnvelope` (`bcc`, `envelope`). */
  readonly completerDonnees?: (donnees: DonneesMessage) => DonneesMessage;
};

/** Forme d'un code de connexion : 6 chiffres ASCII (B3-PO-4). */
const FORME_CODE = /^[0-9]{6}$/;

const adresseCanonique = (to: string): boolean => {
  const lu = parseEmailAddress(to);
  return lu.ok && lu.email === to;
};

export function preparerMessageCode(message: LoginCodeMessage, expediteur: string, deps: AvantTransportDeps = {}): MessageControle {
  const to: CanonicalEmail = message.to;
  if (!(deps.adresseAdmise ?? adresseCanonique)(to)) {
    logEvent("email.address_refused", {}, "warn");
    throw new CodeMailerRefusalError();
  }
  if (!FORME_CODE.test(message.code) || !Number.isInteger(message.expiresInMinutes) || message.expiresInMinutes < 1) {
    throw new CodeMailerRefusalError();
  }
  const donnees: DonneesMessage = {
    from: expediteur,
    to,
    subject: format(messages.emailCode.objet, { produit: PRODUCT_NAME }),
    text: format(messages.emailCode.corps, { code: message.code, minutes: message.expiresInMinutes }),
  };
  const controle = checkEnvelope(deps.completerDonnees === undefined ? donnees : deps.completerDonnees(donnees), { from: expediteur, to });
  if (!controle.ok) {
    logEvent("email.envelope_refused", {}, "warn");
    throw new CodeMailerRefusalError();
  }
  return controle.message;
}
