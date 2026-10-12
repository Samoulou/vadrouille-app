// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DayMapSchema, TripSchema, validateDayMap } from "@/contracts";

import { EDIMBOURG_TRIP_ID, edimbourg } from "./edimbourg";
import { edimbourgCarte } from "./edimbourg-carte";

const decimals = (value: number) => (String(value).split(".")[1] ?? "").length;

describe("positions simulées d'Édimbourg (F4-PO-2)", () => {
  it("le voyage et chaque jour de positions passent leurs schémas", () => {
    expect(() => TripSchema.parse(edimbourg)).not.toThrow();
    for (const map of edimbourgCarte) {
      expect(() => DayMapSchema.parse(map)).not.toThrow();
    }
  });

  it("couvre les 6 jours, chaque terminus et chaque étape", () => {
    expect(edimbourgCarte.map((map) => map.dayIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const day of edimbourg.days) {
      const map = edimbourgCarte.find((candidate) => candidate.dayIndex === day.index)!;
      const refs = map.points.map((point) =>
        point.ref.type === "stop" ? `stop:${point.ref.stopId}` : `terminus:${point.ref.role}`,
      );
      const expected = day.items.flatMap((item) =>
        item.type === "stop" ? [`stop:${item.stop.id}`] : item.type === "terminus" ? [`terminus:${item.role}`] : [],
      );
      expect(refs.sort()).toEqual(expected.sort());
    }
  });

  it("a au plus 3 décimales par coordonnée", () => {
    for (const point of edimbourgCarte.flatMap((map) => map.points)) {
      expect(decimals(point.lat)).toBeLessThanOrEqual(3);
      expect(decimals(point.lng)).toBeLessThanOrEqual(3);
    }
  });

  it("concorde avec les jours du voyage (validateDayMap)", () => {
    for (const map of edimbourgCarte) {
      const day = edimbourg.days.find((candidate) => candidate.index === map.dayIndex)!;
      expect(validateDayMap(day, map, EDIMBOURG_TRIP_ID)).toEqual([]);
    }
  });
});
