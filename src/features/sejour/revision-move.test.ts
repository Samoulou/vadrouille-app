// @vitest-environment node
import { describe, expect, it } from "vitest";

import { MoveOptionsSchema, MoveRequestSchema, RevisionFixturesSchema, RevisionPreviewSchema, type Day, type RevisionFixtures } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { edimbourgRevision } from "@/mocks/edimbourg-revision";

import { applyProgramme, createMemoryProgramme, INITIAL_PROGRAMME, programmeReducer, type ProgrammeEvent } from "./programme";
import { lockedStopViolations } from "./revision";

/**
 * Déplacement dans l'implémentation en mémoire (spécification F7, F7b, C20 à C22 et C33 ; décision 0016 § 4 et § 5) :
 * options lues une fois, jours « complets », aperçu, application et annulation (égalité profonde), conflit, verrous.
 */

const JARDIN = "j2-jardin-botanique";
const REQUEST = { stopId: JARDIN, pointId: "j4-1545", baseVersion: 0 } as const;
const signal = () => new AbortController().signal;
const day = (n: number): Day => edimbourg.days.find((candidate) => candidate.index === n)!;
const stopsOf = (d: Day) => d.items.flatMap((item) => (item.type === "stop" ? [`${item.stop.start} ${item.stop.name}`] : []));

function setup(fixtures: RevisionFixtures | null = edimbourgRevision) {
  const events: ProgrammeEvent[] = [];
  let screen = INITIAL_PROGRAMME;
  const actions = createMemoryProgramme(
    edimbourg,
    (event) => {
      events.push(event);
      screen = programmeReducer(screen, event);
    },
    fixtures,
  );
  return { actions, events, shown: () => applyProgramme(edimbourg, screen), state: () => screen };
}

const move = edimbourgRevision.moves[0]!;
const draft = move.drafts[0]!.draft;

describe("déplacer: jeu simulé", () => {
  it("options et brouillon passent les schémas ; aucune étape verrouillée touchée ; un seul jeu (Jardin botanique)", () => {
    expect(RevisionFixturesSchema.safeParse(edimbourgRevision).success).toBe(true);
    expect(MoveOptionsSchema.safeParse(move.options).success).toBe(true);
    expect(edimbourgRevision.moves.map((fixture) => fixture.options.stopId)).toEqual([JARDIN]);
    expect(lockedStopViolations(edimbourg.days, draft.days)).toEqual([]);
    expect(RevisionPreviewSchema.safeParse({ kind: "move", id: "apercu-1", baseVersion: 0, ...draft }).success).toBe(true);
  });

  it("points : J1 vers 16:15, J4 vers 15:45, J5 vers 16:00 ; J2, J3 et J6 complets", () => {
    expect(move.options.days.map((d) => [d.index, d.points.map((point) => point.time)])).toEqual([
      [1, ["16:15"]],
      [2, []],
      [3, []],
      [4, ["15:45"]],
      [5, ["16:00"]],
      [6, []],
    ]);
  });

  it("vers J4 : jardin à 15:45 – 17:15 après Arthur's Seat, J2 sans le jardin avec un temps libre dès 13:15, dîners à 19:00", () => {
    const j2 = draft.days.find((d) => d.index === 2)!;
    const j4 = draft.days.find((d) => d.index === 4)!;
    expect(stopsOf(j2)).not.toContain("13:25 [Jardin botanique royal]");
    expect(stopsOf(j2)).toContain("19:00 [Bonne table de New Town]");
    expect(j2.items).toContainEqual({ type: "free", from: "13:15", to: "18:30" });
    expect(stopsOf(j4)).toEqual([
      "09:15 [Calton Hill]",
      "10:35 [Palais de Holyrood]",
      "12:10 [Café de Canongate]",
      "13:20 [Arthur's Seat]",
      "15:45 [Jardin botanique royal]",
      "19:00 [Petite adresse de l'Old Town]",
    ]);
    expect(j4.travelMinutes).toBeLessThanOrEqual(j4.travelBudgetMinutes);
  });

  it("changements : `moved` J2 13:25 → J4 15:45 en tête, sans `placeId`, sans ligne `checklist` ni budget (C33)", () => {
    expect(draft.changes[0]).toEqual({ type: "moved", label: "[Jardin botanique royal]", before: { day: 2, time: "13:25" }, after: { day: 4, time: "15:45" } });
    const text = JSON.stringify(draft.changes);
    expect(text).not.toMatch(/mock_place_|j2-|j4-/);
    expect(draft.changes.some((change) => change.type === "budget")).toBe(false);
    expect(draft.changes).toContainEqual({ type: "unchanged", label: "[Bonne table de New Town]", time: "19:00" });
    expect(draft.changes).toContainEqual({ type: "unchanged", label: "[Petite adresse de l'Old Town]", time: "19:00" });
  });

  it("demande stricte : ni nom ni `placeId`", () => {
    expect(MoveRequestSchema.safeParse(REQUEST).success).toBe(true);
    expect(MoveRequestSchema.safeParse({ ...REQUEST, name: "[Jardin botanique royal]" }).success).toBe(false);
    expect(MoveRequestSchema.safeParse({ ...REQUEST, placeId: "mock_place_jardin_botanique" }).success).toBe(false);
  });

  it("schéma : un brouillon pour un point absent des options est refusé", () => {
    const broken = { ...edimbourgRevision, moves: [{ ...move, drafts: [{ ...move.drafts[0]!, pointId: "inconnu" }] }] };
    expect(RevisionFixturesSchema.safeParse(broken).success).toBe(false);
  });
});

