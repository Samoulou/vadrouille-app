import { describe, expect, it } from "vitest";

import {
  BriefRequestSchema,
  BriefSchema,
  CategorySchema,
  InferredBriefSchema,
  LodgingSchema,
  TripDraftSchema,
  type Brief,
  type BriefRequest,
  type InferredBrief,
  type TripDraft,
} from "@/contracts";
import { MOCK_INFERRED_BRIEF } from "@/mocks/creation-edimbourg";

import { ADULTS, CHILDREN, MAX_CITIES, MAX_COMMITMENTS, MEAL_BUDGET_CHF, STORY_LENGTH, isEmailShape } from "./values";

/** Contrats de phase 0 de la création (décision 0017 § 2, F8-TL-2), livrés par F8a. */

const DRAFT: TripDraft = {
  destination: "Édimbourg",
  start: "2026-08-29",
  end: "2026-09-03",
  lodging: { kind: "none" },
  otherCities: [],
  commitments: [{ kind: "ticket", label: "Tattoo", date: "2026-08-29", start: "21:30" }],
};

const REQUEST: BriefRequest = {
  story: "On part à deux, on aime la nature et les dégustations.",
  trip: { destination: "Édimbourg", start: "2026-08-29", end: "2026-09-03", otherCities: [] },
};

const BRIEF: Brief = {
  travellers: { adults: 2, children: 0 },
  pace: "balanced",
  wishes: ["nature", "tasting"],
  limits: [],
  mobility: ["walk"],
  inferredFields: ["travellers"],
};

const repeat = (n: number) => "a".repeat(n);

describe("TripDraftSchema", () => {
  it("accepte le brouillon du scénario « Créer un voyage sans hôtel »", () => {
    expect(TripDraftSchema.safeParse(DRAFT).success).toBe(true);
  });

  it("objet strict : un champ inconnu est refusé", () => {
    expect(TripDraftSchema.safeParse({ ...DRAFT, inconnu: 1 }).success).toBe(false);
  });

  it("départ strictement après l'arrivée", () => {
    expect(TripDraftSchema.safeParse({ ...DRAFT, end: DRAFT.start }).success).toBe(false);
  });

  it("autres villes : arrivées strictement croissantes, strictement entre l'arrivée et le départ", () => {
    const city = (name: string, arrival: string) => ({ name, arrival, lodging: { kind: "none" as const } });
    expect(TripDraftSchema.safeParse({ ...DRAFT, otherCities: [city("Glasgow", "2026-09-01")] }).success).toBe(true);
    expect(TripDraftSchema.safeParse({ ...DRAFT, otherCities: [city("Glasgow", "2026-08-29")] }).success).toBe(false);
    expect(TripDraftSchema.safeParse({ ...DRAFT, otherCities: [city("Glasgow", "2026-09-03")] }).success).toBe(false);
    expect(
      TripDraftSchema.safeParse({ ...DRAFT, otherCities: [city("Glasgow", "2026-09-01"), city("Inverness", "2026-09-01")] }).success,
    ).toBe(false);
  });

  it(`${MAX_CITIES} villes en tout au plus, ${MAX_COMMITMENTS} engagements au plus`, () => {
    const cities = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"].map((arrival, index) => ({
      name: `Ville ${index}`,
      arrival,
      lodging: { kind: "none" as const },
    }));
    expect(TripDraftSchema.safeParse({ ...DRAFT, otherCities: cities.slice(0, MAX_CITIES - 1) }).success).toBe(true);
    expect(TripDraftSchema.safeParse({ ...DRAFT, otherCities: cities }).success).toBe(false);
    const commitment = DRAFT.commitments[0]!;
    expect(TripDraftSchema.safeParse({ ...DRAFT, commitments: Array(MAX_COMMITMENTS).fill(commitment) }).success).toBe(true);
    expect(TripDraftSchema.safeParse({ ...DRAFT, commitments: Array(MAX_COMMITMENTS + 1).fill(commitment) }).success).toBe(false);
  });

  it("engagement : dans les dates du voyage, fin après le début", () => {
    const commitment = DRAFT.commitments[0]!;
    expect(TripDraftSchema.safeParse({ ...DRAFT, commitments: [{ ...commitment, date: "2026-08-28" }] }).success).toBe(false);
    expect(TripDraftSchema.safeParse({ ...DRAFT, commitments: [{ ...commitment, end: "21:00" }] }).success).toBe(false);
    expect(TripDraftSchema.safeParse({ ...DRAFT, commitments: [{ ...commitment, end: "23:30" }] }).success).toBe(true);
  });

  it("logement : une suggestion retenue ne porte que des identifiants", () => {
    expect(LodgingSchema.safeParse({ kind: "suggestedLodging", lodgingId: "l1", placeId: "p1" }).success).toBe(true);
    expect(LodgingSchema.safeParse({ kind: "suggestedLodging", lodgingId: "l1", name: "Hôtel" }).success).toBe(false);
    expect(LodgingSchema.safeParse({ kind: "known", label: "a" }).success).toBe(false);
  });
});

