// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CODES_EXTERNES } from "@/prototype/arret";
import {
  CODES_EXTERNES_SUIVI,
  COMPTEES_MAX,
  decompte,
  estExclue,
  EXECUTIONS_EXCLUES,
  RELANCES_MAX,
} from "@/server/p0/decompte";

import { arretee, executionSuivie } from "./suivi-fabrique";

/**
 * Décompte des exécutions réelles (P0S2-PO-13 ; P0a2 : 2 B et 1 A par brief). Information seulement depuis la décision
 * 0071 : il ne refuse plus aucun lancement (`tests/unit/p0/lancement.test.ts`) ; `placeLibre` lit le tableau de la page.
 */
const placeLibre = (executions: Parameters<typeof decompte>[0], brief: string, variante: "A" | "B") =>
  decompte(executions, brief, variante).comptees < COMPTEES_MAX[variante];

describe("p0: décompte des exécutions (P0S2-PO-13)", () => {
  it("codes externes égaux à CODES_EXTERNES de src/prototype/arret.ts ; maxima de P0a2", () => {
    expect([...CODES_EXTERNES_SUIVI]).toEqual([...CODES_EXTERNES]);
    expect(COMPTEES_MAX).toEqual({ A: 1, B: 2 });
    expect(RELANCES_MAX).toBe(1);
  });

  it("aucune exécution : rien de compté, place libre pour chaque variante", () => {
    expect(decompte([], "edimbourg-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
    expect(placeLibre([], "edimbourg-1.json", "A")).toBe(true);
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

  it("B : deux comptées puis plus de place ; A : une comptée puis plus de place ; une relance ne consomme pas de place comptée", () => {
    const b = [executionSuivie(), arretee("upstream_unavailable")];
    expect(placeLibre(b, "edimbourg-1.json", "B")).toBe(true);
    expect(placeLibre([...b, executionSuivie()], "edimbourg-1.json", "B")).toBe(false);
    const a = [executionSuivie({ variante: "A" })];
    expect(placeLibre(a, "edimbourg-1.json", "A")).toBe(false);
    expect(placeLibre([arretee("usage_unavailable", { variante: "A" })], "edimbourg-1.json", "A")).toBe(true);
    expect(placeLibre([arretee("usage_unavailable", { variante: "A" }), arretee("upstream_redirect", { variante: "A" })], "edimbourg-1.json", "A")).toBe(
      false,
    );
  });

  it("un essai d'intégration n'entre jamais dans le décompte, même places pleines", () => {
    const pleines = [executionSuivie(), executionSuivie(), executionSuivie({ variante: "A" })];
    const essais = [executionSuivie({ mode: "essai" }), executionSuivie({ mode: "essai", variante: "A" })];
    expect(decompte([...pleines, ...essais], "edimbourg-1.json", "B")).toEqual(decompte(pleines, "edimbourg-1.json", "B"));
    expect(decompte([...pleines, ...essais], "edimbourg-1.json", "A")).toEqual(decompte(pleines, "edimbourg-1.json", "A"));
  });
});

/** Décision 0070 : l'exécution réelle du 2026-10-16 (`wrun_41M51Z1RQ450GN2FF85TK80W6Z`) est exclue du décompte G0. */
describe("p0: exécutions exclues du décompte (décision 0070)", () => {
  const exclue0070 = arretee("pipeline_failed", {
    jourQuota: "2026-10-16",
    commitSha: "d61e9faefacf568ad39833e8ac611ba717e0fbdd",
  });

  it("liste fermée : une seule entrée, celle de la décision 0070", () => {
    expect(EXECUTIONS_EXCLUES).toEqual([
      {
        decision: "0070",
        brief: "edimbourg-1.json",
        variante: "B",
        jourQuota: "2026-10-16",
        codeArret: "pipeline_failed",
        commitSha: "d61e9faefacf568ad39833e8ac611ba717e0fbdd",
      },
    ]);
  });

  it("l'exécution de 0070 n'est ni comptée ni relance : edimbourg-1/B garde ses deux places", () => {
    expect(estExclue(exclue0070)).toBe(true);
    expect(decompte([exclue0070], "edimbourg-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
    expect(placeLibre([exclue0070, executionSuivie()], "edimbourg-1.json", "B")).toBe(true);
    expect(placeLibre([exclue0070, executionSuivie(), executionSuivie()], "edimbourg-1.json", "B")).toBe(false);
  });

  it.each([
    ["autre jour", { jourQuota: "2026-10-17" }],
    ["autre commit", { commitSha: "b".repeat(40) }],
    ["autre code", { codeArret: "cap_reached" }],
    ["autre brief", { brief: "edimbourg-2.json" }],
    ["autre variante", { variante: "A" as const }],
    ["programme écrit", { statut: "programme_ecrit" as const, codeArret: null }],
    ["en cours", { statut: "en_cours" as const, codeArret: null }],
  ])("un seul champ différent (%s) : l'exécution compte", (_cas, champs) => {
    const execution = { ...exclue0070, ...champs };
    expect(estExclue(execution)).toBe(false);
    expect(decompte([execution], execution.brief, execution.variante).comptees).toBe(1);
  });

  it("un essai du même jour n'est pas visé (il ne compte déjà pas)", () => {
    expect(estExclue({ ...exclue0070, mode: "essai" })).toBe(false);
  });
});
