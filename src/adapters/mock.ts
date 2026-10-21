import {
  DayMapSchema,
  DaySchema,
  PreviewSlotsSchema,
  ProposalSchema,
  RevisionFixturesSchema,
  TripSchema,
  TripSummarySchema,
  countToReserve,
  validateDayMap,
  type DayMap,
  type PreviewSlot,
  type Proposal,
  type RevisionFixtures,
  type Trip,
  type TripSummary,
} from "@/contracts";
import { lisbonne, porto } from "@/mocks/autres-voyages";
import {
  EDIMBOURG_DEBLOQUE_TRIP_ID,
  EDIMBOURG_TRIP_ID,
  MOCK_ORGANIZATION_ID,
  MOCK_USER_ID,
  apercu,
  edimbourg,
  edimbourgDebloque,
  propositions,
  propositionsDebloque,
} from "@/mocks/edimbourg";
import { deriveEdimbourgCarte, edimbourgCarte } from "@/mocks/edimbourg-carte";
import { edimbourgRevision } from "@/mocks/edimbourg-revision";

import type { AdapterContext, TripAdapter } from "./types";

interface MockEntry {
  trip: Trip;
  proposals: Proposal[];
  /** Aperçu d'un voyage non débloqué (évolution E7), facultatif : sans aperçu, liste vide. */
  previewSlots?: PreviewSlot[];
  /** Positions simulées des jours (F4), facultatives. */
  maps?: DayMap[];
}

const DEFAULT_ENTRIES: MockEntry[] = [
  { trip: edimbourg, proposals: propositions, previewSlots: apercu, maps: edimbourgCarte },
  // Écran 6b (décision 0013, § 3.6) : même voyage, débloqué. Ses positions sont dérivées de celles
  // d'Édimbourg, sauf le J6 en préparation (bug n° 106, décision 0017 § 13).
  { trip: edimbourgDebloque, proposals: propositionsDebloque, maps: deriveEdimbourgCarte(edimbourgDebloque) },
  // F11a (F11-PO-15, décision 0021 § 2) : un voyage passé et un voyage à venir, sans positions ni propositions,
  // ajoutés après les deux d'Édimbourg pour que les tests qui lisent les entrées par identifiant ne changent pas.
  { trip: lisbonne, proposals: [] },
  { trip: porto, proposals: [] },
];

/**
 * Résumé d'un voyage (décision 0021 § 1.2), validé par `TripSummarySchema` : champs du voyage, réservations
 * à faire et nombre de jours, sans jour, étape, position ni organisation.
 */
export function toTripSummary(trip: Trip): TripSummary {
  return TripSummarySchema.parse({
    id: trip.id,
    destination: trip.destination,
    destinationColor: trip.destinationColor,
    start: trip.start,
    end: trip.end,
    timeZone: trip.timeZone,
    travellers: trip.travellers,
    unlocked: trip.unlocked,
    toReserveCount: countToReserve(trip.checklist),
    dayCount: trip.days.length,
  });
}

/**
 * Contexte simulé (organisation, personne propriétaire), lu seulement par `getRequestContext` quand DATA_ADAPTER
 * vaut `mock`.
 */
export const MOCK_REQUEST_CONTEXT: AdapterContext = { organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" };

/**
 * Voyage simulé de démonstration, pour les pages de développement qui ne peuvent pas
 * importer `src/mocks` (/dev/carte).
 */
export const MOCK_DEMO_TRIP = {
  ctx: MOCK_REQUEST_CONTEXT,
  tripId: EDIMBOURG_TRIP_ID,
} as const;

/**
 * Même voyage simulé, débloqué (écran 6b, puis Séjour et Journée après « Débloquer »), pour la
 * section « Démonstration » de la page d'accueil (spécification D1, D1-PO-3).
 */
export const MOCK_DEMO_UNLOCKED_TRIP = {
  ctx: MOCK_REQUEST_CONTEXT,
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
    async listTrips(ctx) {
      return entries
        .filter((entry) => entry.trip.organizationId === ctx.organizationId)
        .map((entry) => toTripSummary(TripSchema.parse(entry.trip)));
    },
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
    async listPreviewSlots(ctx, tripId) {
      const entry = find(ctx, tripId);
      return entry ? PreviewSlotsSchema.parse(entry.previewSlots ?? []) : [];
    },
    async getDayMap(ctx, tripId, index) {
      const entry = find(ctx, tripId);
      return entry ? dayMapOf(entry, index) : null;
    },
    /** Session de tri en mémoire de F6 (B10-PO-18) : aucun tri enregistré sur `mock` (décision 0112 § 4 point 1). */
    async getDeckSession() {
      return null;
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

/** Jeux simulés de révision par voyage (décision 0016 § 6) : le voyage débloqué hérite de celui d'Édimbourg. */
const REVISION_FIXTURES: Readonly<Record<string, RevisionFixtures>> = {
  [EDIMBOURG_TRIP_ID]: edimbourgRevision,
  [EDIMBOURG_DEBLOQUE_TRIP_ID]: edimbourgRevision,
};

/**
 * Jeu simulé de révision d'un voyage (spécification F7, F7-TL-3 ; décision 0016 § 6), validé par
 * `RevisionFixturesSchema` : même isolation par organisation que `getTrip` (`null` pour un voyage inconnu ou d'une
 * autre organisation), `null` pour un voyage sans jeu de révision.
 */
export async function getMockRevisionFixtures(
  ctx: AdapterContext,
  tripId: string,
  adapter: TripAdapter = mockTripAdapter,
): Promise<RevisionFixtures | null> {
  const trip = await adapter.getTrip(ctx, tripId);
  if (!trip || !Object.hasOwn(REVISION_FIXTURES, tripId)) return null;
  return RevisionFixturesSchema.parse(REVISION_FIXTURES[tripId]);
}
