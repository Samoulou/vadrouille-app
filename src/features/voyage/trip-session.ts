import type { PaymentMethod, StopRating } from "@/contracts/values";

/**
 * Session de l'onglet, rangée par voyage (décision 0020 § 8). Réducteur pur, sans React ni stockage.
 *
 * F9a : paiements commencés dans l'onglet. `payment_succeeded` et `payment_failed` ne sont envoyés que pour
 * un paiement présent et pas encore rapporté ; `duplicate` le marque rapporté sans second `payment_succeeded`.
 * F11a : dernier onglet consulté du voyage (décision 0021 § 4), pour la réouverture depuis « Mes voyages ».
 * F9b y ajoute la session de tri ; F11b les avis, les adresses et les goûts retenus.
 */

/**
 * Dernier onglet consulté d'un voyage (F11-PO-5) : le Séjour, ou la Journée `n` (la fiche, les sous-pages
 * de la Journée et la Journée elle-même comptent pour la Journée). La présentation et les écrans 9 et 10 ne
 * sont pas des onglets.
 */
export type LastTab = { kind: "sejour" } | { kind: "jour"; n: number };

export type ReportKind = "succeeded" | "failed";

export interface StartedCheckout {
  checkoutId: string;
  method: PaymentMethod;
  reported: ReportKind | null;
}

export interface TripSessionEntry {
  checkouts: ReadonlyMap<string, StartedCheckout>;
  /** Dernier onglet consulté dans cet onglet du navigateur (F11a). */
  lastTab?: LastTab;
  /** Avis rapides de l'écran 16 sur `mock` (M8a ; 0021 § 4) : identifiant d'étape → valeur ; perdus au rechargement. */
  reviews?: ReadonlyMap<string, StopRating>;
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

function sameTab(a: LastTab | undefined, b: LastTab): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind === "sejour" || (b.kind === "jour" && a.n === b.n);
}

/** Enregistre le dernier onglet consulté du voyage ; état inchangé (même référence) s'il l'était déjà. */
export function recordLastTab(state: TripSessionState, tripId: string, tab: LastTab): TripSessionState {
  const entry = entryOf(state, tripId);
  if (sameTab(entry.lastTab, tab)) return state;
  const next = new Map(state);
  next.set(tripId, { ...entry, lastTab: tab.kind === "jour" ? { kind: "jour", n: tab.n } : { kind: "sejour" } });
  return next;
}

/** Dernier onglet consulté du voyage, ou `undefined`. */
export function lastTabOf(state: TripSessionState, tripId: string): LastTab | undefined {
  return state.get(tripId)?.lastTab;
}

/** Avis de l'onglet pour le voyage (M8a, `mock`) ; vide s'il n'y en a aucun. */
export function reviewsOf(state: TripSessionState, tripId: string): ReadonlyMap<string, StopRating> {
  return state.get(tripId)?.reviews ?? new Map();
}

/** Enregistre (ou efface, `null`) l'avis sur une étape ; état inchangé (même référence) s'il l'était déjà. */
export function recordReview(state: TripSessionState, tripId: string, stopId: string, rating: StopRating | null): TripSessionState {
  const entry = entryOf(state, tripId);
  const current = entry.reviews?.get(stopId) ?? null;
  if (current === rating) return state;
  const reviews = new Map(entry.reviews);
  if (rating === null) reviews.delete(stopId);
  else reviews.set(stopId, rating);
  const next = new Map(state);
  next.set(tripId, { ...entry, reviews });
  return next;
}
