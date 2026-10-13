// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ecartDuCas, lireCas, refusDuCas } from "./analyse";
import { fichiersSuivis, lireFichier } from "./fichiers";

/** `confinement: hôtes normalisés` (spécification P0c, section 2.5) : cas lus dans `donnees/cas-hotes.json`. */

const suivis = new Set(fichiersSuivis().map((f) => f.chemin));
const depot = { existe: (c: string) => suivis.has(c), lire: (c: string) => (suivis.has(c) ? lireFichier(c) : undefined) };

describe("confinement: hôtes normalisés", () => {
  for (const cas of lireCas("cas-hotes.json")) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      expect(ecartDuCas(cas, refusDuCas(cas, depot)), cas.source).toBeUndefined();
    });
  }
});

describe("confinement: hôtes de main couverts par leurs lignes, et seulement par elles", () => {
  for (const fichier of ["tests/e2e/carte-helpers.ts", "tests/e2e/carte.e2e.spec.ts", "src/prototype/config.ts", "src/prototype/config.test.ts"]) {
    it(fichier, () => {
      const source = lireFichier(fichier);
      const chez = refusDuCas({ id: fichier, chemin: fichier, source, attendu: "admis" }, depot);
      expect(chez.filter((c) => c.regle === "hote")).toEqual([]);
      const ailleurs = fichier.replace(/\/([^/]+)$/, "/autre-$1");
      const deplace = refusDuCas({ id: ailleurs, chemin: ailleurs, source, attendu: "refus", regle: "hote" }, depot);
      expect(deplace.some((c) => c.regle === "hote")).toBe(true);
    });
  }
});
