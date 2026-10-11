/**
 * Valeurs des contrats lues par l'interface, sans import de `zod` (décision 0016 § 3.1, règle 1) :
 * les schémas de `src/contracts` en dérivent, il n'y a donc pas de seconde copie. Le code client lit
 * ces valeurs ici (`@/contracts/values`) et les types depuis `@/contracts` par `import type`.
 *
 * Créé par F9a avec les seules valeurs du paiement (décision 0020 § 1.1) ; T4 et F8a le complètent
 * sans renommer.
 */

/**
 * Codes de variante de prix, liste fermée (décision 0020 § 4). Ajouter un code est un changement de
 * contrat qui suit une décision de prix de Samuel (Q2 : 29 CHF pour l'instant).
 */
export const PRICE_VARIANTS = ["chf_29"] as const;
export type PriceVariant = (typeof PRICE_VARIANTS)[number];

export const CURRENCIES = ["CHF"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Moyens de paiement, dans l'ordre d'affichage de l'écran 9 (F9-PO-5). */
export const PAYMENT_METHODS = ["twint", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Codes possibles de « Ce qui est inclus » (écran 9). Ce que l'offre inclut vraiment est dans la
 * configuration serveur et relève de Samuel (Q128) ; les textes sont dans `fr.json`.
 */
export const OFFER_INCLUSIONS = [
  "allDays",
  "mealsAndEvenings",
  "events",
  "replacements",
  "checklist",
  "calendarAndSharing",
  "access",
] as const;
export type OfferInclusion = (typeof OFFER_INCLUSIONS)[number];

/** États d'un paiement : `pending`, puis un seul état final (décision 0020 § 2.2). */
export const CHECKOUT_STATUSES = ["pending", "succeeded", "duplicate", "declined", "cancelled", "expired"] as const;
export type CheckoutStatusCode = (typeof CHECKOUT_STATUSES)[number];

/** États finaux d'échec : bandeau sur l'écran 9 et `payment_failed` (F9-PO-20). */
export const CHECKOUT_FAILURES = ["declined", "cancelled", "expired"] as const;
export type CheckoutFailure = (typeof CHECKOUT_FAILURES)[number];

/** Issues que la page de paiement simulé peut envoyer (rôle du webhook du prestataire). */
export const CHECKOUT_OUTCOMES = ["succeeded", "declined", "cancelled"] as const;
export type CheckoutOutcome = (typeof CHECKOUT_OUTCOMES)[number];

/** `checkoutId` : 128 bits aléatoires en base64url, 22 caractères (décision 0020 § 1.3). */
export const CHECKOUT_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Identifiant de voyage reçu d'une entrée (règle de 0017 § 1). */
export const TRIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Codes d'erreur des actions serveur (format commun de 0017 § 4, `snake_case`) : les seuls que F9a
 * utilise. F8a et B6 l'étendent sans renommer.
 */
export const API_ERROR_CODES = ["validation_failed", "not_found", "already_unlocked"] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isCheckoutFailure(status: string): status is CheckoutFailure {
  return (CHECKOUT_FAILURES as readonly string[]).includes(status);
}
