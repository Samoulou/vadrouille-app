import type { AdapterContext, PaymentAdapter, TripAdapter } from "@/adapters";
import type { CheckoutStatus, Offer, Receipt, Trip } from "@/contracts";
import { isCheckoutFailure, type CheckoutFailure, type PriceVariant } from "@/contracts/values";

import { parsePaiementParam } from "./routes";

/**
 * Lectures des pages du parcours « Débloquer », faites côté serveur dans le contexte de la requête
 * (décision 0020 § 11). Les adaptateurs sont reçus en paramètre : ce module n'importe que des types de
 * `@/contracts` et des valeurs de `@/contracts/values`.
 */

export interface UnlockPageData {
  trip: Trip;
  /** `null` pour un voyage déjà débloqué : ni prix ni bouton de paiement (F9-PO-9). */
  offer: Offer | null;
  failure: { reason: CheckoutFailure; checkoutId: string; priceVariant: PriceVariant } | null;
  /** Voyage débloqué dont la personne a un reçu (B4d) : l'écran rend le lien vers `R9-recu`. */
  receipt: boolean;
}

/**
 * Écran 9 : `null` si le voyage est inconnu ou d'une autre organisation (404), ou si l'offre manque.
 * Le paramètre `paiement` ne donne un bandeau que pour un paiement de **ce** voyage, de la même
 * organisation, à l'état `declined`, `cancelled` ou `expired` ; sinon il est ignoré (F9-PO-20).
 */
export async function loadUnlockPage(
  trips: TripAdapter,
  payment: PaymentAdapter,
  ctx: AdapterContext,
  tripId: string,
  paiement: string | string[] | undefined,
): Promise<UnlockPageData | null> {
  const trip = await trips.getTrip(ctx, tripId);
  if (!trip) return null;
  if (trip.unlocked) return { trip, offer: null, failure: null, receipt: (await receiptOf(payment, ctx, trip.id)) !== null };
  const offer = await payment.getOffer(ctx, trip.id);
  if (!offer.ok) return null;
  return { trip, offer: offer.value, failure: await failureOf(payment, ctx, trip.id, paiement), receipt: false };
}

/**
 * Reçu du voyage (B4d) : `null` si l'adaptateur n'en a pas (`mock`, `stripe` en attente de la colonne du lien), si la
 * personne n'a pas payé ce voyage, ou si la lecture échoue (aucun lien plutôt qu'une erreur).
 */
async function receiptOf(payment: PaymentAdapter, ctx: AdapterContext, tripId: string): Promise<Receipt | null> {
  if (payment.getReceipt === undefined) return null;
  try {
    const receipt = await payment.getReceipt(ctx, tripId);
    return receipt.ok && receipt.value.tripId === tripId ? receipt.value : null;
  } catch {
    return null;
  }
}

/** Page `R9-recu` (B4d) : `null` (404) si le voyage est inconnu, d'une autre organisation, ou sans reçu de la personne. */
export async function loadReceipt(
  trips: TripAdapter,
  payment: PaymentAdapter,
  ctx: AdapterContext,
  tripId: string,
): Promise<{ trip: Trip; receipt: Receipt } | null> {
  if (payment.getReceipt === undefined) return null;
  const trip = await trips.getTrip(ctx, tripId);
  if (!trip) return null;
  const receipt = await receiptOf(payment, ctx, trip.id);
  return receipt === null ? null : { trip, receipt };
}

/**
 * Voyages de « Mes voyages » qui ont un reçu de la personne (B4d) : identifiant du voyage → adresse de `R9-recu`.
 * Vide si l'adaptateur n'en a pas ou si la lecture échoue (la liste des voyages s'affiche quand même).
 */
export async function loadReceiptLinks(
  payment: PaymentAdapter,
  ctx: AdapterContext,
  hrefOf: (tripId: string) => string,
): Promise<Readonly<Record<string, string>>> {
  if (payment.listReceipts === undefined) return {};
  try {
    const receipts = await payment.listReceipts(ctx);
    return receipts.ok ? Object.fromEntries(receipts.value.map((receipt) => [receipt.tripId, hrefOf(receipt.tripId)])) : {};
  } catch {
    return {};
  }
}

async function failureOf(
  payment: PaymentAdapter,
  ctx: AdapterContext,
  tripId: string,
  paiement: string | string[] | undefined,
): Promise<UnlockPageData["failure"]> {
  const checkoutId = parsePaiementParam(paiement);
  if (!checkoutId) return null;
  const status = await payment.getCheckoutStatus(ctx, checkoutId);
  if (!status.ok || status.value.tripId !== tripId || !isCheckoutFailure(status.value.status)) return null;
  return { reason: status.value.status, checkoutId, priceVariant: status.value.priceVariant };
}

/**
 * Paiement de `R9-sim` et `R9-retour` : `null` (404) si l'identifiant est mal formé, inconnu, d'une autre
 * organisation ou d'un autre voyage.
 */
export async function loadCheckout(
  payment: PaymentAdapter,
  ctx: AdapterContext,
  trip: Trip,
  paiement: string | string[] | undefined,
): Promise<CheckoutStatus | null> {
  const checkoutId = parsePaiementParam(paiement);
  if (!checkoutId) return null;
  const status = await payment.getCheckoutStatus(ctx, checkoutId);
  return status.ok && status.value.tripId === trip.id ? status.value : null;
}
