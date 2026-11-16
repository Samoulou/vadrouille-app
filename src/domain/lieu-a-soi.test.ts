// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ADDED_BY } from "@/contracts/values";

import { estAdresseDecouverte, estLieuASoi, marqueDAjout } from "./lieu-a-soi";

/**
 * Lieu à soi et adresse découverte (tâche M8b, ticket 1111 ; spécification M8 § 4.1 et § 4.3, critère M8b-1 ; décision 0160
 * § 1.4) : prédicat commun et règle pure de la marque, sur le voyage de référence (Édimbourg, 2026-08-29 au 2026-09-03).
 */
const EDIMBOURG = { start: "2026-08-29", end: "2026-09-03" };

describe("lieu à soi: prédicat commun", () => {
  it("vrai pour chaque valeur de ADDED_BY, faux sans marque", () => {
    expect(ADDED_BY).toEqual(["person", "discovered"]);
    for (const addedBy of ADDED_BY) expect(estLieuASoi({ addedBy }), addedBy).toBe(true);
    expect(estLieuASoi({})).toBe(false);
    expect(estLieuASoi({ addedBy: undefined })).toBe(false);
  });

  it("échec fermé : une marque inconnue (étape lue sans schéma) reste un lieu à soi, hors des prompts", () => {
    expect(estLieuASoi({ addedBy: "autre" })).toBe(true);
  });

  it("adresse découverte : la seule valeur discovered", () => {
    expect(estAdresseDecouverte({ addedBy: "discovered" })).toBe(true);
    expect(estAdresseDecouverte({ addedBy: "person" })).toBe(false);
    expect(estAdresseDecouverte({})).toBe(false);
  });
});

describe("lieu à soi: marque d'un ajout (spécification § 4.1)", () => {
  it.each([
    ["le 31.08 pour J3 (aujourd'hui)", 3, "2026-08-31", "discovered"],
    ["le 31.08 pour J2 (jour passé)", 2, "2026-08-31", "discovered"],
    ["le 31.08 pour J4 (jour à venir)", 4, "2026-08-31", "person"],
    ["le 20.08 pour J1 (avant le voyage)", 1, "2026-08-20", "person"],
  ] as const)("cas d'Édimbourg : %s", (_nom, jour, aujourdhui, marque) => {
    expect(marqueDAjout(EDIMBOURG, jour, aujourdhui)).toBe(marque);
  });

  it("bornes du premier et du dernier jour, comprises", () => {
    expect(marqueDAjout(EDIMBOURG, 1, "2026-08-28")).toBe("person");
    expect(marqueDAjout(EDIMBOURG, 1, "2026-08-29")).toBe("discovered");
    expect(marqueDAjout(EDIMBOURG, 2, "2026-08-29")).toBe("person");
    expect(marqueDAjout(EDIMBOURG, 6, "2026-09-02")).toBe("person");
    expect(marqueDAjout(EDIMBOURG, 6, "2026-09-03")).toBe("discovered");
    expect(marqueDAjout(EDIMBOURG, 1, "2026-09-03")).toBe("discovered");
    // Après le dernier jour : plus d'adresse découverte, même pour un jour passé.
    expect(marqueDAjout(EDIMBOURG, 6, "2026-09-04")).toBe("person");
    expect(marqueDAjout(EDIMBOURG, 1, "2026-10-01")).toBe("person");
  });

  it("changement de mois et d'année dans la date du jour visé", () => {
    expect(marqueDAjout(EDIMBOURG, 4, "2026-09-01")).toBe("discovered");
    expect(marqueDAjout(EDIMBOURG, 5, "2026-09-01")).toBe("person");
    const nouvelAn = { start: "2026-12-30", end: "2027-01-02" };
    expect(marqueDAjout(nouvelAn, 3, "2027-01-01")).toBe("discovered");
    expect(marqueDAjout(nouvelAn, 4, "2027-01-01")).toBe("person");
  });

  it("jour ou date illisibles : person (jamais discovered par défaut)", () => {
    for (const jour of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(marqueDAjout(EDIMBOURG, jour, "2026-08-31"), String(jour)).toBe("person");
    expect(marqueDAjout({ start: "pas-une-date", end: "zzzz" }, 1, "sans-date")).toBe("person");
    expect(marqueDAjout({ start: "", end: "" }, 1, "")).toBe("person");
  });
});
