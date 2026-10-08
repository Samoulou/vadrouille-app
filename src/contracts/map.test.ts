// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DayMapSchema, validateDayMap, type DayMap } from "./map";
import type { Day } from "./trip";

const day: Day = {
  index: 2,
  date: "2026-08-30",
  weekday: "dim.",
  title: "Dimanche 30 août",
  items: [
    { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
    { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
    {
      type: "stop",
      stop: { id: "a", kind: "activity", name: "[A]", start: "09:15", meta: "", exceptions: [], locked: false },
    },
    { type: "free", from: "10:00", to: "11:00" },
    { type: "terminus", role: "end", time: "20:00", label: "[Hôtel]" },
  ],
  events: [],
  generating: false,
  travelMinutes: 10,
  travelBudgetMinutes: 90,
};

const valid: DayMap = {
  tripId: "voyage",
  dayIndex: 2,
  points: [
    { ref: { type: "terminus", role: "start" }, lat: 55.949, lng: -3.186 },
    { ref: { type: "stop", stopId: "a" }, lat: 55.95, lng: -3.19 },
    { ref: { type: "terminus", role: "end" }, lat: 55.949, lng: -3.186 },
  ],
};

describe("DayMapSchema", () => {
  it("accepte des positions valides", () => {
    expect(DayMapSchema.parse(valid)).toEqual(valid);
  });

  it.each(["rating", "openingHours", "photos", "name", "address"])("refuse le champ inconnu « %s » sur un point", (field) => {
    const point = { ...valid.points[1], [field]: "x" };
    expect(DayMapSchema.safeParse({ ...valid, points: [point] }).success).toBe(false);
  });

  it("refuse un champ inconnu sur la carte et sur la référence", () => {
    expect(DayMapSchema.safeParse({ ...valid, name: "x" }).success).toBe(false);
    const point = { ...valid.points[1]!, ref: { type: "stop", stopId: "a", placeName: "x" } };
    expect(DayMapSchema.safeParse({ ...valid, points: [point] }).success).toBe(false);
  });

  it.each([
    [-90.001, 0],
    [90.001, 0],
    [0, -180.001],
    [0, 180.001],
  ])("refuse lat %s, lng %s hors limites", (lat, lng) => {
    const point = { ref: { type: "stop", stopId: "a" }, lat, lng };
    expect(DayMapSchema.safeParse({ ...valid, points: [point] }).success).toBe(false);
  });

  it("accepte les bornes", () => {
    const points = [
      { ref: { type: "terminus", role: "start" }, lat: -90, lng: -180 },
      { ref: { type: "terminus", role: "end" }, lat: 90, lng: 180 },
    ];
    expect(DayMapSchema.safeParse({ ...valid, points }).success).toBe(true);
  });

  it("refuse deux points pour la même référence", () => {
    const stop = { ref: { type: "stop", stopId: "a" }, lat: 1, lng: 1 };
    expect(DayMapSchema.safeParse({ ...valid, points: [stop, { ...stop, lat: 2 }] }).success).toBe(false);
    const start = { ref: { type: "terminus", role: "start" }, lat: 1, lng: 1 };
    expect(DayMapSchema.safeParse({ ...valid, points: [start, start] }).success).toBe(false);
  });
});

describe("validateDayMap", () => {
  it("ne signale rien quand tout concorde", () => {
    expect(validateDayMap(day, valid, "voyage")).toEqual([]);
  });

  it("signale un stopId absent des étapes du jour", () => {
    const map = { ...valid, points: [{ ref: { type: "stop" as const, stopId: "inconnu" }, lat: 1, lng: 1 }] };
    expect(validateDayMap(day, map, "voyage")).toEqual([expect.stringContaining("inconnu")]);
  });

  it("signale un stopId qui désigne un élément qui n'est pas une étape", () => {
    const withEvent: Day = {
      ...day,
      events: [{ id: "evenement", kind: "event", name: "[E]", start: "18:00", meta: "", exceptions: [], locked: false }],
    };
    const map = { ...valid, points: [{ ref: { type: "stop" as const, stopId: "evenement" }, lat: 1, lng: 1 }] };
    expect(validateDayMap(withEvent, map, "voyage")).toHaveLength(1);
  });

  it("signale un tripId ou un dayIndex qui ne correspond pas au jour", () => {
    expect(validateDayMap(day, valid, "autre-voyage")).toEqual([expect.stringContaining("tripId")]);
    expect(validateDayMap(day, { ...valid, dayIndex: 3 }, "voyage")).toEqual([expect.stringContaining("dayIndex")]);
  });
});
