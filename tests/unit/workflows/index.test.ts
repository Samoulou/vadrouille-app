// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GardeOuverte } from "@/server/p0/garde";
import { demarrerApercu, demarrerRecalcul, demarrerVoyageComplet, getRun, P0RUN_COMPLET, REGION_WORKFLOWS, startWorkflow } from "@/workflows";

/** Interface stable des workflows (décision 0009 point 2 ; décision 0063 points 5 et 10), SDK simulé. */

const d = vi.hoisted(() => ({ start: vi.fn(), getRun: vi.fn() }));
vi.mock("workflow/api", () => ({ start: d.start, getRun: d.getRun }));
vi.mock("@/workflows/p0-run", () => ({ p0Run: vi.fn() }));
vi.mock("@/workflows/apercu", () => ({ generatePreview: vi.fn() }));
vi.mock("@/workflows/voyage-complet", () => ({ generateFullTrip: vi.fn() }));
vi.mock("@/workflows/recalcul", () => ({ batchRecompute: vi.fn() }));
/** Interrupteur simulé à faux : le refus reste prouvé alors que la valeur commitée est vraie (PR dédiée après P0r3d). */
vi.mock("@/workflows/complet", () => ({ P0RUN_COMPLET: false }));

const GARDE = Object.freeze({ runId: "33333333-3333-4333-8333-333333333333" }) as unknown as GardeOuverte;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("src/workflows/index.ts", () => {
  it("P0RUN_COMPLET faux (simulé ; conditions du point 7 de l'amendement P0r3c-5 de 0063) : démarrage refusé, SDK jamais appelé", async () => {
    expect(P0RUN_COMPLET).toBe(false);
    expect(await startWorkflow("p0Run", GARDE)).toEqual({ ok: false, code: "real_mode_unavailable" });
    expect(d.start).not.toHaveBeenCalled();
  });

  it("valeur commitée de P0RUN_COMPLET : vrai (PR dédiée après P0r3d ; amendement P0r3d de 0063, point 2)", async () => {
    const reel = await vi.importActual<typeof import("@/workflows/complet")>("@/workflows/complet");
    expect(reel.P0RUN_COMPLET).toBe(true);
  });

  it("région fra1, passée à chaque démarrage ; entrée réduite à l'identifiant d'exécution", () => {
    expect(REGION_WORKFLOWS).toBe("fra1");
    const source = readFileSync(path.join(process.cwd(), "src/workflows/index.ts"), "utf8");
    expect(source).toContain("start(p0Run, [{ runId: garde.runId }], { region: REGION_WORKFLOWS })");
    // B9c : le second démarrage est celui de l'aperçu (`generatePreview`), région fra1 et état réduit aux identifiants.
    expect(source).toContain("start(generatePreview, [entree], { region: REGION_WORKFLOWS })");
    // B9d : le troisième est celui du voyage complet (`generateFullTrip`), région fra1, état réduit aux identifiants.
    expect(source).toContain("start(generateFullTrip, [entree], { region: REGION_WORKFLOWS })");
    // B10b : le quatrième est celui du recalcul d'un tri (`batchRecompute`, 0119 § 1.5 point 1), région fra1, même état.
    expect(source).toContain("start(batchRecompute, [entree], { region: REGION_WORKFLOWS })");
    // Lot 4 du bout en bout (décision 0126 § 1) : le cinquième est celui de la révision d'un voyage d'essai (`p0Revision`),
    // région fra1, entrée réduite à des identifiants maison.
    expect(source).toContain("start(p0Revision, [entree], { region: REGION_WORKFLOWS })");
    // M1a-2 (décision 0136 § 2) : le sixième est celui de `generateProgramme` (chaîne inversée), région fra1, même état.
    expect(source).toContain("start(generateProgramme, [entree], { region: REGION_WORKFLOWS })");
    expect(source.match(/\bstart\(/g)).toHaveLength(6);
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

  it("demarrerApercu : entrée réduite aux identifiants et au rang 0, région fra1 ; une erreur du SDK ne sort que par un code", async () => {
    const generationRunId = "11111111-1111-4111-8111-111111111111";
    const organizationId = "22222222-2222-4222-8222-222222222222";
    d.start.mockResolvedValueOnce({ runId: "wrun_9" });
    expect(await demarrerApercu(generationRunId, organizationId)).toEqual({ ok: true, workflowRunId: "wrun_9" });
    expect(d.start).toHaveBeenCalledWith(expect.anything(), [{ generationRunId, organizationId, rang: 0 }], { region: "fra1" });
    d.start.mockRejectedValueOnce(new Error("message du SDK avec test_place_fuite"));
    expect(await demarrerApercu(generationRunId, organizationId)).toEqual({ ok: false, code: "start_failed" });
    d.start.mockResolvedValueOnce({ runId: 42 });
    expect(await demarrerApercu(generationRunId, organizationId)).toEqual({ ok: false, code: "start_failed" });
  });

  it("demarrerVoyageComplet : entrée réduite aux identifiants et au rang 0, région fra1 ; une erreur du SDK ne sort que par un code", async () => {
    const generationRunId = "11111111-1111-4111-8111-111111111111";
    const organizationId = "22222222-2222-4222-8222-222222222222";
    d.start.mockResolvedValueOnce({ runId: "wrun_10" });
    expect(await demarrerVoyageComplet(generationRunId, organizationId)).toEqual({ ok: true, workflowRunId: "wrun_10" });
    expect(d.start).toHaveBeenCalledWith(expect.anything(), [{ generationRunId, organizationId, rang: 0 }], { region: "fra1" });
    d.start.mockRejectedValueOnce(new Error("message du SDK avec test_place_fuite"));
    expect(await demarrerVoyageComplet(generationRunId, organizationId)).toEqual({ ok: false, code: "start_failed" });
  });

  it("demarrerRecalcul (B10b) : entrée réduite aux identifiants et au rang 0, région fra1 ; une erreur du SDK ne sort que par un code", async () => {
    const generationRunId = "11111111-1111-4111-8111-111111111111";
    const organizationId = "22222222-2222-4222-8222-222222222222";
    d.start.mockResolvedValueOnce({ runId: "wrun_11" });
    expect(await demarrerRecalcul(generationRunId, organizationId)).toEqual({ ok: true, workflowRunId: "wrun_11" });
    expect(d.start).toHaveBeenCalledWith(expect.anything(), [{ generationRunId, organizationId, rang: 0 }], { region: "fra1" });
    d.start.mockRejectedValueOnce(new Error("message du SDK avec test_place_fuite"));
    expect(await demarrerRecalcul(generationRunId, organizationId)).toEqual({ ok: false, code: "start_failed" });
    d.start.mockResolvedValueOnce({});
    expect(await demarrerRecalcul(generationRunId, organizationId)).toEqual({ ok: false, code: "start_failed" });
  });
});
