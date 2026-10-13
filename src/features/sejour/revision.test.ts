// @vitest-environment node
import { describe, expect, it } from "vitest";

import { RevisionFixturesSchema, RevisionPreviewSchema, type Day, type RevisionFixtures } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { degustationStockbridge, edimbourgRevision } from "@/mocks/edimbourg-revision";

import {
  applyProgramme,
  createMemoryProgramme,
  createMemoryProgrammeStore,
  INITIAL_PROGRAMME,
  programmeReducer,
  type ProgrammeEvent,
} from "./programme";
import { deepEqual, lockedStopViolations } from "./revision";

/**
 * Implémentation en mémoire de `RevisionActions` (spécification F7, F7-TL-2, C17 ; décision 0016 § 4 et § 5) :
 * aperçu, application, annulation, conflit de version, verrous intouchables, abandon.
 */

const DEAN = "j2-dean-village";
const REQUEST = { stopId: DEAN, reason: "notMyStyle", baseVersion: 0 } as const;
const day = (n: number): Day => edimbourg.days.find((candidate) => candidate.index === n)!;
const signal = () => new AbortController().signal;

/** Programme en mémoire et état de l'écran reconstitué à partir des événements envoyés (même réducteur). */
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

/** Brouillon de test qui déplace le Tattoo (verrouillé) du J1 : doit être refusé. */
function tattooFixtures(): RevisionFixtures {
  const j1 = day(1);
  const items = j1.items.map((item) =>
    item.type === "stop" && item.stop.id === "j1-tattoo" ? { ...item, stop: { ...item.stop, start: "22:00" } } : item,
  );
  const target = j1.items.find((item) => item.type === "stop" && !item.stop.locked);
  if (target?.type !== "stop") throw new Error("J1 sans étape non verrouillée");
  return {
    replacements: [
      {
        stopId: target.stop.id,
        draft: {
          days: [{ ...j1, items: items.map((item) => (item.type === "stop" && item.stop.id === target.stop.id ? { type: "stop", stop: degustationStockbridge } : item)) }],
          changes: [{ type: "replaced", time: "10:55", before: target.stop.name, after: degustationStockbridge.name }],
          changedStopIds: [degustationStockbridge.id],
          targetStopId: degustationStockbridge.id,
          proposal: degustationStockbridge,
          fromReserve: true,
        },
      },
    ],
    moves: [],
  };
}

describe("revision: jeu simulé", () => {
  it("le brouillon de Dean Village passe les schémas et ne touche aucune étape verrouillée", () => {
    expect(RevisionFixturesSchema.safeParse(edimbourgRevision).success).toBe(true);
    const draft = edimbourgRevision.replacements[0]!.draft;
    expect(lockedStopViolations(edimbourg.days, draft.days)).toEqual([]);
    expect(RevisionPreviewSchema.safeParse({ kind: "replace", id: "apercu-1", baseVersion: 0, ...draft }).success).toBe(true);
  });

  it("aucun `placeId` ni identifiant d'étape dans les changements (noms maison seulement)", () => {
    const text = JSON.stringify(edimbourgRevision.replacements.map((fixture) => fixture.draft.changes));
    expect(text).not.toMatch(/mock_place_|j2-/);
  });

  it("« Ce qui ne bouge pas » ne contient pas « [Dean Village] », et contient le dîner à 19:00", () => {
    const unchanged = edimbourgRevision.replacements[0]!.draft.changes.filter((change) => change.type === "unchanged");
    expect(unchanged).toContainEqual({ type: "unchanged", label: "[Bonne table de New Town]", time: "19:00" });
    expect(JSON.stringify(unchanged)).not.toContain("[Dean Village]");
  });
});

