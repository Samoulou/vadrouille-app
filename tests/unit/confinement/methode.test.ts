// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ecartDuCas, lireCas, refusDuCas } from "./analyse";
import { fichiersSuivis, lireFichier } from "./fichiers";

/** `confinement: méthode de détection` (spécification P0c, sections 2.2 à 2.4) : cas lus dans `donnees/cas-methode.json`. */

const suivis = new Set(fichiersSuivis().map((f) => f.chemin));
const depot = { existe: (c: string) => suivis.has(c), lire: (c: string) => (suivis.has(c) ? lireFichier(c) : undefined) };

describe("confinement: méthode de détection", () => {
  for (const cas of lireCas("cas-methode.json")) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      expect(ecartDuCas(cas, refusDuCas(cas, depot)), cas.source).toBeUndefined();
    });
  }
});
