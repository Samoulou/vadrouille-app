import type { PaymentMethod } from "@/contracts/values";

/**
 * Session de l'onglet, rangée par voyage (décision 0020 § 8). Réducteur pur, sans React ni stockage.
 *
 * F9a : paiements commencés dans l'onglet. `payment_succeeded` et `payment_failed` ne sont envoyés que pour
 * un paiement présent et pas encore rapporté ; `duplicate` le marque rapporté sans second `payment_succeeded`.
 * F9b y ajoute la session de tri.
 */

export type ReportKind = "succeeded" | "failed";

export interface StartedCheckout {
  checkoutId: string;
  method: PaymentMethod;
  reported: ReportKind | null;
}

export interface TripSessionEntry {
  checkouts: ReadonlyMap<string, StartedCheckout>;
}

export type TripSessionState = ReadonlyMap<string, TripSessionEntry>;

export const EMPTY_SESSION: TripSessionState = new Map();

function entryOf(state: TripSessionState, tripId: string): TripSessionEntry {
  return state.get(tripId) ?? { checkouts: new Map() };
}

function withCheckout(state: TripSessionState, tripId: string, checkout: StartedCheckout): TripSessionState {
  const entry = entryOf(state, tripId);
  const checkouts = new Map(entry.checkouts);
  checkouts.set(checkout.checkoutId, checkout);
  const next = new Map(state);
  next.set(tripId, { ...entry, checkouts });
  return next;
}

/** Paiement commencé dans l'onglet (après un `startCheckout` réussi). */
export function recordCheckout(state: TripSessionState, tripId: string, checkoutId: string, method: PaymentMethod): TripSessionState {
  if (entryOf(state, tripId).checkouts.has(checkoutId)) return state;
  return withCheckout(state, tripId, { checkoutId, method, reported: null });
}

/**
 * Rapporte l'issue d'un paiement : `report` est le paiement à mesurer, ou `null` s'il n'a pas été commencé
 * dans cet onglet (rechargement, autre onglet) ou s'il est déjà rapporté. `kind: null` (`duplicate`) le
 * marque rapporté sans rien mesurer.
 */
export function reportCheckout(
  state: TripSessionState,
  tripId: string,
  checkoutId: string,
  kind: ReportKind | null,
): { state: TripSessionState; report: StartedCheckout | null } {
  const checkout = entryOf(state, tripId).checkouts.get(checkoutId);
  if (!checkout || checkout.reported !== null) return { state, report: null };
  const next = withCheckout(state, tripId, { ...checkout, reported: kind ?? "succeeded" });
  return { state: next, report: kind === null ? null : checkout };
}
