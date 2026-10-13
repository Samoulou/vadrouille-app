// @vitest-environment node
import { describe, expect, it } from "vitest";

import { avecServeurLocal, demarrerServeurLocal, type ServeurLocal } from "../../support/serveur-local";
import { ecartDuCas, lireCas, refusDuCas } from "./analyse";
import { depotSuivi } from "./fichiers";

/** `confinement: régime des tests` (spécification P0c, section 4, zones sensibles comprises). */

const depot = depotSuivi();

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

  it("avecServeurLocal ferme le serveur après le travail, même quand le travail échoue", async () => {
    let vu: ServeurLocal | undefined;
    await expect(
      avecServeurLocal(
        (_requete, reponse) => reponse.end(),
        async (serveur) => {
          vu = serveur;
          throw new Error("échec du travail");
        },
      ),
    ).rejects.toThrow("échec du travail");
    // Déjà fermé : une seconde fermeture échoue (ERR_SERVER_NOT_RUNNING).
    await expect(vu?.fermer()).rejects.toThrow();

    let reussi: ServeurLocal | undefined;
    await expect(avecServeurLocal((_requete, reponse) => reponse.end(), async (serveur) => ((reussi = serveur), 42))).resolves.toBe(42);
    await expect(reussi?.fermer()).rejects.toThrow();
  });
});
