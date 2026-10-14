// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { ancrerCandidatsDansZone, ancrerLogementsDuSejour, capacitesAncrage, type CapacitesAncrage } from "@/grounding/ancrage-zone";
import { fichesEtapeFinale, fichesLogementsEtapeFinale, margeRemplacement, preTriParCache } from "@/grounding/fiches-finales";
import { ErreurAncrage, type ClientPlaces, type DetailsLieu, type RequeteTextSearch } from "@/grounding/interfaces";
import { creerPlacesSimule, type FixturesPlaces } from "@/grounding/places.simule";
import { dansZone, zoneDuSejour } from "@/grounding/zone";
import { BriefSchema, type Brief } from "@/prototype/brief";

/**
 * Ancrage et fiches de `p0Run` (décision 0055, section 6 points 3 et 4 ; section 3 point 5) sur le double de Places à
 * valeurs sentinelles, espionné : aucune donnée réelle de Google.
 */

const BRIEF: Brief = BriefSchema.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, "../../prototype/briefs/edimbourg-1.json"), "utf8")));
const DEUX_LOGEMENTS: Brief = BriefSchema.parse({
  ...BRIEF,
  logements: [
    { texte: "Logement A", nuits: 2 },
    { texte: "Logement B", nuits: 3 },
  ],
});

const lieu = (placeId: string, lat: number, lng: number, statut: DetailsLieu["statut"] = "OPERATIONAL") => ({
  placeId,
  statut,
  position: { lat, lng },
  horaires: [{ jour: 1, debut: 600, fin: 1080 }],
  nom: "SENTINELLE-NOM-GOOGLE",
  adresse: "SENTINELLE-ADRESSE",
  note: 4.9,
  niveauPrix: "SENTINELLE-PRIX",
});

const FIXTURES: FixturesPlaces = {
  lieux: {
    "Vieille ville d'Édimbourg (Old Town)": lieu("SENT_LOGEMENT_1", 55.9533123, -3.1883123),
    "Logement A": lieu("SENT_LOGEMENT_A", 55.95, -3.19),
    "Logement B": lieu("SENT_LOGEMENT_B", 55.97, -3.17),
    Musée: lieu("SENT_MUSEE", 55.947, -3.19),
    Fermé: lieu("SENT_FERME", 55.95, -3.2, "CLOSED_PERMANENTLY"),
    Temporaire: lieu("SENT_TEMPORAIRE", 55.95, -3.21, "CLOSED_TEMPORARILY"),
    Loin: lieu("SENT_LOIN", 51.5, -0.12),
    Bar: lieu("SENT_BAR", 55.96, -3.18),
    Café: lieu("SENT_CAFE", 55.951, -3.185),
  },
};

function espion() {
  const simule = creerPlacesSimule(FIXTURES);
  const recherches: RequeteTextSearch[] = [];
  const fiches: string[] = [];
  const places: ClientPlaces = {
    textSearch: vi.fn(async (requete: RequeteTextSearch) => {
      recherches.push(requete);
      return simule.textSearch(requete);
    }),
    details: vi.fn(async (placeId: string) => {
      fiches.push(placeId);
      return simule.details(placeId);
    }),
  };
  return { places, recherches, fiches };
}

