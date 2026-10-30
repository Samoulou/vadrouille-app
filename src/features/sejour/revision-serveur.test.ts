// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/remplacement", () => ({
  previewReplacement: vi.fn(),
  applyReplacement: vi.fn(),
  undoReplacement: vi.fn(),
}));
vi.mock("@/server/actions/sejour", () => ({
  toggleChecklistItem: vi.fn(),
}));
vi.mock("@/server/actions/retouches", () => ({
  lockStop: vi.fn(),
  unlockStop: vi.fn(),
}));

import { RevisionPreviewSchema, type ChecklistItem, type Day, type PatchResult, type ReplacementOffer, type ReplacementWrite, type Result, type Stop } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { applyProgramme, createMemoryProgramme, createMemoryProgrammeStore, programmeReducer, sendToMemoryStore, VerrouNonEnregistre, type ProgrammeState } from "./programme";
import { createServerRevision, createServerRevisionStore, syncServerRevisionVersion, type ServerRevisionCalls } from "./revision-serveur";

/**
 * Révision enregistrée de l'écran 14 sur `api` (tâche M1g, PR 869) : aperçu repris du brouillon du moteur (serveur),
 * application et annulation par les actions serveur (doublées ici), jours affichés en attendant la relecture.
 */

const DINER = "j1-diner";
const NOUVELLE: Stop = {
  id: "remplacement-v2-abcdef12",
  kind: "meal",
  placeId: "mock_place_old_town_diner_2",
  name: "[Bistrot de Victoria Street]",
  start: "18:45",
  end: "20:15",
  facts: { area: "[Old Town]", durationMinutes: 90 },
  reason: "[Raison de test]",
  exceptions: ["toReserve"],
  locked: false,
};
const CANDIDAT = "3f0b7c1e-0000-4000-8000-000000000001";
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const signal = () => new AbortController().signal;
const jour = (n: number): Day => edimbourg.days.find((day) => day.index === n)!;

/** Jour du brouillon du serveur : le dîner remplacé, trajet d'arrivée de 12 minutes (durée du port), Tattoo intact. */
function jourDuBrouillon(): Day {
  const avant = jour(1);
  const rang = avant.items.findIndex((item) => item.type === "stop" && item.stop.id === DINER);
  return {
    ...avant,
    items: avant.items.map((item, i) => {
      if (i === rang) return { type: "stop" as const, stop: NOUVELLE };
      if (i === rang - 1 && item.type === "segment") return { ...item, segment: { ...item.segment, minutes: 12 } };
      return item;
    }),
  };
}

const OFFRE: ReplacementOffer = {
  status: "offer",
  version: 1,
  candidateId: CANDIDAT,
  draft: {
    days: [jourDuBrouillon()],
    changes: [
      { type: "replaced", time: "18:45", before: "[Bonne table de l'Old Town]", after: NOUVELLE.name },
      { type: "segment", label: NOUVELLE.name, before: 15, after: 12, estimated: false },
      { type: "unchanged", label: "[Château d'Édimbourg]", time: "14:00" },
    ],
    changedStopIds: [NOUVELLE.id],
    targetStopId: NOUVELLE.id,
    proposal: NOUVELLE,
    fromReserve: true,
  },
};

