// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TripSchema, TripSummarySchema, type Trip } from "@/contracts";
import { LISBONNE_TRIP_ID, PORTO_TRIP_ID, lisbonne, porto } from "@/mocks/autres-voyages";
import {
  EDIMBOURG_DEBLOQUE_TRIP_ID,
  EDIMBOURG_TRIP_ID,
  MOCK_ORGANIZATION_ID,
  edimbourg,
  edimbourgDebloque,
} from "@/mocks/edimbourg";

import { counterpartOf, createMockTripAdapter, mockTripAdapter, toTripSummary } from "./mock";
import { withSimulatedUnlock } from "./mock-unlock";

/** `listTrips` (F11a ; spécification F11, C15 ; décision 0021 § 1.2 et § 2). */

const ctx = { organizationId: MOCK_ORGANIZATION_ID };
const otherCtx = { organizationId: "mock_org_autre" };

const byId = <T extends { id: string }>(list: readonly T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
}

describe("listTrips de l'adaptateur simulé", () => {
  it("exactement les 4 voyages de l'organisation, chacun validé par TripSummarySchema", async () => {
    const summaries = await mockTripAdapter.listTrips(ctx);
    expect(summaries.map((summary) => summary.id).sort()).toEqual(
      [EDIMBOURG_TRIP_ID, EDIMBOURG_DEBLOQUE_TRIP_ID, LISBONNE_TRIP_ID, PORTO_TRIP_ID].sort(),
    );
    for (const summary of summaries) expect(TripSummarySchema.parse(summary)).toEqual(summary);
  });

  it("toReserveCount = lignes non faites (4, 4, 2, 0) ; dayCount = écart entre start et end plus un", async () => {
    const summaries = byId(await mockTripAdapter.listTrips(ctx));
    const count = Object.fromEntries(summaries.map((summary) => [summary.id, summary.toReserveCount]));
    expect(count).toEqual({
      [EDIMBOURG_TRIP_ID]: 4,
      [EDIMBOURG_DEBLOQUE_TRIP_ID]: 4,
      [PORTO_TRIP_ID]: 2,
      [LISBONNE_TRIP_ID]: 0,
    });
    for (const summary of summaries) expect(summary.dayCount).toBe(daysBetween(summary.start, summary.end));
  });

  it("aucun champ de jour, d'étape, de liste, de position ni d'organisation", async () => {
    for (const summary of await mockTripAdapter.listTrips(ctx)) {
      expect(Object.keys(summary).sort()).toEqual(
        ["dayCount", "destination", "destinationColor", "end", "id", "start", "timeZone", "toReserveCount", "travellers", "unlocked"].sort(),
      );
      expect(JSON.stringify(summary)).not.toMatch(/placeId|organizationId|mock_org|days|checklist|lat|lng/);
    }
  });

  it("autre organisation : liste vide", async () => {
    expect(await mockTripAdapter.listTrips(otherCtx)).toEqual([]);
  });

  it("un jeu sans voyage de l'organisation : liste vide ; toTripSummary sur un voyage seul", async () => {
    expect(await createMockTripAdapter([]).listTrips(ctx)).toEqual([]);
    expect(toTripSummary(porto)).toMatchObject({ id: PORTO_TRIP_ID, unlocked: true, toReserveCount: 2, dayCount: 4 });
  });
});

