// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ecartDuCas, lireCas, refusDuCas } from "./analyse";
import { depotSuivi } from "./fichiers";
import { programmeDeCas } from "./programme";

/**
 * `confinement: accès calculés` (spécification P0c, section 2.6 ; décision 0038, P0c-TL-5 point 4). Les cas typés sont
 * jugés par un programme de cas construit une fois ici (fichiers virtuels distincts, mêmes options que le dépôt) ;
 * les cas de règle fermée (zone sensible, `.mjs`) sont analysés sans vérificateur.
 */

const depot = depotSuivi();
const cas = lireCas("cas-acces-calcules.json");
const types = cas.filter((c) => c.typage);
const nomVirtuel = (id: string) => `${id}.${types.find((c) => c.id === id)?.chemin.endsWith(".tsx") ? "tsx" : "ts"}`;
const programme = programmeDeCas(types.map((c) => ({ nom: nomVirtuel(c.id), source: c.source })));

describe("confinement: accès calculés", () => {
  for (const c of cas) {
    it(`${c.id} (${c.attendu}${c.regle ? ` par ${c.regle}` : ""})`, () => {
      const typage = c.typage ? { verificateur: programme.verificateur, arbre: programme.fichier(nomVirtuel(c.id)) } : undefined;
      expect(ecartDuCas(c, refusDuCas(c, depot, typage)), c.source).toBeUndefined();
    });
  }
});