function setup(
  reponses: {
    offer?: Result<ReplacementOffer>;
    apply?: Result<ReplacementWrite>;
    undo?: Result<ReplacementWrite>;
    toggle?: (input: unknown) => Promise<Result<ChecklistItem>>;
    verrou?: (input: unknown) => Promise<Result<PatchResult>>;
  } = {},
) {
  // Verrou enregistré (M5a) : version suivante de la base reçue, aucun changement détaillé.
  let derniereVersion = 1;
  const verrou =
    reponses.verrou ??
    (async (input: unknown) => {
      const { baseVersion } = input as { baseVersion: number };
      derniereVersion = baseVersion + 1;
      return ok<PatchResult>({ version: derniereVersion, touchedDays: [1], changes: [] });
    });
  const calls = {
    previewReplacement: vi.fn<ServerRevisionCalls["previewReplacement"]>(async () => reponses.offer ?? ok(OFFRE)),
    applyReplacement: vi.fn<ServerRevisionCalls["applyReplacement"]>(async () => reponses.apply ?? ok({ status: "applied", version: 2 })),
    undoReplacement: vi.fn<ServerRevisionCalls["undoReplacement"]>(async () => reponses.undo ?? ok({ status: "undone", version: 3 })),
    toggleChecklistItem: vi.fn<ServerRevisionCalls["toggleChecklistItem"]>(
      reponses.toggle ??
        (async (input) => {
          const { itemId, done } = input as { itemId: string; done: boolean };
          const item = edimbourg.checklist.find((ligne) => ligne.id === itemId)!;
          return ok({ ...item, done });
        }),
    ),
    lockStop: vi.fn<ServerRevisionCalls["lockStop"]>(verrou),
    unlockStop: vi.fn<ServerRevisionCalls["unlockStop"]>(verrou),
  };
  let screen: ProgrammeState = createMemoryProgrammeStore().state;
  const memoryStore = createMemoryProgrammeStore();
  const dispatch = (event: Parameters<typeof programmeReducer>[1]) => {
    screen = programmeReducer(screen, event);
  };
  const memory = createMemoryProgramme(edimbourg, dispatch, null, memoryStore);
  const store = createServerRevisionStore(1);
  const afterWrite = vi.fn();
  let serial = 0;
  const actions = createServerRevision({
    tripId: edimbourg.id,
    store,
    memory,
    currentDays: () => applyProgramme(edimbourg, memoryStore.state).days,
    showDays: (days) => sendToMemoryStore(memoryStore, dispatch, { type: "applyRevision", days }),
    afterWrite,
    calls,
    newRequestId: () => `00000000-0000-4000-8000-00000000000${(serial += 1)}`,
  });
  return { actions, calls, store, afterWrite, shown: () => applyProgramme(edimbourg, screen), rebase: () => sendToMemoryStore(memoryStore, dispatch, { type: "rebase" }) };
}

const REQUETE = { stopId: DINER, reason: "notMyStyle", baseVersion: 1 } as const;

describe("révision enregistrée : fonctions pures (PR 869)", () => {
  it("PR 869 : la version relue ne fait jamais reculer celle des écritures", () => {
    const store = createServerRevisionStore(3);
    syncServerRevisionVersion(store, 2);
    expect(store.version).toBe(3);
    syncServerRevisionVersion(store, 5);
    expect(store.version).toBe(5);
  });
});

