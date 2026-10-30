import type { ApplyResult, ChecklistItem, Day, PatchResult, ReplacementOffer, ReplacementWrite, Result, RevisionPreview, RevisionResult } from "@/contracts";
import { applyReplacement, previewReplacement, undoReplacement } from "@/server/actions/remplacement";
import { lockStop, unlockStop } from "@/server/actions/retouches";
import { toggleChecklistItem } from "@/server/actions/sejour";

import { VerrouNonEnregistre, type MemoryProgramme, type ProgrammeActions } from "./programme";
import { abortReason, type RevisionActions } from "./revision";

/**
 * Révision enregistrée de l'écran 14 sur l'adaptateur `api` (tâche M1g, ticket 869) : implémentation serveur de
 * `RevisionActions` et de `ProgrammeActions.undo`, choisie par `TripShell` quand la mise en page lui passe la version
 * courante du voyage (`revisionVersion` non nul, adaptateur `api`). N'importe de `src/server` que
 * `@/server/actions/remplacement`, `@/server/actions/retouches` et `@/server/actions/sejour`. Le déplacement reste
 * l'implémentation en mémoire.
 *
 * - Verrou de la fiche (M5a, spécification M5 § 3) : `lockStop` ou `unlockStop` écrit une version (aucun appel Google ni
 *   Routes) ; l'état s'affiche une fois la version écrite, puis la mise en page relit le voyage : après un rechargement, le
 *   verrou vient du serveur. « Annuler » du toast écrit le geste inverse (une version de plus). Un refus lève
 *   `VerrouNonEnregistre` (`conflict` : version dépassée, le voyage est relu ; `error` sinon) : rien n'est affiché.
 *
 * - Liste « À faire » (M5e, spécification M5 § 7.3) : cocher ou décocher s'affiche aussitôt (état en mémoire), puis
 *   `toggleChecklistItem` l'enregistre (hors des versions, aucun « Annuler ») ; un refus ou une panne rétablit la case et
 *   lève une erreur, que l'écran annonce. Après un rechargement, la case vient du serveur.
 *
 * - Aperçu : le serveur choisit la proposition (déjà vérifiée, rien n'est écrit) et rend le brouillon du moteur : jours
 *   touchés recomposés comme une lecture (durées du port de relectures, budget), changements (trajets compris).
 * - « Appliquer » : nouvelle version ; les jours du brouillon s'affichent aussitôt (surlignage, focus), puis la mise en
 *   page relit le voyage (`afterWrite`), dont la lecture remplace le brouillon.
 * - « Annuler » (toast de 5 s) : une version de plus, identique à la version de base ; les jours d'avant s'affichent
 *   aussitôt, puis la relecture. Un refus ou une panne lève une erreur : la modification reste annulable (rien n'est
 *   oublié), l'écran l'annonce. Seule la dernière modification s'annule : poser un verrou rend le remplacement définitif.
 *
 * Rien n'est écrit dans le navigateur ; un `requestId` par écriture (idempotence côté serveur).
 */

/** Aperçu servi, gardé pour « Appliquer » : la demande à rejouer et les jours avant et après. */
type ApercuEnAttente = {
  readonly stopId: string;
  readonly candidateId: string;
  readonly baseVersion: number;
  readonly avant: readonly Day[];
  readonly apres: readonly Day[];
};

/**
 * État tenu pour la vie de l'écran (comme `MemoryProgrammeStore`) : recréer les actions (voyage relu) ne perd ni la
 * version, ni le remplacement à annuler.
 */
export interface ServerRevisionStore {
  version: number;
  serial: number;
  readonly pending: Map<string, ApercuEnAttente>;
  /** Dernière modification annulable, si c'est un remplacement enregistré. */
  last: { readonly version: number; readonly avant: readonly Day[] } | null;
  /** Dernière modification annulable, si c'est un verrou enregistré (M5a) : « Annuler » écrit le geste inverse. */
  lastLock: { readonly stopId: string; readonly locked: boolean } | null;
}

export function createServerRevisionStore(version: number): ServerRevisionStore {
  return { version, serial: 0, pending: new Map(), last: null, lastLock: null };
}

/** Version relue par la mise en page : elle ne fait jamais reculer celle que les écritures ont rendue. */
export function syncServerRevisionVersion(store: ServerRevisionStore, version: number): void {
  if (version > store.version) store.version = version;
}

/** Actions serveur injectées (tests) ; celles de `@/server/actions/remplacement` par défaut. */
export type ServerRevisionCalls = {
  previewReplacement(input: unknown): Promise<Result<ReplacementOffer>>;
  applyReplacement(input: unknown): Promise<Result<ReplacementWrite>>;
  undoReplacement(input: unknown): Promise<Result<ReplacementWrite>>;
  toggleChecklistItem(input: unknown): Promise<Result<ChecklistItem>>;
  lockStop(input: unknown): Promise<Result<PatchResult>>;
  unlockStop(input: unknown): Promise<Result<PatchResult>>;
};

const APPELS: ServerRevisionCalls = { previewReplacement, applyReplacement, undoReplacement, toggleChecklistItem, lockStop, unlockStop };

export interface ServerRevisionOptions {
  tripId: string;
  store: ServerRevisionStore;
  /** Implémentation en mémoire : affichage des verrous et de la liste, déplacement, et annulation d'une modification locale. */
  memory: MemoryProgramme;
  /** Jours affichés (données de l'adaptateur et écarts locaux). */
  currentDays: () => readonly Day[];
  /** Affiche aussitôt ces jours à la place de ceux de l'adaptateur (jusqu'à la relecture). */
  showDays: (days: readonly Day[]) => void;
  /** Demande la relecture du voyage après une écriture. */
  afterWrite: () => void;
  calls?: ServerRevisionCalls;
  /** Identifiant de demande (tests) ; `crypto.randomUUID` par défaut. */
  newRequestId?: () => string;
}

