import "server-only";

import MailComposer from "nodemailer/lib/mail-composer";

import type { CanonicalEmail } from "@/server/email";

/**
 * Contrôle de l'enveloppe avant tout envoi (spécification B3b-envoi, point 4.3 ; critère E4). Fonction pure : elle
 * n'envoie rien et n'écrit aucun journal ; l'appelant (implémentation SMTP de `CodeMailer`) traduit un refus en
 * `provider_error` et en événement `email.envelope_refused`, sans appeler le transport.
 *
 * 1. **Forme** : objet dont les clés énumérables, propres ou héritées, sont exactement `from`, `to`, `subject` et
 *    `text`, toutes propres et de valeur chaîne, et qui ne voit aucune clé `envelope`, même héritée ou non
 *    énumérable. Sont donc refusées d'emblée `envelope` (sinon `getEnvelope()` rendrait cette valeur sans rien analyser, et le contrôle
 *    deviendrait tautologique), `raw`, `headers`, `cc`, `bcc`, `replyTo`, `sender`, `attachments`, `html`, `list`…
 *    (propres ou héritées), qui changeraient les octets envoyés ou l'enveloppe, et un `to` en tableau.
 * 2. **Compilation** d'une **copie** à prototype nul de ces quatre chaînes par `MailComposer` de `nodemailer`
 *    (10.0.16, chemin public `nodemailer/lib/mail-composer`) : `getEnvelope()` analyse les en-têtes `From`, `To`,
 *    `Cc` et `Bcc`, et ne peut lire aucune autre clé (copie fraîche, sans prototype).
 * 3. Seul un résultat **exactement** égal à `{ from: attendu.from, to: [attendu.to] }` est accepté : même
 *    expéditeur, un seul destinataire, mêmes chaînes.
 *
 * En cas d'accord, le résultat porte la copie contrôlée : l'appelant envoie **ce message-là** (et non ses propres
 * données), avec l'enveloppe explicite `{ from: attendu.from, to: [attendu.to] }` (point 4.5). Un refus ne porte
 * aucune valeur.
 */

/** Données d'un message à contrôler ; le contrôle lit toute clé, propre ou héritée, avant d'en garder quatre. */
export type DonneesMessage = Readonly<Record<string, unknown>>;

/** Message contrôlé : les quatre seules clés admises, en chaînes, sur un objet gelé à prototype nul. */
export type MessageControle = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

/** Enveloppe attendue : l'expéditeur fixe et la forme canonique du destinataire (`parseEmailAddress`). */
export type EnveloppeAttendue = { readonly from: string; readonly to: CanonicalEmail };

export type ResultatEnveloppe = { readonly ok: true; readonly message: MessageControle } | { readonly ok: false };

const REFUS: ResultatEnveloppe = { ok: false };

/** Seules clés admises dans les données d'un message (point 4.2). */
const CLES_ADMISES = ["from", "subject", "text", "to"] as const;

/**
 * Copie à prototype nul des quatre clés admises, ou `null` si la forme du point 1 n'est pas tenue. Sans réflexion
 * (régime de confinement) : `in` voit une clé `envelope` propre ou héritée, énumérable ou non ; `for…in` parcourt les
 * clés énumérables propres **et héritées**. Chaque valeur est lue **une fois**, dans la copie : c'est la copie, et
 * elle seule, qui est compilée puis envoyée ; une clé non énumérable ou héritée n'y entre jamais.
 */
function copieAdmise(donnees: unknown): MessageControle | null {
  if (typeof donnees !== "object" || donnees === null || Array.isArray(donnees)) return null;
  if ("envelope" in donnees) return null;
  const vues = new Set<string>();
  for (const cle in donnees) {
    if (!Object.hasOwn(donnees, cle) || !(CLES_ADMISES as readonly string[]).includes(cle)) return null;
    vues.add(cle);
  }
  if (vues.size !== CLES_ADMISES.length) return null;
  const copie = Object.create(null) as Record<string, string>;
  try {
    for (const cle of CLES_ADMISES) {
      const valeur: unknown = (donnees as Record<string, unknown>)[cle];
      if (typeof valeur !== "string") return null;
      copie[cle] = valeur;
    }
  } catch {
    return null;
  }
  return Object.freeze(copie) as MessageControle;
}

/**
 * Enveloppe telle que `nodemailer` la compile à partir des en-têtes des données, ou `null` si la compilation échoue.
 * Exportée **pour les tests** (critère E4 : montrer l'enveloppe compilée) ; le chemin d'envoi n'appelle que
 * `checkEnvelope`.
 */
export function compiledEnvelope(donnees: DonneesMessage): { from: unknown; to: unknown } | null {
  try {
    const enveloppe = new MailComposer(donnees).compile().getEnvelope();
    return { from: enveloppe.from, to: enveloppe.to };
  } catch {
    return null;
  }
}

export function checkEnvelope(donnees: DonneesMessage, attendu: EnveloppeAttendue): ResultatEnveloppe {
  const message = copieAdmise(donnees);
  if (message === null) return REFUS;
  const compilee = compiledEnvelope(message);
  if (compilee === null) return REFUS;
  const { from, to } = compilee;
  if (typeof from !== "string" || from !== attendu.from) return REFUS;
  if (!Array.isArray(to) || to.length !== 1 || to[0] !== attendu.to) return REFUS;
  return { ok: true, message };
}
