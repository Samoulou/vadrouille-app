import {
  DayMapSchema,
  DaySchema,
  ProposalSchema,
  TripSchema,
  TripSummarySchema,
  countToReserve,
  validateDayMap,
  type Trip,
} from "@/contracts";

import type { AdapterContext, TripAdapter } from "./types";

export type EntitlementReader = (ctx: AdapterContext, tripId: string) => Promise<{ unlocked: boolean }>;

/**
 * Vue débloquée du voyage simulé, forme B de la décision 0020 § 3 : un décorateur de `TripAdapter`, qui
 * laisse l'adaptateur `mock` pur et sans état.
 *
 * Pour un voyage **non débloqué** dans les données et **débloqué par un droit** de la portée, chaque
 * méthode renvoie le contenu de son pendant débloqué (`counterpartOf`), réétiqueté sous l'identifiant
 * payé (`Trip.id`, `unlocked: true`, `DayMap.tripId`), revalidé par les schémas. Un voyage débloqué sans
 * pendant garde son contenu avec `unlocked: true` ; un voyage débloqué dans les données n'est jamais
 * modifié. Disparaît avec un back-end réel, où `Trip.unlocked` est écrit par la confirmation du paiement.
 */
export function withSimulatedUnlock(
  base: TripAdapter,
  entitlement: EntitlementReader,
  counterpartOf: (tripId: string) => string | undefined,
): TripAdapter {
  type View = { kind: "base" } | { kind: "flag"; trip: Trip } | { kind: "counterpart"; trip: Trip; sourceId: string };

  async function resolve(ctx: AdapterContext, tripId: string): Promise<View> {
    const trip = await base.getTrip(ctx, tripId);
    if (!trip || trip.unlocked) return { kind: "base" };
    const { unlocked } = await entitlement(ctx, trip.id);
    if (!unlocked) return { kind: "base" };
    const sourceId = counterpartOf(trip.id);
    const source = sourceId ? await base.getTrip(ctx, sourceId) : null;
    if (!sourceId || !source) {
      return { kind: "flag", trip: TripSchema.parse({ ...trip, unlocked: true }) };
    }
    return { kind: "counterpart", sourceId, trip: TripSchema.parse({ ...source, id: trip.id, unlocked: true }) };
  }

  async function dayMap(ctx: AdapterContext, tripId: string, index: number, view: View) {
    if (view.kind !== "counterpart") return base.getDayMap(ctx, tripId, index);
    const raw = await base.getDayMap(ctx, view.sourceId, index);
    const day = view.trip.days.find((candidate) => candidate.index === index);
    if (!raw || !day) return null;
    const map = DayMapSchema.parse({ ...raw, tripId: view.trip.id });
    const issues = validateDayMap(day, map, view.trip.id);
    if (issues.length > 0) throw new Error(`positions réétiquetées invalides : ${issues.join(" ; ")}`);
    return map;
  }

  return {
    /**
     * Amendement de 0020 § 3 par 0021 § 2 : le résumé d'un voyage non débloqué dans les données et débloqué par
     * un droit de la portée est celui de sa vue débloquée (pendant réétiqueté, ou drapeau seul), revalidé ; les
     * autres résumés ne changent pas.
     */
    async listTrips(ctx) {
      const summaries = await base.listTrips(ctx);
      return Promise.all(
        summaries.map(async (summary) => {
          if (summary.unlocked) return summary;
          const view = await resolve(ctx, summary.id);
          if (view.kind === "base") return summary;
          return TripSummarySchema.parse({
            ...summary,
            unlocked: true,
            toReserveCount: countToReserve(view.trip.checklist),
            dayCount: view.trip.days.length,
          });
        }),
      );
    },
    async getTrip(ctx, tripId) {
      const view = await resolve(ctx, tripId);
      return view.kind === "base" ? base.getTrip(ctx, tripId) : view.trip;
    },
    async getDay(ctx, tripId, index) {
      const view = await resolve(ctx, tripId);
      if (view.kind === "base") return base.getDay(ctx, tripId, index);
      const day = view.trip.days.find((candidate) => candidate.index === index);
      return day ? DaySchema.parse(day) : null;
    },
    async listProposals(ctx, tripId) {
      const view = await resolve(ctx, tripId);
      if (view.kind !== "counterpart") return base.listProposals(ctx, tripId);
      return ProposalSchema.array().parse(await base.listProposals(ctx, view.sourceId));
    },
    /** L'aperçu ne sert qu'un voyage non débloqué : il est lu tel quel dans l'adaptateur de base. */
    async listPreviewSlots(ctx, tripId) {
      return base.listPreviewSlots(ctx, tripId);
    },
    async getDayMap(ctx, tripId, index) {
      const view = await resolve(ctx, tripId);
      return dayMap(ctx, tripId, index, view);
    },
    async getTripMap(ctx, tripId) {
      const view = await resolve(ctx, tripId);
      if (view.kind !== "counterpart") return base.getTripMap(ctx, tripId);
      const maps = await Promise.all(view.trip.days.map((day) => dayMap(ctx, tripId, day.index, view)));
      return maps.filter((map) => map !== null);
    },
  };
}
