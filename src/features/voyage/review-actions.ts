import type { Result, RetainedPreference, RetainedTaste, StopReview } from "@/contracts";
import type { StopRating } from "@/contracts/values";
import { rateStop as rateStopServeur } from "@/server/actions/avis";
import * as goutsServeur from "@/server/actions/gouts";

/**
 * Actions de l'écran 16 et de « Tes goûts retenus » (décision 0021 § 5, amendée par 0160 § 1.2 point 6 ; M8a, ticket 1062 ;
 * M8c-1, ticket 1121) : au format `Result<T>`, toutes asynchrones.
 *
 * - `rateStop(tripId, stopId, rating | null)` → `StopReview` enregistré, ou `null` quand l'avis est effacé ;
 * - `retainTastes(tripId, candidateIds)` → seulement les goûts **nouvellement** retenus (un sujet déjà retenu est ignoré,
 *   sa première origine et son premier voyage sont gardés) ;
 * - `removeTaste(tasteId)` → le goût supprimé, pour « Annuler » ; `restoreTaste(taste)` le rétablit (en fin de liste) ;
 * - `removeAllTastes()` : « Retirer tous mes goûts ».
 *
 * Deux implémentations : **serveur** sur `api` (actions de `@/server/actions/avis` et `@/server/actions/gouts`, un
 * `requestId` neuf à chaque appel, créé ici et jamais par l'écran ; un « Réessayer » est un nouvel appel) ; **mémoire de
 * l'onglet** sur `mock` (0021 § 4 et § 5 : rien sur le serveur ni dans le navigateur, perdu au rechargement). L'écran envoie
 * les mesures quand l'action est résolue ; les implémentations n'en envoient aucune.
 */
export interface ReviewActions {
  rateStop(tripId: string, stopId: string, rating: StopRating | null): Promise<Result<StopReview | null>>;
  retainTastes(tripId: string, candidateIds: readonly string[]): Promise<Result<RetainedTaste[]>>;
  removeTaste(tasteId: string): Promise<Result<RetainedTaste>>;
  restoreTaste(taste: RetainedTaste): Promise<Result<void>>;
  removeAllTastes(): Promise<Result<void>>;
}

type EnvoiAvis = (input: unknown) => Promise<Result<StopReview | null>>;

/** Actions serveur des goûts (`@/server/actions/gouts`), injectables dans les tests. */
export interface EnvoisGouts {
  retainTastes(input: unknown): Promise<Result<RetainedTaste[]>>;
  removeTaste(input: unknown): Promise<Result<RetainedTaste>>;
  restoreTaste(input: unknown): Promise<Result<void>>;
  removeAllTastes(input: unknown): Promise<Result<void>>;
}

export function createServerReviewActions(
  send: EnvoiAvis = rateStopServeur,
  newRequestId: () => string = () => crypto.randomUUID(),
  gouts: EnvoisGouts = goutsServeur,
): ReviewActions {
  return {
    rateStop: (tripId, stopId, rating) => send({ tripId, stopId, rating, requestId: newRequestId() }),
    retainTastes: (tripId, candidateIds) => gouts.retainTastes({ tripId, candidateIds: [...candidateIds], requestId: newRequestId() }),
    removeTaste: (tasteId) => gouts.removeTaste({ tasteId, requestId: newRequestId() }),
    restoreTaste: (taste) => gouts.restoreTaste({ taste, requestId: newRequestId() }),
    removeAllTastes: () => gouts.removeAllTastes({ requestId: newRequestId() }),
  };
}

/** Mémoire des avis (fournisseur de l'onglet, `useOptionalTripSession`, ou mémoire locale de l'écran hors fournisseur). */
export interface ReviewMemory {
  recordReview(tripId: string, stopId: string, rating: StopRating | null): void;
}

/** Mémoire des goûts retenus de l'onglet (`mock`) : liste ordonnée, sans doublon de `id`. */
export interface TasteMemory {
  tastes(): readonly RetainedTaste[];
  setTastes(tastes: readonly RetainedTaste[]): void;
}

/** Mémoire de goûts locale (hors du fournisseur de l'onglet : tests isolés), perdue avec l'écran. */
export function createLocalTasteMemory(): TasteMemory {
  let list: readonly RetainedTaste[] = [];
  return {
    tastes: () => list,
    setTastes(tastes) {
      list = tastes;
    },
  };
}

const REFUS_GOUT: Result<never> = { ok: false, error: { code: "not_found" } };

/**
 * Implémentation `mock` : une étape qui n'est pas à évaluer est refusée (`validation_failed`, comme le serveur). Goûts :
 * sans `tastes` (écran sans goûts), les actions de goûts rendent `not_found` ; avec, mêmes règles que le serveur (candidat
 * inconnu : `validation_failed` ; sujet déjà retenu : ignoré ; goût absent : `not_found`).
 */
export function createMemoryReviewActions(
  memory: ReviewMemory,
  stopIds: ReadonlySet<string>,
  tastes?: { readonly memory: TasteMemory; readonly candidates: readonly RetainedPreference[] },
): ReviewActions {
  return {
    async rateStop(tripId, stopId, rating) {
      if (!stopIds.has(stopId)) return { ok: false, error: { code: "validation_failed", field: "stopId" } };
      memory.recordReview(tripId, stopId, rating);
      return { ok: true, value: rating === null ? null : { stopId, rating } };
    },
    async retainTastes(tripId, candidateIds) {
      if (!tastes) return REFUS_GOUT;
      const chosen = candidateIds.map((id) => tastes.candidates.find((candidate) => candidate.id === id));
      if (chosen.length === 0 || chosen.some((candidate) => candidate === undefined)) {
        return { ok: false, error: { code: "validation_failed", field: "candidateIds" } };
      }
      const current = tastes.memory.tastes();
      const added = chosen
        .filter((candidate): candidate is RetainedPreference => candidate !== undefined && !current.some((taste) => taste.id === candidate.id))
        .map((candidate): RetainedTaste => ({ id: candidate.id, origin: candidate.origin, subject: candidate.subject, fromTripId: tripId }));
      if (added.length > 0) tastes.memory.setTastes([...current, ...added]);
      return { ok: true, value: added };
    },
    async removeTaste(tasteId) {
      const current = tastes?.memory.tastes() ?? [];
      const removed = current.find((taste) => taste.id === tasteId);
      if (!tastes || !removed) return REFUS_GOUT;
      tastes.memory.setTastes(current.filter((taste) => taste.id !== tasteId));
      return { ok: true, value: removed };
    },
    async restoreTaste(taste) {
      if (!tastes) return REFUS_GOUT;
      const current = tastes.memory.tastes();
      if (!current.some((other) => other.id === taste.id)) tastes.memory.setTastes([...current, taste]);
      return { ok: true, value: undefined };
    },
    async removeAllTastes() {
      if (!tastes) return REFUS_GOUT;
      tastes.memory.setTastes([]);
      return { ok: true, value: undefined };
    },
  };
}
