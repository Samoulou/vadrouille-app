// @vitest-environment node
import { describe, expect, it } from "vitest";

import { edimbourg } from "@/mocks/edimbourg";

import {
  INITIAL_PROGRAMME,
  applyProgramme,
  baseLocked,
  createMemoryProgramme,
  programmeReducer,
  type ProgrammeEvent,
  type ProgrammeState,
} from "./programme";

const stopOf = (trip: typeof edimbourg, id: string) =>
  trip.days.flatMap((day) => day.items).flatMap((item) => (item.type === "stop" && item.stop.id === id ? [item.stop] : []))[0];

describe("programme: verrouiller et annuler (F5-TL-6)", () => {
  it("verrouiller Dean Village : écart enregistré, voyage affiché verrouillé", () => {
    const state = programmeReducer(INITIAL_PROGRAMME, {
      type: "setStopLocked",
      stopId: "j2-dean-village",
      locked: true,
      base: false,
    });
    expect(state.locks).toEqual({ "j2-dean-village": true });
    expect(stopOf(applyProgramme(edimbourg, state), "j2-dean-village")?.locked).toBe(true);
    // Les données de l'adaptateur ne changent pas.
    expect(stopOf(edimbourg, "j2-dean-village")?.locked).toBe(false);
  });

  it("annuler rétablit l'état exact (égalité profonde)", () => {
    const before: ProgrammeState = structuredClone(INITIAL_PROGRAMME);
    const locked = programmeReducer(before, { type: "setStopLocked", stopId: "j2-dean-village", locked: true, base: false });
    expect(locked).not.toEqual(before);
    expect(programmeReducer(locked, { type: "undo" })).toEqual(before);
  });

  it("annuler après deux modifications ne rétablit que la dernière ; un second annuler ne fait rien", () => {
    const first = programmeReducer(INITIAL_PROGRAMME, { type: "setStopLocked", stopId: "a", locked: true, base: false });
    const second = programmeReducer(first, { type: "setStopLocked", stopId: "b", locked: true, base: false });
    const undone = programmeReducer(second, { type: "undo" });
    expect(undone.locks).toEqual(first.locks);
    expect(programmeReducer(undone, { type: "undo" })).toBe(undone);
    expect(programmeReducer(INITIAL_PROGRAMME, { type: "undo" })).toBe(INITIAL_PROGRAMME);
  });

  it("déverrouiller le Tattoo (verrouillé dans les données), puis le reverrouiller : plus aucun écart", () => {
    const unlocked = programmeReducer(INITIAL_PROGRAMME, { type: "setStopLocked", stopId: "j1-tattoo", locked: false, base: true });
    expect(unlocked.locks).toEqual({ "j1-tattoo": false });
    expect(stopOf(applyProgramme(edimbourg, unlocked), "j1-tattoo")?.locked).toBe(false);
    const relocked = programmeReducer(unlocked, { type: "setStopLocked", stopId: "j1-tattoo", locked: true, base: true });
    expect(relocked.locks).toEqual({});
    expect(applyProgramme(edimbourg, relocked)).toBe(edimbourg);
  });

  it("sans écart, applyProgramme renvoie le voyage tel quel", () => {
    expect(applyProgramme(edimbourg, INITIAL_PROGRAMME)).toBe(edimbourg);
  });

  it("baseLocked lit la valeur de l'adaptateur", () => {
    expect(baseLocked(edimbourg, "j1-tattoo")).toBe(true);
    expect(baseLocked(edimbourg, "j2-dean-village")).toBe(false);
    expect(baseLocked(edimbourg, "inconnue")).toBe(false);
  });

  it("implémentation en mémoire : promesses résolues, événements transmis au réducteur", async () => {
    const events: ProgrammeEvent[] = [];
    const actions = createMemoryProgramme(edimbourg, (event) => events.push(event));
    await expect(actions.setStopLocked("j1-tattoo", false)).resolves.toBeUndefined();
    await expect(actions.undo()).resolves.toBeUndefined();
    expect(events).toEqual([
      { type: "setStopLocked", stopId: "j1-tattoo", locked: false, base: true },
      { type: "undo" },
    ]);
  });
});