export function createServerRevision(options: ServerRevisionOptions): ProgrammeActions & RevisionActions {
  const { tripId, store, memory } = options;
  const calls = options.calls ?? APPELS;
  const newRequestId = options.newRequestId ?? (() => crypto.randomUUID());

  /** Écrit le verrou (version nouvelle) puis l'affiche ; un refus lève `VerrouNonEnregistre` sans rien afficher. */
  async function ecrireVerrou(stopId: string, locked: boolean): Promise<void> {
    const appel = locked ? calls.lockStop : calls.unlockStop;
    let result: Result<PatchResult> | null;
    try {
      result = await appel({ tripId, requestId: newRequestId(), stopId, baseVersion: store.version });
    } catch {
      result = null;
    }
    if (result === null || !result.ok) {
      if (result?.ok === false && result.error.code === "version_conflict") {
        // Le programme a changé entre-temps : la version relue sert de base au prochain geste (spécification M5 § 3).
        if (result.error.currentVersion !== undefined) syncServerRevisionVersion(store, result.error.currentVersion);
        options.afterWrite();
        throw new VerrouNonEnregistre("conflict");
      }
      throw new VerrouNonEnregistre("error");
    }
    store.version = result.value.version;
    await memory.setStopLocked(stopId, locked);
    options.afterWrite();
  }

  return {
    async setStopLocked(stopId, locked) {
      await ecrireVerrou(stopId, locked);
      // Une nouvelle modification rend le remplacement définitif (une seule modification annulable à la fois).
      store.last = null;
      store.lastLock = { stopId, locked };
    },
    async undo() {
      const lastLock = store.lastLock;
      if (lastLock !== null) {
        // Geste inverse, enregistré comme une version de plus ; un refus lève, l'annulation reste possible.
        await ecrireVerrou(lastLock.stopId, !lastLock.locked);
        store.lastLock = null;
        return;
      }
      const last = store.last;
      if (last === null) {
        await memory.undo();
        return;
      }
      const result = await calls.undoReplacement({ tripId, requestId: newRequestId(), version: last.version });
      // Refus ou panne : rien n'est oublié (la même annulation peut être redemandée) ; l'appelant l'annonce.
      if (!result.ok || result.value.status !== "undone") throw new Error("annulation refusée");
      store.last = null;
      store.version = result.value.version;
      options.showDays(last.avant);
      options.afterWrite();
    },
    async setChecklistItemDone(itemId, done) {
      await memory.setChecklistItemDone(itemId, done);
      let result: Result<ChecklistItem> | null = null;
      try {
        result = await calls.toggleChecklistItem({ tripId, itemId, done });
      } catch {
        result = null;
      }
      if (result === null || !result.ok || result.value.done !== done) {
        // Rien n'est enregistré : la case revient à son état d'avant ; l'appelant annonce l'échec.
        await memory.setChecklistItemDone(itemId, !done);
        throw new Error("case non enregistrée");
      }
    },
    checklistOnServer: true,
    version: () => store.version,
    async previewReplacement(request, { signal }) {
      if (signal.aborted) throw abortReason(signal);
      const result = await calls.previewReplacement({ tripId, ...request });
      if (signal.aborted) throw abortReason(signal);
      if (!result.ok) return { ok: false, error: "error" };
      const offer = result.value;
      if (offer.status !== "offer") return { ok: false, error: offer.status };
      const { draft } = offer;
      const jours = new Set(draft.days.map((day) => day.index));
      const avant = options.currentDays().filter((day) => jours.has(day.index));
      if (avant.length !== jours.size) return { ok: false, error: "conflict" };
      store.serial += 1;
      const preview: RevisionPreview = {
        kind: "replace",
        id: `remplacement-${store.serial}`,
        baseVersion: offer.version,
        // Jours du brouillon tels quels : les engagements intacts y restent (décision 0145 § 2).
        days: draft.days,
        changes: draft.changes,
        changedStopIds: draft.changedStopIds,
        targetStopId: draft.targetStopId,
        proposal: draft.proposal,
        fromReserve: draft.fromReserve,
      };
      // Un seul aperçu en attente : un aperçu plus récent remplace le précédent (l'écran n'applique que le dernier).
      store.pending.clear();
      store.pending.set(preview.id, { stopId: request.stopId, candidateId: offer.candidateId, baseVersion: offer.version, avant, apres: draft.days });
      return { ok: true, preview } satisfies RevisionResult;
    },
    getMoveOptions: (stopId) => memory.getMoveOptions(stopId),
    previewMove: (request, signal) => memory.previewMove(request, signal),
    async apply(previewId): Promise<ApplyResult> {
      const pending = store.pending.get(previewId);
      if (!pending) return { ok: false, error: "error" };
      const result = await calls.applyReplacement({
        tripId,
        requestId: newRequestId(),
        stopId: pending.stopId,
        candidateId: pending.candidateId,
        baseVersion: pending.baseVersion,
      });
      if (!result.ok) return { ok: false, error: "error" };
      const write = result.value;
      if (write.status === "conflict" || write.status === "lockedStop") {
        store.pending.delete(previewId);
        return { ok: false, error: write.status };
      }
      if (write.status !== "applied") return { ok: false, error: "error" };
      store.pending.delete(previewId);
      store.version = write.version;
      store.last = { version: write.version, avant: pending.avant };
      store.lastLock = null;
      options.showDays(pending.apres);
      options.afterWrite();
      return { ok: true, version: write.version };
    },
  };
}
