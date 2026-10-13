// @vitest-environment node
import { describe, expect, it } from "vitest";

import { mockTripAdapter } from "@/adapters/mock";
import type { TripSummary } from "@/contracts";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { classifyTrips, reopenTarget } from "./trips";

/** Classement et réouverture de « Mes voyages » (spécification F11, « Tests », `trips.ts` ; C6 à C11). */

const ED = "mock_trip_edimbourg";
const ED_OK = "mock_trip_edimbourg_debloque";
const LIS = "mock_trip_lisbonne";
const POR = "mock_trip_porto";

const at = (iso: string) => Date.parse(iso);
const ids = (list: readonly TripSummary[]) => list.map((summary) => summary.id);

async function summaries() {
  return mockTripAdapter.listTrips({ organizationId: MOCK_ORGANIZATION_ID });
}

function summary(over: Partial<TripSummary>): TripSummary {
  return {
    id: "t",
    destination: "[Ville]",
    destinationColor: "ocre",
    start: "2026-09-10",
    end: "2026-09-12",
    timeZone: "Europe/London",
    travellers: { adults: 2, children: 0 },
    unlocked: true,
    toReserveCount: 0,
    dayCount: 3,
    ...over,
  };
}

describe("classifyTrips, jeu simulé (tableau de la spécification)", () => {
  it("2026-08-01 : À venir Édimbourg puis Porto ; Pas encore débloqués Édimbourg ; Passés Lisbonne ; plaque Édimbourg débloqué", async () => {
    const sections = classifyTrips(await summaries(), at("2026-08-01T12:00:00+01:00"));
    expect(ids(sections.current)).toEqual([]);
    expect(ids(sections.upcoming)).toEqual([ED_OK, POR]);
    expect(ids(sections.locked)).toEqual([ED]);
    expect(ids(sections.past)).toEqual([LIS]);
    expect(sections.featured?.id).toBe(ED_OK);
  });

  it("2026-08-30 : En cours Édimbourg débloqué ; l'autre reste dans Pas encore débloqués", async () => {
    const sections = classifyTrips(await summaries(), at("2026-08-30T10:40:00+01:00"));
    expect(ids(sections.current)).toEqual([ED_OK]);
    expect(ids(sections.upcoming)).toEqual([POR]);
    expect(ids(sections.locked)).toEqual([ED]);
    expect(ids(sections.past)).toEqual([LIS]);
    expect(sections.featured?.id).toBe(ED_OK);
  });

  it("2026-10-09 : À venir Porto ; Passés Édimbourg (identifiant), Édimbourg débloqué, Lisbonne ; plaque Porto", async () => {
    const sections = classifyTrips(await summaries(), at("2026-10-09T12:00:00+01:00"));
    expect(ids(sections.current)).toEqual([]);
    expect(ids(sections.upcoming)).toEqual([POR]);
    expect(ids(sections.locked)).toEqual([]);
    expect(ids(sections.past)).toEqual([ED, ED_OK, LIS]);
    expect(sections.featured?.id).toBe(POR);
  });

  it("date de la destination : appareil à Zurich, 29.08 00:30 (23:30 le 28 à Édimbourg) puis 01:30 (C8)", async () => {
    const before = classifyTrips(await summaries(), at("2026-08-29T00:30:00+02:00"));
    expect(ids(before.current)).toEqual([]);
    expect(ids(before.upcoming)).toContain(ED_OK);
    const after = classifyTrips(await summaries(), at("2026-08-29T01:30:00+02:00"));
    expect(ids(after.current)).toEqual([ED_OK]);
  });
});

