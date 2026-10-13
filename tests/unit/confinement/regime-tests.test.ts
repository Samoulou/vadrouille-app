// @vitest-environment node
import { describe, expect, it } from "vitest";

import { demarrerServeurLocal } from "../../support/serveur-local";
import { ecartDuCas, lireCas, refusDuCas } from "./analyse";
import { fichiersSuivis, lireFichier } from "./fichiers";

/** `confinement: régime des tests` (spécification P0c, section 4, zones sensibles comprises). */

const suivis = new Set(fichiersSuivis().map((f) => f.chemin));
const depot = { existe: (c: string) => suivis.has(c), lire: (c: string) => (suivis.has(c) ? lireFichier(c) : undefined) };

describe("confinement: régime des tests", () => {
  for (const cas of lireCas("cas-regime-tests.json")) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      expect(ecartDuCas(cas, refusDuCas(cas, depot)), cas.source).toBeUndefined();
    });
  }
});

describe("confinement: serveur local de test", () => {
  it("écoute sur 127.0.0.1 et un port choisi par le système, puis se ferme", async () => {
    const serveur = await demarrerServeurLocal((_requete, reponse) => reponse.end());
    try {
      expect(serveur.hote).toBe("127.0.0.1");
      expect(serveur.port).toBeGreaterThan(0);
      expect(serveur.origine).toBe(`http://127.0.0.1:${serveur.port}`);
    } finally {
      await serveur.fermer();
    }
    await expect(serveur.fermer()).rejects.toThrow();
  });
});
