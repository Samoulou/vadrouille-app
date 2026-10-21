import { CreatedTripSchema } from "@/contracts/creation";
import { FullTripStatusSchema, GenerationStatusSchema, fail, ok, type CreatedTrip, type FullTripStatus, type GenerationStatus, type Result } from "@/contracts";
import { creerCasCreation, type DependancesCreation } from "@/server/creation";

import type { CreationAdapter } from "./types";

/**
 * Adaptateur `api` de la création (spécification B9, B9b ; décision 0081 B9-TL-1 : `src/adapters/api-creation.ts`) :
 * `createTrip`, `retryGeneration` et `getGenerationStatus` appellent dans le même processus les cas d'usage de
 * `src/server/creation/` (aucun appel HTTP vers soi-même, handover § 11) et valident chaque sortie par son contrat.
 * `getFullTripStatus` (B9d) appelle de même son cas d'usage. `structureBrief` et `suggestLodging` (B9a) ne sont pas livrés
 * par B9b : ils lèvent, et l'action rend `provider_error`.
 *
 * **Non branché** sur `getCreationAdapter()` dans B9b, comme `createApiTripAdapter` dans B6a : le branchement et sa
 * garde arrivent avec B6b et B9e (aucune génération réelle avant B9c). Dépendances : **tests seulement** (`withOrg` du
 * client de test, horloge, espion du démarrage) ; le démarrage par défaut est le double sans appel.
 */
export type OptionsAdaptateurCreationApi = DependancesCreation;

const nonLivre = (methode: string, tache: string) => () => Promise.reject(new Error(`${methode} : adaptateur api non livré (${tache})`));

function sortie<T>(schema: { safeParse(valeur: unknown): { success: true; data: T } | { success: false } }, resultat: Result<T>): Result<T> {
  if (!resultat.ok) return resultat;
  const valide = schema.safeParse(resultat.value);
  return valide.success ? ok(valide.data) : fail("provider_error");
}

export function createApiCreationAdapter(options: OptionsAdaptateurCreationApi = {}): CreationAdapter {
  const cas = creerCasCreation(options);
  return {
    structureBrief: nonLivre("structureBrief", "B9a"),
    suggestLodging: nonLivre("suggestLodging", "B9a"),
    async createTrip(ctx, request): Promise<Result<CreatedTrip>> {
      return sortie(CreatedTripSchema, await cas.createTrip(ctx, request));
    },
    async retryGeneration(ctx, request): Promise<Result<CreatedTrip>> {
      return sortie(CreatedTripSchema, await cas.retryGeneration(ctx, request));
    },
    async getGenerationStatus(ctx, tripId): Promise<Result<GenerationStatus>> {
      return sortie(GenerationStatusSchema, await cas.getGenerationStatus(ctx, tripId));
    },
    async getFullTripStatus(ctx, tripId): Promise<Result<FullTripStatus>> {
      return sortie(FullTripStatusSchema, await cas.getFullTripStatus(ctx, tripId));
    },
  };
}
