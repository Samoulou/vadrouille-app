import type { Day, DayLineItem, Stop, Trip } from "@/contracts";

/**
 * Actions locales du programme (spécification F5, F5-TL-6 ; décision 0015 § 6).
 *
 * Interface asynchrone et injectable : en phase 0, une implémentation en mémoire dans le navigateur ;
 * en B11, une implémentation serveur (opérations `lock`, `unlock` et `revert` de `TripPatch`, Server
 * Actions derrière `src/adapters`) se branche sans changer les écrans. « Annuler » est une opération à
 * part (`undo`), jamais une bascule inverse. F5c y ajoute `setChecklistItemDone`.
 *
 * L'état ne contient que les écarts aux données de l'adaptateur ; `applyProgramme` rend le voyage
 * affiché. Rien n'est persisté : recharger la page rétablit les données de l'adaptateur (F5-PO-16).
 */
export interface ProgrammeActions {
  setStopLocked(stopId: Stop["id"], locked: boolean): Promise<void>;
  /** Annule la dernière modification du programme. */
  undo(): Promise<void>;
}

/** Écarts aux données de l'adaptateur. */
export interface ProgrammeState {
  /** Verrous modifiés, par identifiant d'étape ; une étape revenue à sa valeur d'origine n'y figure pas. */
  locks: Readonly<Record<string, boolean>>;
  /** État avant la dernière modification annulable, ou `null`. */
  previous: { locks: Readonly<Record<string, boolean>> } | null;
}

export type ProgrammeEvent =
  /** `base` : valeur de `locked` dans les données de l'adaptateur. */
  | { type: "setStopLocked"; stopId: Stop["id"]; locked: boolean; base: boolean }
  | { type: "undo" };

export const INITIAL_PROGRAMME: ProgrammeState = { locks: {}, previous: null };

/** Réducteur pur : une modification à la fois, annulable une fois (handover § 7). */
export function programmeReducer(state: ProgrammeState, event: ProgrammeEvent): ProgrammeState {
  switch (event.type) {
    case "setStopLocked": {
      const locks: Record<string, boolean> = { ...state.locks };
      if (event.locked === event.base) delete locks[event.stopId];
      else locks[event.stopId] = event.locked;
      return { locks, previous: { locks: state.locks } };
    }
    case "undo":
      return state.previous ? { locks: state.previous.locks, previous: null } : state;
  }
}

function applyToItem(item: DayLineItem, locks: ProgrammeState["locks"]): DayLineItem {
  if (item.type !== "stop") return item;
  const locked = locks[item.stop.id];
  return locked === undefined || locked === item.stop.locked ? item : { ...item, stop: { ...item.stop, locked } };
}

/** Voyage affiché : données de l'adaptateur et écarts de l'état. Sans écart, le voyage est renvoyé tel quel. */
export function applyProgramme(trip: Trip, state: ProgrammeState): Trip {
  if (Object.keys(state.locks).length === 0) return trip;
  return {
    ...trip,
    days: trip.days.map((day): Day => ({ ...day, items: day.items.map((item) => applyToItem(item, state.locks)) })),
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
  };
}
