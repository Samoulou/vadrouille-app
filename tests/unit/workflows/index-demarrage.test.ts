// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GardeOuverte } from "@/server/p0/garde";
import { P0RUN_COMPLET, startWorkflow } from "@/workflows";

/**
 * Chemin de démarrage de `p0Run` une fois l'interrupteur passé à vrai (P0r3d ; 0063 points 5, 7 et 10) : interrupteur
 * simulé à vrai **dans ce test seulement** (`src/workflows/complet.ts` reste à faux, test `index.test.ts`), SDK simulé.
 */

const d = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("workflow/api", () => ({ start: d.start, getRun: vi.fn() }));
vi.mock("@/workflows/complet", () => ({ P0RUN_COMPLET: true }));
vi.mock("@/workflows/p0-run", () => ({ p0Run: { nom: "p0Run" } }));

const GARDE = Object.freeze({ runId: "33333333-3333-4333-8333-333333333333" }) as unknown as GardeOuverte;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("src/workflows/index.ts : démarrage (interrupteur simulé à vrai)", () => {
  it("SDK appelé une fois : p0Run, entrée réduite à l'identifiant d'exécution, région fra1", async () => {
    expect(P0RUN_COMPLET).toBe(true);
    d.start.mockResolvedValue({ runId: "wrun_42" });
    expect(await startWorkflow("p0Run", GARDE)).toEqual({ ok: true, workflowRunId: "wrun_42" });
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.start).toHaveBeenCalledWith({ nom: "p0Run" }, [{ runId: GARDE.runId }], { region: "fra1" });
  });

  it("SDK en échec : start_failed, sans le message ; identifiant illisible : start_failed", async () => {
    d.start.mockRejectedValue(new Error("SENTINELLE_SDK"));
    const resultat = await startWorkflow("p0Run", GARDE);
    expect(resultat).toEqual({ ok: false, code: "start_failed" });
    expect(JSON.stringify(resultat)).not.toContain("SENTINELLE_SDK");
    d.start.mockResolvedValue({ runId: undefined });
    expect(await startWorkflow("p0Run", GARDE)).toEqual({ ok: false, code: "start_failed" });
  });

  it("nom inconnu : refus sans appel au SDK", async () => {
    expect(await startWorkflow("autre" as "p0Run", GARDE)).toEqual({ ok: false, code: "real_mode_unavailable" });
    expect(d.start).not.toHaveBeenCalled();
  });
});
