import { z } from "zod";

import { CategorySchema, type PreferenceReason } from "@/contracts";

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

export const AnalyticsEventSchema = z.discriminatedUnion("name", [
  DeckDecisionEventSchema,
  DeckUndoEventSchema,
  DeckSkippedEventSchema,
  PreferencePromptAnsweredEventSchema,
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsEventName = AnalyticsEvent["name"];
