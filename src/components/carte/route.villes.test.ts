// @vitest-environment node
import { describe, expect, it } from "vitest";

import { edimbourg } from "@/mocks/edimbourg";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";

import {
  carteDe,
  deplacerTerminus,
  jourDe,
  nomsDesVilles,
  parisBerlin,
  romeFlorence,
  romeFlorenceRome,
  sansEtapes,
  villesParJour,
} from "../../../tests/unit/carte-villes-fixtures";

import {
  anneauVisible,
  buildCityOverview,
  buildDayRoute,
  buildOverview,
  moitieInitiale,
  ZOOM_ANNEAUX_PAR_VILLE,
  ZOOM_POSITION_SEULE,
} from "./route";
import { coteEtiquette, placerEtiquettes, type Box, type EtiquetteAPlacer } from "./etiquettes";

const overviewOf = ({ trip, maps }: typeof romeFlorence) => buildCityOverview(trip.days, maps, villesParJour(trip), nomsDesVilles(trip));
const ECARTS = { ecart: 4, marge: 8 };

describe("M4-suite-carte: règles de Ligne inchangées", () => {
  it("le jour J3, aucun tronçon entre la dernière étape avant le transfer et la première après", () => {
    const route = buildDayRoute(jourDe(romeFlorence.trip, 3), carteDe(romeFlorence.maps, 3));
    const avant = route.stops.find((stop) => stop.stopId === "cv-j3-depart-2")!.position;
    const apres = route.stops.find((stop) => stop.stopId === "cv-j3-arrivee")!.position;
    expect(route.legs).toHaveLength(3);
    for (const leg of route.legs) {
      expect([leg.from, leg.to]).not.toEqual(expect.arrayContaining([avant, apres]));
      const traverse = (leg.from === avant && leg.to === apres) || (leg.from === apres && leg.to === avant);
      expect(traverse).toBe(false);
    }
    // Départ → étape 1 → étape 2, puis étape 3 → nouveau logement.
    expect(route.legs.map((leg) => [leg.from, leg.to])).toEqual([
      [route.termini[0]!.position, route.stops[0]!.position],
      [route.stops[0]!.position, route.stops[1]!.position],
      [route.stops[2]!.position, route.termini[1]!.position],
    ]);
  });

  it("aucun tracé sur la carte d'ensemble : les groupes par ville n'ont que des anneaux et des repères", () => {
    const overview = overviewOf(romeFlorence);
    expect(Object.keys(overview).sort()).toEqual(["all", "cities", "markers", "rings"]);
  });
});

describe("M4-suite-carte: une seule ville inchangée", () => {
  it("buildOverview et buildDayRoute d'Édimbourg ne changent pas (aucune moitié, aucune ville)", () => {
    expect(buildOverview(edimbourgCarte).length).toBeGreaterThan(0);
    for (const day of edimbourg.days) {
      const route = buildDayRoute(day, edimbourgCarte.find((map) => map.dayIndex === day.index));
      expect(route.moities).toBeUndefined();
      expect(route.stops.every((stop) => stop.moitie === undefined)).toBe(true);
      expect(moitieInitiale(route)).toBeNull();
    }
  });
});

