// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ecartDuCas, lectureSecreteAdmise, lireCas, refusDuCas } from "./analyse";
import { depotSuivi } from "./fichiers";

/** `confinement: environnement` (spécification P0c, section 5) : cas lus dans `donnees/cas-environnement.json`. */

const depot = depotSuivi();

describe("confinement: environnement", () => {
  for (const cas of lireCas("cas-environnement.json")) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      expect(ecartDuCas(cas, refusDuCas(cas, depot)), cas.source).toBeUndefined();
    });
  }
});

describe("confinement: absence de l'exception de 0040 D1 (tests/unit/p0/cli.test.ts ; retirée par ticket 221, décision 0042)", () => {
  for (const cas of lireCas("cas-absence-exception-d1.json")) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      expect(ecartDuCas(cas, refusDuCas(cas, depot)), cas.source).toBeUndefined();
    });
  }
});

/**
 * Admission des noms secrets de la base (revue du head a89d9a5, PR 244, bloquant 1) : `lectureSecreteAdmise` vaut pour
 * `db/connection.ts` et `db/migrate.ts` exactement, jamais pour un chemin proche. Cas `env-b1-*` de
 * `donnees/cas-environnement.json` ; ici, la fonction elle-même et la règle des refus dans les fichiers admis.
 */
describe("confinement: noms secrets de la base, deux fichiers exacts (B1)", () => {
  it("admet db/connection.ts et db/migrate.ts", () => {
    expect(lectureSecreteAdmise("db/connection.ts")).toBe(true);
    expect(lectureSecreteAdmise("db/migrate.ts")).toBe(true);
  });

  it.each([
    "db/index.ts",
    "db/schema/x.ts",
    "db/connection.test.ts",
    "db/connection.mts",
    "db/connection.tsx",
    "db/connection/index.ts",
    "db/migrate.test.ts",
    "db/migrations/migrate.ts",
    "./db/connection.ts",
    "/db/connection.ts",
    "DB/connection.ts",
    "src/db/connection.ts",
    "tests/db/env.ts",
    "tests/db/connection.ts",
    "scripts/migrate.ts",
  ])("refuse %s", (chemin) => {
    expect(lectureSecreteAdmise(chemin)).toBe(false);
  });

  it("dans un fichier admis, un nom secret sans ligne est refusé par absence de ligne, pas par la règle nom-secret", () => {
    const cas = lireCas("cas-environnement.json").filter((c) => c.id.startsWith("env-b1-refus-") && lectureSecreteAdmise(c.chemin));
    expect(cas.length).toBeGreaterThan(0);
    for (const c of cas) {
      const refus = refusDuCas(c, depot);
      expect(refus.map((r) => r.regle), c.id).toContain("environnement");
      expect(refus.map((r) => r.regle), c.id).not.toContain("nom-secret");
    }
  });
});
