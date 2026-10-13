// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AnalyticsEventSchema } from "./events";

/**
 * Événement du déplacement (spécification F7, F7-PO-18, critère C8 ; décision 0016 § 10) : `method` seulement. Un nom,
 * un `placeId`, un identifiant d'étape, un jour, une requête ou un souhait sont refusés.
 */

describe("analytics: stop_moved", () => {
  it("accepte `button` et `drag`, refuse une autre méthode ou une propriété manquante", () => {
    const parse = (properties: unknown) => AnalyticsEventSchema.safeParse({ name: "stop_moved", properties }).success;
    expect(parse({ method: "button" })).toBe(true);
    expect(parse({ method: "drag" })).toBe(true);
    expect(parse({ method: "keyboard" })).toBe(false);
    expect(parse({})).toBe(false);
  });

  it.each([
    ["name", "[Jardin botanique royal]"],
    ["placeId", "mock_place_jardin_botanique"],
    ["stopId", "j2-jardin-botanique"],
    ["day", 4],
    ["wish", "plus tard"],
    ["query", "jardin"],
  ])("refuse la propriété %s", (key, value) => {
    expect(AnalyticsEventSchema.safeParse({ name: "stop_moved", properties: { method: "button", [key]: value } }).success).toBe(false);
  });
});
