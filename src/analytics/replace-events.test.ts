// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AnalyticsEventSchema, EVENT_REASON } from "./events";

/**
 * Événements du remplacement (spécification F7, F7-PO-18, critère C8 ; décision 0016 § 10) : objets stricts, codes
 * fermés et nombres seulement. Un nom, un `placeId`, un identifiant d'étape, une requête ou un souhait sont refusés.
 */

const PROPERTIES = { reason: EVENT_REASON.notMyStyle, from_reserve: true, duration_ms: 1200 };

describe("analytics: replace_applied et replace_undone", () => {
  it.each(["replace_applied", "replace_undone"] as const)("%s accepte raison, réserve et durée", (name) => {
    expect(AnalyticsEventSchema.safeParse({ name, properties: PROPERTIES }).success).toBe(true);
    expect(AnalyticsEventSchema.safeParse({ name, properties: { ...PROPERTIES, from_reserve: false, duration_ms: 0 } }).success).toBe(true);
    for (const reason of Object.values(EVENT_REASON)) {
      expect(AnalyticsEventSchema.safeParse({ name, properties: { ...PROPERTIES, reason } }).success).toBe(true);
    }
  });

  it.each([
    ["name", "[Dean Village]"],
    ["placeId", "mock_place_dean_village"],
    ["stopId", "j2-dean-village"],
    ["wish", "une dégustation"],
    ["query", "librairie"],
  ])("refuse la propriété %s", (key, value) => {
    for (const name of ["replace_applied", "replace_undone"]) {
      expect(AnalyticsEventSchema.safeParse({ name, properties: { ...PROPERTIES, [key]: value } }).success).toBe(false);
    }
  });

  it("refuse une durée négative ou décimale, une raison du contrat (camelCase), une propriété manquante", () => {
    const parse = (properties: unknown) => AnalyticsEventSchema.safeParse({ name: "replace_applied", properties }).success;
    expect(parse({ ...PROPERTIES, duration_ms: -1 })).toBe(false);
    expect(parse({ ...PROPERTIES, duration_ms: 12.5 })).toBe(false);
    expect(parse({ ...PROPERTIES, reason: "notMyStyle" })).toBe(false);
    expect(parse({ reason: "too_far", from_reserve: true })).toBe(false);
  });
});