describe("voyages simulés ajoutés (F11-PO-15)", () => {
  const all: Trip[] = [edimbourg, edimbourgDebloque, lisbonne, porto];
  const stopIds = (trip: Trip) =>
    trip.days.flatMap((day) => [
      ...day.items.flatMap((item) => (item.type === "stop" ? [item.stop.id] : [])),
      ...day.events.map((event) => event.id),
    ]);

  it("Lisbonne et Porto sont valides, dans l'organisation simulée, et lus par getTrip", async () => {
    for (const trip of [lisbonne, porto]) {
      expect(() => TripSchema.parse(trip)).not.toThrow();
      expect(trip.organizationId).toBe(MOCK_ORGANIZATION_ID);
      expect(await mockTripAdapter.getTrip(ctx, trip.id)).toEqual(trip);
      expect(await mockTripAdapter.listProposals(ctx, trip.id)).toEqual([]);
      expect(await mockTripAdapter.getTripMap(ctx, trip.id)).toEqual([]);
    }
  });

  it("identifiants d'étapes préfixés par le voyage et disjoints entre les quatre voyages (Édimbourg et son pendant partagent les leurs)", () => {
    expect(stopIds(lisbonne).every((id) => id.startsWith("lis-"))).toBe(true);
    expect(stopIds(porto).every((id) => id.startsWith("por-"))).toBe(true);
    const edinburgh = new Set([...stopIds(edimbourg), ...stopIds(edimbourgDebloque)]);
    const added = [...stopIds(lisbonne), ...stopIds(porto)];
    expect(new Set(added).size).toBe(added.length);
    expect(added.filter((id) => edinburgh.has(id))).toEqual([]);
    expect(all).toHaveLength(4);
  });

  it("aucun placeId, aucune position, aucune proposition ; trajets sous le budget du rythme", () => {
    for (const trip of [lisbonne, porto]) {
      expect(JSON.stringify(trip)).not.toMatch(/placeId|"lat"|"lng"/);
      for (const day of trip.days) {
        expect(day.travelMinutes).toBeLessThan(day.travelBudgetMinutes);
        const kinds = day.items.flatMap((item) => (item.type === "stop" ? [item.stop.kind] : []));
        expect(kinds).toContain("activity");
        expect(kinds).toContain("meal");
        expect(kinds.length).toBeGreaterThanOrEqual(2);
        expect(kinds.length).toBeLessThanOrEqual(3);
        const first = day.items[0];
        const last = day.items.at(-1);
        expect(first?.type === "terminus" && first.role === "start").toBe(true);
        expect(last?.type === "terminus" && last.role === "end").toBe(true);
      }
    }
  });

  it("dates, fuseaux, couleurs et listes de la spécification", () => {
    expect([lisbonne.start, lisbonne.end, lisbonne.timeZone, lisbonne.destinationColor]).toEqual([
      "2026-05-14",
      "2026-05-17",
      "Europe/Lisbon",
      "azulejo",
    ]);
    expect([porto.start, porto.end, porto.timeZone, porto.destinationColor]).toEqual(["2027-05-08", "2027-05-11", "Europe/Lisbon", "granit"]);
    expect(lisbonne.checklist.map((item) => item.done)).toEqual([true]);
    expect(porto.checklist.filter((item) => !item.done)).toHaveLength(2);
    expect(porto.checklist).toHaveLength(3);
    const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
    for (const trip of [lisbonne, porto]) {
      trip.days.forEach((day, i) => {
        expect(day.index).toBe(i + 1);
        expect(day.weekday).toBe(WEEKDAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()]);
      });
      expect(trip.days[0]?.date).toBe(trip.start);
      expect(trip.days.at(-1)?.date).toBe(trip.end);
    }
  });
});

describe("listTrips avec le paiement simulé (amendement de 0020 § 3 par 0021 § 2)", () => {
  const unlockedFor = (paid: Set<string>) => async (_ctx: { organizationId: string }, tripId: string) => ({
    unlocked: paid.has(tripId),
  });

  it("sans droit : résumés de l'adaptateur de base", async () => {
    const reader = withSimulatedUnlock(mockTripAdapter, unlockedFor(new Set()), counterpartOf);
    expect(byId(await reader.listTrips(ctx))).toEqual(byId(await mockTripAdapter.listTrips(ctx)));
  });

  it("droit sur mock_trip_edimbourg : son résumé est débloqué, avec 4 réservations et les jours du pendant", async () => {
    const reader = withSimulatedUnlock(mockTripAdapter, unlockedFor(new Set([EDIMBOURG_TRIP_ID])), counterpartOf);
    const summaries = await reader.listTrips(ctx);
    const paid = summaries.find((summary) => summary.id === EDIMBOURG_TRIP_ID);
    expect(paid).toMatchObject({ id: EDIMBOURG_TRIP_ID, unlocked: true, toReserveCount: 4, dayCount: 6 });
    expect(TripSummarySchema.parse(paid)).toEqual(paid);
    // Le pendant garde son propre résumé ; aucun résumé payé n'apparaît sous l'identifiant du pendant.
    expect(summaries.filter((summary) => summary.id === EDIMBOURG_DEBLOQUE_TRIP_ID)).toHaveLength(1);
    expect(summaries).toHaveLength(4);
    const others = summaries.filter((summary) => summary.id !== EDIMBOURG_TRIP_ID);
    expect(byId(others)).toEqual(byId((await mockTripAdapter.listTrips(ctx)).filter((summary) => summary.id !== EDIMBOURG_TRIP_ID)));
  });

  it("voyage sans pendant débloqué par un droit : drapeau seul", async () => {
    const base = createMockTripAdapter([{ trip: { ...porto, unlocked: false }, proposals: [] }]);
    const reader = withSimulatedUnlock(base, unlockedFor(new Set([PORTO_TRIP_ID])), () => undefined);
    expect(await reader.listTrips(ctx)).toEqual([{ ...toTripSummary(porto), unlocked: true }]);
  });

  it("autre organisation : liste vide", async () => {
    const reader = withSimulatedUnlock(mockTripAdapter, async () => ({ unlocked: true }), counterpartOf);
    expect(await reader.listTrips(otherCtx)).toEqual([]);
  });
});
