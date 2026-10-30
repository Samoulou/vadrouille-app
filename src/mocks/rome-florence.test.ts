// @vitest-environment node
import { describe, expect, it } from "vitest";

import { projectSharedTrip } from "@/adapters/share-projection";
import { TripSchema, TripSnapshotSchema } from "@/contracts";
import { MAX_CITIES } from "@/contracts/values";

import { romeFlorence } from "./rome-florence";

/** Jeu `mock` à deux villes (décision 0148 § 12, ligne M4-C). */
describe("plusieurs-villes: jeu simulé Rome puis Florence", () => {
  it("est un Trip valide, avec Trip.cities (2 villes, end exclusif) et un transfer à J3", () => {
    expect(TripSchema.parse(romeFlorence)).toEqual(romeFlorence);
    const cities = romeFlorence.cities ?? [];
    expect(cities.length).toBeGreaterThanOrEqual(2);
    expect(cities.length).toBeLessThanOrEqual(MAX_CITIES);
    expect(cities.at(0)?.start).toBe(romeFlorence.start);
    expect(cities.at(-1)?.end).toBe(romeFlorence.end);
    for (let i = 1; i < cities.length; i += 1) expect(cities[i]?.start).toBe(cities[i - 1]?.end);
    const avecTransfer = romeFlorence.days.filter((day) => day.items.some((item) => item.type === "transfer"));
    expect(avecTransfer.map((day) => day.date)).toEqual([cities[1]?.start]);
  });

  it("le transfer n'a ni placeId ni trajet autour de lui ; travelMinutes ne le compte pas", () => {
    const jour = romeFlorence.days.find((day) => day.items.some((item) => item.type === "transfer"))!;
    const rang = jour.items.findIndex((item) => item.type === "transfer");
    const transfer = jour.items[rang]!;
    expect(transfer).not.toHaveProperty("placeId");
    expect(transfer).toMatchObject({ from: romeFlorence.cities?.[0]?.name, to: romeFlorence.cities?.[1]?.name });
    expect(jour.items[rang - 1]?.type).not.toBe("segment");
    expect(jour.items[rang + 1]?.type).not.toBe("segment");
    const segments = jour.items.reduce((total, item) => total + (item.type === "segment" ? (item.segment.minutes ?? 0) : 0), 0);
    expect(jour.travelMinutes).toBe(segments);
  });

  it("passe l'instantané, et la vue partagée n'en garde ni le transfer ni les villes", () => {
    const days = romeFlorence.days.map(({ budgetPerPerson: _b, generating: _g, travelMinutes: _t, ...day }) => ({
      ...day,
      items: day.items.map((item) => (item.type === "segment" ? { type: "segment" as const, segment: { mode: item.segment.mode, estimated: item.segment.estimated } } : item)),
    }));
    expect(TripSnapshotSchema.safeParse({ days }).success).toBe(true);
    const shared = projectSharedTrip(romeFlorence);
    expect(JSON.stringify(shared)).not.toContain("transfer");
    expect(shared).not.toHaveProperty("cities");
  });
});
