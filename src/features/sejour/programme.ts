import type { ChecklistItem, Day, DayLineItem, RevisionFixtures, RevisionPreview, RevisionResult, Stop, Trip } from "@/contracts";

import { abortReason, deepEqual, lockedStopViolations, type RevisionActions } from "./revision";

/**
 * Actions locales du programme (spécification F5, F5-TL-6 ; décision 0015 § 6).
 *
 * Interface asynchrone et injectable : en phase 0, une implémentation en mémoire dans le navigateur ;
 * en B11, une implémentation serveur (opérations `lock`, `unlock` et `revert` de `TripPatch`, action de la
 * liste, Server Actions derrière `src/adapters`) se branche sans changer les écrans. « Annuler » est une
 * opération à part (`undo`), jamais une bascule inverse ; la liste « À faire avant de partir » n'a pas
 * d'annulation (la case s'annule elle-même, F5-PO-4).
 *
 * L'état ne contient que les écarts aux données de l'adaptateur ; `applyProgramme` rend le voyage
 * affiché. Rien n'est persisté : recharger la page rétablit les données de l'adaptateur (F5-PO-16).
 */
export interface ProgrammeActions {
  setStopLocked(stopId: Stop["id"], locked: boolean): Promise<void>;
  /** Annule la dernière modification du programme (verrou) ; la liste n'est pas concernée. */
  undo(): Promise<void>;
  /**
   * Coche ou décoche une ligne de « À faire avant de partir » (F5c, décision 0015 § 6). L'écran envoie
   * `checklist_item_done` quand la promesse d'un cochage est résolue ; l'implémentation n'envoie rien.
   */
  setChecklistItemDone(itemId: ChecklistItem["id"], done: boolean): Promise<void>;
  /**
   * Cochage enregistré sur le serveur (adaptateur `api`, M5e) : l'écran désactive les cases hors ligne. Absent ou faux :
   * cochage en mémoire, sans réseau.
   */
  readonly checklistOnServer?: boolean;
}

/**
 * Verrou refusé par le serveur (adaptateur `api`, M5a) : `conflict` si le programme a changé entre-temps (version dépassée,
 * le voyage est relu), `error` pour tout autre refus ou une panne. Rien n'est affiché ; l'écran l'annonce.
 */
export class VerrouNonEnregistre extends Error {
  override name = "VerrouNonEnregistre";

  constructor(readonly raison: "conflict" | "error") {
    super(raison);
  }
}

/** Écarts aux données de l'adaptateur. */
export interface ProgrammeState {
  /** Verrous modifiés, par identifiant d'étape ; une étape revenue à sa valeur d'origine n'y figure pas. */
  locks: Readonly<Record<string, boolean>>;
  /**
   * Jours remplacés par une révision appliquée (F7, décision 0016 § 5), par numéro de jour : brouillon complet
   * du jour, à la place de celui de l'adaptateur.
   */
  days: Readonly<Record<number, Day>>;
  /** État avant la dernière modification annulable (verrou ou révision), ou `null`. */
  previous: { locks: Readonly<Record<string, boolean>>; days: Readonly<Record<number, Day>> } | null;
  /** Lignes de la liste modifiées, par identifiant ; une ligne revenue à sa valeur d'origine n'y figure pas. */
  checklist: Readonly<Record<string, boolean>>;
}

export type ProgrammeEvent =
  /** `base` : valeur de `locked` dans les données de l'adaptateur. */
  | { type: "setStopLocked"; stopId: Stop["id"]; locked: boolean; base: boolean }
  | { type: "undo" }
  /** Révision appliquée (remplacement, déplacement ; ajout avec F7c) : jours touchés du brouillon. */
  | { type: "applyRevision"; days: readonly Day[] }
  /** `base` : valeur de `done` dans les données de l'adaptateur. */
  | { type: "setChecklistItemDone"; itemId: ChecklistItem["id"]; done: boolean; base: boolean }
  /**
   * Données de l'adaptateur relues après une révision enregistrée (adaptateur `api`, M1g) : les jours affichés en attendant
   * la relecture sont retirés, les verrous et la liste locale restent.
   */
  | { type: "rebase" }
  /**
   * Retour à une version enregistré (M5b) : le programme vient tout entier du serveur, relu ensuite ; verrous et jours
   * affichés en attendant sont retirés, sans modification annulable (le retour a son propre « Annuler »). La liste locale
   * reste.
   */
  | { type: "reset" };

export const INITIAL_PROGRAMME: ProgrammeState = { locks: {}, days: {}, previous: null, checklist: {} };

/**
 * Réducteur pur : une modification du programme à la fois, annulable une fois (handover § 7). Cocher ou
 * décocher une ligne de la liste ne touche ni aux verrous ni à la modification annulable.
 */
