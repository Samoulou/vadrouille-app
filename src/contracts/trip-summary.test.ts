// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import * as contracts from "./index";
import { TripSummarySchema, type TripSummary } from "./trip-summary";
import { STOP_KINDS, countToReserve } from "./values";

const valid: TripSummary = {
  id: "mock_trip_porto",
  destination: "Porto",
  destinationColor: "granit",
  start: "2027-05-08",
  end: "2027-05-11",
  timeZone: "Europe/Lisbon",
  travellers: { adults: 2, children: 0 },
  unlocked: true,
  toReserveCount: 2,
  dayCount: 4,
};

describe("TripSummarySchema (décision 0021 § 1.2)", () => {
  it("accepte un résumé valide ; type égal au type inféré ; réexporté par src/contracts", () => {
    expect(TripSummarySchema.parse(valid)).toEqual(valid);
    expectTypeOf<TripSummary>().toEqualTypeOf<z.infer<typeof TripSummarySchema>>();
    expect(contracts.TripSummarySchema).toBe(TripSummarySchema);
  });

  it("reste strict après pick et extend : refuse days, placeId, organizationId et checklist", () => {
    for (const extra of [
      { days: [] },
      { placeId: "mock_place" },
      { organizationId: "mock_org_personnelle" },
      { checklist: [] },
    ]) {
      expect(TripSummarySchema.safeParse({ ...valid, ...extra }).success, Object.keys(extra)[0]).toBe(false);
    }
  });

  it("toReserveCount entier ≥ 0, dayCount entier ≥ 1, fuseau valide", () => {
    expect(TripSummarySchema.safeParse({ ...valid, toReserveCount: -1 }).success).toBe(false);
    expect(TripSummarySchema.safeParse({ ...valid, toReserveCount: 1.5 }).success).toBe(false);
    expect(TripSummarySchema.safeParse({ ...valid, toReserveCount: 0 }).success).toBe(true);
    expect(TripSummarySchema.safeParse({ ...valid, dayCount: 0 }).success).toBe(false);
    expect(TripSummarySchema.safeParse({ ...valid, timeZone: "Lune/Base" }).success).toBe(false);
  });
});

describe("valeurs de F11a (décision 0021 § 1.1)", () => {
  it("STOP_KINDS est la source de StopSchema.kind", () => {
    expect(contracts.StopSchema.shape.kind.options).toEqual([...STOP_KINDS]);
  });

  it("countToReserve compte les lignes non faites", () => {
    expect(countToReserve([])).toBe(0);
    expect(countToReserve([{ done: true }, { done: false }, { done: false }])).toBe(2);
  });
});
