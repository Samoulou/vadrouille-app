import "server-only";

import { PaymentEventSchema, type PaymentEvent } from "@/contracts/billing";
import type { PaymentEventStatus, PaymentEventType } from "@/contracts/values";

/**
 * Analyse d'un événement du prestataire (forme de Stripe : `{ id, type, livemode, created, data: { object } }`) en
 * `PaymentEvent` (spécification B4, B4a point 1). Un champ absent de l'événement reçu est absent du résultat, jamais
 * inventé ; aucune donnée de la personne n'est lue (ni `customer_details`, ni e-mail, ni moyen de paiement détaillé).
 * Rend `null` si l'événement n'est pas analysable (identifiant, type ou mode absent ou mal typé) : le webhook répond 400.
 */

const TYPES: ReadonlyMap<string, PaymentEventType> = new Map([
  ["checkout.session.completed", "checkoutCompleted"],
  ["checkout.session.async_payment_succeeded", "asyncPaymentSucceeded"],
  ["checkout.session.async_payment_failed", "asyncPaymentFailed"],
  ["checkout.session.expired", "checkoutExpired"],
  ["charge.refunded", "refund"],
  ["charge.refund.updated", "refund"],
  ["refund.created", "refund"],
  ["refund.updated", "refund"],
  ["charge.dispute.created", "dispute"],
  ["charge.dispute.updated", "dispute"],
  ["charge.dispute.closed", "dispute"],
]);

const STATUTS: ReadonlyMap<string, PaymentEventStatus> = new Map([
  ["paid", "paid"],
  ["unpaid", "unpaid"],
  ["no_payment_required", "noPaymentRequired"],
]);

const objet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const texte = (valeur: unknown): string | undefined => (typeof valeur === "string" && valeur.length > 0 && valeur.length <= 255 ? valeur : undefined);
const entier = (valeur: unknown): number | undefined => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : undefined);

export function analyserEvenement(brut: unknown): PaymentEvent | null {
  if (!objet(brut)) return null;
  const eventId = texte(brut.id);
  const typeBrut = texte(brut.type);
  if (eventId === undefined || typeBrut === undefined || typeof brut.livemode !== "boolean") return null;
  const type = TYPES.get(typeBrut) ?? "other";
  const evenement: Record<string, unknown> = { eventId, type, livemode: brut.livemode };
  const createdAt = entier(brut.created);
  if (createdAt !== undefined) evenement.createdAt = createdAt;

  const donnees = objet(brut.data) && objet(brut.data.object) ? brut.data.object : null;
  if (donnees !== null && typeBrut.startsWith("checkout.session.")) {
    const session = texte(donnees.id);
    if (session !== undefined) evenement.checkoutSessionId = session;
    const statut = typeof donnees.payment_status === "string" ? STATUTS.get(donnees.payment_status) : undefined;
    if (statut !== undefined) evenement.paymentStatus = statut;
    const montant = entier(donnees.amount_total);
    if (montant !== undefined) evenement.amount = montant;
    if (typeof donnees.currency === "string" && /^[A-Za-z]{3}$/.test(donnees.currency)) evenement.currency = donnees.currency.toUpperCase();
    const checkoutId = objet(donnees.metadata) ? texte(donnees.metadata.checkoutId) : undefined;
    if (checkoutId !== undefined) evenement.checkoutId = checkoutId;
  }
  const valide = PaymentEventSchema.safeParse(evenement);
  return valide.success ? valide.data : null;
}