describe("p0: aucune fiche de candidat à l'ancrage", () => {
  it("logements : une fiche chacun ; candidats : Text Search seulement, aucun appel details", async () => {
    const { places, recherches, fiches } = espion();
    const capacites = capacitesAncrage(places);
    const { logements, zone } = await ancrerLogementsDuSejour(DEUX_LOGEMENTS, capacites);
    expect(logements.map((l) => l.placeId)).toEqual(["SENT_LOGEMENT_A", "SENT_LOGEMENT_B"]);
    expect(fiches).toEqual(["SENT_LOGEMENT_A", "SENT_LOGEMENT_B"]);
    const candidats = [
      { id: "c_001", nom: "Musée" },
      { id: "c_002", nom: "Fermé" },
      { id: "c_003", nom: "Inconnu" },
    ];
    const ancrages = await ancrerCandidatsDansZone(candidats, DEUX_LOGEMENTS.destination, capacites, zone);
    expect([...ancrages]).toEqual([
      ["c_001", { resolu: true, placeId: "SENT_MUSEE" }],
      ["c_002", { resolu: true, placeId: "SENT_FERME" }],
      ["c_003", { resolu: false }],
    ]);
    // Aucune fiche de plus que celles des logements.
    expect(fiches).toEqual(["SENT_LOGEMENT_A", "SENT_LOGEMENT_B"]);
    expect(places.details).toHaveBeenCalledTimes(2);
    // Aucun champ Google (nom, adresse, note, prix, statut, position) dans l'ancrage d'un candidat.
    expect(JSON.stringify([...ancrages])).not.toMatch(/SENTINELLE|55\.9|OPERATIONAL|CLOSED/);
    expect(recherches.slice(2).every((r) => r.restriction !== undefined)).toBe(true);
  });

  it("detailsLogement : entrée = un logement du brief ; indice hors du brief refusé ; une seule fiche par logement", async () => {
    const { places, fiches } = espion();
    const capacites = capacitesAncrage(places);
    for (const indice of [-1, 1, 1.5, Number.NaN]) {
      await expect(capacites.detailsLogement(BRIEF, indice)).rejects.toEqual(new ErreurAncrage("lodging_unresolved"));
    }
    const premiere = await capacites.detailsLogement(BRIEF, 0);
    const seconde = await capacites.detailsLogement(BRIEF, 0);
    expect(seconde).toBe(premiere);
    expect(fiches).toEqual(["SENT_LOGEMENT_1"]);
  });

  it("forme de l'objet d'ancrage : textSearch et detailsLogement, aucune autre clé (ni details, ni client complet)", () => {
    expectTypeOf<keyof CapacitesAncrage>().toEqualTypeOf<"textSearch" | "detailsLogement">();
    expectTypeOf<CapacitesAncrage["detailsLogement"]>().parameters.toEqualTypeOf<[Brief, number]>();
    expect(Object.keys(capacitesAncrage(espion().places)).sort()).toEqual(["detailsLogement", "textSearch"]);
  });

  it("logement fermé définitivement ou introuvable : lodging_unresolved", async () => {
    const ferme = BriefSchema.parse({ ...BRIEF, logements: [{ texte: "Fermé", nuits: 5 }] });
    const absent = BriefSchema.parse({ ...BRIEF, logements: [{ texte: "Nulle part", nuits: 5 }] });
    for (const brief of [ferme, absent]) {
      await expect(ancrerLogementsDuSejour(brief, capacitesAncrage(espion().places))).rejects.toEqual(new ErreurAncrage("lodging_unresolved"));
    }
  });
});

describe("p0: Text Search restreint à la zone", () => {
  it("requête capturée : restriction au rectangle des logements, sans biais", async () => {
    const { places, recherches } = espion();
    const capacites = capacitesAncrage(places);
    const { logements, zone } = await ancrerLogementsDuSejour(DEUX_LOGEMENTS, capacites);
    await ancrerCandidatsDansZone([{ id: "c_001", nom: "Musée" }], "Édimbourg", capacites, zone);
    const derniere = recherches.at(-1);
    expect(derniere).toEqual({ texte: "Musée, Édimbourg", biais: null, restriction: zone });
    // Le rectangle couvre les deux logements et les cercles de 30 km autour d'eux.
    expect(zone).toEqual(zoneDuSejour(logements.map((l) => l.position), 30_000));
    for (const logement of logements) expect(dansZone(logement.position, zone)).toBe(true);
    // Les logements eux-mêmes ne sont ni biaisés ni restreints (ils fixent la zone).
    expect(recherches.slice(0, 2).map((r) => [r.biais, r.restriction])).toEqual([
      [null, undefined],
      [null, undefined],
    ]);
  });
});

describe("p0: fiches de l'étape finale bornées à la première série et à sa marge", () => {
  const ZONE = zoneDuSejour([{ lat: 55.95, lng: -3.19 }], 30_000);
  const classement = [
    { id: "c_001", placeId: "SENT_MUSEE" },
    { id: "c_002", placeId: "SENT_FERME" },
    { id: "c_003", placeId: "SENT_LOIN" },
    { id: "c_004", placeId: "SENT_ABSENT" },
    { id: "c_005", placeId: "SENT_BAR" },
    { id: "c_006", placeId: "SENT_CAFE" },
    { id: "c_007", placeId: "SENT_TEMPORAIRE" },
  ];

  it("jamais plus de premiereSerie + marge fiches ; série complète quand la marge suffit", async () => {
    const { places, fiches } = espion();
    const issue = await fichesEtapeFinale(classement, places, ZONE, { premiereSerie: 2, marge: 3 });
    expect(issue.retenus.map((r) => r.id)).toEqual(["c_001", "c_005"]);
    expect(issue).toMatchObject({ fiches: 5, complete: true });
    expect(fiches).toEqual(["SENT_MUSEE", "SENT_FERME", "SENT_LOIN", "SENT_ABSENT", "SENT_BAR"]);
  });

  it("marge épuisée : série incomplète, aucune fiche au-delà du plafond", async () => {
    const { places, fiches } = espion();
    const issue = await fichesEtapeFinale(classement, places, ZONE, { premiereSerie: 3, marge: 1 });
    expect(issue).toMatchObject({ fiches: 4, complete: false });
    expect(issue.retenus.map((r) => r.id)).toEqual(["c_001"]);
    expect(fiches).toHaveLength(4);
  });

  it("deux candidats du même lieu : une seule fiche", async () => {
    const { places, fiches } = espion();
    const issue = await fichesEtapeFinale(
      [
        { id: "c_001", placeId: "SENT_MUSEE" },
        { id: "c_002", placeId: "SENT_MUSEE" },
      ],
      places,
      ZONE,
      { premiereSerie: 2, marge: 0 },
    );
    expect(issue.retenus.map((r) => r.id)).toEqual(["c_001", "c_002"]);
    expect(fiches).toEqual(["SENT_MUSEE"]);
  });

  it("une erreur du client autre que place_not_found arrête l'étape", async () => {
    const places = { details: vi.fn(async () => Promise.reject(new ErreurAncrage("routes_unavailable"))) };
    await expect(fichesEtapeFinale(classement, places, ZONE, { premiereSerie: 1, marge: 1 })).rejects.toEqual(new ErreurAncrage("routes_unavailable"));
  });

  it("marge de remplacement : max(minimum, ⌈part × première série⌉), bornes refusées", async () => {
    const regle = { minimum: 4, part: 0.2 };
    expect([14, 32, 50, 58].map((n) => margeRemplacement(n, regle))).toEqual([4, 7, 10, 12]);
    expect(() => margeRemplacement(-1, regle)).toThrow(RangeError);
    expect(() => margeRemplacement(10, { minimum: 4, part: 1.5 })).toThrow(RangeError);
    await expect(fichesEtapeFinale([], espion().places, ZONE, { premiereSerie: 1, marge: -1 })).rejects.toThrow(RangeError);
  });
});

