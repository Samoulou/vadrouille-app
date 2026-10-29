import "server-only";

import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { logEvent } from "@/server/log";

import { checkEnvelope, type DonneesMessage, type MessageControle } from "./enveloppe";
import { type ApercuPretMessage, CodeMailerRefusalError, type LoginCodeMessage } from "./port";

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
 *
 * `preparerMessageApercu` (M7a) suit le même ordre pour l'e-mail « propositions prêtes » : l'étape 2 contrôle l'origine
 * (forme `URL.origin` exacte, `http:` ou `https:`) et l'identifiant du voyage (`uuid`) au lieu du code, et l'étape 3
 * construit le lien `<origine>/voyages/<id>/presentation` (handover § 7 : l'e-mail ouvre la présentation) et le texte de
 * `src/i18n/fr/emailApercu.json`. Les étapes 1 et 4 sont **les mêmes fonctions** que pour le code (`controler`).
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

/** Étapes 1 et 4, communes aux deux messages : adresse refaite avant la construction, puis `checkEnvelope`. */
function adresseControlee(to: CanonicalEmail, deps: AvantTransportDeps): void {
  if (!(deps.adresseAdmise ?? adresseCanonique)(to)) {
    logEvent("email.address_refused", {}, "warn");
    throw new CodeMailerRefusalError();
  }
}

function controler(donnees: DonneesMessage, expediteur: string, to: CanonicalEmail, deps: AvantTransportDeps): MessageControle {
  const controle = checkEnvelope(deps.completerDonnees === undefined ? donnees : deps.completerDonnees(donnees), { from: expediteur, to });
  if (!controle.ok) {
    logEvent("email.envelope_refused", {}, "warn");
    throw new CodeMailerRefusalError();
  }
  return controle.message;
}

export function preparerMessageCode(message: LoginCodeMessage, expediteur: string, deps: AvantTransportDeps = {}): MessageControle {
  const to: CanonicalEmail = message.to;
  adresseControlee(to, deps);
  if (!FORME_CODE.test(message.code) || !Number.isInteger(message.expiresInMinutes) || message.expiresInMinutes < 1) {
    throw new CodeMailerRefusalError();
  }
  const donnees: DonneesMessage = {
    from: expediteur,
    to,
    subject: format(messages.emailCode.objet, { produit: PRODUCT_NAME }),
    text: format(messages.emailCode.corps, { code: message.code, minutes: message.expiresInMinutes }),
  };
  return controler(donnees, expediteur, to, deps);
}

/** Identifiant de voyage : `uuid` (forme de `trips.id`), en minuscules ou majuscules. */
const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Origine admise : `http:` ou `https:`, égale à son `URL.origin` (ni chemin, ni requête, ni identifiants). */
function origineAdmise(origine: string): boolean {
  try {
    const url = new URL(origine);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === origine;
  } catch {
    return false;
  }
}

/**
 * Lien du voyage dans l'e-mail « propositions prêtes » : la présentation (handover § 7, règles de navigation). Exporté pour
 * les tests et le test sur Mailpit ; le chemin d'envoi ne l'appelle que par `preparerMessageApercu`.
 */
export function lienApercu(origine: string, tripId: string): string {
  return `${origine}/voyages/${encodeURIComponent(tripId.toLowerCase())}/presentation`;
}

export function preparerMessageApercu(message: ApercuPretMessage, expediteur: string, deps: AvantTransportDeps = {}): MessageControle {
  const to: CanonicalEmail = message.to;
  adresseControlee(to, deps);
  if (typeof message.tripId !== "string" || !FORME_UUID.test(message.tripId) || typeof message.origine !== "string" || !origineAdmise(message.origine)) {
    throw new CodeMailerRefusalError();
  }
  const donnees: DonneesMessage = {
    from: expediteur,
    to,
    subject: messages.emailApercu.objet,
    text: format(messages.emailApercu.corps, { lien: lienApercu(message.origine, message.tripId), produit: PRODUCT_NAME }),
  };
  return controler(donnees, expediteur, to, deps);
}
