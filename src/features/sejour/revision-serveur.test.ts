// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/remplacement", () => ({
  previewReplacement: vi.fn(),
  applyReplacement: vi.fn(),
  undoReplacement: vi.fn(),
}));

import { RevisionPreviewSchema, type Day, type ReplacementOffer, type ReplacementWrite, type Result, type Stop } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { applyProgramme, createMemoryProgramme, createMemoryProgrammeStore, programmeReducer, sendToMemoryStore, type ProgrammeState } from "./programme";
import {
  changementsDuRemplacement,
  createServerRevision,
  createServerRevisionStore,
  jourDApercu,
  jourRemplace,
  syncServerRevisionVersion,
  type ServerRevisionCalls,
} from "./revision-serveur";

/**
 * Révision enregistrée de l'écran 14 sur `api` (tâche M1g, PR 869) : composition de l'aperçu depuis le jour affiché,
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
const PROPOSITION = "3f0b7c1e-0000-4000-8000-000000000001";
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const signal = () => new AbortController().signal;
const jour = (n: number): Day => edimbourg.days.find((day) => day.index === n)!;

function setup(reponses: { offer?: Result<ReplacementOffer>; apply?: Result<ReplacementWrite>; undo?: Result<ReplacementWrite> } = {}) {
  const calls = {
    previewReplacement: vi.fn<ServerRevisionCalls["previewReplacement"]>(async () => reponses.offer ?? ok({ status: "offer", version: 1, proposalId: PROPOSITION, stop: NOUVELLE })),
    applyReplacement: vi.fn<ServerRevisionCalls["applyReplacement"]>(async () => reponses.apply ?? ok({ status: "applied", version: 2 })),
    undoReplacement: vi.fn<ServerRevisionCalls["undoReplacement"]>(async () => reponses.undo ?? ok({ status: "undone", version: 3 })),
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
  it("PR 869 : jourRemplace pose la proposition à la place de l'étape, trajets voisins et total sans durée", () => {
    const avant = jour(1);
    const apres = jourRemplace(avant, DINER, NOUVELLE);
    const rang = avant.items.findIndex((item) => item.type === "stop" && item.stop.id === DINER);
    expect(apres.items).toHaveLength(avant.items.length);
    expect(apres.items[rang]).toEqual({ type: "stop", stop: NOUVELLE });
    for (const voisin of [rang - 1, rang + 1]) {
      const item = apres.items[voisin];
      if (item?.type === "segment") expect(item.segment.minutes).toBeNull();
    }
    expect(apres.travelMinutes).toBeNull();
    // Les autres lignes ne changent pas ; une étape absente rend le jour tel quel.
    expect(apres.items.filter((_, i) => Math.abs(i - rang) > 1)).toEqual(avant.items.filter((_, i) => Math.abs(i - rang) > 1));
    expect(jourRemplace(avant, "absente", NOUVELLE)).toBe(avant);
  });

  it("PR 869 : changementsDuRemplacement : l'étape remplacée, puis ce qui ne bouge pas (noms maison seulement)", () => {
    const avant = jour(1);
    const ancienne = avant.items.flatMap((item) => (item.type === "stop" && item.stop.id === DINER ? [item.stop] : []))[0]!;
    const changes = changementsDuRemplacement(avant, ancienne, NOUVELLE);
    expect(changes[0]).toEqual({ type: "replaced", time: ancienne.start, before: ancienne.name, after: NOUVELLE.name });
    expect(changes.slice(1).every((change) => change.type === "unchanged")).toBe(true);
    expect(changes.map((change) => ("label" in change ? change.label : ""))).not.toContain(ancienne.name);
    expect(JSON.stringify(changes)).not.toContain("placeId");
  });

  it("PR 869 : la version relue ne fait jamais reculer celle des écritures", () => {
    const store = createServerRevisionStore(3);
    syncServerRevisionVersion(store, 2);
    expect(store.version).toBe(3);
    syncServerRevisionVersion(store, 5);
    expect(store.version).toBe(5);
  });
});

describe("révision enregistrée : aperçu, application et annulation (PR 869)", () => {
  it("PR 869 : aperçu composé depuis le jour affiché, valide RevisionPreviewSchema, rien n'est affiché ni écrit", async () => {
    const { actions, calls, afterWrite, shown } = setup();
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    expect(calls.previewReplacement).toHaveBeenCalledWith({ tripId: edimbourg.id, ...REQUETE });
    if (!result.ok) throw new Error(result.error);
    const preview = RevisionPreviewSchema.parse(result.preview);
    expect(preview).toMatchObject({ kind: "replace", baseVersion: 1, targetStopId: NOUVELLE.id, changedStopIds: [NOUVELLE.id], fromReserve: true });
    // Jour visé entier, sans le champ `commitment` du Tattoo (qui ne bouge pas) : l'aperçu valide son contrat.
    expect(preview.days).toEqual([jourDApercu(jourRemplace(jour(1), DINER, NOUVELLE))]);
    const tattoo = preview.days[0]?.items.find((item) => item.type === "stop" && item.stop.id === "j1-tattoo");
    expect(tattoo?.type === "stop" && tattoo.stop.locked).toBe(true);
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
      proposalId: PROPOSITION,
      baseVersion: 1,
    });
    expect(actions.version()).toBe(2);
    expect(store.last?.version).toBe(2);
    expect(afterWrite).toHaveBeenCalledTimes(1);
    expect(shown().days.find((day) => day.index === 1)).toEqual(jourRemplace(jour(1), DINER, NOUVELLE));
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

  it("PR 869 : un verrou posé après le remplacement le rend définitif (« Annuler » annule le verrou, en mémoire)", async () => {
    const { actions, calls, shown } = setup();
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    if (!result.ok) throw new Error(result.error);
    await actions.apply(result.preview.id);
    await actions.setStopLocked("j1-chateau", true);
    await actions.undo();
    expect(calls.undoReplacement).not.toHaveBeenCalled();
    const chateau = shown().days[0]?.items.find((item) => item.type === "stop" && item.stop.id === "j1-chateau");
    expect(chateau?.type === "stop" && chateau.stop.locked).toBe(false);
  });

  it("PR 869 : annulation refusée par le serveur : l'action lève, rien n'est réaffiché", async () => {
    const { actions, shown } = setup({ undo: ok({ status: "conflict", currentVersion: 4 }) });
    const result = await actions.previewReplacement(REQUETE, { signal: signal() });
    if (!result.ok) throw new Error(result.error);
    await actions.apply(result.preview.id);
    await expect(actions.undo()).rejects.toThrow();
    expect(shown().days.find((day) => day.index === 1)).toEqual(jourRemplace(jour(1), DINER, NOUVELLE));
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
