import { describe, expect, it } from "vitest";

import {
  paysDeVille,
  villesAvecPays,
  cleVille,
  controlerVilles,
  dateLocale,
  decalageMinutes,
  fuseauDeVille,
  fuseauReconnu,
  fuseauxDeLaTable,
  memeDecalage,
  minuitLocal,
  villesConnues,
} from "./index";

const QUART_D_HEURE_MS = 15 * 60_000;
const JOUR_MS = 86_400_000;
const DEBUT = Date.UTC(2026, 0, 1);
const FIN = Date.UTC(2031, 0, 1);

describe("fuseaux : table des villes (0087 § 4)", () => {
  it("chaque clé est déjà normalisée", () => {
    for (const cle of villesConnues()) expect(cleVille(cle)).toBe(cle);
  });

  it("chaque fuseau de la table est reconnu par le moteur JavaScript", () => {
    for (const zone of fuseauxDeLaTable()) expect(fuseauReconnu(zone)).toBe(true);
  });

  it("la clé ignore la casse, les accents, les tirets, les apostrophes et les espaces superflus", () => {
    expect(cleVille("  Édimbourg ")).toBe("edimbourg");
    expect(cleVille("Andorre-la-Vieille")).toBe("andorre la vieille");
    expect(cleVille("Saint–Marin")).not.toBe("");
    expect(fuseauDeVille("SÉVILLE")).toBe("Europe/Madrid");
    expect(fuseauDeVille("Edinburgh")).toBe("Europe/London");
    expect(fuseauDeVille("Atlantis")).toBeNull();
    expect(fuseauReconnu("Europe/Atlantis")).toBe(false);
  });

  it("décalages et changements d'heure de chaque fuseau tombent sur des quarts d'heure UTC (2026 à 2030)", () => {
    for (const zone of fuseauxDeLaTable()) {
      let precedent = decalageMinutes(zone, DEBUT);
      expect(precedent % 15).toBe(0);
      for (let jour = DEBUT + JOUR_MS; jour <= FIN; jour += JOUR_MS) {
        const courant = decalageMinutes(zone, jour);
        if (courant === precedent) continue;
        expect(courant % 15).toBe(0);
        // Pas d'un jour (deux changements ne tombent jamais le même jour), puis dichotomie sur le jour écoulé : premier instant (à la milliseconde) qui porte le nouveau décalage.
        let bas = jour - JOUR_MS;
        let haut = jour;
        while (haut - bas > 1) {
          const milieu = Math.floor((bas + haut) / 2);
          if (decalageMinutes(zone, milieu) === precedent) bas = milieu;
          else haut = milieu;
        }
        expect(haut % QUART_D_HEURE_MS).toBe(0);
        precedent = courant;
      }
    }
  });
});

describe("fuseaux : date locale", () => {
  it("rend la date du fuseau à l'instant donné", () => {
    const instant = Date.UTC(2027, 6, 13, 22, 30);
    expect(dateLocale("Europe/Paris", instant)).toBe("2027-07-14");
    expect(dateLocale("Europe/London", instant)).toBe("2027-07-13");
    expect(dateLocale("Atlantic/Reykjavik", instant)).toBe("2027-07-13");
  });
});

describe("fuseaux : minuit local", () => {
  it("rend l'instant UTC de 00:00 locale, changement d'heure compris", () => {
    expect(minuitLocal("Europe/Paris", "2027-07-14")).toBe(Date.UTC(2027, 6, 13, 22));
    expect(minuitLocal("Europe/Paris", "2027-01-14")).toBe(Date.UTC(2027, 0, 13, 23));
    expect(minuitLocal("Europe/London", "2027-10-31")).toBe(Date.UTC(2027, 9, 30, 23));
    expect(minuitLocal("Europe/London", "2027-11-01")).toBe(Date.UTC(2027, 10, 1, 0));
  });
});

describe("fuseaux : même décalage pendant les dates du voyage (0087 § 5.3)", () => {
  it("Paris et Berlin acceptés en juillet et pendant la semaine du 31 octobre 2027", () => {
    expect(memeDecalage("Europe/Paris", "Europe/Berlin", "2027-07-10", "2027-07-17")).toBe(true);
    expect(memeDecalage("Europe/Paris", "Europe/Berlin", "2027-10-28", "2027-11-04")).toBe(true);
  });

  it("Édimbourg et Paris refusés", () => {
    expect(memeDecalage("Europe/London", "Europe/Paris", "2027-07-10", "2027-07-17")).toBe(false);
  });

  it("Lisbonne et Madrid refusés", () => {
    expect(memeDecalage("Europe/Lisbon", "Europe/Madrid", "2027-07-10", "2027-07-17")).toBe(false);
  });

  it("Helsinki et Minsk acceptés en juillet 2027, refusés à travers le 31 octobre 2027", () => {
    expect(memeDecalage("Europe/Helsinki", "Europe/Minsk", "2027-07-10", "2027-07-17")).toBe(true);
    expect(memeDecalage("Europe/Helsinki", "Europe/Minsk", "2027-10-28", "2027-11-04")).toBe(false);
  });
});

describe("fuseaux : contrôle des villes d'un voyage", () => {
  it("rend le fuseau de la destination et celui de chaque ville", () => {
    expect(controlerVilles(["Paris", "Lyon", "Nice"], "2027-07-10", "2027-07-17")).toEqual({
      ok: true,
      fuseau: "Europe/Paris",
      fuseauxDesVilles: ["Europe/Paris", "Europe/Paris", "Europe/Paris"],
    });
    expect(controlerVilles(["Paris", "Berlin"], "2027-07-10", "2027-07-17")).toEqual({
      ok: true,
      fuseau: "Europe/Paris",
      fuseauxDesVilles: ["Europe/Paris", "Europe/Berlin"],
    });
  });

  it("refuse la première ville inconnue ou de décalage différent", () => {
    expect(controlerVilles(["Édimbourg", "Paris"], "2027-07-10", "2027-07-17")).toEqual({ ok: false, indice: 1, raison: "decalage" });
    expect(controlerVilles(["Paris", "Lyon", "Atlantis"], "2027-07-10", "2027-07-17")).toEqual({ ok: false, indice: 2, raison: "inconnue" });
    expect(controlerVilles(["Atlantis"], "2027-07-10", "2027-07-17")).toEqual({ ok: false, indice: 0, raison: "inconnue" });
    expect(controlerVilles([], "2027-07-10", "2027-07-17")).toEqual({ ok: false, indice: 0, raison: "inconnue" });
  });
});

describe("fuseaux : table des pays (spécification E2E-essai, lot 3, D1)", () => {
  it("mêmes villes que la table des fuseaux, chacune avec un pays non vide", () => {
    expect([...villesAvecPays()].sort()).toEqual([...villesConnues()].sort());
    for (const ville of villesAvecPays()) expect(paysDeVille(ville)?.length ?? 0, ville).toBeGreaterThan(0);
  });

  it("pays des briefs commités, clé normalisée ; ville inconnue : null", () => {
    expect(paysDeVille("Rome")).toBe("Italie");
    expect(paysDeVille("Édimbourg")).toBe("Royaume-Uni");
    expect(paysDeVille("  GENÈVE ")).toBe("Suisse");
    expect(paysDeVille("Atlantis")).toBeNull();
  });
});
