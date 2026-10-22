import { describe, expect, it } from "vitest";

import { BriefRequestSchema, BriefSchema, IsoDateSchema, TripDraftSchema } from "@/contracts";
import {
  ADULTS,
  AREA_LENGTH,
  CHILDREN,
  CITY_NAME_LENGTH,
  COMMITMENT_LABEL_LENGTH,
  DESTINATION_LENGTH,
  KNOWN_LODGING_LENGTH,
  MEAL_BUDGET_CHF,
  STORY_LENGTH,
} from "@/contracts/values";

import { draftReducer, emptyBriefValues, initialDraft, type BriefValues, type CommitmentForm, type TripForm } from "./draft";
import {
  cityRanges,
  isDate,
  parseInteger,
  storyError,
  textError,
  toBrief,
  toBriefRequest,
  toTripDraft,
  todayIso,
  validateBrief,
  validateTrip,
} from "./validation";

const TODAY = "2026-08-01";

const TRIP: TripForm = {
  destination: "Édimbourg",
  start: "2026-08-29",
  end: "2026-09-03",
  lodging: { answer: "none", label: "" },
  otherCities: [],
  commitments: [],
};

const COMMITMENT: CommitmentForm = { key: "e1", kind: "ticket", label: "Tattoo", date: "2026-08-29", start: "21:30", end: "" };
const city = (name: string, arrival: string) => ({ key: name, name, arrival, lodging: { answer: "none" as const, label: "" } });
const repeat = (n: number) => "a".repeat(n);

describe("validateTrip (écran 1)", () => {
  it("le scénario « Créer un voyage sans hôtel » est valide", () => {
    expect(validateTrip({ ...TRIP, commitments: [COMMITMENT] }, TODAY)).toEqual([]);
  });

  it("rien saisi : destination, dates et logement, dans l'ordre (le focus va sur la destination)", () => {
    expect(validateTrip(initialDraft().trip, TODAY)).toEqual([
      { field: "destination", code: "required" },
      { field: "start", code: "required" },
      { field: "end", code: "required" },
      { field: "lodging", code: "required" },
    ]);
  });

  it("arrivée passée refusée, arrivée aujourd'hui acceptée", () => {
    expect(validateTrip({ ...TRIP, start: "2026-07-31" }, TODAY)).toContainEqual({ field: "start", code: "past" });
    expect(validateTrip({ ...TRIP, start: TODAY }, TODAY)).toEqual([]);
  });

  it("départ égal à l'arrivée refusé", () => {
    expect(validateTrip({ ...TRIP, end: TRIP.start }, TODAY)).toEqual([{ field: "end", code: "endBeforeStart" }]);
  });

  it("logement « Oui » ou « Un quartier » : libellé obligatoire, dans ses bornes", () => {
    expect(validateTrip({ ...TRIP, lodging: { answer: "known", label: "" } }, TODAY)).toEqual([{ field: "lodging.label", code: "required" }]);
    expect(validateTrip({ ...TRIP, lodging: { answer: "known", label: repeat(KNOWN_LODGING_LENGTH.max) } }, TODAY)).toEqual([]);
    expect(validateTrip({ ...TRIP, lodging: { answer: "area", label: repeat(AREA_LENGTH.max + 1) } }, TODAY)).toEqual([
      { field: "lodging.label", code: "length" },
    ]);
  });

  it("engagement hors des dates refusé ; fin avant le début refusée", () => {
    expect(validateTrip({ ...TRIP, commitments: [{ ...COMMITMENT, date: "2026-09-04" }] }, TODAY)).toEqual([
      { field: "commitments.0.date", code: "outOfTrip" },
    ]);
    expect(validateTrip({ ...TRIP, commitments: [{ ...COMMITMENT, end: "20:00" }] }, TODAY)).toEqual([
      { field: "commitments.0.end", code: "endTime" },
    ]);
    expect(validateTrip({ ...TRIP, commitments: [{ ...COMMITMENT, kind: null, label: "" }] }, TODAY).map((e) => e.field)).toEqual([
      "commitments.0.kind",
      "commitments.0.label",
    ]);
  });

  it("villes : arrivée strictement après la précédente et strictement avant le départ", () => {
    expect(validateTrip({ ...TRIP, otherCities: [city("Glasgow", "2026-09-01")] }, TODAY)).toEqual([]);
    expect(validateTrip({ ...TRIP, otherCities: [city("Glasgow", TRIP.start)] }, TODAY)).toEqual([
      { field: "otherCities.0.arrival", code: "cityOrder" },
    ]);
    expect(validateTrip({ ...TRIP, otherCities: [city("Glasgow", "2026-09-01"), city("Inverness", "2026-09-01")] }, TODAY)).toEqual([
      { field: "otherCities.1.arrival", code: "cityOrder" },
    ]);
    expect(validateTrip({ ...TRIP, otherCities: [city("Glasgow", TRIP.end)] }, TODAY)).toEqual([
      { field: "otherCities.0.arrival", code: "cityBeforeEnd" },
    ]);
  });

  it("bornes des textes : celles des contrats", () => {
    expect(textError(repeat(DESTINATION_LENGTH.min - 1), DESTINATION_LENGTH)).toBe("length");
    expect(textError(repeat(DESTINATION_LENGTH.min), DESTINATION_LENGTH)).toBeNull();
    expect(textError(repeat(CITY_NAME_LENGTH.max + 1), CITY_NAME_LENGTH)).toBe("length");
    expect(textError("   ", COMMITMENT_LABEL_LENGTH)).toBe("required");
  });

  it("todayIso : date locale de l'appareil", () => {
    expect(todayIso(new Date(2026, 7, 1, 8, 0))).toBe("2026-08-01");
  });
});

