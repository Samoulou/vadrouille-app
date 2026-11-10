import type { Result, StopReview } from "@/contracts";
import type { StopRating } from "@/contracts/values";
import { rateStop as rateStopServeur } from "@/server/actions/avis";

/**
 * Actions de l'écran 16 (décision 0021 § 5, amendée par 0160 § 1.2 point 6 ; M8a, ticket 1062) : au format `Result<T>`,
 * toutes asynchrones. M8a ne livre que `rateStop` ; les goûts viendront avec M8c-1.
 *
 * - `rateStop(tripId, stopId, rating | null)` → `StopReview` enregistré, ou `null` quand l'avis est effacé.
 *
 * Deux implémentations : **serveur** sur `api` (action `rateStop` de `@/server/actions/avis`, un `requestId` neuf à chaque
 * appel, créé ici et jamais par l'écran ; un « Réessayer » est un nouvel appel) ; **mémoire de l'onglet** sur `mock` (0021
 * § 4 et § 5 : rien sur le serveur ni dans le navigateur, perdu au rechargement). L'écran envoie les mesures quand l'action
 * est résolue ; les implémentations n'en envoient aucune.
 */
export interface ReviewActions {
  rateStop(tripId: string, stopId: string, rating: StopRating | null): Promise<Result<StopReview | null>>;
}

type EnvoiAvis = (input: unknown) => Promise<Result<StopReview | null>>;

export function createServerReviewActions(send: EnvoiAvis = rateStopServeur, newRequestId: () => string = () => crypto.randomUUID()): ReviewActions {
  return {
    rateStop: (tripId, stopId, rating) => send({ tripId, stopId, rating, requestId: newRequestId() }),
  };
}

/** Mémoire des avis (fournisseur de l'onglet, `useOptionalTripSession`, ou mémoire locale de l'écran hors fournisseur). */
export interface ReviewMemory {
  recordReview(tripId: string, stopId: string, rating: StopRating | null): void;
}

/** Implémentation `mock` : une étape qui n'est pas à évaluer est refusée (`validation_failed`, comme le serveur). */
export function createMemoryReviewActions(memory: ReviewMemory, stopIds: ReadonlySet<string>): ReviewActions {
  return {
    async rateStop(tripId, stopId, rating) {
      if (!stopIds.has(stopId)) return { ok: false, error: { code: "validation_failed", field: "stopId" } };
      memory.recordReview(tripId, stopId, rating);
      return { ok: true, value: rating === null ? null : { stopId, rating } };
    },
  };
}