describe("revision: fonctions pures", () => {
  it("lockedStopViolations : Tattoo déplacé, supprimé ou copié dans un autre jour", () => {
    const j1 = day(1);
    const moved = { ...j1, items: j1.items.map((item) => (item.type === "stop" && item.stop.locked ? { ...item, stop: { ...item.stop, start: "22:00" } } : item)) };
    expect(lockedStopViolations(edimbourg.days, [moved])).toEqual(["j1-tattoo"]);
    const removed = { ...j1, items: j1.items.filter((item) => !(item.type === "stop" && item.stop.locked)) };
    expect(lockedStopViolations(edimbourg.days, [removed])).toEqual(["j1-tattoo"]);
    const tattoo = j1.items.find((item) => item.type === "stop" && item.stop.locked)!;
    const j2 = day(2);
    expect(lockedStopViolations(edimbourg.days, [{ ...j2, items: [...j2.items, tattoo] }])).toEqual(["j1-tattoo"]);
    expect(lockedStopViolations(edimbourg.days, [j1])).toEqual([]);
  });

  it("deepEqual ignore les clés `undefined` et distingue tableaux et objets", () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  });
});

describe("revision: aperçu, application et annulation", () => {
  it("Dean Village : aperçu, application (version 0 → 1), annulation (version 2) et état égal à celui d'avant", async () => {
    const { actions, events, shown, state } = setup();
    const before = structuredClone(state());
    const beforeTrip = structuredClone(shown());
    expect(actions.version()).toBe(0);

    const result = await actions.previewReplacement(REQUEST, { signal: signal() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview).toMatchObject({ kind: "replace", baseVersion: 0, targetStopId: degustationStockbridge.id, fromReserve: true });
    // Un aperçu n'écrit rien.
    expect(events).toEqual([]);

    await expect(actions.apply(result.preview.id)).resolves.toEqual({ ok: true, version: 1 });
    expect(events.map((event) => event.type)).toEqual(["applyRevision"]);
    const j2 = shown().days.find((candidate) => candidate.index === 2)!;
    const names = j2.items.flatMap((item) => (item.type === "stop" ? [`${item.stop.start} ${item.stop.name}`] : []));
    expect(names).toContain("10:55 [Dégustation dans une épicerie fine de Stockbridge]");
    expect(names).toContain("19:00 [Bonne table de New Town]");
    expect(names.join()).not.toContain("[Dean Village]");
    // Les données de l'adaptateur ne changent pas.
    expect(day(2).items.some((item) => item.type === "stop" && item.stop.id === DEAN)).toBe(true);

    await actions.undo();
    expect(actions.version()).toBe(2);
    expect(state()).toEqual(before);
    expect(shown()).toEqual(beforeTrip);
  });

  it("appliquer, puis verrouiller, puis annuler : seul le verrou est annulé, le remplacement devient définitif (F7-PO-1, 0016 § 5)", async () => {
    const { actions, shown } = setup();
    const result = await actions.previewReplacement(REQUEST, { signal: signal() });
    if (!result.ok) throw new Error("aperçu attendu");
    await actions.apply(result.preview.id);
    const applied = structuredClone(shown());
    await actions.setStopLocked("j2-bonne-table", true);
    expect(actions.version()).toBe(2);
    await actions.undo();
    expect(actions.version()).toBe(3);
    // Le remplacement reste ; le verrou revient à sa valeur d'avant.
    expect(shown()).toEqual(applied);
    const j2 = shown().days.find((candidate) => candidate.index === 2)!;
    expect(j2.items.some((item) => item.type === "stop" && item.stop.id === degustationStockbridge.id)).toBe(true);
    expect(j2.items.some((item) => item.type === "stop" && item.stop.id === DEAN)).toBe(false);
    // Une seconde annulation ne rétablit pas Dean Village : une seule modification annulable.
    await actions.undo();
    expect(shown()).toEqual(applied);
  });

  it("actions recréées avec la même copie d'état (nouvelles données, `revalidatePath`) : version et jours gardés", async () => {
    const store = createMemoryProgrammeStore();
    let screen = INITIAL_PROGRAMME;
    const dispatch = (event: ProgrammeEvent) => {
      screen = programmeReducer(screen, event);
    };
    const first = createMemoryProgramme(edimbourg, dispatch, edimbourgRevision, store);
    const result = await first.previewReplacement(REQUEST, { signal: signal() });
    if (!result.ok) throw new Error("aperçu attendu");
    await first.apply(result.preview.id);

    const second = createMemoryProgramme(structuredClone(edimbourg), dispatch, edimbourgRevision, store);
    expect(second.version()).toBe(1);
    // Le jour remplacé est vu par les nouvelles actions comme par le réducteur de l'écran : pas de second aperçu.
    await expect(second.previewReplacement({ ...REQUEST, baseVersion: 1 }, { signal: signal() })).resolves.toEqual({ ok: false, error: "noOption" });
    await expect(second.previewReplacement(REQUEST, { signal: signal() })).resolves.toEqual({ ok: false, error: "conflict" });
    await second.undo();
    expect(second.version()).toBe(2);
    expect(screen).toEqual(store.state);
    expect(applyProgramme(edimbourg, screen)).toEqual(edimbourg);
  });

  it("un aperçu ne s'applique qu'une fois ; un identifiant inconnu est une erreur", async () => {
    const { actions } = setup();
    const result = await actions.previewReplacement(REQUEST, { signal: signal() });
    if (!result.ok) throw new Error("aperçu attendu");
    await actions.apply(result.preview.id);
    await expect(actions.apply(result.preview.id)).resolves.toEqual({ ok: false, error: "error" });
    await expect(actions.apply("apercu-inconnu")).resolves.toEqual({ ok: false, error: "error" });
  });

  it("après « Appliquer », le jour n'est plus celui de l'adaptateur : plus d'aperçu pour Dean Village", async () => {
    const { actions } = setup();
    const result = await actions.previewReplacement(REQUEST, { signal: signal() });
    if (!result.ok) throw new Error("aperçu attendu");
    await actions.apply(result.preview.id);
    await expect(actions.previewReplacement({ ...REQUEST, baseVersion: 1 }, { signal: signal() })).resolves.toEqual({ ok: false, error: "noOption" });
  });

  it("aucune option : étape sans brouillon (Royal Mile), ou programme sans jeu de révision", async () => {
    await expect(setup().actions.previewReplacement({ ...REQUEST, stopId: "j2-royal-mile" }, { signal: signal() })).resolves.toEqual({
      ok: false,
      error: "noOption",
    });
    await expect(setup(null).actions.previewReplacement(REQUEST, { signal: signal() })).resolves.toEqual({ ok: false, error: "noOption" });
  });

  it("une demande abandonnée est rejetée et ne résout jamais d'aperçu", async () => {
    const { actions } = setup();
    const controller = new AbortController();
    const pending = actions.previewReplacement(REQUEST, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });
});

describe("revision: conflit", () => {
  it("version de base périmée à l'aperçu : `conflict`", async () => {
    const { actions } = setup();
    await actions.setStopLocked("j2-royal-mile", true);
    await expect(actions.previewReplacement(REQUEST, { signal: signal() })).resolves.toEqual({ ok: false, error: "conflict" });
  });

  it("programme modifié entre l'aperçu et « Appliquer » : `conflict`, rien n'est appliqué", async () => {
    const { actions, events, state } = setup();
    const result = await actions.previewReplacement(REQUEST, { signal: signal() });
    if (!result.ok) throw new Error("aperçu attendu");
    await actions.setStopLocked("j2-royal-mile", true);
    const before = structuredClone(state());
    await expect(actions.apply(result.preview.id)).resolves.toEqual({ ok: false, error: "conflict" });
    expect(state()).toEqual(before);
    expect(events.map((event) => event.type)).toEqual(["setStopLocked"]);
  });
});

describe("revision: étape verrouillée intouchable", () => {
  it("brouillon de test qui modifie le Tattoo : refusé (`lockedStop`), programme inchangé", async () => {
    const fixtures = tattooFixtures();
    const { actions, events } = setup(fixtures);
    const result = await actions.previewReplacement({ ...REQUEST, stopId: fixtures.replacements[0]!.stopId }, { signal: signal() });
    expect(result).toEqual({ ok: false, error: "lockedStop" });
    expect(events).toEqual([]);
  });

  it("étape verrouillée après l'aperçu : « Appliquer » refusé sans rien écrire", async () => {
    const { actions, events } = setup();
    const result = await actions.previewReplacement(REQUEST, { signal: signal() });
    if (!result.ok) throw new Error("aperçu attendu");
    await actions.setStopLocked("j2-bonne-table", true);
    // La version a changé : le conflit est détecté avant le verrou, rien n'est appliqué.
    const applied = await actions.apply(result.preview.id);
    expect(applied.ok).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["setStopLocked"]);
  });
});
