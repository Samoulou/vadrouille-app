import type { ApplyResult, Day, MoveDraft, MoveOptions, MoveRequest, PatchResult, Result, RevisionPreview, RevisionResult } from "@/contracts";
import { applyMove, applyRevert, getMoveOptions, previewMove } from "@/server/actions/retouches";

import { abortReason } from "./revision";
import { syncServerRevisionVersion, type ServerRevisionOptions } from "./revision-serveur";

/**
 * Déplacement enregistré de l'écran 14 sur l'adaptateur `api` (ticket 947, feuille « Déplacer ») : chargé à la demande
 * par `createServerRevision` (`import()` au premier geste « Déplacer »), pour que ses actions serveur et sa logique
 * restent hors du JavaScript initial de la Journée (budget de 200 000 octets, décision 0016 § 3.1, Q95).
 *
 * - Points d'insertion (`getMoveOptions` ; un refus ou une panne **lève** : la feuille l'affiche comme une erreur, pas comme
 *   des jours « complets »), aperçu (`previewMove` : « Ce qui change » et jours touchés calculés par le moteur avec les
 *   durées relues, décision 0153, PR 959), « Appliquer » (`applyMove`, une version de plus) ; « Annuler » du toast est
 *   un retour à la version de base (`applyRevert`, M5b). Un point refusé par le moteur ou qui n'existe plus rend « aucune
 *   option » ; une version dépassée, « conflit ».
 */

/** Actions serveur du déplacement (injectées dans les tests par `ServerRevisionOptions.calls`). */
export type MoveCalls = {
  getMoveOptions(input: unknown): Promise<Result<MoveOptions>>;
  previewMove(input: unknown): Promise<Result<MoveDraft>>;
  applyMove(input: unknown): Promise<Result<PatchResult>>;
  applyRevert(input: unknown): Promise<Result<PatchResult>>;
};

export const APPELS_DEPLACEMENT: MoveCalls = { getMoveOptions, previewMove, applyMove, applyRevert };

/** Aperçu de déplacement gardé pour « Appliquer ». */
export type DeplacementEnAttente = {
  readonly kind: "move";
  readonly stopId: string;
  readonly pointId: string;
  readonly baseVersion: number;
  readonly avant: readonly Day[];
  readonly apres: readonly Day[];
};

/** `options` : celles de `createServerRevision` (actions injectées comprises) ; `newRequestId` : son identifiant de demande. */
export function creerDeplacementServeur(options: ServerRevisionOptions, newRequestId: () => string) {
  const { tripId, store } = options;
  const calls = options.calls ?? APPELS_DEPLACEMENT;

  return {
    async getMoveOptions(stopId: string): Promise<MoveOptions> {
      const result = await calls.getMoveOptions({ tripId, stopId });
      // Refus ou panne : ce n'est pas « complet » ; la feuille affiche son bandeau d'erreur (rien n'est écrit).
      if (!result.ok) throw new Error("points de déplacement indisponibles");
      return result.value;
    },

    async previewMove(request: MoveRequest, signal: AbortSignal): Promise<RevisionResult> {
      if (signal.aborted) throw abortReason(signal);
      const result = await calls.previewMove({ tripId, ...request });
      if (signal.aborted) throw abortReason(signal);
      if (!result.ok) {
        const { error } = result;
        if (error.code === "version_conflict") {
          if (error.currentVersion !== undefined) syncServerRevisionVersion(store, error.currentVersion);
          return { ok: false, error: "conflict" };
        }
        return { ok: false, error: error.code === "no_option" ? "noOption" : "error" };
      }
      const draft = result.value;
      const jours = new Set(draft.days.map((day) => day.index));
      const avant = options.currentDays().filter((day) => jours.has(day.index));
      if (avant.length !== jours.size) return { ok: false, error: "conflict" };
      store.serial += 1;
      const preview: RevisionPreview = { kind: "move", id: `deplacement-${store.serial}`, baseVersion: request.baseVersion, ...draft };
      // Un seul aperçu en attente : un aperçu plus récent remplace le précédent (l'écran n'applique que le dernier).
      store.pending.clear();
      store.pending.set(preview.id, { kind: "move", stopId: request.stopId, pointId: request.pointId, baseVersion: request.baseVersion, avant, apres: draft.days });
      return { ok: true, preview };
    },

    /** « Appliquer » : une version de plus ; les jours de l'aperçu s'affichent, puis la relecture. */
    async appliquer(previewId: string, pending: DeplacementEnAttente): Promise<ApplyResult> {
      let result: Result<PatchResult> | null;
      try {
        result = await calls.applyMove({ tripId, requestId: newRequestId(), stopId: pending.stopId, pointId: pending.pointId, baseVersion: pending.baseVersion });
      } catch {
        result = null;
      }
      if (result === null) return { ok: false, error: "error" };
      if (!result.ok) {
        if (result.error.code === "version_conflict") {
          store.pending.delete(previewId);
          if (result.error.currentVersion !== undefined) syncServerRevisionVersion(store, result.error.currentVersion);
          return { ok: false, error: "conflict" };
        }
        if (result.error.code === "validation_failed" && result.error.field === "stopId") {
          store.pending.delete(previewId);
          return { ok: false, error: "lockedStop" };
        }
        return { ok: false, error: "error" };
      }
      store.pending.delete(previewId);
      store.version = result.value.version;
      store.last = null;
      store.lastLock = null;
      store.lastMove = { version: result.value.version, baseVersion: pending.baseVersion, avant: pending.avant };
      options.showDays(pending.apres);
      options.afterWrite();
      return { ok: true, version: result.value.version };
    },

    /** « Annuler » : retour à la version d'avant le déplacement (M5b) ; un refus ou une panne lève, l'annulation reste possible. */
    async annuler(): Promise<void> {
      const lastMove = store.lastMove;
      if (lastMove === null) return;
      let result: Result<PatchResult> | null;
      try {
        result = await calls.applyRevert({ tripId, requestId: newRequestId(), baseVersion: lastMove.version, toVersion: lastMove.baseVersion });
      } catch {
        result = null;
      }
      if (result === null || !result.ok) throw new Error("annulation refusée");
      store.lastMove = null;
      store.version = result.value.version;
      options.showDays(lastMove.avant);
      options.afterWrite();
    },
  };
}

export type DeplacementServeur = ReturnType<typeof creerDeplacementServeur>;