describe("BriefRequestSchema : le minimum", () => {
  it(`récit de ${STORY_LENGTH.min} à ${STORY_LENGTH.max} caractères, espaces des extrémités retirés`, () => {
    expect(BriefRequestSchema.safeParse(REQUEST).success).toBe(true);
    expect(BriefRequestSchema.safeParse({ ...REQUEST, story: repeat(STORY_LENGTH.min - 1) }).success).toBe(false);
    expect(BriefRequestSchema.safeParse({ ...REQUEST, story: `  ${repeat(STORY_LENGTH.min - 1)}  ` }).success).toBe(false);
    expect(BriefRequestSchema.safeParse({ ...REQUEST, story: repeat(STORY_LENGTH.max) }).success).toBe(true);
    expect(BriefRequestSchema.safeParse({ ...REQUEST, story: repeat(STORY_LENGTH.max + 1) }).success).toBe(false);
  });

  it("ni logement, ni engagement, ni identifiant", () => {
    expect(BriefRequestSchema.safeParse({ ...REQUEST, trip: { ...REQUEST.trip, lodging: { kind: "none" } } }).success).toBe(false);
    expect(BriefRequestSchema.safeParse({ ...REQUEST, trip: { ...REQUEST.trip, commitments: [] } }).success).toBe(false);
    expect(BriefRequestSchema.safeParse({ ...REQUEST, placeId: "p" }).success).toBe(false);
  });
});

describe("BriefSchema", () => {
  it("accepte un brief complet", () => {
    expect(BriefSchema.safeParse(BRIEF).success).toBe(true);
    expect(BriefSchema.safeParse({ ...BRIEF, mealBudgetPerPerson: MEAL_BUDGET_CHF.max }).success).toBe(true);
  });

  it("au moins une envie, sans doublon ; aucune envie à limiter", () => {
    expect(BriefSchema.safeParse({ ...BRIEF, wishes: [] }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...BRIEF, wishes: ["nature", "nature"] }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...BRIEF, limits: ["nature"] }).success).toBe(false);
  });

  it("voyageurs et budget dans leurs bornes, entiers", () => {
    expect(BriefSchema.safeParse({ ...BRIEF, travellers: { adults: ADULTS.min - 1, children: 0 } }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...BRIEF, travellers: { adults: ADULTS.max + 1, children: 0 } }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...BRIEF, travellers: { adults: 2, children: CHILDREN.max + 1 } }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...BRIEF, mealBudgetPerPerson: MEAL_BUDGET_CHF.min - 1 }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...BRIEF, mealBudgetPerPerson: 40.5 }).success).toBe(false);
  });
});

describe("InferredBriefSchema", () => {
  it("le brief simulé d'Édimbourg est conforme", () => {
    const brief: InferredBrief = MOCK_INFERRED_BRIEF;
    expect(InferredBriefSchema.safeParse(brief).success).toBe(true);
  });

  it("un brief vide est conforme (rien n'a été déduit)", () => {
    expect(InferredBriefSchema.safeParse({ inferredFields: [] }).success).toBe(true);
  });

  it("inferredFields est exactement l'ensemble des champs présents", () => {
    expect(InferredBriefSchema.safeParse({ pace: "relaxed", inferredFields: [] }).success).toBe(false);
    expect(InferredBriefSchema.safeParse({ inferredFields: ["pace"] }).success).toBe(false);
    expect(InferredBriefSchema.safeParse({ mealBudgetPerPerson: 30, inferredFields: ["mealBudget"] }).success).toBe(true);
    expect(InferredBriefSchema.safeParse({ pace: "relaxed", inferredFields: ["pace", "pace"] }).success).toBe(false);
  });

  it("une envie ne peut pas être aussi à limiter", () => {
    expect(InferredBriefSchema.safeParse({ wishes: ["nature"], limits: ["nature"], inferredFields: ["wishes", "limits"] }).success).toBe(
      false,
    );
  });

  it("champ inconnu ou catégorie inconnue refusés", () => {
    expect(InferredBriefSchema.safeParse({ inferredFields: [], story: "x" }).success).toBe(false);
    expect(InferredBriefSchema.safeParse({ wishes: ["plage"], inferredFields: ["wishes"] }).success).toBe(false);
  });
});

describe("vocabulaire des envies (F8-PO-6, F8-TL-8)", () => {
  it("huit codes, ceux de F6 d'abord", () => {
    expect(CategorySchema.options).toEqual(["museum", "walk", "nature", "tasting", "restaurant", "heritage", "market", "nightlife"]);
  });
});

describe("isEmailShape (0017 § 2.1)", () => {
  it.each(["a@b.ch", "prenom.nom@exemple.org"])("accepte %s", (value) => {
    expect(isEmailShape(value)).toBe(true);
  });

  it.each(["", "a", "a@b", "@b.ch", "a@.ch", "a@b.", "a@@b.ch", "a b@c.ch", `${repeat(250)}@b.ch`])("refuse « %s »", (value) => {
    expect(isEmailShape(value)).toBe(false);
  });
});