describe("M4-suite-carte: repères par ville", () => {
  it("Rome puis Florence : deux repères dans l'ordre, numéros 1 et 2, aucun anneau à la position d'un logement", () => {
    const overview = overviewOf(romeFlorence);
    expect(overview.markers.map((marker) => [marker.city, marker.numbers, marker.primary])).toEqual([
      ["Rome", [1], true],
      ["Florence", [2], true],
    ]);
    for (const marker of overview.markers) {
      expect(overview.rings.some((ring) => ring.position.lat === marker.position.lat && ring.position.lng === marker.position.lng)).toBe(false);
    }
    // J3 : étapes avant le transfer à Rome, après lui à Florence.
    expect(overview.rings.filter((ring) => ring.city === "Rome")).toHaveLength(4 + 2);
    expect(overview.rings.filter((ring) => ring.city === "Florence")).toHaveLength(1 + 2 + 2);
    expect(overview.cities.map((city) => city.city)).toEqual(["Rome", "Florence"]);
  });

  it("Rome avec deux positions de logement (J1 et J2) : un seul repère nommé à la position de J1, l'autre masqué", () => {
    const maps = deplacerTerminus(romeFlorence.maps, 2, "start", 41.9, 12.5);
    const overview = buildCityOverview(romeFlorence.trip.days, maps, villesParJour(romeFlorence.trip), ["Rome", "Florence"]);
    const rome = overview.markers.filter((marker) => marker.city === "Rome");
    expect(rome.map((marker) => marker.primary)).toEqual([true, false]);
    expect(rome[0]!.position).toEqual({ lat: 41.896, lng: 12.492 });
    expect(rome[1]!.position).toEqual({ lat: 41.9, lng: 12.5 });
    expect(overview.markers.filter((marker) => marker.primary).map((marker) => marker.city)).toEqual(["Rome", "Florence"]);
  });

  it("Rome, Florence, Rome, même logement : un repère « 1 et 3 » ; logements différents : deux repères", () => {
    const meme = romeFlorenceRome(true);
    expect(overviewOf(meme).markers.map((marker) => [marker.city, marker.numbers])).toEqual([
      ["Rome", [1, 3]],
      ["Florence", [2]],
    ]);
    const autre = romeFlorenceRome(false);
    expect(overviewOf(autre).markers.map((marker) => [marker.city, marker.numbers])).toEqual([
      ["Rome", [1]],
      ["Florence", [2]],
      ["Rome", [3]],
    ]);
    // « Rome » cadre les positions des deux séjours.
    const rome = overviewOf(autre).cities.find((city) => city.city === "Rome")!;
    expect(rome.positions).toEqual(expect.arrayContaining([{ lat: 41.896, lng: 12.492 }, { lat: 41.903, lng: 12.48 }]));
    expect(overviewOf(autre).cities.map((city) => city.city)).toEqual(["Rome", "Florence"]);
  });
});

describe("M4-suite-carte: regroupement", () => {
  it("anneaux visibles sur « Toutes les villes » au zoom 10, regroupés au zoom 9 ; zoom inconnu : regroupés", () => {
    expect(ZOOM_ANNEAUX_PAR_VILLE).toBe(10);
    expect(anneauVisible(10, "Paris")).toBe(true);
    expect(anneauVisible(9, "Paris")).toBe(false);
    expect(anneauVisible(null, "Paris")).toBe(false);
  });

  it("vue « Paris » : anneaux de Paris toujours visibles, ceux de Berlin selon le zoom", () => {
    expect(anneauVisible(9, "Paris", "Paris")).toBe(true);
    expect(anneauVisible(null, "Paris", "Paris")).toBe(true);
    expect(anneauVisible(9, "Berlin", "Paris")).toBe(false);
    expect(anneauVisible(10, "Berlin", "Paris")).toBe(true);
    expect(overviewOf(parisBerlin).rings.filter((ring) => ring.city === "Paris").length).toBeGreaterThan(0);
  });
});

describe("M4-suite-carte: terminus de la Journée du changement de ville", () => {
  it("J3 : numérotation continue 1, 2 à Rome puis 3 à Florence ; aucun marqueur pour le transfer ; deux terminus", () => {
    const route = buildDayRoute(jourDe(romeFlorence.trip, 3), carteDe(romeFlorence.maps, 3));
    expect(route.stops.map((stop) => [stop.number, stop.moitie])).toEqual([
      [1, "avant"],
      [2, "avant"],
      [3, "apres"],
    ]);
    expect(route.termini.map((terminus) => terminus.roles)).toEqual([["start"], ["end"]]);
    expect(route.moities?.avant).toHaveLength(3);
    expect(route.moities?.apres).toHaveLength(2);
  });
});

describe("M4-suite-carte: cadrage de la Journée du changement de ville", () => {
  const j3 = buildDayRoute(jourDe(romeFlorence.trip, 3), carteDe(romeFlorence.maps, 3));

  it("ouverture sur la moitié « avant », ou celle de l'étape sélectionnée", () => {
    expect(moitieInitiale(j3)).toBe("avant");
    expect(moitieInitiale(j3, "cv-j3-arrivee")).toBe("apres");
    expect(moitieInitiale(j3, "cv-j3-depart-1")).toBe("avant");
  });

  it("billet à 07:00, aucune étape avant le transfer : ouverture sur « après » ; aucune étape positionnée : toute la journée", () => {
    const tot = sansEtapes(romeFlorence.trip, romeFlorence.maps, 3, ["cv-j3-depart-1", "cv-j3-depart-2"]);
    expect(moitieInitiale(buildDayRoute(jourDe(tot.trip, 3), carteDe(tot.maps, 3)))).toBe("apres");
    const vide = sansEtapes(romeFlorence.trip, romeFlorence.maps, 3, ["cv-j3-depart-1", "cv-j3-depart-2", "cv-j3-arrivee"]);
    expect(moitieInitiale(buildDayRoute(jourDe(vide.trip, 3), carteDe(vide.maps, 3)))).toBeNull();
    expect(ZOOM_POSITION_SEULE).toBe(15);
  });
});