describe("déplacer: options", () => {
  it("un jour par jour du voyage ; sans jeu simulé ou pour une autre étape, tous complets", async () => {
    const options = await setup().actions.getMoveOptions(JARDIN);
    expect(options.days.map((d) => d.points.length > 0)).toEqual([true, false, false, true, true, false]);
    const none = await setup(null).actions.getMoveOptions(JARDIN);
    expect(none.days.every((d) => d.points.length === 0)).toBe(true);
    const other = await setup().actions.getMoveOptions("j2-royal-mile");
    expect(other.days).toHaveLength(6);
    expect(other.days.every((d) => d.points.length === 0)).toBe(true);
  });
});

describe("déplacer: aperçu, application et annulation", () => {
  it("J4 : aperçu `move`, application (J2 et J4 remplacés), annulation : état égal à celui d'avant", async () => {
    const { actions, events, shown, state } = setup();
    const before = structuredClone(state());
    const beforeTrip = structuredClone(shown());
    const result = await actions.previewMove(REQUEST, { signal: signal() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview).toMatchObject({ kind: "move", baseVersion: 0, targetStopId: JARDIN, changedStopIds: [JARDIN] });
    expect(events).toEqual([]);

    await expect(actions.apply(result.preview.id)).resolves.toEqual({ ok: true, version: 1 });
    const after = shown();
    expect(stopsOf(after.days.find((d) => d.index === 4)!)).toContain("15:45 [Jardin botanique royal]");
    expect(stopsOf(after.days.find((d) => d.index === 2)!).join()).not.toContain("[Jardin botanique royal]");
    expect(stopsOf(after.days.find((d) => d.index === 2)!)).toContain("19:00 [Bonne table de New Town]");

    await actions.undo();
    expect(state()).toEqual(before);
    expect(shown()).toEqual(beforeTrip);
  });

  it("point sans brouillon (J1, J5) : aucune option compatible ; après un déplacement, plus de points", async () => {
    const { actions } = setup();
    await expect(actions.previewMove({ ...REQUEST, pointId: "j1-1615" }, { signal: signal() })).resolves.toEqual({ ok: false, error: "noOption" });
    await expect(actions.previewMove({ ...REQUEST, pointId: "j5-1600" }, { signal: signal() })).resolves.toEqual({ ok: false, error: "noOption" });
    const result = await actions.previewMove(REQUEST, { signal: signal() });
    if (!result.ok) throw new Error("aperçu attendu");
    await actions.apply(result.preview.id);
    const options = await actions.getMoveOptions(JARDIN);
    expect(options.days.every((d) => d.points.length === 0)).toBe(true);
    await expect(actions.previewMove({ ...REQUEST, baseVersion: 1 }, { signal: signal() })).resolves.toEqual({ ok: false, error: "noOption" });
  });

  it("conflit : version périmée à l'aperçu, ou programme modifié avant « Appliquer »", async () => {
    const { actions, state } = setup();
    const result = await actions.previewMove(REQUEST, { signal: signal() });
    if (!result.ok) throw new Error("aperçu attendu");
    await actions.setStopLocked("j2-royal-mile", true);
    const before = structuredClone(state());
    await expect(actions.apply(result.preview.id)).resolves.toEqual({ ok: false, error: "conflict" });
    expect(state()).toEqual(before);
    await expect(actions.previewMove(REQUEST, { signal: signal() })).resolves.toEqual({ ok: false, error: "conflict" });
  });

  it("brouillon de test qui déplace aussi le Tattoo : `lockedStop`, rien d'écrit", async () => {
    const j1 = day(1);
    const tattooMoved = { ...j1, items: j1.items.map((item) => (item.type === "stop" && item.stop.locked ? { ...item, stop: { ...item.stop, start: "22:00" } } : item)) };
    const fixtures: RevisionFixtures = {
      ...edimbourgRevision,
      moves: [{ ...move, drafts: [{ pointId: "j4-1545", draft: { ...draft, days: [...draft.days, tattooMoved] } }] }],
    };
    const { actions, events } = setup(fixtures);
    await expect(actions.previewMove(REQUEST, { signal: signal() })).resolves.toEqual({ ok: false, error: "lockedStop" });
    expect(events).toEqual([]);
  });

  it("une demande abandonnée est rejetée", async () => {
    const controller = new AbortController();
    const pending = setup().actions.previewMove(REQUEST, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });
});
