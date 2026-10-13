import * as z from "zod/mini";

import { BRIEF_FIELDS, CATEGORIES, CHECKOUT_FAILURES, PAYMENT_METHODS, PRICE_VARIANTS } from "@/contracts/values";

import { EVENT_REASON, EVENT_REASONS, type EventReason } from "./reasons";

/**
 * Événements de mesure (handover § 12, spécification F6, décision 0013 § 3.3).
 *
 * Union discriminée d'objets stricts : une propriété inconnue est refusée, ce qui empêche d'y glisser un nom
 * de lieu, un `placeId`, un identifiant de proposition ou un texte libre. Toutes les propriétés sont des codes
 * fermés ou des nombres.
 *
 * Écrits avec `zod/mini`, le point d'entrée léger du paquet `zod` (décision 0016 § 3.1 règle 3) : ce module
 * est chargé par le navigateur et n'embarque pas le Zod complet. Les variantes suivantes s'écrivent de même.
 */

const PositionSchema = z.int().check(z.positive());

/** Catégorie d'une proposition, tirée de la même liste que `CategorySchema` (`CATEGORIES`). */
const CategoryPropertySchema = z.enum(CATEGORIES);

/** Raisons des événements, en `snake_case` (F6-PO-14), tirées de `EVENT_REASONS` (module sans `zod`). */
export const EventReasonSchema = z.enum(EVENT_REASONS);
export { EVENT_REASON, type EventReason };

export const DeckDecisionEventSchema = z.strictObject({
  name: z.literal("deck_decision"),
  properties: z.strictObject({
    decision: z.enum(["like", "dislike"]),
    kind: z.enum(["activity", "meal"]),
    category: CategoryPropertySchema,
    position: PositionSchema,
    gesture: z.enum(["swipe", "button", "key"]),
    travel_minutes: z.int().check(z.nonnegative()),
    /** Jamais renseigné dans F6 : la raison se donne dans la feuille (F6-PO-14). */
    reason: z.optional(EventReasonSchema),
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
    category: z.union([CategoryPropertySchema, z.literal("distance")]),
    answer: z.enum(["yes", "no"]),
    reason: z.optional(EventReasonSchema),
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

/**
 * Ligne de « À faire avant de partir » passée de « à faire » à « faite » (handover § 12, spécification F5,
 * F5c) : aucune propriété, ni identifiant ni nom de la ligne. Décocher n'envoie rien.
 */
export const ChecklistItemDoneEventSchema = z.strictObject({
  name: z.literal("checklist_item_done"),
  properties: z.strictObject({}),
});

/** Nombre de champs du brief : 0 à 6 (`BRIEF_FIELDS`, F8-PO-15). */
const BriefFieldCountSchema = z.int().check(z.nonnegative(), z.lte(BRIEF_FIELDS.length));

/**
 * « Continuer » réussi à l'état « Vérification » de l'écran 2 (handover § 12, spécification F8, F8-PO-15) :
 * deux comptes, ni récit, ni destination, ni valeur du brief, ni identifiant.
 */
export const BriefCompletedEventSchema = z.strictObject({
  name: z.literal("brief_completed"),
  properties: z
    .strictObject({
      inferred_fields_count: BriefFieldCountSchema,
      edited_fields_count: BriefFieldCountSchema,
    })
    .check(
      z.refine((properties) => properties.edited_fields_count <= properties.inferred_fields_count, {
        message: "edited_fields_count au plus inferred_fields_count",
      }),
    ),
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
  ChecklistItemDoneEventSchema,
  BriefCompletedEventSchema,
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsEventName = AnalyticsEvent["name"];
