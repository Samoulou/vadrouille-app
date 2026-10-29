import { describe, expect, it } from "vitest";

import {
  codePaysDeVille,
  distanceKm,
  fuseauParPosition,
  villeDuPays,
  villeMvpDuPays,
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
  villesDuMvp,
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

  it("plusieurs centaines de villes ; Hoi An reste hors de la table (scénario « ville choisie dans les suggestions »)", () => {
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
    // Repères maison (positions de villes, pour `fuseauParPosition`) en plus : la zone et la région restent celles-ci.
    expect(paysParCode("US")?.fuseaux[0]).toMatchObject({ zone: "America/New_York", region: "Côte Est (New York, Washington, Miami)" });
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

describe("fuseaux : ville choisie dans les suggestions (demande de Samuel du 23 octobre 2026)", () => {
  it("villeDuPays : nom maison et fuseau d'une ville de la table, dans ce pays seulement", () => {
    expect(villeDuPays("valencia", "ES")).toEqual({ nom: "Valence", zone: "Europe/Madrid" });
    expect(villeDuPays("València", "ES")?.nom).toBe("Valence");
    // Même nom, autre pays (Valencia, Venezuela) : la table ne s'applique pas, la destination reste le texte tapé.
    expect(villeDuPays("Valencia", "VE")).toBeNull();
    expect(villeDuPays("Hoi An", "VN")).toBeNull();
    expect(villeDuPays("Rome", "XX")).toBeNull();
  });

  it("distanceKm : grand cercle (Paris–Londres, environ 344 km ; nulle pour un même point)", () => {
    const paris = { lat: 48.857, lng: 2.352 };
    expect(distanceKm(paris, paris)).toBe(0);
    expect(distanceKm(paris, { lat: 51.507, lng: -0.128 })).toBeGreaterThan(330);
    expect(distanceKm(paris, { lat: 51.507, lng: -0.128 })).toBeLessThan(360);
  });

  it("fuseauParPosition : seul fuseau du pays, ou repère maison le plus proche ; valeurs de la table", () => {
    expect(fuseauParPosition("VN", { lat: 15.88, lng: 108.33 })).toBe("Asia/Ho_Chi_Minh");
    expect(fuseauParPosition("FR", { lat: 0, lng: 0 })).toBe("Europe/Paris");
    expect(fuseauParPosition("US", { lat: 35.6, lng: -82.55 })).toBe("America/New_York");
    expect(fuseauParPosition("US", { lat: 30.27, lng: -97.74 })).toBe("America/Chicago");
    expect(fuseauParPosition("US", { lat: 37.77, lng: -122.42 })).toBe("America/Los_Angeles");
    expect(fuseauParPosition("AU", { lat: -31.95, lng: 115.86 })).toBe("Australia/Perth");
    expect(fuseauParPosition("ES", { lat: 28.29, lng: -16.63 })).toBe("Atlantic/Canary");
    expect(fuseauParPosition("ES", { lat: 39.47, lng: -0.38 })).toBe("Europe/Madrid");
    expect(fuseauParPosition("XX", { lat: 0, lng: 0 })).toBeNull();
    expect(fuseauParPosition("US", { lat: Number.NaN, lng: 0 })).toBeNull();
  });

  it("fuseauParPosition, cas limites des pays à plusieurs fuseaux (mineur 19 de la revue du head `aa77422`, décision 0129)", () => {
    const cas: [string, string, number, number, string][] = [
      // États-Unis : villes proches d'une limite de fuseau.
      ["El Paso", "US", 31.76, -106.49, "America/Denver"],
      ["Detroit", "US", 42.33, -83.05, "America/New_York"],
      ["Indianapolis", "US", 39.77, -86.16, "America/New_York"],
      ["Louisville", "US", 38.25, -85.76, "America/New_York"],
      ["Knoxville", "US", 35.96, -83.92, "America/New_York"],
      ["Nashville", "US", 36.16, -86.78, "America/Chicago"],
      ["Pensacola", "US", 30.42, -87.22, "America/Chicago"],
      // Texas du nord (heure du Centre) : repères d'Amarillo et de Lubbock, sans quoi Denver serait le plus proche.
      ["Amarillo", "US", 35.22, -101.83, "America/Chicago"],
      ["Lubbock", "US", 33.58, -101.85, "America/Chicago"],
      ["Boise", "US", 43.62, -116.2, "America/Denver"],
      ["Phoenix", "US", 33.45, -112.07, "America/Phoenix"],
      // Autres pays à plusieurs fuseaux.
      ["Thunder Bay", "CA", 48.38, -89.25, "America/Toronto"],
      ["Regina", "CA", 50.45, -104.61, "America/Regina"],
      ["Broken Hill", "AU", -31.95, 141.45, "Australia/Adelaide"],
      ["Darwin", "AU", -12.46, 130.84, "Australia/Darwin"],
      ["Cancún", "MX", 21.16, -86.85, "America/Cancun"],
      ["Tijuana", "MX", 32.51, -117.04, "America/Tijuana"],
      ["Manaus", "BR", -3.12, -60.02, "America/Manaus"],
      ["Kaliningrad", "RU", 54.71, 20.51, "Europe/Kaliningrad"],
      ["Iekaterinbourg", "RU", 56.84, 60.6, "Asia/Yekaterinburg"],
    ];
    for (const [ville, pays, lat, lng, zone] of cas) expect(fuseauParPosition(pays, { lat, lng }), ville).toBe(zone);
  });

  it("fuseauParPosition, positions hors repère près d'une limite (mineur 6 de la revue du head de4ab92)", () => {
    // Aucune de ces positions n'est un repère : le repère le plus proche doit tomber du bon côté de la limite. Panama
    // City (Chicago), Tallahassee et Apalachicola (New York), Mildura (Sydney) et Mount Gambier (Adélaïde) sont des repères
    // ajoutés pour ces limites.
    const cas: [string, string, number, number, string][] = [
      ["Evansville", "US", 37.97, -87.57, "America/Chicago"],
      ["Odessa (Texas)", "US", 31.85, -102.37, "America/Chicago"],
      ["Cincinnati", "US", 39.1, -84.51, "America/New_York"],
      ["Chattanooga", "US", 35.05, -85.31, "America/New_York"],
      ["Huntsville", "US", 34.73, -86.59, "America/Chicago"],
      ["Columbus (Géorgie)", "US", 32.46, -84.99, "America/New_York"],
      ["Dothan", "US", 31.22, -85.39, "America/Chicago"],
      ["Marianna", "US", 30.77, -85.23, "America/Chicago"],
      ["Quincy (Floride)", "US", 30.59, -84.58, "America/New_York"],
      ["Port St. Joe", "US", 29.81, -85.3, "America/New_York"],
      ["Destin", "US", 30.39, -86.5, "America/Chicago"],
      ["Rapid City", "US", 44.08, -103.23, "America/Denver"],
      ["Spokane", "US", 47.66, -117.43, "America/Los_Angeles"],
      ["Sault Ste. Marie (Ontario)", "CA", 46.52, -84.35, "America/Toronto"],
      ["Kenora", "CA", 49.77, -94.49, "America/Winnipeg"],
      ["Robinvale", "AU", -34.58, 142.77, "Australia/Sydney"],
      ["Naracoorte", "AU", -36.96, 140.74, "Australia/Adelaide"],
      ["Tennant Creek", "AU", -19.65, 134.19, "Australia/Darwin"],
    ];
    const reperes = new Set(listeDesPays().flatMap((pays) => pays.fuseaux.flatMap((fuseau) => (fuseau.reperes ?? []).map((repere) => repere.join(",")))));
    for (const [ville, pays, lat, lng, zone] of cas) {
      expect(reperes.has(`${lat},${lng}`), `${ville} n'est pas un repère`).toBe(false);
      expect(fuseauParPosition(pays, { lat, lng }), ville).toBe(zone);
    }
  });

  it("chaque pays à plusieurs fuseaux a au moins un repère par fuseau ; un repère est une position valide", () => {
    for (const pays of listeDesPays()) {
      if (pays.fuseaux.length < 2) continue;
      for (const fuseau of pays.fuseaux) {
        expect(fuseau.reperes?.length ?? 0, `${pays.code} ${fuseau.zone}`).toBeGreaterThan(0);
        for (const [lat = Number.NaN, lng = Number.NaN] of fuseau.reperes ?? []) {
          expect(Math.abs(lat), `${pays.code} ${fuseau.zone}`).toBeLessThanOrEqual(90);
          expect(Math.abs(lng), `${pays.code} ${fuseau.zone}`).toBeLessThanOrEqual(180);
        }
        // Le repère d'un fuseau le désigne lui-même.
        const [lat = Number.NaN, lng = Number.NaN] = fuseau.reperes?.[0] ?? [];
        expect(fuseauParPosition(pays.code, { lat, lng }), `${pays.code} ${fuseau.zone}`).toBe(fuseau.zone);
      }
    }
  });
});

describe("fuseaux : table du MVP isolée de la table élargie (décision 0129 § 8)", () => {
  it("les 62 clés d'origine, chacune au même fuseau dans la table élargie ; `controlerVilles` ne lit qu'elles", () => {
    const mvp = villesDuMvp();
    expect(mvp).toHaveLength(62);
    for (const cle of mvp) expect(villesConnues(), cle).toContain(cle);
    for (const cle of mvp) expect(controlerVilles([cle], "2027-07-10", "2027-07-12").ok, cle).toBe(true);
    // Villes de la seule table élargie (site d'essai) : inconnues du MVP.
    for (const ville of ["Valence", "Bilbao", "Kyoto", "Tokyo", "New York"]) {
      expect(fuseauDeVille(ville), ville).not.toBeNull();
      expect(controlerVilles([ville], "2027-07-10", "2027-07-12"), ville).toEqual({ ok: false, indice: 0, raison: "inconnue" });
    }
  });
});

// Décision 0141 § 8.2 (T18, PR 880) : recherche de ville de l'écran 1 de `api`, bornée aux 62 villes du MVP.
describe("villeMvpDuPays", () => {
  it("Lisbonne au Portugal admise ; Valence en Espagne refusée (hors des 62) ; ville des 62 dans un autre pays refusée", () => {
    expect(villeMvpDuPays("Lisbonne", "PT")).toEqual({ nom: "Lisbonne", zone: "Europe/Lisbon" });
    expect(villeMvpDuPays("lisbonne", "PT")).toEqual({ nom: "Lisbonne", zone: "Europe/Lisbon" });
    // Valence est dans la table élargie du site d'essai, pas dans les 62 villes du MVP.
    expect(villeDuPays("Valence", "ES")).not.toBeNull();
    expect(villeMvpDuPays("Valence", "ES")).toBeNull();
    expect(villeMvpDuPays("Lisbonne", "ES")).toBeNull();
    expect(villeMvpDuPays("Paris", "US")).toBeNull();
    // Chaque ville admise est une clé de la table du MVP, donc admise par `controlerVilles`.
    for (const cle of villesDuMvp()) {
      const code = codePaysDeVille(cle);
      if (code === null) continue;
      const ville = villeMvpDuPays(cle, code);
      if (ville !== null) expect(villesDuMvp(), cle).toContain(cleVille(ville.nom));
    }
  });
});
