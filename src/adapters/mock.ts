import { DaySchema, ProposalSchema, TripSchema, type Proposal, type Trip } from "@/contracts";
import { edimbourg, propositions } from "@/mocks/edimbourg";

import type { AdapterContext, TripAdapter } from "./types";

interface MockEntry {
  trip: Trip;
  proposals: Proposal[];
}

const DEFAULT_ENTRIES: MockEntry[] = [{ trip: edimbourg, proposals: propositions }];

/**
 * Adaptateur simulé : lit les jeux de `src/mocks`, valide chaque sortie avec
 * les schémas de `src/contracts` (une erreur de jeu échoue tôt) et ne renvoie
 * rien pour une autre organisation.
 */
export function createMockTripAdapter(entries: MockEntry[] = DEFAULT_ENTRIES): TripAdapter {
  const find = (ctx: AdapterContext, tripId: string): MockEntry | undefined =>
    entries.find(
      (entry) => entry.trip.id === tripId && entry.trip.organizationId === ctx.organizationId,
    );

  return {
    async getTrip(ctx, tripId) {
      const entry = find(ctx, tripId);
      return entry ? TripSchema.parse(entry.trip) : null;
    },
    async getDay(ctx, tripId, index) {
      const day = find(ctx, tripId)?.trip.days.find((candidate) => candidate.index === index);
      return day ? DaySchema.parse(day) : null;
    },
    async listProposals(ctx, tripId) {
      const entry = find(ctx, tripId);
      return entry ? ProposalSchema.array().parse(entry.proposals) : [];
    },
  };
}

export const mockTripAdapter: TripAdapter = createMockTripAdapter();
