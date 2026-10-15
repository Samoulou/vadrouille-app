// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GardeOuverte } from "@/server/p0/garde";
import { getRun, P0RUN_COMPLET, REGION_WORKFLOWS, startWorkflow } from "@/workflows";

/** Interface stable des workflows (décision 0009 point 2 ; décision 0063 points 5 et 10), SDK simulé. */

const d = vi.hoisted(() => ({ start: vi.fn(), getRun: vi.fn() }));
vi.mock("workflow/api", () => ({ start: d.start, getRun: d.getRun }));
vi.mock("@/workflows/p0-run", () => ({ p0Run: vi.fn() }));

const GARDE = Object.freeze({ runId: "33333333-3333-4333-8333-333333333333" }) as unknown as GardeOuverte;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("src/workflows/index.ts", () => {
  it("P0RUN_COMPLET faux (conditions du point 7 de l'amendement P0r3c-5 de 0063) : démarrage refusé, SDK jamais appelé", async () => {
    expect(P0RUN_COMPLET).toBe(false);
    expect(await startWorkflow("p0Run", GARDE)).toEqual({ ok: false, code: "real_mode_unavailable" });
    expect(d.start).not.toHaveBeenCalled();
  });

  it("région fra1, passée à chaque démarrage ; entrée réduite à l'identifiant d'exécution", () => {
    expect(REGION_WORKFLOWS).toBe("fra1");
    const source = readFileSync(path.join(process.cwd(), "src/workflows/index.ts"), "utf8");
    expect(source).toContain("start(p0Run, [{ runId: garde.runId }], { region: REGION_WORKFLOWS })");
    expect(source.match(/\bstart\(/g)).toHaveLength(1);
  });

  it("getRun : statut seul, ni entrée ni sortie relue", async () => {
    const lue = vi.fn();
    d.getRun.mockReturnValue({
      status: Promise.resolve("running"),
      get returnValue() {
        lue();
        return Promise.resolve(undefined);
      },
    });
    expect(await getRun("wrun_1")).toEqual({ statut: "running" });
    expect(d.getRun).toHaveBeenCalledWith("wrun_1");
    expect(lue).not.toHaveBeenCalled();
  });
});