export function programmeReducer(state: ProgrammeState, event: ProgrammeEvent): ProgrammeState {
  switch (event.type) {
    case "setStopLocked": {
      const locks: Record<string, boolean> = { ...state.locks };
      if (event.locked === event.base) delete locks[event.stopId];
      else locks[event.stopId] = event.locked;
      return { ...state, locks, previous: { locks: state.locks, days: state.days } };
    }
    case "applyRevision": {
      const days: Record<number, Day> = { ...state.days };
      for (const day of event.days) days[day.index] = day;
      return { ...state, days, previous: { locks: state.locks, days: state.days } };
    }
    case "undo":
      return state.previous ? { ...state, locks: state.previous.locks, days: state.previous.days, previous: null } : state;
    case "reset":
      if (Object.keys(state.locks).length === 0 && Object.keys(state.days).length === 0 && state.previous === null) return state;
      return { ...state, locks: {}, days: {}, previous: null };
    case "rebase":
      if (Object.keys(state.days).length === 0 && (state.previous === null || Object.keys(state.previous.days).length === 0)) return state;
      return { ...state, days: {}, previous: state.previous ? { locks: state.previous.locks, days: {} } : null };
    case "setChecklistItemDone": {
      const checklist: Record<string, boolean> = { ...state.checklist };
      if (event.done === event.base) delete checklist[event.itemId];
      else checklist[event.itemId] = event.done;
      return { ...state, checklist };
    }
  }
}

function applyToItem(item: DayLineItem, locks: ProgrammeState["locks"]): DayLineItem {
  if (item.type !== "stop") return item;
  const locked = locks[item.stop.id];
  return locked === undefined || locked === item.stop.locked ? item : { ...item, stop: { ...item.stop, locked } };
}

/** Voyage affiché : données de l'adaptateur et écarts de l'état. Sans écart, le voyage est renvoyé tel quel. */
export function applyProgramme(trip: Trip, state: ProgrammeState): Trip {
  const hasLocks = Object.keys(state.locks).length > 0;
  const hasDays = Object.keys(state.days).length > 0;
  const checklist = state.checklist;
  const hasChecklist = Object.keys(checklist).length > 0;
  if (!hasLocks && !hasChecklist && !hasDays) return trip;
  return {
    ...trip,
    days:
      hasLocks || hasDays
        ? trip.days.map((source): Day => {
            const day = state.days[source.index] ?? source;
            return hasLocks ? { ...day, items: day.items.map((item) => applyToItem(item, state.locks)) } : day;
          })
        : trip.days,
    checklist: hasChecklist
      ? trip.checklist.map((item) => {
          const done = checklist[item.id];
          return done === undefined || done === item.done ? item : { ...item, done };
        })
      : trip.checklist,
  };
}

/** Valeur de `locked` d'une étape du programme dans les données de l'adaptateur (`false` si absente). */
export function baseLocked(trip: Trip, stopId: Stop["id"]): boolean {
  for (const day of trip.days) {
    for (const item of day.items) {
      if (item.type === "stop" && item.stop.id === stopId) return item.stop.locked;
    }
  }
  return false;
}

/** Valeur de `done` d'une ligne de la liste dans les données de l'adaptateur (`false` si absente). */
export function baseChecklistDone(trip: Trip, itemId: ChecklistItem["id"]): boolean {
  return trip.checklist.find((item) => item.id === itemId)?.done ?? false;
}

/**
 * Copie de l'état tenue par l'implémentation en mémoire : état du réducteur, version locale, numéro du dernier
 * aperçu et aperçus servis. Le shell la garde pour toute la vie de l'écran, pour que recréer les actions (nouvelles
 * données de l'adaptateur, jeu de révision) ne remette pas la version et les jours à zéro alors que le réducteur
 * de l'écran les garde.
 */
export interface MemoryProgrammeStore {
  state: ProgrammeState;
  version: number;
  serial: number;
  readonly previews: Map<string, RevisionPreview>;
}

export function createMemoryProgrammeStore(): MemoryProgrammeStore {
  return { state: INITIAL_PROGRAMME, version: 0, serial: 0, previews: new Map() };
}

/**
 * Applique un événement à la copie de l'état et au réducteur de l'écran (révision enregistrée, M1g) : même règle que les
 * actions en mémoire, pour que leurs vérifications (verrous, jours courants) voient les jours affichés.
 */
export function sendToMemoryStore(store: MemoryProgrammeStore, dispatch: (event: ProgrammeEvent) => void, event: ProgrammeEvent): void {
  store.state = programmeReducer(store.state, event);
  dispatch(event);
}

/** Actions du programme et de la révision : un seul objet, une seule version (décision 0016 § 5). */
export type MemoryProgramme = ProgrammeActions & RevisionActions;

