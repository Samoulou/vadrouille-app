// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ecartDuCas, lireCas, refusDuCas } from "./analyse";
import { depotSuivi, lireFichier } from "./fichiers";

/** `confinement: hôtes normalisés` (spécification P0c, section 2.5) : cas lus dans `donnees/cas-hotes.json`. */

const depot = depotSuivi();

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

// B3d (M2a ; spécification B3d, point 8, « Non-régression » ; décision 0138 § 9, ligne 10) : l'hôte de Resend et `fetch`
// ne sont admis que dans l'implémentation Resend ; la même source à côté, dans `src/server/mail/`, est refusée.
describe("confinement: hôte de Resend et fetch admis dans le seul module d'envoi réel", () => {
  const fichier = "src/server/mail/resend.ts";
  const source = lireFichier(fichier);

  it("à sa place : ni hôte ni capacité refusés", () => {
    const chez = refusDuCas({ id: fichier, chemin: fichier, source, attendu: "admis" }, depot);
    expect(chez).toEqual([]);
  });

  it("dans un autre fichier de src/server/mail/ : hôte et fetch refusés", () => {
    const ailleurs = "src/server/mail/autre-envoi.ts";
    const deplace = refusDuCas({ id: ailleurs, chemin: ailleurs, source, attendu: "refus", regle: "hote" }, depot);
    expect(deplace.some((c) => c.regle === "hote")).toBe(true);
    expect(deplace.some((c) => c.capacite === "identifiant:fetch")).toBe(true);
  });
});
