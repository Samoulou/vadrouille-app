// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ecartDuCas, lireCas, refusDuCas } from "./analyse";
import { fichiersSuivis, lireFichier } from "./fichiers";

/** `confinement: environnement` (spécification P0c, section 5) : cas lus dans `donnees/cas-environnement.json`. */

const suivis = new Set(fichiersSuivis().map((f) => f.chemin));
const depot = { existe: (c: string) => suivis.has(c), lire: (c: string) => (suivis.has(c) ? lireFichier(c) : undefined) };

describe("confinement: environnement", () => {
  for (const cas of lireCas("cas-environnement.json")) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      expect(ecartDuCas(cas, refusDuCas(cas, depot)), cas.source).toBeUndefined();
    });
  }
});