describe("révision enregistrée : aperçu, application et annulation (PR 869)", () => {
  it("PR 869 : aperçu repris du brouillon du moteur (durées, changements), valide RevisionPreviewSchema, rien n'est affiché ni écrit", async () => {
    const { actions, calls, afterWrite, shown } = setup();
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    expect(calls.previewReplacement).toHaveBeenCalledWith({ tripId: edimbourg.id, ...REQUETE });
    if (!result.ok) throw new Error(result.error);
    const preview = RevisionPreviewSchema.parse(result.preview);
    expect(preview).toMatchObject({ kind: "replace", baseVersion: 1, targetStopId: NOUVELLE.id, changedStopIds: [NOUVELLE.id], fromReserve: true });
    // Changements du moteur tels quels (trajet compris) ; jour du brouillon tel quel, engagement intact du Tattoo compris.
    expect(preview.changes).toEqual(OFFRE.status === "offer" ? OFFRE.draft.changes : []);
    expect(preview.days).toEqual([jourDuBrouillon()]);
    const segment = preview.days[0]?.items.find((item) => item.type === "segment" && item.segment.minutes === 12);
    expect(segment).toBeDefined();
    const tattoo = preview.days[0]?.items.find((item) => item.type === "stop" && item.stop.id === "j1-tattoo");
    expect(tattoo?.type === "stop" && tattoo.stop.locked).toBe(true);
    expect(tattoo?.type === "stop" && tattoo.stop.commitment).toBe("ticket");
    expect(shown()).toBe(edimbourg);
    expect(afterWrite).not.toHaveBeenCalled();
  });

  it("PR 869 : « Appliquer » écrit (demande rejouée telle quelle), affiche le brouillon, puis demande la relecture", async () => {
    const { actions, calls, store, afterWrite, shown } = setup();
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    if (!result.ok) throw new Error(result.error);
    expect(await actions.apply(result.preview.id)).toEqual({ ok: true, version: 2 });
    expect(calls.applyReplacement).toHaveBeenCalledWith({
      tripId: edimbourg.id,
      requestId: "00000000-0000-4000-8000-000000000001",
      stopId: DINER,
      candidateId: CANDIDAT,
      baseVersion: 1,
    });
    expect(actions.version()).toBe(2);
    expect(store.last?.version).toBe(2);
    expect(afterWrite).toHaveBeenCalledTimes(1);
    // Le jour du brouillon entier (engagement compris, durées du port) : aucune durée « à confirmer » en attendant la relecture.
    expect(shown().days.find((day) => day.index === 1)).toEqual(jourDuBrouillon());
    // L'aperçu est consommé.
    expect(await actions.apply(result.preview.id)).toEqual({ ok: false, error: "error" });
  });

  it("PR 869 : « Annuler » (toast) écrit la version d'annulation et réaffiche le jour d'avant ; voyage relu : brouillon retiré", async () => {
    const { actions, calls, afterWrite, shown, rebase } = setup();
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    if (!result.ok) throw new Error(result.error);
    await actions.apply(result.preview.id);
    await actions.undo();
    expect(calls.undoReplacement).toHaveBeenCalledWith({ tripId: edimbourg.id, requestId: "00000000-0000-4000-8000-000000000002", version: 2 });
    expect(actions.version()).toBe(3);
    expect(afterWrite).toHaveBeenCalledTimes(2);
    expect(shown().days.find((day) => day.index === 1)).toEqual(jour(1));
    rebase();
    expect(shown()).toEqual(edimbourg);
    // Une seule annulation : la suivante revient à l'implémentation en mémoire (rien à annuler), sans appel serveur.
    await actions.undo();
    expect(calls.undoReplacement).toHaveBeenCalledTimes(1);
  });

  it("PR 869 : un verrou posé après le remplacement le rend définitif (« Annuler » annule le verrou : geste inverse enregistré, M5a)", async () => {
    const { actions, calls, shown } = setup();
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    if (!result.ok) throw new Error(result.error);
    await actions.apply(result.preview.id);
    await actions.setStopLocked("j1-chateau", true);
    await actions.undo();
    expect(calls.undoReplacement).not.toHaveBeenCalled();
    expect(calls.lockStop).toHaveBeenCalledWith({ tripId: edimbourg.id, requestId: "00000000-0000-4000-8000-000000000002", stopId: "j1-chateau", baseVersion: 2 });
    expect(calls.unlockStop).toHaveBeenCalledWith({ tripId: edimbourg.id, requestId: "00000000-0000-4000-8000-000000000003", stopId: "j1-chateau", baseVersion: 3 });
    const chateau = shown().days[0]?.items.find((item) => item.type === "stop" && item.stop.id === "j1-chateau");
    expect(chateau?.type === "stop" && chateau.stop.locked).toBe(false);
  });

  it.each([
    ["refus", ok({ status: "conflict", currentVersion: 4 } as const)],
    ["panne", { ok: false, error: { code: "internal" } } as const],
  ])("PR 869 : annulation qui n'aboutit pas (%s) : l'action lève, rien n'est réaffiché, et l'annulation reste possible", async (_cas, reponse) => {
    const { actions, calls, store, shown } = setup({ undo: reponse as Result<ReplacementWrite> });
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    if (!result.ok) throw new Error(result.error);
    await actions.apply(result.preview.id);
    await expect(actions.undo()).rejects.toThrow();
    expect(shown().days.find((day) => day.index === 1)).toEqual(jourDuBrouillon());
    // `last` n'est vidé qu'en cas de succès : la même annulation est redemandée au serveur.
    expect(store.last?.version).toBe(2);
    calls.undoReplacement.mockResolvedValueOnce(ok({ status: "undone", version: 3 }));
    await actions.undo();
    expect(calls.undoReplacement).toHaveBeenCalledTimes(2);
    expect(calls.undoReplacement.mock.calls[1]?.[0]).toMatchObject({ version: 2 });
    expect(store.last).toBeNull();
    expect(shown().days.find((day) => day.index === 1)).toEqual(jour(1));
  });

  it("PR 869 : un aperçu plus récent remplace le précédent (un seul en attente)", async () => {
    const { actions, store } = setup();
    const premier = await actions.previewReplacement(REQUETE, { signal: signal() });
    const second = await actions.previewReplacement(REQUETE, { signal: signal() });
    if (!premier.ok || !second.ok) throw new Error("aperçu");
    expect([...store.pending.keys()]).toEqual([second.preview.id]);
    expect(await actions.apply(premier.preview.id)).toEqual({ ok: false, error: "error" });
  });

  it.each([
    [ok({ status: "noOption" } as const), "noOption"],
    [ok({ status: "conflict", currentVersion: 4 } as const), "conflict"],
    [ok({ status: "lockedStop" } as const), "lockedStop"],
    [{ ok: false, error: { code: "generation_in_progress", retryable: true } } as const, "error"],
    [{ ok: false, error: { code: "internal" } } as const, "error"],
  ])("PR 869 : réponse d'aperçu %j → %s", async (offer, attendu) => {
    const { actions } = setup({ offer: offer as Result<ReplacementOffer> });
    expect(await actions.previewReplacement(REQUETE, { signal: signal() })).toEqual({ ok: false, error: attendu });
  });

  it.each([
    [ok({ status: "conflict", currentVersion: 4 } as const), "conflict"],
    [ok({ status: "lockedStop" } as const), "lockedStop"],
    [ok({ status: "noOption" } as const), "error"],
    [{ ok: false, error: { code: "generation_in_progress", retryable: true } } as const, "error"],
  ])("PR 869 : réponse d'application %j → %s, rien n'est affiché", async (apply, attendu) => {
    const { actions, afterWrite, shown } = setup({ apply: apply as Result<ReplacementWrite> });
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    if (!result.ok) throw new Error(result.error);
    expect(await actions.apply(result.preview.id)).toEqual({ ok: false, error: attendu });
    expect(afterWrite).not.toHaveBeenCalled();
    expect(shown()).toBe(edimbourg);
  });

  it("PR 869 : demande abandonnée, la promesse est rejetée par la raison de l'abandon", async () => {
    const { actions } = setup();
    const controller = new AbortController();
    const raison = new Error("abandon");
    const pending = actions.previewReplacement(REQUETE, { signal: controller.signal });
    controller.abort(raison);
    await expect(pending).rejects.toBe(raison);
  });
});