describe("cityRanges (récapitulatif)", () => {
  it("Édimbourg 29.08 – 01.09 et Glasgow 01.09 – 03.09", () => {
    expect(cityRanges({ ...TRIP, otherCities: [city("Glasgow", "2026-09-01")] })).toEqual([
      { name: "Édimbourg", start: "2026-08-29", end: "2026-09-01" },
      { name: "Glasgow", start: "2026-09-01", end: "2026-09-03" },
    ]);
  });

  it("« Retirer » Glasgow rend à Édimbourg tout le voyage", () => {
    const state = { ...initialDraft(), trip: { ...TRIP, otherCities: [city("Glasgow", "2026-09-01")] } };
    const removed = draftReducer(state, { type: "removeCity", index: 0 });
    expect(cityRanges(removed.trip)).toEqual([{ name: "Édimbourg", start: "2026-08-29", end: "2026-09-03" }]);
  });

  it("null tant que les dates ne sont pas cohérentes", () => {
    expect(cityRanges({ ...TRIP, otherCities: [city("Glasgow", "")] })).toBeNull();
    expect(cityRanges({ ...TRIP, otherCities: [city("Glasgow", "2026-08-20")] })).toBeNull();
  });
});

describe("concordance avec les schémas (le serveur fait foi, aucune borne recopiée)", () => {
  it("un écran 1 valide donne un TripDraft conforme", () => {
    const trips: TripForm[] = [
      { ...TRIP, commitments: [COMMITMENT] },
      { ...TRIP, destination: repeat(DESTINATION_LENGTH.max), lodging: { answer: "known", label: repeat(KNOWN_LODGING_LENGTH.max) } },
      { ...TRIP, destination: repeat(DESTINATION_LENGTH.min), lodging: { answer: "area", label: repeat(AREA_LENGTH.min) } },
      { ...TRIP, otherCities: [city("Glasgow", "2026-09-01")], commitments: [{ ...COMMITMENT, label: repeat(COMMITMENT_LABEL_LENGTH.max), end: "23:00" }] },
    ];
    for (const trip of trips) {
      expect(validateTrip(trip, TODAY)).toEqual([]);
      expect(TripDraftSchema.safeParse(toTripDraft(trip)).success).toBe(true);
    }
  });

  it("dates : l'interface et IsoDateSchema donnent le même verdict (date existante au calendrier)", () => {
    const samples = ["2026-08-29", "2028-02-29", "2026-02-28", "2026-02-29", "2026-02-31", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-8-29", ""];
    for (const value of samples) {
      expect(isDate(value), value).toBe(IsoDateSchema.safeParse(value).success);
    }
    expect(validateTrip({ ...TRIP, start: "2026-09-31", end: "2026-10-02" }, TODAY)).toContainEqual({ field: "start", code: "required" });
  });

  it("toTripDraft refuse un engagement sans type au lieu de lui en donner un", () => {
    expect(() => toTripDraft({ ...TRIP, commitments: [{ ...COMMITMENT, kind: null }] })).toThrow(/engagement sans type/);
  });

  it("aux bornes, l'interface et le schéma refusent les mêmes textes", () => {
    for (const destination of [repeat(DESTINATION_LENGTH.min - 1), repeat(DESTINATION_LENGTH.max + 1)]) {
      expect(validateTrip({ ...TRIP, destination }, TODAY)).toEqual([{ field: "destination", code: "length" }]);
      expect(TripDraftSchema.safeParse(toTripDraft({ ...TRIP, destination })).success).toBe(false);
    }
  });

  it("toBriefRequest : le minimum, conforme au schéma ; récit aux bornes", () => {
    const request = toBriefRequest({ ...TRIP, lodging: { answer: "known", label: "Hôtel" }, commitments: [COMMITMENT] }, repeat(STORY_LENGTH.min));
    expect(Object.keys(request.trip).sort()).toEqual(["destination", "end", "otherCities", "start"]);
    expect(BriefRequestSchema.safeParse(request).success).toBe(true);
    expect(storyError(repeat(STORY_LENGTH.min))).toBeNull();
    expect(storyError(` ${repeat(STORY_LENGTH.min - 1)} `)).toBe("required");
    expect(BriefRequestSchema.safeParse(toBriefRequest(TRIP, ` ${repeat(STORY_LENGTH.min - 1)} `)).success).toBe(false);
    expect(storyError(repeat(STORY_LENGTH.max + 1))).toBe("length");
  });
});

describe("validateBrief (vérification)", () => {
  const valid: BriefValues = { ...emptyBriefValues(), pace: "balanced", wishes: ["nature"] };

  it("sans rythme ni envie : erreurs dans l'ordre, le focus va sur le rythme", () => {
    expect(validateBrief(emptyBriefValues())).toEqual([
      { field: "pace", code: "required" },
      { field: "wishes", code: "required" },
    ]);
  });

  it("voyageurs et budget dans les bornes des contrats", () => {
    expect(validateBrief({ ...valid, adults: String(ADULTS.min - 1) })).toEqual([{ field: "adults", code: "range" }]);
    expect(validateBrief({ ...valid, adults: "" })).toEqual([{ field: "adults", code: "range" }]);
    expect(validateBrief({ ...valid, children: String(CHILDREN.max + 1) })).toEqual([{ field: "children", code: "range" }]);
    expect(validateBrief({ ...valid, mealBudget: String(MEAL_BUDGET_CHF.min - 1) })).toEqual([{ field: "mealBudget", code: "range" }]);
    expect(validateBrief({ ...valid, mealBudget: String(MEAL_BUDGET_CHF.max) })).toEqual([]);
    expect(validateBrief({ ...valid, mealBudget: "" })).toEqual([]);
  });

  it("parseInteger : entier dans les bornes seulement", () => {
    expect(parseInteger("40", MEAL_BUDGET_CHF)).toBe(40);
    expect(parseInteger("4.5", MEAL_BUDGET_CHF)).toBeNull();
    expect(parseInteger("-1", CHILDREN)).toBeNull();
  });

  it("toBrief : une vérification valide donne un Brief conforme, les champs encore marqués restent déduits", () => {
    let state = draftReducer(initialDraft(), {
      type: "inferred",
      brief: {
        travellers: { adults: 2, children: 0 },
        pace: "balanced",
        wishes: ["nature", "tasting"],
        mobility: ["walk"],
        inferredFields: ["travellers", "pace", "wishes", "mobility"],
      },
    });
    state = draftReducer(state, { type: "pace", pace: "intense" });
    state = draftReducer(state, { type: "mealBudget", value: "40" });
    expect(validateBrief(state.brief.values)).toEqual([]);
    const brief = toBrief(state.brief);
    expect(BriefSchema.safeParse(brief).success).toBe(true);
    expect(brief).toMatchObject({ pace: "intense", mealBudgetPerPerson: 40, inferredFields: ["travellers", "wishes", "mobility"] });
  });
});

describe("validateTrip : site d'essai (E2E-essai, lot 2, critère 2 ; D1)", () => {
  const ROME: TripForm = { ...TRIP, destination: "Rome", start: "2026-08-29", end: "2026-09-03" };
  const essai = { essai: true };

  it("Rome, une seule ville, 5 nuits : admis ; casse et accents ignorés", () => {
    expect(validateTrip(ROME, TODAY, essai)).toEqual([]);
    expect(validateTrip({ ...ROME, destination: "  ÉDIMBOURG " }, TODAY, essai)).toEqual([]);
  });

  it("ville absente de la table : refus au champ destination ; destination vide reste « required »", () => {
    expect(validateTrip({ ...ROME, destination: "Atlantide" }, TODAY, essai)).toEqual([{ field: "destination", code: "unknownCity" }]);
    expect(validateTrip({ ...ROME, destination: "" }, TODAY, essai)).toContainEqual({ field: "destination", code: "required" });
  });

  it("une autre ville : refus au champ de son nom", () => {
    const deux: TripForm = {
      ...ROME,
      otherCities: [{ key: "c1", name: "Florence", arrival: "2026-09-01", lodging: { answer: "none", label: "" } }],
    };
    expect(validateTrip(deux, TODAY, essai)).toEqual([{ field: "otherCities.0.name", code: "singleCity" }]);
    expect(validateTrip(deux, TODAY)).toEqual([]);
  });

  it("15 jours au plus (départ au plus 14 jours après l'arrivée), comme `BriefSchema`", () => {
    expect(validateTrip({ ...ROME, end: "2026-09-12" }, TODAY, essai)).toEqual([]);
    expect(validateTrip({ ...ROME, end: "2026-09-13" }, TODAY, essai)).toEqual([{ field: "end", code: "tooLong" }]);
    expect(validateTrip({ ...ROME, end: "2026-09-13" }, TODAY)).toEqual([]);
  });
});
