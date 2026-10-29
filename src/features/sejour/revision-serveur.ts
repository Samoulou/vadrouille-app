import type { ApplyResult, Change, Day, ReplacementOffer, ReplacementWrite, Result, RevisionPreview, RevisionResult, Stop } from "@/contracts";
import { applyReplacement, previewReplacement, undoReplacement } from "@/server/actions/remplacement";

import type { MemoryProgramme, ProgrammeActions } from "./programme";
import { abortReason, type RevisionActions } from "./revision";

/**
 * Révision enregistrée de l'écran 14 sur l'adaptateur `api` (tâche M1g, ticket 869) : implémentation serveur de
 * `RevisionActions` et de `ProgrammeActions.undo`, choisie par `TripShell` quand la mise en page lui passe la version
 * courante du voyage (`revisionVersion` non nul, adaptateur `api`). N'importe de `src/server` que
 * `@/server/actions/remplacement`. Le reste (verrous, liste « À faire », déplacement) reste l'implémentation en mémoire.
 *
 * - Aperçu : le serveur choisit la proposition (déjà vérifiée, rien n'est écrit) ; l'aperçu (jour, changements) est
 *   composé ici depuis le jour affiché, sans aucune durée inventée : les trajets qui touchent l'étape proposée sont
 *   « sans durée » (`null`) jusqu'à la relecture du voyage.
 * - « Appliquer » : nouvelle version ; le jour du brouillon s'affiche aussitôt (surlignage, focus), puis la mise en page
 *   relit le voyage (`afterWrite`), dont la lecture remplace le brouillon.
 * - « Annuler » (toast de 5 s) : une version de plus, identique à la version de base ; le jour d'avant s'affiche aussitôt,
 *   puis la relecture. Seule la dernière modification s'annule : poser un verrou rend le remplacement définitif.
 *
 * Rien n'est écrit dans le navigateur ; un `requestId` par écriture (idempotence côté serveur).
 */

/** Jour où l'étape `stopId` est remplacée par `stop` : même place, trajets voisins sans durée, total inconnu. */
export function jourRemplace(day: Day, stopId: Stop["id"], stop: Stop): Day {
  const rang = day.items.findIndex((item) => item.type === "stop" && item.stop.id === stopId);
  if (rang < 0) return day;
  const items = day.items.map((item, index) => {
    if (index === rang) return { type: "stop" as const, stop };
    if (item.type === "segment" && (index === rang - 1 || index === rang + 1)) return { ...item, segment: { ...item.segment, minutes: null } };
    return item;
  });
  return { ...day, items, travelMinutes: null };
}

/**
 * Jour montré dans l'aperçu : le jour du brouillon, sans le champ `commitment` des engagements qui ne bougent pas
 * (`RevisionPreviewSchema` : une révision ne crée jamais d'engagement, décision 0016 § 4.2). L'aperçu ne lit de ses jours
 * que le jour visé, et le verrou et les badges des étapes qui ne bougent pas : rien d'affiché ne change. Le jour affiché
 * après « Appliquer » reste le brouillon entier.
 */
export function jourDApercu(day: Day): Day {
  return {
    ...day,
    items: day.items.map((item) => {
      if (item.type !== "stop" || item.stop.commitment === undefined) return item;
      const stop: Stop = { ...item.stop };
      delete stop.commitment;
      return { ...item, stop };
    }),
  };
}

/** « Ce qui change » d'un remplacement : l'étape remplacée, puis les autres étapes du jour, qui ne bougent pas. */
export function changementsDuRemplacement(day: Day, ancienne: Stop, nouvelle: Stop): Change[] {
  const inchangees = day.items.flatMap((item): Change[] =>
    item.type === "stop" && item.stop.id !== ancienne.id ? [{ type: "unchanged", label: item.stop.name, time: item.stop.start }] : [],
  );
  return [{ type: "replaced", time: ancienne.start, before: ancienne.name, after: nouvelle.name }, ...inchangees];
}

/** Aperçu servi, gardé pour « Appliquer » : la demande à rejouer et les jours avant et après. */
type ApercuEnAttente = {
  readonly stopId: string;
  readonly proposalId: string;
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
}

export function createServerRevisionStore(version: number): ServerRevisionStore {
  return { version, serial: 0, pending: new Map(), last: null };
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
};

const APPELS: ServerRevisionCalls = { previewReplacement, applyReplacement, undoReplacement };

export interface ServerRevisionOptions {
  tripId: string;
  store: ServerRevisionStore;
  /** Implémentation en mémoire : verrous, liste, déplacement, et annulation d'une modification locale. */
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

  return {
    async setStopLocked(stopId, locked) {
      // Une nouvelle modification rend le remplacement définitif (une seule modification annulable à la fois).
      store.last = null;
      await memory.setStopLocked(stopId, locked);
    },
    async undo() {
      const last = store.last;
      if (last === null) {
        await memory.undo();
        return;
      }
      store.last = null;
      const result = await calls.undoReplacement({ tripId, requestId: newRequestId(), version: last.version });
      if (!result.ok || result.value.status !== "undone") throw new Error("annulation refusée");
      store.version = result.value.version;
      options.showDays(last.avant);
      options.afterWrite();
    },
    setChecklistItemDone: (itemId, done) => memory.setChecklistItemDone(itemId, done),
    version: () => store.version,
    async previewReplacement(request, { signal }) {
      if (signal.aborted) throw abortReason(signal);
      const day = options.currentDays().find((candidate) => candidate.items.some((item) => item.type === "stop" && item.stop.id === request.stopId));
      const ancienne = day?.items.flatMap((item) => (item.type === "stop" && item.stop.id === request.stopId ? [item.stop] : []))[0];
      const result = await calls.previewReplacement({ tripId, ...request });
      if (signal.aborted) throw abortReason(signal);
      if (!result.ok) return { ok: false, error: "error" };
      const offer = result.value;
      if (offer.status !== "offer") return { ok: false, error: offer.status };
      if (!day || !ancienne) return { ok: false, error: "conflict" };
      const apres = jourRemplace(day, ancienne.id, offer.stop);
      store.serial += 1;
      const preview: RevisionPreview = {
        kind: "replace",
        id: `remplacement-${store.serial}`,
        baseVersion: offer.version,
        days: [jourDApercu(apres)],
        changes: changementsDuRemplacement(day, ancienne, offer.stop),
        changedStopIds: [offer.stop.id],
        targetStopId: offer.stop.id,
        proposal: offer.stop,
        // Proposition déjà vérifiée du voyage, sans nouvelle recherche.
        fromReserve: true,
      };
      store.pending.set(preview.id, { stopId: ancienne.id, proposalId: offer.proposalId, baseVersion: offer.version, avant: [day], apres: [apres] });
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
        proposalId: pending.proposalId,
        baseVersion: pending.baseVersion,
      });
      if (!result.ok) return { ok: false, error: "error" };
      const write = result.value;
      if (write.status === "conflict" || write.status === "lockedStop") return { ok: false, error: write.status };
      if (write.status !== "applied") return { ok: false, error: "error" };
      store.pending.delete(previewId);
      store.version = write.version;
      store.last = { version: write.version, avant: pending.avant };
      options.showDays(pending.apres);
      options.afterWrite();
      return { ok: true, version: write.version };
    },
  };
}
