// @vitest-environment node
import { describe, expect, it } from "vitest";

import { edimbourg } from "@/mocks/edimbourg";

import {
  INITIAL_PROGRAMME,
  applyProgramme,
  baseChecklistDone,
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

const doneOf = (trip: typeof edimbourg, id: string) => trip.checklist.find((item) => item.id === id)?.done;

describe("programme: cocher et décocher la liste « À faire avant de partir » (F5c, décision 0015 § 6)", () => {
  it("cocher le château : écart enregistré, ligne faite dans le voyage affiché, données inchangées", () => {
    const state = programmeReducer(INITIAL_PROGRAMME, { type: "setChecklistItemDone", itemId: "check-chateau", done: true, base: false });
    expect(state.checklist).toEqual({ "check-chateau": true });
    const shown = applyProgramme(edimbourg, state);
    expect(doneOf(shown, "check-chateau")).toBe(true);
    // Ordre des lignes conservé (F5-PO-4) ; les autres lignes et les jours ne changent pas.
    expect(shown.checklist.map((item) => item.id)).toEqual(edimbourg.checklist.map((item) => item.id));
    expect(shown.days).toBe(edimbourg.days);
    expect(doneOf(edimbourg, "check-chateau")).toBe(false);
  });

  it("décocher rétablit les données de l'adaptateur : plus aucun écart, voyage renvoyé tel quel", () => {
    const checked = programmeReducer(INITIAL_PROGRAMME, { type: "setChecklistItemDone", itemId: "check-chateau", done: true, base: false });
    const unchecked = programmeReducer(checked, { type: "setChecklistItemDone", itemId: "check-chateau", done: false, base: false });
    expect(unchecked).toEqual(INITIAL_PROGRAMME);
    expect(applyProgramme(edimbourg, unchecked)).toBe(edimbourg);
  });

  it("décocher une ligne faite dans les données (billets du Tattoo)", () => {
    const state = programmeReducer(INITIAL_PROGRAMME, { type: "setChecklistItemDone", itemId: "check-tattoo", done: false, base: true });
    expect(doneOf(applyProgramme(edimbourg, state), "check-tattoo")).toBe(false);
  });

  it("la liste n'a pas d'annulation : cocher ne touche ni aux verrous ni à la modification annulable", () => {
    const locked = programmeReducer(INITIAL_PROGRAMME, { type: "setStopLocked", stopId: "j2-dean-village", locked: true, base: false });
    const checked = programmeReducer(locked, { type: "setChecklistItemDone", itemId: "check-chateau", done: true, base: false });
    expect(checked.locks).toBe(locked.locks);
    expect(checked.previous).toBe(locked.previous);
    // « Annuler » du verrou ne décoche pas la ligne.
    const undone = programmeReducer(checked, { type: "undo" });
    expect(undone.locks).toEqual({});
    expect(undone.checklist).toEqual({ "check-chateau": true });
    const shown = applyProgramme(edimbourg, checked);
    expect(stopOf(shown, "j2-dean-village")?.locked).toBe(true);
    expect(doneOf(shown, "check-chateau")).toBe(true);
  });

  it("baseChecklistDone lit la valeur de l'adaptateur", () => {
    expect(baseChecklistDone(edimbourg, "check-tattoo")).toBe(true);
    expect(baseChecklistDone(edimbourg, "check-chateau")).toBe(false);
    expect(baseChecklistDone(edimbourg, "inconnue")).toBe(false);
  });

  it("implémentation en mémoire : promesse résolue, événement transmis au réducteur", async () => {
    const events: ProgrammeEvent[] = [];
    const actions = createMemoryProgramme(edimbourg, (event) => events.push(event));
    await expect(actions.setChecklistItemDone("check-chateau", true)).resolves.toBeUndefined();
    expect(events).toEqual([{ type: "setChecklistItemDone", itemId: "check-chateau", done: true, base: false }]);
  });
});

describe("programmeReducer : « reset » (M5b, retour à une version enregistré)", () => {
  it("retire verrous, jours affichés et modification annulable ; garde la liste locale ; état vide inchangé", () => {
    expect(programmeReducer(INITIAL_PROGRAMME, { type: "reset" })).toBe(INITIAL_PROGRAMME);
    const etat = {
      ...INITIAL_PROGRAMME,
      locks: { "j1-chateau": true },
      days: { 1: edimbourg.days[0]! },
      previous: { locks: {}, days: {} },
      checklist: { "check-assurance": true },
    };
    expect(programmeReducer(etat, { type: "reset" })).toEqual({ locks: {}, days: {}, previous: null, checklist: { "check-assurance": true } });
  });
});