describe("liste « À faire » enregistrée (M5e, spécification M5 § 7.3)", () => {
  const CHATEAU = "check-chateau";
  const fait = (shown: () => ReturnType<typeof applyProgramme>) => shown().checklist.find((ligne) => ligne.id === CHATEAU)?.done;

  it("a-faire: cocher reste coché : l'état s'affiche, puis toggleChecklistItem l'enregistre (aucune version, aucun « Annuler »)", async () => {
    const { actions, calls, afterWrite, shown, store } = setup();
    expect(actions.checklistOnServer).toBe(true);
    await actions.setChecklistItemDone(CHATEAU, true);
    expect(calls.toggleChecklistItem).toHaveBeenCalledWith({ tripId: edimbourg.id, itemId: CHATEAU, done: true });
    expect(fait(shown)).toBe(true);
    expect(store.version).toBe(1);
    expect(store.last).toBeNull();
    expect(afterWrite).not.toHaveBeenCalled();
    await actions.setChecklistItemDone(CHATEAU, false);
    expect(calls.toggleChecklistItem).toHaveBeenLastCalledWith({ tripId: edimbourg.id, itemId: CHATEAU, done: false });
    expect(fait(shown)).toBe(false);
  });

  it("a-faire: un échec (refus ou panne) rétablit la case et lève une erreur", async () => {
    for (const toggle of [async () => ({ ok: false as const, error: { code: "not_found" as const, retryable: false } }), async () => Promise.reject(new Error("réseau"))]) {
      const { actions, shown } = setup({ toggle });
      await expect(actions.setChecklistItemDone(CHATEAU, true)).rejects.toThrow();
      expect(fait(shown)).toBe(false);
    }
  });
});

