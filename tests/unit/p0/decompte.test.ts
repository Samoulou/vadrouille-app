// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CODES_EXTERNES } from "@/prototype/arret";
import { CODES_EXTERNES_SUIVI, COMPTEES_MAX, decompte, lancementDansLeDecompte, RELANCES_MAX } from "@/server/p0/decompte";

import { arretee, executionSuivie } from "./suivi-fabrique";

/** Décompte des exécutions réelles (P0S2-PO-13 ; P0a2 : 2 B et 1 A par brief ; D24, `run_quota_reached`). */

describe("p0: décompte des exécutions (P0S2-PO-13)", () => {
  it("codes externes égaux à CODES_EXTERNES de src/prototype/arret.ts ; maxima de P0a2", () => {
    expect([...CODES_EXTERNES_SUIVI]).toEqual([...CODES_EXTERNES]);
    expect(COMPTEES_MAX).toEqual({ A: 1, B: 2 });
    expect(RELANCES_MAX).toBe(1);
  });

  it("aucune exécution : rien de compté, lancement admis pour chaque variante", () => {
    expect(decompte([], "edimbourg-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
    expect(lancementDansLeDecompte([], "reel", "edimbourg-1.json", "A")).toBe(true);
  });

  it("toute fin compte (programme écrit, pipeline_failed, codes avant appel), et une exécution en cours compte", () => {
    const executions = [
      executionSuivie(),
      arretee("pipeline_failed"),
      arretee("config_invalid"),
      executionSuivie({ statut: "en_cours", phase: "recherche", coutModelesMicros: 0, ecouleMs: 1, canaryOk: null }),
    ];
    expect(decompte(executions, "edimbourg-1.json", "B")).toEqual({ comptees: 4, relances: 0 });
  });

  it.each(CODES_EXTERNES_SUIVI)("une fin externe (%s) est une relance, au plus une ; la seconde compte", (code) => {
    expect(decompte([arretee(code)], "edimbourg-1.json", "B")).toEqual({ comptees: 0, relances: 1 });
    expect(decompte([arretee(code), arretee(code)], "edimbourg-1.json", "B")).toEqual({ comptees: 1, relances: 1 });
  });

  it("par brief et variante : les autres briefs, l'autre variante et les essais ne comptent pas", () => {
    const executions = [
      executionSuivie({ brief: "edimbourg-2.json" }),
      executionSuivie({ variante: "A" }),
      executionSuivie({ mode: "essai" }),
      arretee("upstream_unavailable", { mode: "essai" }),
    ];
    expect(decompte(executions, "edimbourg-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
    expect(decompte(executions, "edimbourg-1.json", "A")).toEqual({ comptees: 1, relances: 0 });
  });

  it("B : deux comptées puis refus ; A : une comptée puis refus ; une relance ne consomme pas de place comptée", () => {
    const b = [executionSuivie(), arretee("upstream_unavailable")];
    expect(lancementDansLeDecompte(b, "reel", "edimbourg-1.json", "B")).toBe(true);
    expect(lancementDansLeDecompte([...b, executionSuivie()], "reel", "edimbourg-1.json", "B")).toBe(false);
    const a = [executionSuivie({ variante: "A" })];
    expect(lancementDansLeDecompte(a, "reel", "edimbourg-1.json", "A")).toBe(false);
    expect(lancementDansLeDecompte([arretee("usage_unavailable", { variante: "A" })], "reel", "edimbourg-1.json", "A")).toBe(true);
    expect(lancementDansLeDecompte([arretee("usage_unavailable", { variante: "A" }), arretee("upstream_redirect", { variante: "A" })], "reel", "edimbourg-1.json", "A")).toBe(
      false,
    );
  });

  it("un essai d'intégration n'est jamais refusé par le décompte", () => {
    const pleines = [executionSuivie(), executionSuivie(), executionSuivie({ variante: "A" })];
    expect(lancementDansLeDecompte(pleines, "essai", "edimbourg-1.json", "B")).toBe(true);
    expect(lancementDansLeDecompte(pleines, "essai", "edimbourg-1.json", "A")).toBe(true);
  });
});
