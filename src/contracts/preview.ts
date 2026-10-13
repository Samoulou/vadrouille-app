import { z } from "zod";

import { MAX_PREVIEW_SLOTS } from "./values";
import { ProposalSchema, TimeSchema } from "./trip";

/**
 * Case de l'aperçu (évolution E5, décision 0010 PO-6) : une proposition complète, ou un créneau sans proposition
 * ancrée (`noOption`), sans lieu ni texte : on ne le remplit jamais par un lieu non ancré (R1). L'interface ne
 * montre pas une case `noOption` comme une carte (B2-PO-9).
 */
export const PreviewSlotSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("proposal"), proposal: ProposalSchema }),
  z.strictObject({
    type: z.literal("noOption"),
    /** 1 = J1. */
    day: z.number().int().positive(),
    time: TimeSchema,
    kind: z.enum(["activity", "meal"]),
  }),
]);
export type PreviewSlot = z.infer<typeof PreviewSlotSchema>;

/** Couple (jour, heure) d'une case ; pour une case `proposal`, celui de sa proposition. */
function slotKey(slot: PreviewSlot): string {
  return slot.type === "proposal" ? `${slot.proposal.day}|${slot.proposal.time}` : `${slot.day}|${slot.time}`;
}

/** Aperçu : 8 cases au plus, dans l'ordre ; deux cases n'occupent pas le même créneau (jour, heure). */
export const PreviewSlotsSchema = z
  .array(PreviewSlotSchema)
  .max(MAX_PREVIEW_SLOTS)
  .superRefine((slots, ctx) => {
    const seen = new Set<string>();
    slots.forEach((slot, index) => {
      const key = slotKey(slot);
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: "deux cases de l'aperçu au même créneau (jour, heure)", path: [index] });
      }
      seen.add(key);
    });
  });
