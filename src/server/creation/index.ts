import "server-only";

import type { AdapterContext } from "@/adapters/types";
import type { CreatedTrip, FullTripStatus, GenerationStatus, Result } from "@/contracts";

import { outils, type DependancesCreation } from "./commun";
import { creerVoyage } from "./creer-voyage";
import { lireEtatGeneration } from "./etat-generation";
import { lireEtatVoyageComplet } from "./etat-voyage-complet";
import { relancerGeneration } from "./nouvel-essai";

export type { DependancesCreation } from "./commun";
export type { DemarrerApercu, DemarrerVoyageComplet } from "./demarrage";
export { demarrerVoyageCompletSansAppel } from "./demarrage";

/**
 * Cas d'usage de la création du voyage et de l'état de génération (spécification B9, B9b ; décision 0081 B9-TL-1) :
 * appelés dans le même processus par l'adaptateur `api` (`src/adapters/api-creation.ts`), jamais par HTTP. Chaque
 * entrée est revalidée ici (saisie non fiable) ; chaque sortie est un `Result` fermé.
 */
export interface CasCreation {
  createTrip(ctx: AdapterContext, request: unknown): Promise<Result<CreatedTrip>>;
  retryGeneration(ctx: AdapterContext, request: unknown): Promise<Result<CreatedTrip>>;
  getGenerationStatus(ctx: AdapterContext, tripId: string): Promise<Result<GenerationStatus>>;
  getFullTripStatus(ctx: AdapterContext, tripId: string): Promise<Result<FullTripStatus>>;
}

export function creerCasCreation(dependances: DependancesCreation = {}): CasCreation {
  const o = outils(dependances);
  return {
    createTrip: (ctx, request) => creerVoyage(o, ctx, request),
    retryGeneration: (ctx, request) => relancerGeneration(o, ctx, request),
    getGenerationStatus: (ctx, tripId) => lireEtatGeneration(o, ctx, tripId),
    getFullTripStatus: (ctx, tripId) => lireEtatVoyageComplet(o, ctx, tripId),
  };
}
