import type { ChecklistItem, Day, DayLineItem, Stop, Trip } from "@/contracts";

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
}

/** Écarts aux données de l'adaptateur. */
export interface ProgrammeState {
  /** Verrous modifiés, par identifiant d'étape ; une étape revenue à sa valeur d'origine n'y figure pas. */
  locks: Readonly<Record<string, boolean>>;
  /** État avant la dernière modification annulable (verrou), ou `null`. */
  previous: { locks: Readonly<Record<string, boolean>> } | null;
  /** Lignes de la liste modifiées, par identifiant ; une ligne revenue à sa valeur d'origine n'y figure pas. */
  checklist: Readonly<Record<string, boolean>>;
}

export type ProgrammeEvent =
  /** `base` : valeur de `locked` dans les données de l'adaptateur. */
  | { type: "setStopLocked"; stopId: Stop["id"]; locked: boolean; base: boolean }
  | { type: "undo" }
  /** `base` : valeur de `done` dans les données de l'adaptateur. */
  | { type: "setChecklistItemDone"; itemId: ChecklistItem["id"]; done: boolean; base: boolean };

export const INITIAL_PROGRAMME: ProgrammeState = { locks: {}, previous: null, checklist: {} };

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
      return { ...state, locks, previous: { locks: state.locks } };
    }
    case "undo":
      return state.previous ? { ...state, locks: state.previous.locks, previous: null } : state;
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
  const checklist = state.checklist;
  const hasChecklist = Object.keys(checklist).length > 0;
  if (!hasLocks && !hasChecklist) return trip;
  return {
    ...trip,
    days: hasLocks
      ? trip.days.map((day): Day => ({ ...day, items: day.items.map((item) => applyToItem(item, state.locks)) }))
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
 * Implémentation en mémoire (phase 0) : elle applique les événements au réducteur de l'écran par
 * `dispatch`. Elle n'envoie aucun événement de mesure (décision 0015 § 6).
 */
export function createMemoryProgramme(trip: Trip, dispatch: (event: ProgrammeEvent) => void): ProgrammeActions {
  return {
    async setStopLocked(stopId, locked) {
      dispatch({ type: "setStopLocked", stopId, locked, base: baseLocked(trip, stopId) });
    },
    async undo() {
      dispatch({ type: "undo" });
    },
    async setChecklistItemDone(itemId, done) {
      dispatch({ type: "setChecklistItemDone", itemId, done, base: baseChecklistDone(trip, itemId) });
    },
  };
}
