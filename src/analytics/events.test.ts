// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferenceReasonSchema } from "@/contracts";

import { AnalyticsEventSchema, EVENT_REASON, EventReasonSchema, type AnalyticsEvent } from "./events";
import { CONSOLE_PREFIX, consoleRecorder, createMemoryRecorder, createTracker, noopRecorder, recorderFor } from "./track";

const VALID: AnalyticsEvent[] = [
  {
    name: "deck_decision",
    properties: { decision: "like", kind: "activity", category: "museum", position: 1, gesture: "swipe", travel_minutes: 15 },
  },
  {
    name: "deck_decision",
    properties: { decision: "dislike", kind: "meal", category: "restaurant", position: 2, gesture: "key", travel_minutes: 0 },
  },
  { name: "deck_undo", properties: { position: 3 } },
  { name: "deck_skipped", properties: { position: 1, scope: "all" } },
  { name: "deck_skipped", properties: { position: 4, scope: "day" } },
  { name: "preference_prompt_answered", properties: { category: "museum", answer: "yes", reason: "too_expensive" } },
  { name: "preference_prompt_answered", properties: { category: "distance", answer: "no" } },
];

describe("analytics: événements deck sans donnée personnelle", () => {
  it.each(VALID.map((event) => [event.name, event] as const))("accepte %s conforme au tableau des événements", (_name, event) => {
    expect(AnalyticsEventSchema.safeParse(event).success).toBe(true);
  });

  const decision = VALID[0]!;
  it.each([
    ["name", "[Château d'Édimbourg]"],
    ["placeId", "mock_place_chateau"],
    ["proposalId", "prop-j1-chateau"],
    ["text", "texte libre"],
    ["stopId", "j1-chateau"],
  ])("refuse la propriété %s", (key, value) => {
    const event = { ...decision, properties: { ...decision.properties, [key]: value } };
    expect(AnalyticsEventSchema.safeParse(event).success).toBe(false);
  });

  it("refuse une propriété hors de properties, un nom d'événement inconnu, des valeurs hors vocabulaire", () => {
    expect(AnalyticsEventSchema.safeParse({ ...decision, userId: "u1" }).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse({ name: "deck_like", properties: {} }).success).toBe(false);
    const bad = (properties: Record<string, unknown>) =>
      AnalyticsEventSchema.safeParse({ name: "deck_decision", properties: { ...decision.properties, ...properties } }).success;
    expect(bad({ decision: "valider" })).toBe(false);
    expect(bad({ gesture: "drag" })).toBe(false);
    expect(bad({ category: "Musées" })).toBe(false);
    expect(bad({ position: 0 })).toBe(false);
    expect(bad({ travel_minutes: -1 })).toBe(false);
    // Durée inconnue (décision 0092 § 4) : la propriété est absente, jamais null ni 0 inventé.
    expect(bad({ travel_minutes: null })).toBe(false);
    const sansDuree = Object.fromEntries(Object.entries(decision.properties).filter(([cle]) => cle !== "travel_minutes"));
    expect(AnalyticsEventSchema.safeParse({ name: "deck_decision", properties: sansDuree }).success).toBe(true);
    expect(
      AnalyticsEventSchema.safeParse({ name: "preference_prompt_answered", properties: { category: "distance", answer: "yes", reason: "Trop loin" } })
        .success,
    ).toBe(false);
    expect(AnalyticsEventSchema.safeParse({ name: "deck_skipped", properties: { position: 1 } }).success).toBe(false);
  });

  it("convertit chaque raison du contrat par une seule table", () => {
    expect(Object.keys(EVENT_REASON).sort()).toEqual([...PreferenceReasonSchema.options].sort());
    expect(Object.values(EVENT_REASON).sort()).toEqual([...EventReasonSchema.options].sort());
    expect(EVENT_REASON.tooExpensive).toBe("too_expensive");
  });
});

describe("analytics: checklist_item_done (spécification F5, F5c)", () => {
  it("accepte l'événement sans propriété", () => {
    expect(AnalyticsEventSchema.safeParse({ name: "checklist_item_done", properties: {} }).success).toBe(true);
  });

  it.each([
    ["itemId", "check-chateau"],
    ["label", "[Château d'Édimbourg]"],
    ["placeId", "mock_place_chateau"],
    ["done", true],
  ])("refuse la propriété %s", (key, value) => {
    expect(AnalyticsEventSchema.safeParse({ name: "checklist_item_done", properties: { [key]: value } }).success).toBe(false);
  });

  it("refuse l'événement sans objet properties", () => {
    expect(AnalyticsEventSchema.safeParse({ name: "checklist_item_done" }).success).toBe(false);
  });
});

describe("analytics: today_opened (spécification F10, F10-PO-16, C18)", () => {
  it("accepte { offline: false } et { offline: true } (propriété du contrat du handover § 12)", () => {
    expect(AnalyticsEventSchema.safeParse({ name: "today_opened", properties: { offline: false } }).success).toBe(true);
    expect(AnalyticsEventSchema.safeParse({ name: "today_opened", properties: { offline: true } }).success).toBe(true);
  });

  it.each([
    ["tripId", "mock_trip_edimbourg"],
    ["destination", "Édimbourg"],
    ["name", "[Dean Village]"],
    ["stopId", "j2-dean-village"],
    ["placeId", "mock_place_dean_village"],
    ["time", "10:40"],
    ["day", 2],
  ])("refuse la propriété %s", (key, value) => {
    expect(AnalyticsEventSchema.safeParse({ name: "today_opened", properties: { offline: false, [key]: value } }).success).toBe(false);
  });

  it("refuse l'événement sans `offline` ou avec une valeur qui n'est pas un booléen", () => {
    expect(AnalyticsEventSchema.safeParse({ name: "today_opened", properties: {} }).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse({ name: "today_opened", properties: { offline: "false" } }).success).toBe(false);
  });
});

describe("analytics: enregistreurs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("track valide puis confie l'événement à l'enregistreur en mémoire injecté", () => {
    const recorder = createMemoryRecorder();
    const track = createTracker(recorder, true);
    track(VALID[2]!);
    expect(recorder.events).toEqual([VALID[2]]);
  });

  it("un événement invalide lève une erreur en mode strict (tests) et n'est jamais enregistré", () => {
    const recorder = createMemoryRecorder();
    const invalid = { name: "deck_undo", properties: { position: 1, name: "[Lieu]" } } as unknown as AnalyticsEvent;
    expect(() => createTracker(recorder, true)(invalid)).toThrow(/invalide/);
    expect(() => createTracker(recorder, false)(invalid)).not.toThrow();
    expect(recorder.events).toEqual([]);
  });

  it("est strict hors production par défaut", () => {
    const invalid = { name: "deck_undo", properties: {} } as unknown as AnalyticsEvent;
    expect(() => createTracker(createMemoryRecorder())(invalid)).toThrow();
  });

  it("console : une ligne préfixée ; sans effet : rien ; aucun envoi réseau", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    consoleRecorder.record(VALID[3]!);
    noopRecorder.record(VALID[3]!);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(CONSOLE_PREFIX, JSON.stringify(VALID[3]));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(recorderFor("console")).toBe(consoleRecorder);
    expect(recorderFor("none")).toBe(noopRecorder);
  });
});
