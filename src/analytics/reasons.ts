import type { PreferenceReason } from "@/contracts";

/**
 * Raisons des événements, en `snake_case` (F6-PO-14), et seule table de conversion depuis les codes du contrat.
 * Module sans `zod` (sur le modèle de `@/contracts/values`, décision 0016 § 3.1 règle 1) : l'écran qui envoie
 * la mesure lit la table sans charger les schémas, qui en dérivent (`EventReasonSchema = z.enum(EVENT_REASONS)`).
 */
export const EVENT_REASONS = ["not_my_style", "too_busy", "too_expensive", "too_far", "other"] as const;

export type EventReason = (typeof EVENT_REASONS)[number];

/** Seule table de conversion des codes du contrat (`PreferenceReason`) vers les événements. */
export const EVENT_REASON: Record<PreferenceReason, EventReason> = {
  notMyStyle: "not_my_style",
  tooBusy: "too_busy",
  tooExpensive: "too_expensive",
  tooFar: "too_far",
  other: "other",
};
