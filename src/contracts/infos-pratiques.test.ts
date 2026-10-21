// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { DaySchema, LONGUEURS_CONTRAT, StopFactsSchema, StopSchema, type Day, type StopFacts } from "@/contracts";
import { DaySnapshotSchema, StopSnapshotSchema } from "@/contracts/snapshot";

/**
 * Lot 1 bis (décision 0116 § 6 ; décision 0094 § 7) : `StopFacts.tip`, `priceNote`, `hoursNote` et `Day.theme`,
 * facultatifs, texte maison (une ligne, sans balise ni URL), bornés à 160, 60, 120 et 80.
 */

const jour: Day = {
  index: 1,
  date: "2026-08-29",
  items: [],
  events: [],
  generating: false,
  travelMinutes: 0,
  travelBudgetMinutes: 90,
};

const etape = {
  id: "s1",
  kind: "activity" as const,
  name: "[Colisée]",
  start: "09:00",
  facts: {},
  exceptions: [],
  locked: false,
};

/** Valeurs refusées pour tout champ texte maison du lot 1 bis (0094 § 7 : « www.exemple.ch » et `<b>x</b>`). */
const REFUSES = ["", "   ", "<b>x</b>", "www.exemple.ch", "voir https://exemple.org", "exemple.com", "ligne\u0007son", "texte​caché", "un\ndeux"];

describe("contrats: infos pratiques de l'étape et titre du jour (lot 1 bis)", () => {
  it("rétrocompatible : sans les nouveaux champs, une étape et un jour restent valides", () => {
    expect(StopFactsSchema.safeParse({}).success).toBe(true);
    expect(StopFactsSchema.safeParse({ durationMinutes: 90, costPerPerson: 0, area: "[Old Town]" }).success).toBe(true);
    expect(DaySchema.safeParse(jour).success).toBe(true);
  });

  it("accepte les trois infos pratiques et le titre du jour, à leur borne", () => {
    const facts: StopFacts = {
      tip: "x".repeat(LONGUEURS_CONTRAT.tip),
      priceNote: "x".repeat(LONGUEURS_CONTRAT.priceNote),
      hoursNote: "x".repeat(LONGUEURS_CONTRAT.hoursNote),
    };
    expect(StopFactsSchema.safeParse(facts).success).toBe(true);
    expect(StopFactsSchema.safeParse({ tip: "Réserve le créneau de 9 h, 12.50 EUR, fermé le lundi" }).success).toBe(true);
    expect(DaySchema.safeParse({ ...jour, theme: "x".repeat(LONGUEURS_CONTRAT.theme) }).success).toBe(true);
    expect(DaySchema.safeParse({ ...jour, theme: "Colisée et Monti" }).success).toBe(true);
  });

  it("bornes : 160, 60, 120 et 80", () => {
    expect(LONGUEURS_CONTRAT).toEqual({ tip: 160, priceNote: 60, hoursNote: 120, theme: 80 });
    for (const cle of ["tip", "priceNote", "hoursNote"] as const) {
      expect(StopFactsSchema.safeParse({ [cle]: "x".repeat(LONGUEURS_CONTRAT[cle] + 1) }).success, cle).toBe(false);
    }
    expect(DaySchema.safeParse({ ...jour, theme: "x".repeat(LONGUEURS_CONTRAT.theme + 1) }).success).toBe(false);
  });

  it("refuse balise, URL, nom de domaine, caractère de contrôle ou invisible, texte vide, autre type", () => {
    for (const valeur of [...REFUSES, 12, null]) {
      for (const cle of ["tip", "priceNote", "hoursNote"] as const) {
        expect(StopFactsSchema.safeParse({ [cle]: valeur }).success, `${cle} ${JSON.stringify(valeur)}`).toBe(false);
      }
      expect(DaySchema.safeParse({ ...jour, theme: valeur }).success, `theme ${JSON.stringify(valeur)}`).toBe(false);
    }
  });

  it("toujours strict : une autre clé de faits (horaires ou note Google) reste refusée", () => {
    for (const refuse of [{ openingHours: "9-17" }, { rating: 4.5 }, { priceLevel: 2 }, { tips: "x" }, { title: "x" }]) {
      expect(StopFactsSchema.safeParse(refuse).success, JSON.stringify(refuse)).toBe(false);
    }
    expect(DaySchema.safeParse({ ...jour, title: "Samedi 29 août" }).success).toBe(false);
  });

  it("portés par l'étape, l'instantané et l'événement ; l'instantané garde le titre du jour", () => {
    const facts = { tip: "Arrive tôt", priceNote: "Environ 18 EUR", hoursNote: "Fermé le lundi" };
    expect(StopSchema.parse({ ...etape, facts }).facts).toEqual(facts);
    expect(StopSnapshotSchema.parse({ ...etape, facts }).facts).toEqual(facts);
    const snapshot = { index: 1, date: "2026-08-29", items: [], events: [], travelBudgetMinutes: 90, theme: "Colisée et Monti" };
    expect(DaySnapshotSchema.parse(snapshot).theme).toBe("Colisée et Monti");
  });

  it("types : champs facultatifs de type texte", () => {
    expectTypeOf<StopFacts["tip"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<StopFacts["priceNote"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<StopFacts["hoursNote"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Day["theme"]>().toEqualTypeOf<string | undefined>();
  });
});
