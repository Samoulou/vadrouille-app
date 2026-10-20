import { z } from "zod";

import {
  CHECKOUT_ID_PATTERN,
  CHECKOUT_OUTCOMES,
  CHECKOUT_STATUSES,
  CURRENCIES,
  OFFER_INCLUSIONS,
  PAYMENT_EVENT_STATUSES,
  PAYMENT_EVENT_TYPES,
  PAYMENT_METHODS,
  PRICE_VARIANTS,
  TRIP_ID_PATTERN,
} from "./values";

/**
 * Contrats de paiement de phase 0 (décision 0020 § 1, F9-TL-1). Objets stricts ; noms du handover
 * back-end (#27, en revue) pour que la tâche de paiement réel les étende sans les renommer. Aucun texte
 * d'interface dans les données.
 */

export const PriceVariantSchema = z.enum(PRICE_VARIANTS);
export const CurrencySchema = z.enum(CURRENCIES);
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);
export const OfferInclusionSchema = z.enum(OFFER_INCLUSIONS);
export const CheckoutStatusCodeSchema = z.enum(CHECKOUT_STATUSES);
export const CheckoutOutcomeSchema = z.enum(CHECKOUT_OUTCOMES);

export const TripIdSchema = z.string().regex(TRIP_ID_PATTERN);
export const CheckoutIdSchema = z.string().regex(CHECKOUT_ID_PATTERN);

const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;

/** Offre sans `tripId` : forme de la configuration serveur (`src/server/config/offer.ts`). */
export const OfferConfigSchema = z.strictObject({
  /** Montant en centimes (unité mineure), strictement positif. */
  amount: z.number().int().positive(),
  currency: CurrencySchema,
  priceVariant: PriceVariantSchema,
  /** Dans l'ordre d'affichage, sans doublon. */
  methods: z.array(PaymentMethodSchema).min(1).max(2).refine(unique, "methods : sans doublon"),
  /** Dans l'ordre d'affichage, sans doublon. */
  includes: z.array(OfferInclusionSchema).max(OFFER_INCLUSIONS.length).refine(unique, "includes : sans doublon"),
  /** Absent tant que Q88 n'est pas tranchée : aucun nombre inventé. */
  replacementLimit: z.number().int().nonnegative().optional(),
  accessDaysAfterReturn: z.number().int().min(0).max(365),
});
export type OfferConfig = z.infer<typeof OfferConfigSchema>;

export const OfferSchema = z.strictObject({ tripId: TripIdSchema, ...OfferConfigSchema.shape });
export type Offer = z.infer<typeof OfferSchema>;

/**
 * Entrée de `startCheckout` : champ inconnu (un `amount` du navigateur) refusé. `requestId` (spécification B4,
 * B4-PO-8) : tiré par l'écran à chaque appui sur un bouton de paiement, réutilisé par « Réessayer » ; même forme que
 * `TripPatch.requestId`.
 */
export const CheckoutRequestSchema = z.strictObject({ tripId: TripIdSchema, method: PaymentMethodSchema, requestId: z.uuid() });
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

/**
 * Phase 0 : `redirectUrl` est un chemin de l'application : commence par `/`, ni `//` ni `/\` en tête, et
 * aucun espace, caractère de contrôle (tabulation, retour à la ligne…) ni antislash nulle part, car
 * l'analyseur d'URL retire les uns et lit l'autre comme `/` (`"/\t/evil.com"` y deviendrait `//evil.com`).
 * Seconde défense : résolu contre une origine fictive, le chemin doit garder cette origine. La tâche de
 * paiement réel l'élargira à une liste fermée d'origines du prestataire, jamais à une adresse libre.
 */
const APP_PATH_ORIGIN = "http://app.invalid";

function staysOnAppOrigin(path: string): boolean {
  try {
    return new URL(path, APP_PATH_ORIGIN).origin === APP_PATH_ORIGIN;
  } catch {
    return false;
  }
}

export const AppPathSchema = z
  .string()
  .min(1)
  .regex(/^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/, "chemin de l'application attendu")
  .refine(staysOnAppOrigin, { message: "chemin de l'application attendu" });

export const CheckoutStartSchema = z.strictObject({ checkoutId: CheckoutIdSchema, redirectUrl: AppPathSchema });
export type CheckoutStart = z.infer<typeof CheckoutStartSchema>;

/** État d'un paiement ; prix pris en instantané à la création (décision 0020 § 1.3). */
export const CheckoutStatusSchema = z.strictObject({
  checkoutId: CheckoutIdSchema,
  tripId: TripIdSchema,
  method: PaymentMethodSchema,
  status: CheckoutStatusCodeSchema,
  priceVariant: PriceVariantSchema,
  amount: z.number().int().positive(),
  currency: CurrencySchema,
});
export type CheckoutStatus = z.infer<typeof CheckoutStatusSchema>;

export const SimulateOutcomeRequestSchema = z.strictObject({
  checkoutId: CheckoutIdSchema,
  outcome: CheckoutOutcomeSchema,
});
export type SimulateOutcomeRequest = z.infer<typeof SimulateOutcomeRequestSchema>;

export const CheckoutStatusRequestSchema = z.strictObject({ checkoutId: CheckoutIdSchema });
export type CheckoutStatusRequest = z.infer<typeof CheckoutStatusRequestSchema>;

/**
 * Événement de paiement normalisé (spécification B4, B4a point 1 ; handover § 5) : **contrat interne du serveur**,
 * jamais importé par `src/features` ni `src/components` (règle `ligne/route-handlers`). Analysé depuis l'événement
 * du prestataire (`src/server/payment/evenement.ts`) ; un champ absent de l'événement reçu est absent ici, jamais
 * inventé. Aucune donnée de la personne (e-mail, nom, adresse, moyen de paiement détaillé).
 */
export const PaymentEventTypeSchema = z.enum(PAYMENT_EVENT_TYPES);
export const PaymentEventStatusSchema = z.enum(PAYMENT_EVENT_STATUSES);

export const PaymentEventSchema = z.strictObject({
  eventId: z.string().min(1).max(255),
  type: PaymentEventTypeSchema,
  livemode: z.boolean(),
  checkoutSessionId: z.string().min(1).max(255).optional(),
  /** `uuid` interne du paiement, lu dans les métadonnées de la session (décision 0097 B4-TL-1 point 3). */
  checkoutId: z.string().min(1).max(255).optional(),
  paymentStatus: PaymentEventStatusSchema.optional(),
  /** Centimes (unité mineure). */
  amount: z.number().int().nonnegative().optional(),
  /** Normalisée en majuscules. */
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  /** Secondes depuis l'époque Unix (champ `created` de l'événement). */
  createdAt: z.number().int().nonnegative().optional(),
});
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;
