// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CODES_EXTERNES } from "@/prototype/arret";
import {
  CODES_EXTERNES_SUIVI,
  COMPTEES_MAX,
  decompte,
  RELANCES_MAX,
} from "@/server/p0/decompte";

import { arretee, executionSuivie } from "./suivi-fabrique";

/**
 * Décompte des exécutions réelles (P0a2 : 2 B et 1 A par brief). Information seulement depuis la décision 0071 : il ne
 * refuse plus aucun lancement (`tests/unit/p0/lancement.test.ts`) ; `placeLibre` lit le tableau de la page. Depuis la
 * décision 0093 (point 2, confirmée par Samuel le 2026-10-19), une exécution sans programme écrit ne compte jamais.
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

  it("seuls comptent un programme écrit et une exécution en cours ; une exécution arrêtée ne compte jamais (0093, point 2)", () => {
    const executions = [
      executionSuivie(),
      executionSuivie({ statut: "en_cours", phase: "recherche", coutModelesMicros: 0, ecouleMs: 1, canaryOk: null }),
    ];
    expect(decompte(executions, "edimbourg-1.json", "B")).toEqual({ comptees: 2, relances: 0 });
    const arretees = [
      arretee("pipeline_failed"),
      arretee("config_invalid"),
      arretee("cap_reached"),
      arretee("upstream_unavailable"),
      arretee("upstream_redirect"),
      arretee("usage_unavailable"),
      arretee("timeout"),
    ];
    expect(decompte(arretees, "edimbourg-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
    expect(decompte([...executions, ...arretees], "edimbourg-1.json", "B")).toEqual({ comptees: 2, relances: 0 });
  });

  it.each(CODES_EXTERNES_SUIVI)("une fin externe (%s) sans programme n'est ni comptée ni relance, quel qu'en soit le nombre", (code) => {
    expect(decompte([arretee(code)], "edimbourg-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
    expect(decompte([arretee(code), arretee(code), arretee(code)], "edimbourg-1.json", "B")).toEqual({ comptees: 0, relances: 0 });
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

  it("B : deux comptées puis plus de place ; A : une comptée puis plus de place ; une exécution arrêtée ne prend jamais de place", () => {
    const b = [executionSuivie(), arretee("upstream_unavailable"), arretee("pipeline_failed"), arretee("cap_reached")];
    expect(placeLibre(b, "edimbourg-1.json", "B")).toBe(true);
    expect(placeLibre([...b, executionSuivie()], "edimbourg-1.json", "B")).toBe(false);
    const a = [executionSuivie({ variante: "A" })];
    expect(placeLibre(a, "edimbourg-1.json", "A")).toBe(false);
    expect(placeLibre([arretee("usage_unavailable", { variante: "A" }), arretee("upstream_redirect", { variante: "A" })], "edimbourg-1.json", "A")).toBe(
      true,
    );
  });

  it("un essai d'intégration n'entre jamais dans le décompte, même places pleines", () => {
    const pleines = [executionSuivie(), executionSuivie(), executionSuivie({ variante: "A" })];
    const essais = [executionSuivie({ mode: "essai" }), executionSuivie({ mode: "essai", variante: "A" })];
    expect(decompte([...pleines, ...essais], "edimbourg-1.json", "B")).toEqual(decompte(pleines, "edimbourg-1.json", "B"));
    expect(decompte([...pleines, ...essais], "edimbourg-1.json", "A")).toEqual(decompte(pleines, "edimbourg-1.json", "A"));
  });
});

/**
 * Décisions 0070, 0089 et 0091 (historiques) : Samuel avait retiré du décompte des exécutions arrêtées désignées par leur
 * brief, variante, jour de quota, code d'arrêt et commit. `estExclue` et `EXECUTIONS_EXCLUES` sont supprimés (0102 § 7) :
 * la règle générale de 0093 (point 2) les couvre, `decompte()` ne compte jamais une exécution arrêtée, quel que soit son tuple.
 */
describe("p0: les exécutions arrêtées des décisions 0070, 0089 et 0091 ne comptent pas (0093, point 2)", () => {
  const TUPLES = [
    { decision: "0070", brief: "edimbourg-1.json", jourQuota: "2026-10-16", commitSha: "d61e9faefacf568ad39833e8ac611ba717e0fbdd" },
    { decision: "0089", brief: "rome-1.json", jourQuota: "2026-10-18", commitSha: "cfca0b58ccf67e4d10196adea296045ec98fdb61" },
    { decision: "0089", brief: "rome-1.json", jourQuota: "2026-10-18", commitSha: "efc0994f3e4e8eb5eb081c84b754797b980cf166" },
    { decision: "0091", brief: "rome-1.json", jourQuota: "2026-10-18", commitSha: "0d0bbaa36536cf0d26d1d3b55218d9183375b92f" },
  ] as const;

  it.each(TUPLES)("tuple de la décision $decision ($commitSha) : aucune exécution arrêtée n'est comptée, même répétée ; la même exécution écrite compte", ({ brief, jourQuota, commitSha }) => {
    const historique = arretee("pipeline_failed", { brief, jourQuota, commitSha });
    expect(decompte([historique], brief, "B")).toEqual({ comptees: 0, relances: 0 });
    expect(decompte([historique, { ...historique, id: "22222222-2222-4222-8222-222222222222" }], brief, "B")).toEqual({ comptees: 0, relances: 0 });
    expect(placeLibre([historique, historique, historique], brief, "B")).toBe(true);
    const ecrite = executionSuivie({ brief, jourQuota, commitSha });
    expect(decompte([historique, ecrite], brief, "B")).toEqual({ comptees: 1, relances: 0 });
  });

  it("les quatre tuples ensemble, avec un programme écrit du brief : seul le programme écrit compte", () => {
    const arretees = TUPLES.map(({ brief, jourQuota, commitSha }) => arretee("pipeline_failed", { brief, jourQuota, commitSha }));
    expect(decompte(arretees, "edimbourg-1.json", "B").comptees).toBe(0);
    expect(decompte(arretees, "rome-1.json", "B").comptees).toBe(0);
    expect(decompte([...arretees, executionSuivie({ brief: "rome-1.json" })], "rome-1.json", "B").comptees).toBe(1);
  });
});