describe("p0: lieu fermé définitivement écarté à l'étape finale et remplacé", () => {
  it("sentinelle CLOSED_PERMANENTLY : absente des retenus, remplacée par le suivant du classement", async () => {
    const zone = zoneDuSejour([{ lat: 55.95, lng: -3.19 }], 30_000);
    const { places } = espion();
    const issue = await fichesEtapeFinale(
      [
        { id: "c_001", placeId: "SENT_FERME" },
        { id: "c_002", placeId: "SENT_BAR" },
      ],
      places,
      zone,
      { premiereSerie: 1, marge: 1 },
    );
    expect(issue.retenus.map((r) => r.id)).toEqual(["c_002"]);
    expect(JSON.stringify(issue)).not.toContain("SENT_FERME");
    // Sans marge : case vide (série incomplète), jamais le lieu fermé.
    const sansMarge = await fichesEtapeFinale([{ id: "c_001", placeId: "SENT_FERME" }], places, zone, { premiereSerie: 1, marge: 0 });
    expect(sansMarge).toMatchObject({ retenus: [], complete: false });
  });

  it("fermé temporairement : gardé (le moteur et la validation en décident)", async () => {
    const zone = zoneDuSejour([{ lat: 55.95, lng: -3.19 }], 30_000);
    const issue = await fichesEtapeFinale([{ id: "c_001", placeId: "SENT_TEMPORAIRE" }], espion().places, zone, { premiereSerie: 1, marge: 0 });
    expect(issue.retenus.map((r) => r.ancrage.statut)).toEqual(["ferme_temporairement"]);
  });
});

describe("p0: logements relus à l'étape finale ; pré-tri par le cache", () => {
  it("une fiche par logement ; fermé ou introuvable : lodging_unresolved", async () => {
    const { places, fiches } = espion();
    const relus = await fichesLogementsEtapeFinale(["SENT_LOGEMENT_A", "SENT_LOGEMENT_B"], places);
    expect(relus.map((l) => l.placeId)).toEqual(["SENT_LOGEMENT_A", "SENT_LOGEMENT_B"]);
    expect(fiches).toHaveLength(2);
    await expect(fichesLogementsEtapeFinale(["SENT_FERME"], places)).rejects.toEqual(new ErreurAncrage("lodging_unresolved"));
    await expect(fichesLogementsEtapeFinale(["SENT_ABSENT"], places)).rejects.toEqual(new ErreurAncrage("lodging_unresolved"));
  });

  it("seul un candidat dont la position en cache est hors de la zone est écarté sans fiche ; sans cache, jamais", () => {
    const zone = zoneDuSejour([{ lat: 55.95, lng: -3.19 }], 30_000);
    const classement = [
      { id: "c_001", placeId: "P_SANS_CACHE" },
      { id: "c_002", placeId: "P_CACHE_DEDANS" },
      { id: "c_003", placeId: "P_CACHE_DEHORS" },
    ];
    const cache = new Map([
      ["P_CACHE_DEDANS", { lat: 55.96, lng: -3.2 }],
      ["P_CACHE_DEHORS", { lat: 51.5, lng: -0.12 }],
    ]);
    const gardes = preTriParCache(classement, cache, zone);
    expect(gardes).toEqual([classement[0], classement[1]]);
    // La position du cache ne sort pas du pré-tri.
    expect(JSON.stringify(gardes)).not.toMatch(/55\.96|51\.5/);
  });
});
