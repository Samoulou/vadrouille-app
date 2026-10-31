// @vitest-environment node
import { describe, expect, it } from "vitest";

import { estUnAjout } from "./annulation";

/**
 * Reconnaissance d'un ajout d'une personne pour `undoAddPlace` (tâche M5d-6, ticket 994 ; décision 0155 § 4.1 ; revue de la
 * PR 996, mineur 2) : fonction pure ; le cas d'usage complet est sous `tests/db/lieu-a-soi.test.ts`.
 */

const REQUETE = "0d000000-0000-4000-8000-0000000000cc";
const ADD = { op: "add", stopId: `ajout-${REQUETE}`, kind: "activity", day: 2, time: "16:00", name: "Mon café", placeId: "SENTINELLE_PLACE" };
const LOCK = { op: "lock", stopId: `ajout-${REQUETE}` };
const patch = (operations: unknown[]) => ({ requestId: REQUETE, baseVersion: 1, operations });

describe("estUnAjout (M5d-6)", () => {
  it("accepte un patch [add, lock] d'une personne sur un même stopId ajout-…", () => {
    expect(estUnAjout("user", patch([ADD, LOCK]))).toBe(true);
  });

  it("refuse : stopId différents, hors du préfixe ajout-, auteur workflow ou engine, 1 ou 3 opérations, ordre inversé, patch illisible ou absent", () => {
    expect(estUnAjout("user", patch([ADD, { ...LOCK, stopId: "ajout-autre" }]))).toBe(false);
    expect(estUnAjout("user", patch([{ ...ADD, stopId: "j2-diner" }, { ...LOCK, stopId: "j2-diner" }]))).toBe(false);
    expect(estUnAjout("workflow", patch([ADD, LOCK]))).toBe(false);
    expect(estUnAjout("engine", patch([ADD, LOCK]))).toBe(false);
    expect(estUnAjout("user", patch([ADD]))).toBe(false);
    expect(estUnAjout("user", patch([ADD, LOCK, LOCK]))).toBe(false);
    expect(estUnAjout("user", patch([LOCK, ADD]))).toBe(false);
    expect(estUnAjout("user", { operations: [ADD, LOCK] })).toBe(false);
    expect(estUnAjout("user", "[add, lock]")).toBe(false);
    expect(estUnAjout("user", null)).toBe(false);
  });
});
