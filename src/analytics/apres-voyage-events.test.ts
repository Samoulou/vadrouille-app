// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AnalyticsEventSchema } from "./events";

/*
 * Événements de l'après-voyage (spécification F11, F11-PO-16 ; décisions 0021 § 9 et 0160 § 1.2 point 7 ; spécification
 * M8 § 6.1 critère 4 ; PR de contrat M8-C, ticket 1041). Codes fermés et nombres seulement : un identifiant, un nom, une
 * destination ou un texte libre sont refusés. Aucun événement propre à l'adresse découverte (0160 § 1.2 point 7).
 */

const parse = (name: string, properties: unknown) => AnalyticsEventSchema.safeParse({ name, properties }).success;

const VALIDES = [
  ["stop_reviewed", { rating: "liked", kind: "activity" }],
  ["tastes_retained", { count: 2, inferred_count: 1 }],
  ["taste_removed", { category: "museum", origin: "confirmed" }],
] as const;

const SENTINELLES = [
  ["tripId", "trip-edimbourg"],
  ["stopId", "j1-chateau"],
  ["placeId", "ChIJ-SENTINELLE-M8C"],
  ["tasteId", "category:museum:less"],
  ["name", "[SENTINELLE-NOM-M8C]"],
  ["destination", "Édimbourg"],
  ["text", "texte libre"],
  ["date", "2026-09-03"],
] as const;

describe("analytics: après le voyage", () => {
  it.each(VALIDES)("accepte %s", (name, properties) => {
    expect(parse(name, properties)).toBe(true);
  });

  for (const [name, properties] of VALIDES) {
    it.each(SENTINELLES)(`${name} refuse la propriété %s`, (cle, valeur) => {
      expect(parse(name, { ...properties, [cle]: valeur })).toBe(false);
    });
  }

  it("stop_reviewed : valeurs de STOP_RATINGS et STOP_KINDS seulement", () => {
    for (const rating of ["liked", "disliked", "notDone"]) {
      for (const kind of ["activity", "meal", "event"]) expect(parse("stop_reviewed", { rating, kind })).toBe(true);
    }
    expect(parse("stop_reviewed", { rating: "not_done", kind: "activity" })).toBe(false);
    expect(parse("stop_reviewed", { rating: null, kind: "activity" })).toBe(false);
    expect(parse("stop_reviewed", { rating: "liked", kind: "transfer" })).toBe(false);
    expect(parse("stop_reviewed", { rating: "liked" })).toBe(false);
  });

  it("tastes_retained : entiers, count ≥ 1, 0 ≤ inferred_count ≤ count", () => {
    expect(parse("tastes_retained", { count: 1, inferred_count: 0 })).toBe(true);
    expect(parse("tastes_retained", { count: 3, inferred_count: 3 })).toBe(true);
    expect(parse("tastes_retained", { count: 0, inferred_count: 0 })).toBe(false);
    expect(parse("tastes_retained", { count: 2, inferred_count: 3 })).toBe(false);
    expect(parse("tastes_retained", { count: 2, inferred_count: -1 })).toBe(false);
    expect(parse("tastes_retained", { count: 1.5, inferred_count: 0 })).toBe(false);
  });

  it("taste_removed : catégorie de CATEGORIES ou distance, origine fermée", () => {
    expect(parse("taste_removed", { category: "distance", origin: "inferred" })).toBe(true);
    expect(parse("taste_removed", { category: "Musées", origin: "confirmed" })).toBe(false);
    expect(parse("taste_removed", { category: "museum", origin: "cancelled" })).toBe(false);
    expect(parse("taste_removed", { category: "museum", origin: "confirmed", direction: "less" })).toBe(false);
  });

  it("aucun événement d'adresse découverte à part (décision 0160 § 1.2 point 7)", () => {
    expect(parse("discovered" + "_place_added", { with_day: true })).toBe(false);
  });
});
