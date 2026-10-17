import { createHash } from "node:crypto";

import {
  GenerationStatusSchema,
  InferredBriefSchema,
  LodgingSuggestionSchema,
  fail,
  ok,
  type CreateTripResult,
  type GenerationStatus,
  type InferredBrief,
  type LodgingRequest,
  type LodgingSuggestion,
  type Result,
  type TripRequest,
} from "@/contracts";
import { CreatedTripSchema } from "@/contracts/creation";
import { isFinalGenerationPhase } from "@/contracts/values";
import {
  MOCK_CREATED_TRIP_ID,
  MOCK_INFERRED_BRIEF,
  MOCK_LODGING_SUGGESTION,
  isMockEdinburgh,
  mockGenerationStatus,
} from "@/mocks/creation-edimbourg";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import type { CreationStore, LaunchRecord } from "./simulation";
import type { AdapterContext, CreationAdapter, TripAdapter } from "./types";

export interface MockCreationOptions {
  /** Brief renvoyé par `structureBrief` (tests) ; le brief d'Édimbourg par défaut. */
  inferredBrief?: unknown;
  /** Suggestion renvoyée pour Édimbourg par `suggestLodging` (tests) ; celle du jeu simulé par défaut. */
  lodgingSuggestion?: unknown;
  /**
   * Horloge, lancements et issue de la génération de la portée de simulation (0017 § 10), et lecture des voyages
   * (existence d'un voyage jamais lancé dans la portée). Requis par `createTrip` et `getGenerationStatus` (F8c) ;
   * `structureBrief` et `suggestLodging` n'en ont pas besoin.
   */
  now?: () => number;
  store?: CreationStore;
  trips?: TripAdapter;
  /** Lancements gardés au plus (0017 § 10.4) ; au-delà, le plus ancien est retiré. */
  maxLaunches?: number;
}

/** Nom de la ville `city` du brouillon : `0` pour la destination, `i` pour `otherCities[i − 1]`. */
function cityName(request: LodgingRequest): string | undefined {
  return request.city === 0 ? request.draft.destination : request.draft.otherCities[request.city - 1]?.name;
}

const launchKey = (organizationId: string, requestId: string) => `${organizationId}\u0000${requestId}`;

/**
 * Voyage créé pour l'organisation : `mock_trip_edimbourg` pour l'organisation simulée (F8-PO-13), sinon un identifiant
 * propre à l'organisation (tests unitaires seulement), jamais celui d'Édimbourg (0017 § 3.7).
 */
function createdTripId(organizationId: string): string {
  if (organizationId === MOCK_ORGANIZATION_ID) return MOCK_CREATED_TRIP_ID;
  return `mock_trip_${createHash("sha256").update(organizationId).digest("hex").slice(0, 16)}`;
}

/** Dernier lancement du voyage `tripId` par l'organisation, ou `undefined`. */
function latestLaunch(launches: Map<string, LaunchRecord>, organizationId: string, tripId: string): LaunchRecord | undefined {
  let latest: LaunchRecord | undefined;
  for (const launch of launches.values()) {
    if (launch.organizationId === organizationId && launch.tripId === tripId) latest = launch;
  }
  return latest;
}

/**
 * Création simulée (décision 0017 § 3.2 et § 3.7, F8-PO-13), sans réseau, sans écriture disque, sans journal, sur
 * l'horloge injectée de la portée :
 * - `structureBrief` renvoie un brief préparé quel que soit le récit, qu'il ne lit pas et ne garde pas ;
 * - `suggestLodging` renvoie la suggestion d'Édimbourg pour une ville nommée « Édimbourg », « Edimbourg » ou
 *   « Edinburgh » (casse et accents ignorés), et `no_option` pour toute autre ville ; il ne garde rien ;
 * - `createTrip` est idempotent par (organisation, `requestId`) ; il ne garde que ce couple, le voyage et l'instant
 *   du lancement (ni récit, ni brouillon, ni brief) ; `active_preview_exists` si une génération de la même
 *   organisation n'est pas finie et que le `requestId` est nouveau ; une fois la génération finie, un nouveau
 *   `requestId` relance la suite d'états ;
 * - `getGenerationStatus` déroule la suite d'états fixe du jeu simulé depuis l'instant du dernier lancement ; un
 *   voyage de l'organisation jamais lancé dans la portée est déjà complet (`ready`) ; un voyage inconnu ou d'une
 *   autre organisation donne `not_found`.
 * Les sorties sont validées par leur schéma ici, comme `mockTripAdapter`, puis de nouveau par l'action (F8-PO-17).
 */