describe("classifyTrips, cas limites", () => {
  const now = at("2026-09-10T12:00:00Z");

  it("bornes : commence ou finit le jour même = En cours ; finit la veille = Passé ; commence le lendemain = À venir", () => {
    const sections = classifyTrips(
      [
        summary({ id: "start", start: "2026-09-10", end: "2026-09-15" }),
        summary({ id: "end", start: "2026-09-01", end: "2026-09-10" }),
        summary({ id: "yesterday", start: "2026-09-01", end: "2026-09-09" }),
        summary({ id: "tomorrow", start: "2026-09-11", end: "2026-09-15" }),
      ],
      now,
    );
    expect(ids(sections.current)).toEqual(["end", "start"]);
    expect(ids(sections.past)).toEqual(["yesterday"]);
    expect(ids(sections.upcoming)).toEqual(["tomorrow"]);
  });

  it("non débloqué en cours : Pas encore débloqués ; non débloqué passé : Passés", () => {
    const sections = classifyTrips(
      [summary({ id: "now", unlocked: false }), summary({ id: "old", unlocked: false, start: "2026-01-01", end: "2026-01-03" })],
      now,
    );
    expect(ids(sections.locked)).toEqual(["now"]);
    expect(ids(sections.past)).toEqual(["old"]);
    expect(sections.featured?.id).toBe("now");
  });

  it("liste vide : sections vides, pas de plaque", () => {
    expect(classifyTrips([], now)).toEqual({ current: [], upcoming: [], locked: [], past: [], featured: null });
  });

  it("seulement des voyages passés : pas de plaque", () => {
    expect(classifyTrips([summary({ start: "2026-01-01", end: "2026-01-02" })], now).featured).toBeNull();
  });

  it("dates égales : ordre des identifiants ; Passés par fin décroissante", () => {
    const sections = classifyTrips(
      [
        summary({ id: "b", start: "2026-10-01", end: "2026-10-03" }),
        summary({ id: "a", start: "2026-10-01", end: "2026-10-05" }),
        summary({ id: "p2", start: "2026-01-01", end: "2026-02-01" }),
        summary({ id: "p1", start: "2026-01-01", end: "2026-03-01" }),
        summary({ id: "p0", start: "2025-12-01", end: "2026-03-01" }),
      ],
      now,
    );
    expect(ids(sections.upcoming)).toEqual(["a", "b"]);
    expect(ids(sections.past)).toEqual(["p0", "p1", "p2"]);
  });

  it("chaque voyage à son fuseau : deux destinations, deux dates du jour", () => {
    // 2026-09-09 à 22:30 UTC : déjà le 10 à Kolkata (04:00), encore le 9 à Londres (23:30, heure d'été).
    const late = at("2026-09-09T22:30:00Z");
    const sections = classifyTrips(
      [summary({ id: "london", timeZone: "Europe/London" }), summary({ id: "kolkata", timeZone: "Asia/Kolkata" })],
      late,
    );
    expect(ids(sections.current)).toEqual(["kolkata"]);
    expect(ids(sections.upcoming)).toEqual(["london"]);
  });
});

describe("reopenTarget (F11-PO-5)", () => {
  const unlocked = summary({ id: ED_OK, start: "2026-08-29", end: "2026-09-03", dayCount: 6 });
  const locked = { ...unlocked, id: ED, unlocked: false };
  const before = at("2026-08-01T12:00:00+01:00");
  const during = at("2026-08-30T10:40:00+01:00");
  const after = at("2026-10-09T12:00:00+01:00");

  it("sans dernier onglet : Séjour d'un voyage débloqué, présentation d'un non débloqué à venir, Séjour d'un non débloqué passé", () => {
    expect(reopenTarget(unlocked, before, undefined)).toBe(`/voyages/${ED_OK}`);
    expect(reopenTarget(locked, before, undefined)).toBe(`/voyages/${ED}/presentation`);
    expect(reopenTarget(locked, after, undefined)).toBe(`/voyages/${ED}`);
  });

  it("dernier onglet : Séjour, Journée 3 ; jour inexistant ignoré", () => {
    expect(reopenTarget(unlocked, before, { kind: "sejour" })).toBe(`/voyages/${ED_OK}`);
    expect(reopenTarget(unlocked, before, { kind: "jour", n: 3 })).toBe(`/voyages/${ED_OK}/jour/3`);
    expect(reopenTarget(unlocked, before, { kind: "jour", n: 7 })).toBe(`/voyages/${ED_OK}`);
    expect(reopenTarget(unlocked, before, { kind: "jour", n: 0 })).toBe(`/voyages/${ED_OK}`);
    expect(reopenTarget(locked, before, { kind: "jour", n: 9 })).toBe(`/voyages/${ED}/presentation`);
    expect(reopenTarget(locked, before, { kind: "sejour" })).toBe(`/voyages/${ED}`);
  });

  it("aux dates du voyage, écran 15 (règle 1, F10a) : avant le dernier onglet, voyage débloqué ou non (C11)", () => {
    expect(reopenTarget(unlocked, during, { kind: "jour", n: 3 })).toBe(`/voyages/${ED_OK}/aujourdhui`);
    expect(reopenTarget(unlocked, during, { kind: "sejour" })).toBe(`/voyages/${ED_OK}/aujourdhui`);
    expect(reopenTarget(unlocked, during, undefined)).toBe(`/voyages/${ED_OK}/aujourdhui`);
    expect(reopenTarget(locked, during, undefined)).toBe(`/voyages/${ED}/aujourdhui`);
  });

  it("bornes à la date de la destination : premier et dernier jour inclus ; veille et lendemain exclus", () => {
    expect(reopenTarget(unlocked, at("2026-08-29T00:10:00+01:00"), undefined)).toBe(`/voyages/${ED_OK}/aujourdhui`);
    expect(reopenTarget(unlocked, at("2026-09-03T23:50:00+01:00"), undefined)).toBe(`/voyages/${ED_OK}/aujourdhui`);
    expect(reopenTarget(unlocked, at("2026-08-28T23:50:00+01:00"), undefined)).toBe(`/voyages/${ED_OK}`);
    expect(reopenTarget(unlocked, at("2026-09-04T00:10:00+01:00"), undefined)).toBe(`/voyages/${ED_OK}`);
  });

  it("identifiant encodé", () => {
    expect(reopenTarget({ ...unlocked, id: "a b" }, before, undefined)).toBe("/voyages/a%20b");
  });
});
