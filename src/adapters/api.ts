import {
  DayMapSchema,
  DaySchema,
  PreviewSlotsSchema,
  ProposalSchema,
  TripSchema,
  TripSummarySchema,
} from "@/contracts";
import { creerLectureVoyages, type DependancesLecture } from "@/server/voyages/lecture";

import type { TripAdapter } from "./types";

/**
 * Adaptateur `api` (spécification B6, B6a point 5 ; handover § 11 : aucun appel HTTP vers soi-même) : implémente
 * `TripAdapter` en appelant dans le même processus les cas d'usage de lecture de `src/server/voyages/` (seul fichier
 * hors de `src/server` qui les importe, règle `ligne/voyages-imports`), et valide chaque sortie par son contrat.
 *
 * Le port de relectures est **injecté** par la fabrique (B6 : le double de `src/mocks/relectures-voyages.ts` ; B8b :
 * Places et Routes). **Non branché** sur `getTripAdapter()` dans B6a : B6b ajoute le branchement et sa garde (B6-TL-7).
 * Une erreur fermée de lecture remonte telle quelle (B6a point 10).
 */
export type OptionsAdaptateurApi = DependancesLecture;

export function createApiTripAdapter(options: OptionsAdaptateurApi): TripAdapter {
  const lecture = creerLectureVoyages(options);
  return {
    async listTrips(ctx) {
      return TripSummarySchema.array().parse(await lecture.listTrips(ctx));
    },
    async getTrip(ctx, tripId) {
      const trip = await lecture.getTrip(ctx, tripId);
      return trip === null ? null : TripSchema.parse(trip);
    },
    async getDay(ctx, tripId, index) {
      const day = await lecture.getDay(ctx, tripId, index);
      return day === null ? null : DaySchema.parse(day);
    },
    async listProposals(ctx, tripId) {
      return ProposalSchema.array().parse(await lecture.listProposals(ctx, tripId));
    },
    async listPreviewSlots(ctx, tripId) {
      return PreviewSlotsSchema.parse(await lecture.listPreviewSlots(ctx, tripId));
    },
    async getDayMap(ctx, tripId, index) {
      const map = await lecture.getDayMap(ctx, tripId, index);
      return map === null ? null : DayMapSchema.parse(map);
    },
    async getTripMap(ctx, tripId) {
      return DayMapSchema.array().parse(await lecture.getTripMap(ctx, tripId));
    },
  };
}
