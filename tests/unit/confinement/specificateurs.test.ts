// @vitest-environment node
import { describe, expect, it } from "vitest";

import { analyserPackageJson, ecartDuCas, lireCas, refusDuCas, type Cas } from "./analyse";
import { depotSuivi, lireFichier } from "./fichiers";
import { CONSTRUITS, PAQUETS } from "./listes/paquets";

/** `confinement: spécificateurs et paquets` (spécification P0c, section 6) : cas lus dans `donnees/cas-specificateurs.json`. */

const depot = depotSuivi();

type Json = { [cle: string]: unknown };
const estObjet = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
function fusionner(base: Json, ajout: Json): Json {
  const resultat: Json = { ...base };
  for (const [cle, valeur] of Object.entries(ajout)) {
    const existant = resultat[cle];
    resultat[cle] = estObjet(existant) && estObjet(valeur) ? fusionner(existant, valeur) : valeur;
  }
  return resultat;
}

function refusPackage(cas: Cas) {
  const reel = JSON.parse(lireFichier("package.json")) as Json;
  const source = JSON.stringify(fusionner(reel, JSON.parse(cas.source) as Json));
  return analyserPackageJson(source, PAQUETS, CONSTRUITS).filter((c) => !c.admis);
}

describe("confinement: spécificateurs et paquets", () => {
  for (const cas of lireCas("cas-specificateurs.json")) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      const refus = cas.fusion ? refusPackage(cas) : refusDuCas(cas, depot);
      expect(ecartDuCas(cas, refus), cas.source).toBeUndefined();
    });
  }

  it("le package.json réel passe", () => {
    expect(analyserPackageJson(lireFichier("package.json"), PAQUETS, CONSTRUITS).filter((c) => !c.admis)).toEqual([]);
  });
});
