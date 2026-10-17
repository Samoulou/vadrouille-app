import { describe, expect, it } from "vitest";

import type { InferredBrief } from "@/contracts";
import { MAX_CITIES, MAX_COMMITMENTS } from "@/contracts/values";

import { briefCompletedProperties } from "./brief-fields";
import { MOCK_DEMO_TRIP_DRAFT } from "@/mocks/creation-edimbourg";

import {
  adjacentLodgingCity,
  cityKey,
  draftComplete,
  draftForLodging,
  draftReducer,
  initialDraft,
  markedFields,
  pendingLodgingCities,
  type DraftAction,
  type DraftState,
  type LodgingChoice,
} from "./draft";
import { toTripDraft } from "./validation";

/** Brouillon en mémoire de l'onglet (F8-PO-1, F8-PO-5, F8-PO-7) : réducteur pur. */

const EDIMBOURG: InferredBrief = {
  travellers: { adults: 2, children: 0 },
  pace: "balanced",
  wishes: ["nature", "tasting", "restaurant"],
  mobility: ["walk", "transit"],
  inferredFields: ["travellers", "pace", "wishes", "mobility"],
};

/** Suggestions retenues avec leurs valeurs maison (0081 § B9-TL-5). */
const ZONE: LodgingChoice = { kind: "suggestedArea", areaId: "zone", name: "[Zone]", center: { lat: 55.95, lng: -3.19 }, radiusM: 700 };
const LOGEMENT: LodgingChoice = { kind: "suggestedLodging", lodgingId: "logement-1", placeId: "lieu-1", name: "[Logement]" };

const run = (actions: DraftAction[], state: DraftState = initialDraft()) => actions.reduce(draftReducer, state);

