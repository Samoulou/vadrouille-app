import {
  DayMapSchema,
  DaySchema,
  ProposalSchema,
  TripSchema,
  validateDayMap,
  type DayMap,
  type Proposal,
  type Trip,
} from "@/contracts";
import {
  EDIMBOURG_DEBLOQUE_TRIP_ID,
  EDIMBOURG_TRIP_ID,
  MOCK_ORGANIZATION_ID,
  edimbourg,
  edimbourgDebloque,
  propositions,
  propositionsDebloque,
} from "@/mocks/edimbourg";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";

import type { AdapterContext, TripAdapter } from "./types";

interface MockEntry {
  trip: Trip;
  proposals: Proposal[];
  /** Positions simulées des jours (F4), facultatives. */
  maps?: DayMap[];
}

const DEFAULT_ENTRIES: MockEntry[] = [
  { trip: edimbourg, proposals: propositions, maps: edimbourgCarte },
  // Écran 6b (décision 0013, § 3.6) : même voyage, débloqué, sans positions simulées.
  { trip: edimbourgDebloque, proposals: propositionsDebloque },
];

/** Organisation simulée, lue seulement par `getRequestContext` quand DATA_ADAPTER vaut `mock`. */
export const MOCK_REQUEST_CONTEXT: AdapterContext = { organizationId: MOCK_ORGANIZATION_ID };

/**
 * Voyage simulé de démonstration, pour les pages de développement qui ne peuvent pas
 * importer `src/mocks` (/dev/carte).
 */
export const MOCK_DEMO_TRIP = {
  ctx: { organizationId: MOCK_ORGANIZATION_ID } satisfies AdapterContext,
  tripId: EDIMBOURG_TRIP_ID,
} as const;

/**
 * Même voyage simulé, débloqué (écran 6b, puis Séjour et Journée après « Débloquer »), pour la
 * section « Démonstration » de la page d'accueil (spécification D1, D1-PO-3).
 */
export const MOCK_DEMO_UNLOCKED_TRIP = {
  ctx: { organizationId: MOCK_ORGANIZATION_ID } satisfies AdapterContext,
  tripId: EDIMBOURG_DEBLOQUE_TRIP_ID,
} as const;

/**
 * Pendant débloqué d'un voyage simulé (décision 0020 § 3) : après un paiement simulé réussi,
 * `getTripReader()` sert le contenu du pendant sous l'identifiant payé.
 */
const UNLOCK_COUNTERPARTS: Readonly<Record<string, string>> = {
  [EDIMBOURG_TRIP_ID]: EDIMBOURG_DEBLOQUE_TRIP_ID,
};

export function counterpartOf(tripId: string): string | undefined {
  return Object.hasOwn(UNLOCK_COUNTERPARTS, tripId) ? UNLOCK_COUNTERPARTS[tripId] : undefined;
}

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

  /** Valide les positions d'un jour (schéma et concordance avec le jour) ; `null` sans position. */
  const dayMapOf = (entry: MockEntry, index: number): DayMap | null => {
    const day = entry.trip.days.find((candidate) => candidate.index === index);
    const raw = entry.maps?.find((candidate) => candidate.dayIndex === index);
    if (!day || !raw) {
      return null;
    }
    const map = DayMapSchema.parse(raw);
    const issues = validateDayMap(day, map, entry.trip.id);
    if (issues.length > 0) {
      throw new Error(`positions simulées invalides : ${issues.join(" ; ")}`);
    }
    return map.points.length > 0 ? map : null;
  };

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
    async getDayMap(ctx, tripId, index) {
      const entry = find(ctx, tripId);
      return entry ? dayMapOf(entry, index) : null;
    },
    async getTripMap(ctx, tripId) {
      const entry = find(ctx, tripId);
      if (!entry) {
        return [];
      }
      return entry.trip.days.flatMap((day) => {
        const map = dayMapOf(entry, day.index);
        return map ? [map] : [];
      });
    },
  };
}

export const mockTripAdapter: TripAdapter = createMockTripAdapter();
