import "server-only";

import MailComposer from "nodemailer/lib/mail-composer";

/**
 * Contrôle de l'enveloppe avant tout envoi (spécification B3b-envoi, point 4.3 ; critère E4). Fonction pure : elle
 * n'envoie rien et n'écrit aucun journal ; l'appelant (implémentation SMTP de `CodeMailer`) traduit un refus en
 * `provider_error` et en événement `email.envelope_refused`, sans appeler le transport.
 *
 * 1. Des données qui portent déjà une clé `envelope` sont refusées d'emblée : `getEnvelope()` rendrait cette valeur
 *    sans rien analyser, et le contrôle deviendrait tautologique.
 * 2. Sinon, le message est compilé par `MailComposer` de `nodemailer` (10.0.16, chemin public
 *    `nodemailer/lib/mail-composer`), et `getEnvelope()` analyse les en-têtes `From`, `To`, `Cc` et `Bcc`.
 * 3. Seul un résultat **exactement** égal à `{ from: expediteur, to: [destinataire] }` est accepté : même expéditeur,
 *    un seul destinataire, mêmes chaînes. L'appelant envoie ensuite avec cette enveloppe explicite (point 4.5).
 *
 * Aucune valeur (adresse, code) n'est jointe au résultat : un refus ne dit rien de ce qui a été compilé.
 */

/** Données d'un message, telles que l'implémentation SMTP les construit (point 4.2) ; le contrôle lit toute clé. */
export type DonneesMessage = Readonly<Record<string, unknown>>;

/** Enveloppe attendue : l'expéditeur fixe et la forme canonique du destinataire. */
export type EnveloppeAttendue = { readonly from: string; readonly to: string };

export type ResultatEnveloppe = { readonly ok: true } | { readonly ok: false };

const REFUS: ResultatEnveloppe = { ok: false };

/** Enveloppe telle que `nodemailer` la compile à partir des en-têtes du message, ou `null` si la compilation échoue. */
export function compiledEnvelope(donnees: DonneesMessage): { from: unknown; to: unknown } | null {
  try {
    const enveloppe = new MailComposer(donnees).compile().getEnvelope();
    return { from: enveloppe.from, to: enveloppe.to };
  } catch {
    return null;
  }
}

export function checkEnvelope(donnees: DonneesMessage, attendu: EnveloppeAttendue): ResultatEnveloppe {
  if (Object.hasOwn(donnees, "envelope")) return REFUS;
  const compilee = compiledEnvelope(donnees);
  if (compilee === null) return REFUS;
  const { from, to } = compilee;
  if (typeof from !== "string" || from !== attendu.from) return REFUS;
  if (!Array.isArray(to) || to.length !== 1 || to[0] !== attendu.to) return REFUS;
  return { ok: true };
}