/**
 * Implémentation en mémoire (phase 0) : elle applique les événements au réducteur de l'écran par `dispatch` et en
 * garde une copie (même réducteur pur, mêmes événements), pour vérifier versions, verrous et jours courants. Une
 * seule source de vérité pour le programme et la révision (décision 0016 § 5) : la version locale, à 0 au
 * chargement, augmente à chaque verrou, application ou annulation ; poser un verrou rend un remplacement
 * définitif, et inversement. Elle n'envoie aucun événement de mesure (décision 0015 § 6).
 *
 * `store` : copie de l'état (`createMemoryProgrammeStore`), gardée par le shell entre deux créations des actions.
 *
 * `fixtures` : jeu simulé de révision lu par la mise en page du voyage ; sans lui, chaque demande d'aperçu répond
 * « aucune option compatible ». Un brouillon n'est servi que si les jours qu'il touche sont encore ceux de
 * l'adaptateur (limite assumée de la phase 0, sans moteur), et s'il ne touche aucune étape verrouillée.
 */
export function createMemoryProgramme(
  trip: Trip,
  dispatch: (event: ProgrammeEvent) => void,
  fixtures: RevisionFixtures | null = null,
  store: MemoryProgrammeStore = createMemoryProgrammeStore(),
): MemoryProgramme {
  const previews = store.previews;
  const send = (event: ProgrammeEvent) => {
    store.state = programmeReducer(store.state, event);
    dispatch(event);
  };
  const currentDays = () => applyProgramme(trip, store.state).days;

  /**
   * Sert un brouillon simulé comme aperçu (décision 0016 § 5) : seulement si les jours qu'il touche sont encore ceux
   * de l'adaptateur (sinon « aucune option compatible ») et s'il ne touche aucune étape verrouillée.
   */
  const serve = (draft: Omit<RevisionPreview, "id" | "baseVersion">): RevisionResult => {
    const days = currentDays();
    const unchanged = draft.days.every((draftDay) =>
      deepEqual(
        days.find((day) => day.index === draftDay.index),
        trip.days.find((day) => day.index === draftDay.index),
      ),
    );
    if (!unchanged) return { ok: false, error: "noOption" };
    if (lockedStopViolations(days, draft.days).length > 0) return { ok: false, error: "lockedStop" };
    store.serial += 1;
    const preview = { ...draft, id: `apercu-${store.serial}`, baseVersion: store.version } as RevisionPreview;
    previews.set(preview.id, preview);
    return { ok: true, preview };
  };

  return {
    async setStopLocked(stopId, locked) {
      send({ type: "setStopLocked", stopId, locked, base: baseLocked(trip, stopId) });
      store.version += 1;
    },
    async undo() {
      send({ type: "undo" });
      store.version += 1;
    },
    async setChecklistItemDone(itemId, done) {
      send({ type: "setChecklistItemDone", itemId, done, base: baseChecklistDone(trip, itemId) });
    },
    version: () => store.version,
    async previewReplacement(request, { signal }) {
      await Promise.resolve();
      if (signal.aborted) throw abortReason(signal);
      if (request.baseVersion !== store.version) return { ok: false, error: "conflict" };
      const draft = fixtures?.replacements.find((fixture) => fixture.stopId === request.stopId)?.draft;
      if (!draft) return { ok: false, error: "noOption" };
      return serve({ kind: "replace", ...draft });
    },
    async getMoveOptions(stopId) {
      await Promise.resolve();
      const options = fixtures?.moves.find((fixture) => fixture.options.stopId === stopId)?.options;
      // Sans jeu simulé, ou si un jour touché a déjà changé, aucun point n'est proposé : tous les jours sont « complets ».
      const days = currentDays();
      const changed = (index: number) =>
        !deepEqual(
          days.find((day) => day.index === index),
          trip.days.find((day) => day.index === index),
        );
      const stopDay = days.find((day) => day.items.some((item) => item.type === "stop" && item.stop.id === stopId))?.index;
      return {
        stopId,
        days: days.map((day) => {
          const points = options?.days.find((candidate) => candidate.index === day.index)?.points ?? [];
          return { index: day.index, points: stopDay === undefined || changed(day.index) || changed(stopDay) ? [] : points };
        }),
      };
    },
    async previewMove(request, { signal }) {
      await Promise.resolve();
      if (signal.aborted) throw abortReason(signal);
      if (request.baseVersion !== store.version) return { ok: false, error: "conflict" };
      const fixture = fixtures?.moves.find((candidate) => candidate.options.stopId === request.stopId);
      const draft = fixture?.drafts.find((entry) => entry.pointId === request.pointId)?.draft;
      if (!draft) return { ok: false, error: "noOption" };
      return serve({ kind: "move", ...draft });
    },
    async apply(previewId) {
      const preview = previews.get(previewId);
      if (!preview) return { ok: false, error: "error" };
      if (preview.baseVersion !== store.version) return { ok: false, error: "conflict" };
      if (lockedStopViolations(currentDays(), preview.days).length > 0) return { ok: false, error: "lockedStop" };
      send({ type: "applyRevision", days: preview.days });
      store.version += 1;
      previews.delete(previewId);
      return { ok: true, version: store.version };
    },
  };
}
