// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLazyTrack } from "./lazy";
import { CONSOLE_PREFIX, createMemoryRecorder } from "./track";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("analytics: enregistreur chargé à la demande (F5c)", () => {
  it("valide puis confie l'événement à l'enregistreur injecté, à chaque appel", async () => {
    const recorder = createMemoryRecorder();
    const track = createLazyTrack("none", recorder);
    await track({ name: "checklist_item_done", properties: {} });
    await track({ name: "checklist_item_done", properties: {} });
    expect(recorder.events).toEqual([
      { name: "checklist_item_done", properties: {} },
      { name: "checklist_item_done", properties: {} },
    ]);
  });

  it("un événement invalide est refusé hors production, jamais enregistré", async () => {
    const recorder = createMemoryRecorder();
    const track = createLazyTrack("none", recorder);
    const invalid = { name: "checklist_item_done", properties: { itemId: "check-chateau" } } as never;
    await expect(track(invalid)).rejects.toThrow(/événement de mesure invalide/);
    expect(recorder.events).toEqual([]);
  });

  it("chargement en échec : l'appel est rejeté, puis l'appel suivant retente le chargement (M1, revue de la PR 128)", async () => {
    const recorder = createMemoryRecorder();
    const real = await import("./track");
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("chargement impossible"))
      .mockResolvedValue({ createTracker: real.createTracker, recorderFor: real.recorderFor });
    const track = createLazyTrack("none", recorder, load);
    await expect(track({ name: "checklist_item_done", properties: {} })).rejects.toThrow("chargement impossible");
    expect(recorder.events).toEqual([]);
    await track({ name: "checklist_item_done", properties: {} });
    await track({ name: "checklist_item_done", properties: {} });
    expect(load).toHaveBeenCalledTimes(2);
    expect(recorder.events).toHaveLength(2);
  });

  it("sans enregistreur injecté : celui de `recorderKind` (console avec les pages de développement, sans effet sinon)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await createLazyTrack("console")({ name: "checklist_item_done", properties: {} });
    expect(info).toHaveBeenCalledWith(CONSOLE_PREFIX, JSON.stringify({ name: "checklist_item_done", properties: {} }));
    info.mockClear();
    await createLazyTrack("none")({ name: "checklist_item_done", properties: {} });
    expect(info).not.toHaveBeenCalled();
  });
});
