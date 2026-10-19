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

  it("liste fermée : l'entrée de la décision 0070, les deux de la décision 0089, puis celle de la décision 0091", () => {
    expect(EXECUTIONS_EXCLUES).toEqual([
      {
        decision: "0070",
        brief: "edimbourg-1.json",
        variante: "B",
        jourQuota: "2026-10-16",
        codeArret: "pipeline_failed",
        commitSha: "d61e9faefacf568ad39833e8ac611ba717e0fbdd",
      },
      {
        decision: "0089",
        brief: "rome-1.json",
        variante: "B",
        jourQuota: "2026-10-18",
        codeArret: "pipeline_failed",
        commitSha: "cfca0b58ccf67e4d10196adea296045ec98fdb61",
      },
      {
        decision: "0089",
        brief: "rome-1.json",
        variante: "B",
        jourQuota: "2026-10-18",
        codeArret: "pipeline_failed",
        commitSha: "efc0994f3e4e8eb5eb081c84b754797b980cf166",
      },
      {
        decision: "0091",
        brief: "rome-1.json",
        variante: "B",
        jourQuota: "2026-10-18",
        codeArret: "pipeline_failed",
        commitSha: "0d0bbaa36536cf0d26d1d3b55218d9183375b92f",
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

/**
 * Décision 0089 : les deux exécutions réelles rome-1/B de l'après-midi du 2026-10-18 (`wrun_41M57JCM3G50T1SSVCX1XG7HRT`
 * au commit `cfca0b5`, `wrun_41M57JWPHV50HNB1M3TH4D2140` au commit `efc0994`) sont exclues du décompte G0 ; l'exécution
 * réussie du matin reste comptée. Chaque entrée n'exclut qu'une exécution au plus.
 */
describe("p0: exécutions exclues du décompte (décision 0089)", () => {
  const CFCA = "cfca0b58ccf67e4d10196adea296045ec98fdb61";
  const EFC0 = "efc0994f3e4e8eb5eb081c84b754797b980cf166";
  const rome = (champs: Parameters<typeof executionSuivie>[0] = {}) =>
    executionSuivie({ brief: "rome-1.json", jourQuota: "2026-10-18", ...champs });
  const apresMidi1 = rome({ statut: "arretee", codeArret: "pipeline_failed", commitSha: CFCA });
  const apresMidi2 = rome({ statut: "arretee", codeArret: "pipeline_failed", commitSha: EFC0 });
  const matin = rome({ commitSha: CFCA });

  it("les deux exécutions de l'après-midi ne sont ni comptées ni relances ; celle du matin compte", () => {
    expect(estExclue(apresMidi1)).toBe(true);
    expect(estExclue(apresMidi2)).toBe(true);
    expect(estExclue(matin)).toBe(false);
    expect(decompte([apresMidi1, apresMidi2], "rome-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
    expect(decompte([apresMidi2, apresMidi1, matin], "rome-1.json", "B")).toEqual({ comptees: 1, relances: 0 });
    expect(placeLibre([apresMidi2, apresMidi1, matin], "rome-1.json", "B")).toBe(true);
    expect(placeLibre([apresMidi2, apresMidi1, matin, rome()], "rome-1.json", "B")).toBe(false);
  });

  it("chaque entrée n'exclut qu'une exécution : une seconde exécution du même tuple compte", () => {
    expect(decompte([apresMidi1, { ...apresMidi1, id: "22222222-2222-4222-8222-222222222222" }], "rome-1.json", "B")).toEqual({
      comptees: 1,
      relances: 0,
    });
    expect(
      decompte([apresMidi1, apresMidi2, { ...apresMidi2, id: "33333333-3333-4333-8333-333333333333" }, matin], "rome-1.json", "B"),
    ).toEqual({ comptees: 2, relances: 0 });
  });

  it("l'entrée de 0070 reste limitée à une exécution", () => {
    const exclue0070 = arretee("pipeline_failed", { jourQuota: "2026-10-16", commitSha: "d61e9faefacf568ad39833e8ac611ba717e0fbdd" });
    expect(decompte([exclue0070, exclue0070], "edimbourg-1.json", "B")).toEqual({ comptees: 1, relances: 0 });
  });

  it.each([
    ["autre jour", { jourQuota: "2026-10-19" }],
    ["autre commit", { commitSha: "b".repeat(40) }],
    ["autre code", { codeArret: "upstream_unavailable" }],
    ["autre brief", { brief: "rome-2.json" }],
    ["autre variante", { variante: "A" as const }],
    ["programme écrit", { statut: "programme_ecrit" as const, codeArret: null }],
    ["en cours", { statut: "en_cours" as const, codeArret: null }],
  ])("un seul champ différent (%s) : l'exécution n'est pas exclue", (_cas, champs) => {
    for (const exclue of [apresMidi1, apresMidi2]) {
      const execution = { ...exclue, ...champs };
      expect(estExclue(execution)).toBe(false);
      const attendu = execution.codeArret === "upstream_unavailable" ? { comptees: 0, relances: 1 } : { comptees: 1, relances: 0 };
      expect(decompte([execution], execution.brief, execution.variante)).toEqual(attendu);
    }
  });

  it("un essai d'intégration du même jour n'est pas visé (il ne compte déjà pas)", () => {
    expect(estExclue({ ...apresMidi1, mode: "essai" })).toBe(false);
    expect(estExclue({ ...apresMidi2, mode: "essai" })).toBe(false);
  });
});

/**
 * Décision 0091 : l'exécution réelle rome-1/B du soir du 2026-10-18 (`wrun_41M57YCVXJ50T41W3BH260MEP2`, commit `0d0bbaa`),
 * arrêtée par la limite quotidienne de Google Routes, est exclue du décompte G0. L'entrée n'exclut qu'une exécution au plus.
 */
describe("p0: exécutions exclues du décompte (décision 0091)", () => {
  const CFCA = "cfca0b58ccf67e4d10196adea296045ec98fdb61";
  const EFC0 = "efc0994f3e4e8eb5eb081c84b754797b980cf166";
  const ODBB = "0d0bbaa36536cf0d26d1d3b55218d9183375b92f";
  const rome = (champs: Parameters<typeof executionSuivie>[0] = {}) =>
    executionSuivie({ brief: "rome-1.json", jourQuota: "2026-10-18", ...champs });
  const soir = rome({ statut: "arretee", codeArret: "pipeline_failed", commitSha: ODBB });
  const apresMidi1 = rome({ statut: "arretee", codeArret: "pipeline_failed", commitSha: CFCA });
  const apresMidi2 = rome({ statut: "arretee", codeArret: "pipeline_failed", commitSha: EFC0 });
  const matin = rome({ commitSha: CFCA });

  it("l'exécution du soir n'est ni comptée ni relance ; avec 0089, seule celle du matin compte", () => {
    expect(estExclue(soir)).toBe(true);
    expect(decompte([soir], "rome-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
    expect(decompte([matin, apresMidi1, apresMidi2, soir], "rome-1.json", "B")).toEqual({ comptees: 1, relances: 0 });
    expect(placeLibre([matin, apresMidi1, apresMidi2, soir], "rome-1.json", "B")).toBe(true);
    expect(placeLibre([matin, apresMidi1, apresMidi2, soir, rome()], "rome-1.json", "B")).toBe(false);
  });

  it("l'entrée n'exclut qu'une exécution : une seconde exécution du même tuple compte", () => {
    expect(decompte([soir, { ...soir, id: "44444444-4444-4444-8444-444444444444" }], "rome-1.json", "B")).toEqual({
      comptees: 1,
      relances: 0,
    });
    expect(
      decompte([matin, apresMidi1, apresMidi2, soir, { ...soir, id: "55555555-5555-4555-8555-555555555555" }], "rome-1.json", "B"),
    ).toEqual({ comptees: 2, relances: 0 });
  });

  it.each([
    ["autre jour", { jourQuota: "2026-10-19" }],
    ["autre commit", { commitSha: "b".repeat(40) }],
    ["autre code", { codeArret: "upstream_unavailable" }],
    ["autre brief", { brief: "rome-2.json" }],
    ["autre variante", { variante: "A" as const }],
    ["programme écrit", { statut: "programme_ecrit" as const, codeArret: null }],
    ["en cours", { statut: "en_cours" as const, codeArret: null }],
  ])("un seul champ différent (%s) : l'exécution n'est pas exclue", (_cas, champs) => {
    const execution = { ...soir, ...champs };
    expect(estExclue(execution)).toBe(false);
    const attendu = execution.codeArret === "upstream_unavailable" ? { comptees: 0, relances: 1 } : { comptees: 1, relances: 0 };
    expect(decompte([execution], execution.brief, execution.variante)).toEqual(attendu);
  });

  it("un essai d'intégration du même jour n'est pas visé (il ne compte déjà pas)", () => {
    expect(estExclue({ ...soir, mode: "essai" })).toBe(false);
  });
});