describe("verrou enregistré sur api (M5a, ticket 919)", () => {
  const chateau = (shown: ReturnType<ReturnType<typeof setup>["shown"]>) => {
    const item = shown.days[0]?.items.find((i) => i.type === "stop" && i.stop.id === "j1-chateau");
    return item?.type === "stop" ? item.stop : undefined;
  };

  it("verrou: verrouiller écrit une version : lockStop sur la version courante, l'état s'affiche après l'écriture, puis relecture", async () => {
    const { actions, calls, store, afterWrite, shown } = setup();
    await actions.setStopLocked("j1-chateau", true);
    expect(calls.lockStop).toHaveBeenCalledWith({ tripId: edimbourg.id, requestId: "00000000-0000-4000-8000-000000000001", stopId: "j1-chateau", baseVersion: 1 });
    expect(store.version).toBe(2);
    expect(chateau(shown())?.locked).toBe(true);
    expect(afterWrite).toHaveBeenCalledTimes(1);
    await actions.setStopLocked("j1-chateau", false);
    expect(calls.unlockStop).toHaveBeenCalledWith({ tripId: edimbourg.id, requestId: "00000000-0000-4000-8000-000000000002", stopId: "j1-chateau", baseVersion: 2 });
    expect(chateau(shown())?.locked).toBe(false);
  });

  it("verrou: conflit de version : VerrouNonEnregistre(conflict), rien n'est affiché, la version relue sert de base, relecture demandée", async () => {
    const { actions, store, afterWrite, shown } = setup({ verrou: async () => ({ ok: false, error: { code: "version_conflict", retryable: true, currentVersion: 4 } }) });
    await expect(actions.setStopLocked("j1-chateau", true)).rejects.toEqual(new VerrouNonEnregistre("conflict"));
    expect(chateau(shown())?.locked).toBe(false);
    expect(store.version).toBe(4);
    expect(afterWrite).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["not_unlocked", async (): Promise<Result<PatchResult>> => ({ ok: false, error: { code: "not_unlocked", retryable: false } })],
    ["panne", async (): Promise<Result<PatchResult>> => Promise.reject(new Error("réseau"))],
  ])("verrou: refus (%s) : VerrouNonEnregistre(error), rien n'est affiché ni relu", async (_cas, verrou) => {
    const { actions, store, afterWrite, shown } = setup({ verrou });
    await expect(actions.setStopLocked("j1-chateau", true)).rejects.toEqual(new VerrouNonEnregistre("error"));
    expect(chateau(shown())?.locked).toBe(false);
    expect(store.version).toBe(1);
    expect(afterWrite).not.toHaveBeenCalled();
  });
});
