import { z } from "zod";

import { CategorySchema } from "./category";

/**
 * Question de préférence et réponse de la présentation (décision 0013, § 3.2).
 *
 * F6 ne pose que les champs dont il a besoin ; B10 les étend (identifiant de question, compteurs
 * de `DeckDecisionResult`) sans renommer ceux-ci.
 */

/** Codes de raison de B0 : Pas mon style, Trop chargé, Trop cher, Trop loin, Autre raison (dans cet ordre). */
export const PreferenceReasonSchema = z.enum(["notMyStyle", "tooBusy", "tooExpensive", "tooFar", "other"]);
export type PreferenceReason = z.infer<typeof PreferenceReasonSchema>;

export const PreferencePromptSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("category"), category: CategorySchema }),
  z.strictObject({ kind: z.literal("distance") }),
]);
export type PreferencePrompt = z.infer<typeof PreferencePromptSchema>;

export const PreferenceAnswerSchema = z.strictObject({
  answer: z.enum(["yes", "no"]),
  reason: PreferenceReasonSchema.optional(),
});
export type PreferenceAnswer = z.infer<typeof PreferenceAnswerSchema>;