export function createMockCreationAdapter({
  inferredBrief = MOCK_INFERRED_BRIEF,
  lodgingSuggestion = MOCK_LODGING_SUGGESTION,
  now,
  store,
  trips,
  maxLaunches = Number.POSITIVE_INFINITY,
}: MockCreationOptions = {}): CreationAdapter {
  function scoped() {
    if (!now || !store || !trips) throw new Error("création simulée sans portée de simulation (0017 § 10)");
    return { clock: now, creation: store, reader: trips };
  }

  const statusOf = (launch: LaunchRecord, at: number, outcome: CreationStore["outcome"]): GenerationStatus =>
    mockGenerationStatus(launch.tripId, at - launch.launchedAt, outcome);

  return {
    async structureBrief(): Promise<Result<InferredBrief>> {
      const parsed = InferredBriefSchema.safeParse(inferredBrief);
      return parsed.success ? ok(parsed.data) : fail("provider_error");
    },
    async suggestLodging(request: LodgingRequest): Promise<Result<LodgingSuggestion>> {
      const name = cityName(request);
      if (name === undefined || !isMockEdinburgh(name)) return fail("no_option");
      const parsed = LodgingSuggestionSchema.safeParse(lodgingSuggestion);
      return parsed.success ? ok(parsed.data) : fail("provider_error");
    },
    async createTrip(ctx: AdapterContext, request: TripRequest): Promise<CreateTripResult> {
      const { clock, creation } = scoped();
      const at = clock();
      const existing = creation.launches.get(launchKey(ctx.organizationId, request.requestId));
      if (existing) return ok({ tripId: existing.tripId });

      // Un aperçu actif à la fois par organisation (cadrage § 4) : une génération de l'organisation encore en cours.
      const tripIds = new Set<string>();
      for (const launch of creation.launches.values()) {
        if (launch.organizationId === ctx.organizationId) tripIds.add(launch.tripId);
      }
      for (const tripId of tripIds) {
        const latest = latestLaunch(creation.launches, ctx.organizationId, tripId);
        if (latest && !isFinalGenerationPhase(statusOf(latest, at, creation.outcome).phase)) {
          return { ok: false, error: { code: "active_preview_exists" }, activeTripId: tripId };
        }
      }

      const created = CreatedTripSchema.safeParse({ tripId: createdTripId(ctx.organizationId) });
      if (!created.success) return fail("provider_error");
      creation.launches.set(launchKey(ctx.organizationId, request.requestId), {
        organizationId: ctx.organizationId,
        requestId: request.requestId,
        tripId: created.data.tripId,
        launchedAt: at,
      });
      while (creation.launches.size > maxLaunches) {
        const oldest = creation.launches.keys().next().value;
        if (oldest === undefined) break;
        creation.launches.delete(oldest);
      }
      return ok(created.data);
    },
    async getGenerationStatus(ctx: AdapterContext, tripId: string): Promise<Result<GenerationStatus>> {
      const { clock, creation, reader } = scoped();
      const launch = latestLaunch(creation.launches, ctx.organizationId, tripId);
      let status: GenerationStatus;
      if (launch) {
        status = statusOf(launch, clock(), creation.outcome);
      } else {
        // Ouverture directe de l'écran 5 : le voyage simulé est déjà complet (0017 § 3.7).
        if (!(await reader.getTrip(ctx, tripId))) return fail("not_found");
        status = mockGenerationStatus(tripId, Number.POSITIVE_INFINITY);
      }
      const parsed = GenerationStatusSchema.safeParse(status);
      return parsed.success ? ok(parsed.data) : fail("provider_error");
    },
  };
}
