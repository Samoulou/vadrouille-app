// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { createMockCreationAdapter } from "@/adapters/mock-creation";
import { fail, type BriefRequest } from "@/contracts";
import { MOCK_INFERRED_BRIEF } from "@/mocks/creation-edimbourg";

import { structureBrief } from "./creation";

vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getCreationAdapter: vi.fn(actual.getCreationAdapter) };
});

/** Le serveur fait foi (F8-PO-17, décision 0017 § 3.4) : `structureBrief`. */

const REQUEST: BriefRequest = {
  story: "On part à deux, on aime la nature et les dégustations de whisky.",
  trip: { destination: "Édimbourg", start: "2026-08-29", end: "2026-09-03", otherCities: [] },
};

const structure = vi.fn();

beforeEach(() => {
  structure.mockReset();
  vi.mocked(adapters.getCreationAdapter).mockClear();
});

afterEach(() => {
  vi.mocked(adapters.getCreationAdapter).mockImplementation(() => createMockCreationAdapter());
});

function withAdapter(implementation: () => Promise<unknown>) {
  structure.mockImplementation(implementation);
  vi.mocked(adapters.getCreationAdapter).mockReturnValue({ structureBrief: structure } as never);
}

describe("structureBrief", () => {
  it("adaptateur simulé : renvoie le brief d'Édimbourg, validé", async () => {
    const result = await structureBrief(REQUEST);
    expect(result).toEqual({ ok: true, value: MOCK_INFERRED_BRIEF });
  });

  it.each([
    ["récit de 19 caractères", { ...REQUEST, story: "a".repeat(19) }, "story"],
    ["récit de 1 001 caractères", { ...REQUEST, story: "a".repeat(1001) }, "story"],
    ["5 villes", { ...REQUEST, trip: { ...REQUEST.trip, otherCities: Array(4).fill({ name: "Glasgow", arrival: "2026-09-01" }) } }, "trip.otherCities"],
    ["champ inconnu", { ...REQUEST, inconnu: true }, undefined],
    ["logement dans la requête", { ...REQUEST, trip: { ...REQUEST.trip, lodging: { kind: "none" } } }, "trip"],
  ])("%s : validation_failed sans appeler l'adaptateur", async (_label, input, field) => {
    withAdapter(async () => ({ ok: true, value: MOCK_INFERRED_BRIEF }));
    const result = await structureBrief(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_failed");
      expect(result.error.field).toBe(field);
    }
    expect(structure).not.toHaveBeenCalled();
  });

  it("une clé hostile n'apparaît jamais dans `field`", async () => {
    withAdapter(async () => ({ ok: true, value: MOCK_INFERRED_BRIEF }));
    const result = await structureBrief({ ...REQUEST, trip: { ...REQUEST.trip, "<script>alert(1)</script>": 1 } });
    expect(result).toEqual({ ok: false, error: { code: "validation_failed", field: "trip" } });
    expect(structure).not.toHaveBeenCalled();
  });

  it("une sortie non conforme à InferredBriefSchema devient provider_error", async () => {
    withAdapter(async () => ({ ok: true, value: { pace: "lent", inferredFields: ["pace"] } }));
    expect(await structureBrief(REQUEST)).toEqual({ ok: false, error: { code: "provider_error" } });
    withAdapter(async () => ({ ok: true, value: { pace: "relaxed", inferredFields: [] } }));
    expect(await structureBrief(REQUEST)).toEqual({ ok: false, error: { code: "provider_error" } });
  });

  it.each(["rate_limited", "cost_cap_reached", "provider_error"] as const)("%s est transmis tel quel", async (code) => {
    withAdapter(async () => fail(code));
    expect(await structureBrief(REQUEST)).toEqual({ ok: false, error: { code } });
  });

  it("toute autre erreur, ou une exception, devient provider_error", async () => {
    withAdapter(async () => fail("not_found"));
    expect(await structureBrief(REQUEST)).toEqual({ ok: false, error: { code: "provider_error" } });
    withAdapter(async () => {
      throw new Error(REQUEST.story);
    });
    expect(await structureBrief(REQUEST)).toEqual({ ok: false, error: { code: "provider_error" } });
  });

  it("aucune donnée journalisée : ni récit ni destination sur la console ou la sortie du processus", async () => {
    const spies = [
      ...(["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method)),
      vi.spyOn(process.stdout, "write"),
      vi.spyOn(process.stderr, "write"),
    ];
    try {
      await structureBrief(REQUEST);
      await structureBrief({ ...REQUEST, story: "trop court" });
      withAdapter(async () => {
        throw new Error(REQUEST.story);
      });
      await structureBrief(REQUEST);
      const written = spies.flatMap((spy) => spy.mock.calls.flat()).map(String).join("\n");
      expect(written).not.toContain(REQUEST.story);
      expect(written).not.toContain("trop court");
      expect(written).not.toContain(REQUEST.trip.destination);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("adaptateur de création simulé", () => {
  it("renvoie le brief préparé quel que soit le récit", async () => {
    const adapter = createMockCreationAdapter();
    expect(await adapter.structureBrief(REQUEST)).toEqual({ ok: true, value: MOCK_INFERRED_BRIEF });
    expect(await adapter.structureBrief({ ...REQUEST, story: "Tout autre chose, en vingt caractères." })).toEqual({
      ok: true,
      value: MOCK_INFERRED_BRIEF,
    });
  });

  it("un brief préparé non conforme donne provider_error", async () => {
    const adapter = createMockCreationAdapter({ inferredBrief: { wishes: [], inferredFields: ["wishes"] } });
    expect(await adapter.structureBrief(REQUEST)).toEqual({ ok: false, error: { code: "provider_error" } });
  });

  it("getCreationAdapter : mock par défaut, erreur pour api et une valeur inconnue", async () => {
    const actual = await vi.importActual<typeof import("@/adapters")>("@/adapters");
    expect(actual.getCreationAdapter("mock")).toBeDefined();
    expect(actual.getCreationAdapter(undefined)).toBeDefined();
    expect(() => actual.getCreationAdapter("api")).toThrow();
    expect(() => actual.getCreationAdapter("autre")).toThrow();
  });
});