describe("brouillon : écran 1", () => {
  it(`au plus ${MAX_CITIES - 1} autres villes et ${MAX_COMMITMENTS} engagements`, () => {
    const state = run([...Array(MAX_CITIES + 2).fill({ type: "addCity" }), ...Array(MAX_COMMITMENTS + 2).fill({ type: "addCommitment" })]);
    expect(state.trip.otherCities).toHaveLength(MAX_CITIES - 1);
    expect(state.trip.commitments).toHaveLength(MAX_COMMITMENTS);
  });

  it("clés stables et uniques, même après un retrait", () => {
    const state = run([{ type: "addCity" }, { type: "addCity" }, { type: "removeCity", index: 0 }, { type: "addCity" }]);
    const keys = state.trip.otherCities.map((city) => city.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("logement d'une autre ville : `city` 1 vise la première autre ville", () => {
    const state = run([{ type: "addCity" }, { type: "lodging", city: 1, patch: { answer: "area", label: "Merchant City" } }]);
    expect(state.trip.otherCities[0]?.lodging).toEqual({ answer: "area", label: "Merchant City" });
    expect(state.trip.lodging.answer).toBeNull();
  });

  it("brouillon perdu : tout est remis à zéro, l'annonce attend le premier rendu, puis est écrite", () => {
    let state = run([{ type: "trip", patch: { destination: "Édimbourg" } }, { type: "lost" }]);
    expect(state.trip.destination).toBe("");
    expect(state).toMatchObject({ lostNotice: true, noticeVisible: false, tripReady: false });
    state = draftReducer(state, { type: "noticeShown" });
    expect(state).toMatchObject({ lostNotice: false, noticeVisible: true });
    state = draftReducer(state, { type: "tripReady" });
    expect(state).toMatchObject({ tripReady: true, noticeVisible: false });
  });
});

describe("brouillon : vérification du brief", () => {
  it("brief déduit : valeurs et marques, champs affichés", () => {
    const state = run([{ type: "inferred", brief: EDIMBOURG }]);
    expect(state.stage).toBe("review");
    expect(state.brief.values).toMatchObject({ adults: "2", children: "0", pace: "balanced", wishes: ["nature", "tasting", "restaurant"] });
    expect(state.brief.shown).toEqual(["travellers", "pace", "wishes", "mobility"]);
    expect(markedFields(state.brief.marks)).toEqual(state.brief.shown);
  });

  it("« Remplir moi-même » : aucun champ déduit, rythme sans choix", () => {
    const state = run([{ type: "fillMyself" }]);
    expect(state.brief.shown).toEqual([]);
    expect(state.brief.values.pace).toBeNull();
    expect(state.brief.values.wishes).toEqual([]);
  });

  it("toucher une Chip déduite choisie la retire et retire sa marque ; la toucher de nouveau la choisit sans marque", () => {
    let state = run([{ type: "inferred", brief: EDIMBOURG }, { type: "toggle", field: "wishes", value: "tasting" }]);
    expect(state.brief.values.wishes).toEqual(["nature", "restaurant"]);
    expect(state.brief.marks.wishes).toEqual(["nature", "restaurant"]);
    state = draftReducer(state, { type: "toggle", field: "wishes", value: "tasting" });
    expect(state.brief.values.wishes).toContain("tasting");
    expect(state.brief.marks.wishes).not.toContain("tasting");
  });

  it("une envie choisie est indisponible dans « À limiter » (et inversement) : l'activer n'a pas d'effet", () => {
    const state = run([{ type: "inferred", brief: EDIMBOURG }]);
    expect(draftReducer(state, { type: "toggle", field: "limits", value: "nature" })).toBe(state);
    const limited = draftReducer(state, { type: "toggle", field: "limits", value: "museum" });
    expect(draftReducer(limited, { type: "toggle", field: "wishes", value: "museum" })).toBe(limited);
  });

  it("le rythme déduit déjà choisi n'a pas d'autre effet ; un autre rythme retire la marque", () => {
    const state = run([{ type: "inferred", brief: EDIMBOURG }]);
    expect(draftReducer(state, { type: "pace", pace: "balanced" })).toBe(state);
    const changed = draftReducer(state, { type: "pace", pace: "intense" });
    expect(changed.brief.marks.pace).toBe(false);
    expect(changed.brief.edited).toEqual(["pace"]);
  });

  it("un nouveau passage par le récit remplace les déductions et garde les champs modifiés par la personne", () => {
    const state = run([
      { type: "inferred", brief: EDIMBOURG },
      { type: "pace", pace: "intense" },
      { type: "backToStory" },
      { type: "inferred", brief: { pace: "relaxed", mealBudgetPerPerson: 30, inferredFields: ["pace", "mealBudget"] } },
    ]);
    expect(state.brief.values.pace).toBe("intense");
    expect(state.brief.marks.pace).toBe(false);
    expect(state.brief.values.mealBudget).toBe("30");
    expect(state.brief.values.wishes).toEqual([]);
    expect(state.brief.values.adults).toBe("1");
    expect(state.brief.shown).toEqual(["mealBudget"]);
    expect(state.brief.edited).toEqual([]);
  });

  it("une envie gardée par la personne ne revient pas à limiter par une nouvelle déduction", () => {
    const state = run([
      { type: "fillMyself" },
      { type: "toggle", field: "wishes", value: "museum" },
      { type: "backToStory" },
      { type: "inferred", brief: { limits: ["museum", "market"], inferredFields: ["limits"] } },
    ]);
    expect(state.brief.values.wishes).toEqual(["museum"]);
    expect(state.brief.values.limits).toEqual(["market"]);
    expect(state.brief.marks.limits).toEqual(["market"]);
  });
});

describe("brief_completed : comptes", () => {
  it("scénario « Corriger le brief » : 4 champs déduits, 2 modifiés (envies, rythme)", () => {
    const state = run([
      { type: "inferred", brief: EDIMBOURG },
      { type: "toggle", field: "wishes", value: "tasting" },
      { type: "toggle", field: "wishes", value: "tasting" },
      { type: "pace", pace: "intense" },
    ]);
    expect(briefCompletedProperties(state.brief)).toEqual({ inferred_fields_count: 4, edited_fields_count: 2 });
  });

  it("« Remplir moi-même » : aucun champ déduit, même après des modifications", () => {
    const state = run([{ type: "fillMyself" }, { type: "pace", pace: "relaxed" }, { type: "toggle", field: "wishes", value: "nature" }]);
    expect(briefCompletedProperties(state.brief)).toEqual({ inferred_fields_count: 0, edited_fields_count: 0 });
  });

  it("un champ déduit non touché compte 0 ; un champ modifié deux fois compte une fois", () => {
    const state = run([
      { type: "inferred", brief: EDIMBOURG },
      { type: "travellers", patch: { adults: "3" } },
      { type: "travellers", patch: { children: "1" } },
    ]);
    expect(briefCompletedProperties(state.brief)).toEqual({ inferred_fields_count: 4, edited_fields_count: 1 });
  });

  it("un champ non déduit modifié ne compte pas", () => {
    const state = run([{ type: "inferred", brief: EDIMBOURG }, { type: "mealBudget", value: "40" }]);
    expect(briefCompletedProperties(state.brief)).toEqual({ inferred_fields_count: 4, edited_fields_count: 0 });
  });
});

describe("brouillon : écran 3 (F8b, F8-PO-8)", () => {
  /** Destination « Pas encore », Glasgow « Oui », Stirling « Pas encore ». */
  function threeCities(): DraftState {
    return run([
      { type: "trip", patch: { destination: "Édimbourg", start: "2026-08-29", end: "2026-09-06" } },
      { type: "lodging", city: 0, patch: { answer: "none" } },
      { type: "addCity" },
      { type: "city", index: 0, patch: { name: "Glasgow", arrival: "2026-09-01" } },
      { type: "lodging", city: 1, patch: { answer: "known", label: "[Hôtel]" } },
      { type: "addCity" },
      { type: "city", index: 1, patch: { name: "Stirling", arrival: "2026-09-04" } },
      { type: "lodging", city: 2, patch: { answer: "none" } },
      { type: "tripReady" },
      { type: "briefReady" },
    ]);
  }

  it("villes à loger dans l'ordre ; suivante et précédente", () => {
    const { trip } = threeCities();
    expect(pendingLodgingCities(trip)).toEqual([0, 2]);
    expect(adjacentLodgingCity(trip, 0, 1)).toBe(2);
    expect(adjacentLodgingCity(trip, 2, 1)).toBeNull();
    expect(adjacentLodgingCity(trip, 2, -1)).toBe(0);
    expect(adjacentLodgingCity(trip, 0, -1)).toBeNull();
    expect(cityKey(trip, 0)).toBe("destination");
    expect(cityKey(trip, 2)).toBe(trip.otherCities[1]?.key);
    expect(cityKey(trip, 5)).toBeUndefined();
  });

  it("choix gardé par clé de ville ; la ville courante avance, puis reste la dernière (retour de l'écran 4)", () => {
    let state = run([{ type: "lodgingCity", city: 0 }], threeCities());
    state = draftReducer(state, { type: "lodgingChoice", city: 0, choice: ZONE, next: 2 });
    expect(state.lodgingCity).toBe(2);
    state = draftReducer(state, { type: "lodgingChoice", city: 2, choice: { kind: "none" }, next: null });
    expect(state.lodgingCity).toBe(2);
    expect(state.lodgingChoices).toEqual({ destination: ZONE, [cityKey(state.trip, 2)!]: { kind: "none" } });
    // Le brouillon transmis porte le choix (valeurs maison, 0081 § B9-TL-5) et garde le logement connu de Glasgow.
    const draft = toTripDraft(state.trip, state.lodgingChoices);
    expect(draft.lodging).toEqual(ZONE);
    expect(draft.otherCities.map((city) => city.lodging)).toEqual([{ kind: "known", label: "[Hôtel]" }, { kind: "none" }]);
  });

  it("un choix de logement garde ses identifiants et son nom maison", () => {
    const state = draftReducer(threeCities(), {
      type: "lodgingChoice",
      city: 0,
      choice: LOGEMENT,
      next: 2,
    });
    expect(toTripDraft(state.trip, state.lodgingChoices).lodging).toEqual(LOGEMENT);
  });

  it("brouillon perdu : choix et ville courante effacés", () => {
    let state = draftReducer(threeCities(), { type: "lodgingChoice", city: 0, choice: { kind: "none" }, next: 2 });
    state = draftReducer(state, { type: "lost" });
    expect(state.lodgingChoices).toEqual({});
    expect(state.lodgingCity).toBeNull();
  });

  it("draftForLodging : brouillon prêt pour l'écran 3 de la première ville sans logement", () => {
    const state = draftForLodging(MOCK_DEMO_TRIP_DRAFT);
    expect(state.tripReady).toBe(true);
    expect(state.briefReady).toBe(true);
    expect(state.lodgingCity).toBe(0);
    expect(toTripDraft(state.trip)).toEqual(MOCK_DEMO_TRIP_DRAFT);
  });
});

describe("brouillon : lancement (F8c)", () => {
  const NONE = { kind: "none" } as const;

  it("requestId : créé une fois par brouillon, le premier est gardé", () => {
    const state = run([
      { type: "requestId", requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11" },
      { type: "requestId", requestId: "0c6a1b0e-3d7f-4b8e-8f2a-6b9d5e4c3a21" },
    ]);
    expect(state.requestId).toBe("5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11");
    expect(initialDraft().requestId).toBeNull();
  });

  it("brouillon complet : écrans 1 et 2 validés et un choix de l'écran 3 pour chaque ville « Pas encore »", () => {
    expect(draftComplete(initialDraft())).toBe(false);
    const lodging = draftForLodging({ ...MOCK_DEMO_TRIP_DRAFT, otherCities: [{ name: "Glasgow", arrival: "2026-09-01", lodging: NONE }] });
    expect(draftComplete(lodging)).toBe(false);
    const one = run([{ type: "lodgingChoice", city: 0, choice: NONE, next: 1 }], lodging);
    expect(draftComplete(one)).toBe(false);
    const both = run([{ type: "lodgingChoice", city: 1, choice: NONE, next: null }], one);
    expect(draftComplete(both)).toBe(true);
    expect(draftComplete({ ...both, briefReady: false })).toBe(false);
    // Logement connu : aucun écran 3.
    const known = draftForLodging({ ...MOCK_DEMO_TRIP_DRAFT, lodging: { kind: "known", label: "[Hôtel]" } });
    expect(draftComplete(known)).toBe(true);
  });
});
