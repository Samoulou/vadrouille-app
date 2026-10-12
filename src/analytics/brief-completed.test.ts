// @vitest-environment node
import { describe, expect, it } from "vitest";

import { BRIEF_FIELDS } from "@/contracts/values";

import { AnalyticsEventSchema } from "./events";

/** `brief_completed` (spécification F8, « Événements de mesure », F8-PO-15) : deux comptes, aucune autre propriété. */

const event = (properties: Record<string, unknown>) => ({ name: "brief_completed", properties });

describe("analytics: brief_completed", () => {
  it.each([
    [4, 2],
    [0, 0],
    [BRIEF_FIELDS.length, BRIEF_FIELDS.length],
  ])("accepte inferred_fields_count = %i, edited_fields_count = %i", (inferred, edited) => {
    expect(AnalyticsEventSchema.safeParse(event({ inferred_fields_count: inferred, edited_fields_count: edited })).success).toBe(true);
  });

  it.each([
    ["plus de modifiés que de déduits", { inferred_fields_count: 1, edited_fields_count: 2 }],
    ["plus de 6 champs", { inferred_fields_count: BRIEF_FIELDS.length + 1, edited_fields_count: 0 }],
    ["négatif", { inferred_fields_count: -1, edited_fields_count: 0 }],
    ["non entier", { inferred_fields_count: 1.5, edited_fields_count: 0 }],
    ["compte manquant", { inferred_fields_count: 2 }],
    ["récit", { inferred_fields_count: 0, edited_fields_count: 0, story: "On part à deux" }],
    ["destination", { inferred_fields_count: 0, edited_fields_count: 0, destination: "Édimbourg" }],
    ["email", { inferred_fields_count: 0, edited_fields_count: 0, email: "a@b.ch" }],
    ["identifiant de voyage", { inferred_fields_count: 0, edited_fields_count: 0, trip_id: "mock_trip_edimbourg" }],
  ])("refuse : %s", (_label, properties) => {
    expect(AnalyticsEventSchema.safeParse(event(properties)).success).toBe(false);
  });
});
