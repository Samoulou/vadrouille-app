import { describe, expect, it } from "vitest";

import {
  codePaysDeVille,
  fuseauDuPays,
  fuseauxDesPays,
  listeDesPays,
  paysDeVille,
  paysParCode,
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

  it("chaque fuseau de la table des villes et de la table des pays est reconnu par le moteur JavaScript", () => {
    for (const zone of [...fuseauxDeLaTable(), ...fuseauxDesPays()]) expect(fuseauReconnu(zone), zone).toBe(true);
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
    for (const zone of new Set([...fuseauxDeLaTable(), ...fuseauxDesPays()])) {
      let precedent = decalageMinutes(zone, DEBUT);
      expect(Math.abs(precedent % 15), zone).toBe(0); // `Math.abs` : -300 % 15 vaut -0 (fuseaux à l'ouest de Greenwich).
      for (let jour = DEBUT + JOUR_MS; jour <= FIN; jour += JOUR_MS) {
        const courant = decalageMinutes(zone, jour);
        if (courant === precedent) continue;
        expect(Math.abs(courant % 15), zone).toBe(0);
        // Pas d'un jour (deux changements ne tombent jamais le même jour), puis dichotomie sur le jour écoulé : premier instant (à la milliseconde) qui porte le nouveau décalage.
        let bas = jour - JOUR_MS;
        let haut = jour;
        while (haut - bas > 1) {
          const milieu = Math.floor((bas + haut) / 2);
          if (decalageMinutes(zone, milieu) === precedent) bas = milieu;
          else haut = milieu;
        }
        expect(haut % QUART_D_HEURE_MS, zone).toBe(0);
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

  it("chaque ville a un pays de la table, et son fuseau est l'un des fuseaux de ce pays", () => {
    for (const ville of villesConnues()) {
      const pays = paysParCode(codePaysDeVille(ville) ?? undefined);
      expect(pays, ville).not.toBeNull();
      expect(pays?.fuseaux.map((f) => f.zone), ville).toContain(fuseauDeVille(ville));
    }
  });

  it("pays des briefs commités, clé normalisée ; ville inconnue : null", () => {
    expect(paysDeVille("Rome")).toBe("Italie");
    expect(paysDeVille("Édimbourg")).toBe("Royaume-Uni");
    expect(paysDeVille("  GENÈVE ")).toBe("Suisse");
    expect(paysDeVille("Atlantis")).toBeNull();
  });
});

describe("fuseaux : villes du monde entier (demande de Samuel du 23 octobre 2026)", () => {
  it("Valence et ses variantes, Bilbao, Malaga, Grenade, Palma : Espagne, Europe/Madrid", () => {
    for (const ville of ["Valence", "Valencia", "València", "VALENCIA", "Bilbao", "Málaga", "Malaga", "Grenade", "Granada", "Palma", "Palma de Mallorca"]) {
      expect(fuseauDeVille(ville), ville).toBe("Europe/Madrid");
      expect(paysDeVille(ville), ville).toBe("Espagne");
    }
    expect(fuseauDeVille("Tenerife")).toBe("Atlantic/Canary");
  });

  it("Amérique, Asie, Afrique, Océanie : fuseau et pays de la table", () => {
    const attendus: [string, string, string][] = [
      ["New York", "America/New_York", "États-Unis"],
      ["San Francisco", "America/Los_Angeles", "États-Unis"],
      ["Montréal", "America/Toronto", "Canada"],
      ["Mexico", "America/Mexico_City", "Mexique"],
      ["Rio de Janeiro", "America/Sao_Paulo", "Brésil"],
      ["Buenos Aires", "America/Argentina/Buenos_Aires", "Argentine"],
      ["Tokyo", "Asia/Tokyo", "Japon"],
      ["Hanoï", "Asia/Ho_Chi_Minh", "Viêt Nam"],
      ["Bali", "Asia/Makassar", "Indonésie"],
      ["Katmandou", "Asia/Kathmandu", "Népal"],
      ["Marrakech", "Africa/Casablanca", "Maroc"],
      ["Le Cap", "Africa/Johannesburg", "Afrique du Sud"],
      ["Cape Town", "Africa/Johannesburg", "Afrique du Sud"],
      ["Sydney", "Australia/Sydney", "Australie"],
      ["Auckland", "Pacific/Auckland", "Nouvelle-Zélande"],
    ];
    for (const [ville, zone, pays] of attendus) {
      expect(fuseauDeVille(ville), ville).toBe(zone);
      expect(paysDeVille(ville), ville).toBe(pays);
    }
  });

  it("plusieurs centaines de villes ; Hoi An reste hors de la table (scénario « choisir le pays »)", () => {
    expect(new Set(villesConnues().map((ville) => `${fuseauDeVille(ville)}|${paysDeVille(ville)}`)).size).toBeGreaterThan(100);
    expect(villesConnues().length).toBeGreaterThan(500);
    expect(fuseauDeVille("Hoi An")).toBeNull();
  });
});

describe("fuseaux : table des pays (ville hors de la table)", () => {
  it("codes ISO à deux lettres, noms distincts ; plusieurs fuseaux : chacun a une région, sans doublon ; un seul : sans région", () => {
    const pays = listeDesPays();
    expect(pays.length).toBeGreaterThan(190);
    expect(new Set(pays.map((p) => p.nom)).size).toBe(pays.length);
    for (const p of pays) {
      expect(p.code).toMatch(/^[A-Z]{2}$/);
      expect(new Set(p.fuseaux.map((f) => f.zone)).size, p.code).toBe(p.fuseaux.length);
      if (p.fuseaux.length === 1) expect(p.fuseaux[0]?.region, p.code).toBeUndefined();
      else for (const f of p.fuseaux) expect(f.region?.length ?? 0, `${p.code} ${f.zone}`).toBeGreaterThan(0);
    }
  });

  it("triés par nom dans l'ordre français (accents compris)", () => {
    const noms = listeDesPays().map((p) => p.nom);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
    expect(noms[0]).toBe("Afghanistan");
    expect(noms.indexOf("Égypte")).toBeLessThan(noms.indexOf("Espagne"));
  });

  it("pays à plusieurs fuseaux : États-Unis, Canada, Brésil, Australie, Russie, Mexique, Indonésie", () => {
    for (const code of ["US", "CA", "BR", "AU", "RU", "MX", "ID"]) expect(paysParCode(code)?.fuseaux.length ?? 0, code).toBeGreaterThan(1);
    expect(paysParCode("US")?.fuseaux[0]).toEqual({ zone: "America/New_York", region: "Côte Est (New York, Washington, Miami)" });
  });

  it("fuseauDuPays : liste fermée ; rend la valeur de la table, jamais la chaîne reçue", () => {
    expect(fuseauDuPays("VN")).toBe("Asia/Ho_Chi_Minh");
    expect(fuseauDuPays("VN", "Asia/Ho_Chi_Minh")).toBe("Asia/Ho_Chi_Minh");
    expect(fuseauDuPays("US")).toBeNull();
    expect(fuseauDuPays("US", "America/Chicago")).toBe("America/Chicago");
    expect(fuseauDuPays("US", "Europe/Paris")).toBeNull();
    expect(fuseauDuPays("US", "america/chicago")).toBeNull();
    expect(fuseauDuPays("VN", "Asia/Bangkok")).toBeNull();
    expect(fuseauDuPays("XX", "Europe/Paris")).toBeNull();
    expect(fuseauDuPays(undefined)).toBeNull();
    expect(paysParCode("VN")?.nom).toBe("Viêt Nam");
    expect(paysParCode("XX")).toBeNull();
  });
});