const box = (x: number, y: number, width = 24, height = 24): Box => ({ x, y, width, height });
const recoupe = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("M4-suite-carte: étiquette de ville", () => {
  it("coteEtiquette : droite quand elle tient, gauche sinon, côté le plus large avec largeur réduite quand aucun ne tient", () => {
    expect(coteEtiquette(100, 24, 80, 390, ECARTS)).toEqual({ cote: "droite" });
    expect(coteEtiquette(350, 24, 80, 390, ECARTS)).toEqual({ cote: "gauche" });
    // Aucun côté ne tient une étiquette de 300 dans 390 : à droite (plus de place), largeur réduite.
    expect(coteEtiquette(150, 24, 300, 390, ECARTS)).toEqual({ cote: "droite", largeurMax: 390 - 8 - 154 });
    expect(coteEtiquette(300, 24, 300, 390, ECARTS)).toEqual({ cote: "gauche", largeurMax: 300 - 24 - 4 - 8 });
  });

  const etiquette = (key: string, terminus: Box, decalagesMax = 3): EtiquetteAPlacer => ({ key, terminus, largeur: 80, hauteur: 30, decalagesMax });
  const TAILLE = { width: 390, height: 844 };

  it("placerEtiquettes : deux terminus à 100 de distance sur une horizontale, l'étiquette de la première passe à gauche", () => {
    const a = box(150, 300);
    const b = box(250, 300);
    const [premiere, seconde] = placerEtiquettes([a, b], [etiquette("a", a), etiquette("b", b)], TAILLE, ECARTS);
    expect(premiere!.cote).toBe("gauche");
    expect(premiere!.dy).toBe(0);
    expect(seconde!.cote).toBe("droite");
    expect(recoupe(premiere!.box, b)).toBe(false);
  });

  it("placerEtiquettes : trois terminus serrés, aucun côté libre : décalage d'une hauteur, boîtes disjointes deux à deux", () => {
    const termini = [box(150, 300), box(178, 300), box(206, 300), box(234, 300)];
    const etiquettes = termini.slice(0, 3).map((terminus, index) => etiquette(`e${index}`, terminus));
    const places = placerEtiquettes(termini, etiquettes, TAILLE, ECARTS);
    expect(places.some((place) => Math.abs(place.dy) === 34)).toBe(true);
    for (const [index, place] of places.entries()) {
      for (const autre of places.slice(index + 1)) expect(recoupe(place.box, autre.box)).toBe(false);
      for (const terminus of termini) expect(recoupe(place.box, terminus)).toBe(false);
    }
  });

  it("repli : obstacles qui bloquent toutes les places, la place (1) est gardée", () => {
    const t = box(150, 300);
    const mur = box(0, 0, 390, 844);
    const [place] = placerEtiquettes([mur], [etiquette("a", t)], TAILLE, ECARTS);
    expect(place).toMatchObject({ cote: "droite", dy: 0 });
  });

  it("« Retour » et « Partager » : une place qui les recoupe n'est jamais prise", () => {
    const retour = box(12, 12, 44, 44);
    const partager = box(334, 12, 44, 44);
    const enHautAGauche = box(0, 22);
    const [gauche] = placerEtiquettes([retour, partager, enHautAGauche], [etiquette("a", enHautAGauche)], TAILLE, ECARTS);
    expect(recoupe(gauche!.box, retour)).toBe(false);
    expect(gauche!.dy).toBeGreaterThan(0);
    const enHautADroite = box(250, 22);
    const [droite] = placerEtiquettes([retour, partager, enHautADroite], [etiquette("b", enHautADroite)], TAILLE, ECARTS);
    expect(recoupe(droite!.box, partager)).toBe(false);
  });

  it("jour du changement de ville : au plus une hauteur de décalage (places 5 et suivantes jamais utilisées)", () => {
    const t = box(150, 300);
    // Bloque les places (1) à (4) : seule la place (5), deux hauteurs plus bas, serait libre.
    const obstacles = [box(178, 270, 100, 100), box(40, 290, 100, 40)];
    const [place] = placerEtiquettes(obstacles, [etiquette("a", t, 1)], TAILLE, ECARTS);
    expect(place).toMatchObject({ cote: "droite", dy: 0 });
    const [sejour] = placerEtiquettes(obstacles, [etiquette("a", t, 3)], TAILLE, ECARTS);
    expect(Math.abs(sejour!.dy)).toBe(68);
  });
});
