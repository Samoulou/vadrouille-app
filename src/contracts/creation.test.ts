import { describe, expect, it } from "vitest";

import {
  BriefRequestSchema,
  BriefSchema,
  CategorySchema,
  GenerationDaySchema,
  InferredBriefSchema,
  LodgingSchema,
  LodgingSuggestionSchema,
  TripDraftSchema,
  type Brief,
  type BriefRequest,
  type InferredBrief,
  type TripDraft,
} from "@/contracts";
import { MOCK_INFERRED_BRIEF, MOCK_LODGING_SUGGESTION } from "@/mocks/creation-edimbourg";

import { CreatedTripSchema, RetryGenerationRequestSchema } from "./creation";

import {
  ADULTS,
  API_ERROR_CODES,
  CHILDREN,
  GENERATION_FAILURE_REASONS,
  MAX_CITIES,
  MAX_COMMITMENTS,
  MEAL_BUDGET_CHF,
  STORY_LENGTH,
  isEmailShape,
} from "./values";

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
const without = (value: object, key: string) => Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));

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

  it("logement saisi : libellé d'au moins deux caractères", () => {
    expect(LodgingSchema.safeParse({ kind: "known", label: "a" }).success).toBe(false);
  });
});

describe("LodgingSchema : suggestion retenue (0081 § B9-TL-5)", () => {
  const LODGING = { kind: "suggestedLodging", lodgingId: "l1", placeId: "p1", name: "[Hôtel du Vieux Port]" } as const;
  const AREA = {
    kind: "suggestedArea",
    areaId: "a1",
    name: "[Vieille Ville]",
    center: { lat: 55.95, lng: -3.19 },
    radiusM: 1200,
  } as const;

  it("logement suggéré : identifiant, placeId facultatif, nom maison", () => {
    expect(LodgingSchema.safeParse(LODGING).success).toBe(true);
    expect(LodgingSchema.safeParse(without(LODGING, "placeId")).success).toBe(true);
  });

  it("zone suggérée : identifiant, nom maison, centre et rayon", () => {
    expect(LodgingSchema.safeParse(AREA).success).toBe(true);
  });

  it("refuse une suggestion retenue sans nom, et une zone sans centre ou sans rayon", () => {
    const incomplete = [without(LODGING, "name"), without(AREA, "name"), without(AREA, "center"), without(AREA, "radiusM")];
    for (const value of incomplete) {
      expect(LodgingSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });

  it("mêmes bornes que LodgingSuggestionSchema : nom de 1 à 160 caractères, identifiants de 64 au plus", () => {
    expect(LodgingSchema.safeParse({ ...LODGING, name: repeat(160) }).success).toBe(true);
    expect(LodgingSchema.safeParse({ ...LODGING, name: repeat(161) }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...LODGING, name: "   " }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...AREA, name: repeat(161) }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...LODGING, lodgingId: repeat(65) }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...LODGING, placeId: repeat(65) }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...AREA, areaId: "" }).success).toBe(false);
  });

  it("zone : rayon entier de 50 à 20 000 m, centre dans les bornes, objets stricts", () => {
    expect(LodgingSchema.safeParse({ ...AREA, radiusM: 50 }).success).toBe(true);
    expect(LodgingSchema.safeParse({ ...AREA, radiusM: 20_000 }).success).toBe(true);
    expect(LodgingSchema.safeParse({ ...AREA, radiusM: 49 }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...AREA, radiusM: 20_001 }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...AREA, radiusM: 120.5 }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...AREA, center: { lat: 91, lng: 0 } }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...AREA, center: { lat: 0, lng: -181 } }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...AREA, center: { ...AREA.center, alt: 0 } }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...AREA, reason: "[raison]" }).success).toBe(false);
    expect(LodgingSchema.safeParse({ ...LODGING, meta: "[meta]" }).success).toBe(false);
  });

  it("toute suggestion de LodgingSuggestionSchema peut être retenue telle quelle", () => {
    const { area, lodgings } = LodgingSuggestionSchema.parse(MOCK_LODGING_SUGGESTION);
    const retainedArea = { kind: "suggestedArea", areaId: area.areaId, name: area.name, center: area.center, radiusM: area.radiusM };
    expect(LodgingSchema.safeParse(retainedArea).success).toBe(true);
    for (const lodging of [...lodgings, { lodgingId: repeat(64), placeId: repeat(64), name: repeat(160), meta: "m" }]) {
      const placeId = lodging.placeId === undefined ? {} : { placeId: lodging.placeId };
      const retained = { kind: "suggestedLodging", lodgingId: lodging.lodgingId, ...placeId, name: lodging.name };
      expect(LodgingSchema.safeParse(retained).success, lodging.lodgingId).toBe(true);
    }
  });

  it("TripDraftSchema accepte une suggestion retenue pour la destination et pour une autre ville", () => {
    const draft = { ...DRAFT, lodging: AREA, otherCities: [{ name: "Glasgow", arrival: "2026-09-01", lodging: LODGING }] };
    expect(TripDraftSchema.safeParse(draft).success).toBe(true);
  });
});

