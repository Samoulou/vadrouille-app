import { expect } from "vitest";

import type { AdapterContext, TripAdapter } from "@/adapters/types";
import { DayMapSchema, DaySchema, PreviewSlotsSchema, ProposalSchema, TripSchema, TripSummarySchema } from "@/contracts";
import { countToReserve } from "@/contracts/values";

/**
 * Suite de contrat commune de `TripAdapter` (spécification B6, B6a point 6 ; décision 0086 § 1.5, sur le modèle de
 * `tests/support/auth-contrat.ts`) : exécutée sur `mock` (`tests/unit/adapters/trip-adapter-contrat.test.ts`,
 * `pnpm test`) et sur `api` (`tests/db/adaptateur-api.test.ts`, `pnpm test:db`). Même liste de cas des deux côtés ; les
 * cas propres à un adaptateur (portée de simulation de `mock`, RLS et recomposition d'`api`) restent hors de la suite.
 * Importée par ses deux fichiers d'exécution seulement. « Versions et conflits » (handover § 11) y entrent avec la
 * première écriture versionnée (B11, B6-PO-15).
 *
 * Cas : formes (chaque sortie valide son contrat ; résumés sans `organizationId` ; jour hors du voyage : `null` ;
 * jour sans position : `null`) ; isolation (pour chaque méthode, un voyage de l'organisation lu avec le contexte d'une
 * autre donne `null` ou `[]`, comme un identifiant inconnu ; `listTrips` de l'autre ne contient aucun voyage de la
 * première) ; cohérence (`dayCount`, `toReserveCount`, `unlocked`, `getTripMap` égale `getDayMap` jour par jour).
 */
export type BancTripAdapter = {
  readonly adapter: TripAdapter;
  /** Contexte de l'organisation qui possède les voyages. */
  readonly ctx: AdapterContext;
  /** Contexte d'une autre organisation. */
  readonly autreCtx: AdapterContext;
  /** Identifiants des voyages de l'organisation (au moins un). */
  readonly voyages: readonly string[];
  /** Identifiant valide qui ne désigne aucun voyage. */
  readonly inconnu: string;
  /** Un voyage et un jour de ce voyage sans aucune position. */
  readonly jourSansPosition: { readonly tripId: string; readonly index: number };
};

async function lectures(adapter: TripAdapter, ctx: AdapterContext, tripId: string) {
  return {
    trip: await adapter.getTrip(ctx, tripId),
    day: await adapter.getDay(ctx, tripId, 1),
    proposals: await adapter.listProposals(ctx, tripId),
    slots: await adapter.listPreviewSlots(ctx, tripId),
    dayMap: await adapter.getDayMap(ctx, tripId, 1),
    tripMap: await adapter.getTripMap(ctx, tripId),
  };
}

const VIDE = { trip: null, day: null, proposals: [], slots: [], dayMap: null, tripMap: [] };

export async function executerContratTripAdapter(banc: BancTripAdapter): Promise<void> {
  const { adapter, ctx, autreCtx } = banc;
  expect(banc.voyages.length).toBeGreaterThan(0);

  // --- Formes et cohérence ---
  const resumes = await adapter.listTrips(ctx);
  expect(TripSummarySchema.array().parse(resumes)).toEqual(resumes);
  for (const resume of resumes) expect(resume).not.toHaveProperty("organizationId");
  expect(new Set(resumes.map((r) => r.id))).toEqual(new Set(banc.voyages));

  for (const tripId of banc.voyages) {
    const { trip, day, proposals, slots, tripMap } = await lectures(adapter, ctx, tripId);
    expect(trip, tripId).not.toBeNull();
    if (trip === null) continue;
    TripSchema.parse(trip);
    if (day !== null) DaySchema.parse(day);
    ProposalSchema.array().parse(proposals);
    PreviewSlotsSchema.parse(slots);
    DayMapSchema.array().parse(tripMap);

    const resume = resumes.find((r) => r.id === tripId);
    expect(resume?.dayCount, tripId).toBe(trip.days.length);
    expect(resume?.toReserveCount, tripId).toBe(countToReserve(trip.checklist));
    expect(resume?.unlocked, tripId).toBe(trip.unlocked);

    // Jour hors du voyage.
    expect(await adapter.getDay(ctx, tripId, trip.days.length + 1)).toBeNull();
    expect(await adapter.getDayMap(ctx, tripId, trip.days.length + 1)).toBeNull();

    // getTripMap égale getDayMap jour par jour.
    for (const jour of trip.days) {
      const carte = await adapter.getDayMap(ctx, tripId, jour.index);
      expect(tripMap.find((m) => m.dayIndex === jour.index) ?? null, `${tripId} J${jour.index}`).toEqual(carte);
      if (carte !== null) DayMapSchema.parse(carte);
    }
  }
  expect(await adapter.getDayMap(ctx, banc.jourSansPosition.tripId, banc.jourSansPosition.index)).toBeNull();

  // --- Isolation ---
  expect(await lectures(adapter, ctx, banc.inconnu)).toEqual(VIDE);
  for (const tripId of banc.voyages) expect(await lectures(adapter, autreCtx, tripId), tripId).toEqual(VIDE);
  const autres = await adapter.listTrips(autreCtx);
  for (const resume of autres) expect(banc.voyages).not.toContain(resume.id);
}
