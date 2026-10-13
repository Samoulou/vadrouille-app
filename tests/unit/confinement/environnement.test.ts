// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ecartDuCas, lireCas, refusDuCas } from "./analyse";
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

describe("confinement: exception transitoire de 0040 D1 (tests/unit/p0/cli.test.ts)", () => {
  for (const cas of lireCas("cas-exception-d1.json")) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      expect(ecartDuCas(cas, refusDuCas(cas, depot)), cas.source).toBeUndefined();
    });
  }
});