describe("RetryGenerationRequestSchema (0081 § B9-TL-11)", () => {
  const RETRY = { tripId: "mock_trip_edimbourg", requestId: "0b5e0f8e-3b8a-4f2b-9d36-7c1f2e4a9b10" };

  it("accepte l'identifiant du voyage et un requestId UUID ; la réponse a la forme de CreatedTripSchema", () => {
    expect(RetryGenerationRequestSchema.safeParse(RETRY).success).toBe(true);
    expect(CreatedTripSchema.safeParse({ tripId: RETRY.tripId }).success).toBe(true);
  });

  it("refuse un requestId absent ou qui n'est pas un UUID, un voyage absent, l'organisation ou tout autre champ", () => {
    expect(RetryGenerationRequestSchema.safeParse(without(RETRY, "requestId")).success).toBe(false);
    expect(RetryGenerationRequestSchema.safeParse(without(RETRY, "tripId")).success).toBe(false);
    expect(RetryGenerationRequestSchema.safeParse({ ...RETRY, requestId: "essai-2" }).success).toBe(false);
    expect(RetryGenerationRequestSchema.safeParse({ ...RETRY, tripId: "" }).success).toBe(false);
    expect(RetryGenerationRequestSchema.safeParse({ ...RETRY, organizationId: "org_1" }).success).toBe(false);
    expect(RetryGenerationRequestSchema.safeParse({ ...RETRY, kind: "full" }).success).toBe(false);
  });
});

describe("GenerationDaySchema", () => {
  it("rang positif, état fermé, propositions prêtes entières non négatives, objet strict", () => {
    expect(GenerationDaySchema.safeParse({ index: 1, state: "ready", readyStops: 4 }).success).toBe(true);
    expect(GenerationDaySchema.safeParse({ index: 0, state: "ready", readyStops: 4 }).success).toBe(false);
    expect(GenerationDaySchema.safeParse({ index: 1, state: "failed", readyStops: 0 }).success).toBe(false);
    expect(GenerationDaySchema.safeParse({ index: 1, state: "ready", readyStops: -1 }).success).toBe(false);
    expect(GenerationDaySchema.safeParse({ index: 1, state: "ready", readyStops: 1, placeId: "p" }).success).toBe(false);
  });
});

describe("codes et raisons de la création (0081 § B9-TL-14 point 1, livrés par F8c)", () => {
  it("unauthenticated et active_preview_exists sont des codes d'ApiError, quota_reached seulement une raison d'échec", () => {
    expect(API_ERROR_CODES).toEqual(expect.arrayContaining(["unauthenticated", "active_preview_exists", "validation_failed"]));
    expect(API_ERROR_CODES).not.toContain("quota_reached");
    expect(GENERATION_FAILURE_REASONS).toEqual(["provider_error", "cost_cap_reached", "quota_reached"]);
    expect(GENERATION_FAILURE_REASONS).not.toContain("no_option");
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
