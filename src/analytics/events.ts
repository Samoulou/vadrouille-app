import { z } from "zod";

import { CategorySchema, type PreferenceReason } from "@/contracts";
import { CHECKOUT_FAILURES, PAYMENT_METHODS, PRICE_VARIANTS } from "@/contracts/values";

/**
 * Événements de mesure (handover § 12, spécification F6, décision 0013 § 3.3).
 *
 * Union discriminée Zod d'objets stricts : une propriété inconnue est refusée, ce qui empêche d'y
 * glisser un nom de lieu, un `placeId`, un identifiant de proposition ou un texte libre. Toutes les
 * propriétés sont des codes fermés ou des nombres.
 */

const PositionSchema = z.number().int().positive();

/** Raisons des événements, en `snake_case` (F6-PO-14). */
export const EventReasonSchema = z.enum(["not_my_style", "too_busy", "too_expensive", "too_far", "other"]);
export type EventReason = z.infer<typeof EventReasonSchema>;

/** Seule table de conversion des codes du contrat (`PreferenceReason`) vers les événements. */
export const EVENT_REASON: Record<PreferenceReason, EventReason> = {
  notMyStyle: "not_my_style",
  tooBusy: "too_busy",
  tooExpensive: "too_expensive",
  tooFar: "too_far",
  other: "other",
};

export const DeckDecisionEventSchema = z.strictObject({
  name: z.literal("deck_decision"),
  properties: z.strictObject({
    decision: z.enum(["like", "dislike"]),
    kind: z.enum(["activity", "meal"]),
    category: CategorySchema,
    position: PositionSchema,
    gesture: z.enum(["swipe", "button", "key"]),
    travel_minutes: z.number().int().nonnegative(),
    /** Jamais renseigné dans F6 : la raison se donne dans la feuille (F6-PO-14). */
    reason: EventReasonSchema.optional(),
  }),
});

export const DeckUndoEventSchema = z.strictObject({
  name: z.literal("deck_undo"),
  properties: z.strictObject({ position: PositionSchema }),
});

export const DeckSkippedEventSchema = z.strictObject({
  name: z.literal("deck_skipped"),
  properties: z.strictObject({
    position: PositionSchema,
    /** Ajout de F6-PO-14 : « Passer » (`all`) ou « Tout garder pour le jour N » (`day`). */
    scope: z.enum(["all", "day"]),
  }),
});

export const PreferencePromptAnsweredEventSchema = z.strictObject({
  name: z.literal("preference_prompt_answered"),
  properties: z.strictObject({
    category: z.union([CategorySchema, z.literal("distance")]),
    answer: z.enum(["yes", "no"]),
    reason: EventReasonSchema.optional(),
  }),
});

/**
 * Paiement (handover § 12, spécification F9, décision 0020 § 9). `price_variant` : code de la liste fermée
 * `PRICE_VARIANTS`, jamais un montant ni la configuration serveur. Ni identifiant de voyage ou de paiement,
 * ni destination, ni montant.
 */
const PriceVariantPropertySchema = z.enum(PRICE_VARIANTS);
const PaymentMethodPropertySchema = z.enum(PAYMENT_METHODS);

/** Sans `method` : aucun moyen choisi à l'affichage (F9-PO-16, amende le handover § 12). */
export const PaywallViewedEventSchema = z.strictObject({
  name: z.literal("paywall_viewed"),
  properties: z.strictObject({ price_variant: PriceVariantPropertySchema }),
});

export const PaymentStartedEventSchema = z.strictObject({
  name: z.literal("payment_started"),
  properties: z.strictObject({ method: PaymentMethodPropertySchema, price_variant: PriceVariantPropertySchema }),
});

/** Envoyé par le navigateur en phase 0 ; émis par le serveur avec la tâche de paiement réel (0020 § 9). */
export const PaymentSucceededEventSchema = z.strictObject({
  name: z.literal("payment_succeeded"),
  properties: z.strictObject({ method: PaymentMethodPropertySchema, price_variant: PriceVariantPropertySchema }),
});

/** Ajout de F9-PO-16 : mesurer les abandons. */
export const PaymentFailedEventSchema = z.strictObject({
  name: z.literal("payment_failed"),
  properties: z.strictObject({
    method: PaymentMethodPropertySchema,
    price_variant: PriceVariantPropertySchema,
    reason: z.enum(CHECKOUT_FAILURES),
  }),
});

export const AnalyticsEventSchema = z.discriminatedUnion("name", [
  DeckDecisionEventSchema,
  DeckUndoEventSchema,
  DeckSkippedEventSchema,
  PreferencePromptAnsweredEventSchema,
  PaywallViewedEventSchema,
  PaymentStartedEventSchema,
  PaymentSucceededEventSchema,
  PaymentFailedEventSchema,
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsEventName = AnalyticsEvent["name"];
