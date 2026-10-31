import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";
import { applyTokens, stubLayout } from "../../../tests/unit/carte-fixtures";
import {
  CARTE_VILLES,
  carteDe,
  jourDe,
  nomsDesVilles,
  parisBerlin,
  romeFlorence,
  sansEtapes,
  villesParJour,
} from "../../../tests/unit/carte-villes-fixtures";

import { buildCityOverview, buildDayRoute, type LatLng } from "./route";
import { fitCamera, offsetCamera, project } from "./simulated-model";
import { SimulatedMapRenderer } from "./SimulatedMapRenderer";
import type { FitPadding, MapView } from "./types";

const WIDTH = 390;
const HEIGHT = 844;
const PADDING: FitPadding = { top: 88, right: 44, bottom: 0.55 * HEIGHT, left: 44 };
const INSETS: FitPadding = { top: 0, right: 0, bottom: 0.55 * HEIGHT, left: 0 };

function sejour(jeu = romeFlorence, cityView?: string): MapView {
  const cities = buildCityOverview(jeu.trip.days, jeu.maps, villesParJour(jeu.trip), nomsDesVilles(jeu.trip));
  return {
    mode: "overview",
    fitKey: `sejour:${cityView ?? "toutes"}`,
    rings: [],
    cities,
    ...(cityView ? { cityView } : {}),
    fitPadding: PADDING,
    visibleInsets: INSETS,
  };
}

function journee(jeu = romeFlorence, extra: Partial<Extract<MapView, { mode: "day" }>> = {}): MapView {
  const moitie = extra.moitie;
  return {
    mode: "day",
    fitKey: `jour-3:${moitie ?? "journee"}`,
    route: buildDayRoute(jourDe(jeu.trip, 3), carteDe(jeu.maps, 3)),
    transferCities: { de: "Rome", vers: "Florence" },
    fitPadding: PADDING,
    visibleInsets: INSETS,
    ...extra,
  };
}

const container = () => document.querySelector<HTMLElement>("[data-renderer='simulated']")!;
const camera = () => ({
  center: { lat: Number(container().dataset.centerLat), lng: Number(container().dataset.centerLng) },
  zoom: Number(container().dataset.zoom),
});
/** Position dans la zone visible : dans la carte, au-dessus du panneau (partie couverte en bas). */
function visible(position: LatLng): boolean {
  const { x, y } = project(position, camera());
  const left = WIDTH / 2 + x;
  const top = HEIGHT / 2 - y;
  return left >= 0 && left <= WIDTH && top >= 0 && top <= HEIGHT - INSETS.bottom;
}

beforeAll(() => {
  applyTokens(["--touch-target"]);
});

beforeEach(() => {
  stubLayout(WIDTH, HEIGHT);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M4-suite-carte: repères par ville (carte simulée)", () => {
  it("Séjour, Rome puis Florence : deux images nommées dans l'ordre, terminus sans texte et étiquette masquée avec espaces insécables", () => {
    render(<SimulatedMapRenderer view={sejour()} />);
    const reperes = screen.getAllByRole("img");
    expect(reperes.map((repere) => repere.getAttribute("aria-label"))).toEqual(["Rome, ville 1", "Florence, ville 2"]);
    for (const [index, repere] of reperes.entries()) {
      const terminus = repere.querySelector("[data-kind='terminus']")!;
      expect(terminus.textContent).toBe("");
      const etiquette = repere.querySelector("[data-part='etiquette-ville']")!;
      expect(etiquette).toHaveAttribute("aria-hidden", "true");
      expect(etiquette.textContent).toBe(index === 0 ? "1 · Rome" : "2 · Florence");
      expect(repere).not.toHaveAttribute("tabindex");
    }
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("aucun anneau à la position d'un logement ; aucun élément n'utilise quai", () => {
    render(<SimulatedMapRenderer view={sejour(CARTE_VILLES["paris-versailles"]!)} />);
    expect(container().innerHTML).not.toMatch(/quai/);
    const logements = Array.from(document.querySelectorAll<HTMLElement>("[data-part='repere-ville']"), (element) => element.parentElement!.style.cssText);
    const anneaux = Array.from(document.querySelectorAll<HTMLElement>("[data-part='anneau']"), (element) => element.style.cssText);
    for (const logement of logements) expect(anneaux).not.toContain(logement);
  });
});

describe("M4-suite-carte: regroupement (carte simulée)", () => {
  it("Paris puis Berlin : à l'ouverture aucun anneau et deux repères ; vue « Paris » : un anneau par étape de Paris", () => {
    const { rerender } = render(<SimulatedMapRenderer view={sejour(parisBerlin)} />);
    expect(camera().zoom).toBeLessThan(10);
    expect(document.querySelectorAll("[data-part='anneau']")).toHaveLength(0);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    rerender(<SimulatedMapRenderer view={sejour(parisBerlin, "Paris")} />);
    const paris = buildCityOverview(parisBerlin.trip.days, parisBerlin.maps, villesParJour(parisBerlin.trip), ["Paris", "Berlin"]).rings.filter(
      (ring) => ring.city === "Paris",
    );
    // Anneaux dans la carte (ceux de Berlin, hors du cadrage, peuvent être dessinés au-delà du zoom 10).
    const dansLaCarte = Array.from(document.querySelectorAll<HTMLElement>("[data-part='anneau']")).filter((anneau) => {
      const left = Number.parseFloat(anneau.style.left);
      const top = Number.parseFloat(anneau.style.top);
      return left >= 0 && left <= WIDTH && top >= 0 && top <= HEIGHT;
    });
    expect(dansLaCarte).toHaveLength(paris.length);
    expect(screen.getByRole("img", { name: "Paris, ville 1" })).toBeInTheDocument();
  });

  it("deux villes voisines cadrées au zoom 10 ou plus : anneaux visibles sur « Toutes les villes »", () => {
    render(<SimulatedMapRenderer view={sejour(CARTE_VILLES["paris-versailles"]!)} />);
    expect(camera().zoom).toBeGreaterThanOrEqual(10);
    expect(document.querySelectorAll("[data-part='anneau']").length).toBeGreaterThan(0);
  });
});

describe("M4-suite-carte: choix de la vue sur Séjour (carte simulée)", () => {
  it("vue « Florence » : toutes les positions de Florence dans la zone visible, aucune de Rome ; « Toutes les villes » recadre sur toutes", () => {
    const overview = buildCityOverview(romeFlorence.trip.days, romeFlorence.maps, villesParJour(romeFlorence.trip), ["Rome", "Florence"]);
    const { rerender } = render(<SimulatedMapRenderer view={sejour()} />);
    for (const position of overview.all) expect(visible(position)).toBe(true);
    rerender(<SimulatedMapRenderer view={sejour(romeFlorence, "Florence")} />);
    for (const position of overview.cities[1]!.positions) expect(visible(position)).toBe(true);
    for (const position of overview.cities[0]!.positions) expect(visible(position)).toBe(false);
    rerender(<SimulatedMapRenderer view={sejour()} />);
    for (const position of overview.all) expect(visible(position)).toBe(true);
  });

  it("ville réduite à son logement : zoom 15, logement au milieu de la zone non couverte (snap 0,55)", () => {
    const seul = sansEtapes(romeFlorence.trip, romeFlorence.maps, 3, ["cv-j3-arrivee"]);
    const sansFlorence = {
      trip: seul.trip,
      maps: seul.maps.map((map) => (map.dayIndex > 3 ? { ...map, points: map.points.filter((point) => point.ref.type === "terminus") } : map)),
    };
    render(<SimulatedMapRenderer view={sejour(sansFlorence, "Florence")} />);
    const logement = { lat: 43.769, lng: 11.262 };
    expect(camera()).toEqual({ zoom: 15, center: offsetCamera(logement, INSETS, 15) });
    expect(visible(logement)).toBe(true);
  });
});

describe("M4-suite-carte: terminus de la Journée du changement de ville (carte simulée)", () => {
  it("J3 : deux images nommées non focalisables, étiquettes « Rome » et « Florence » ; étapes 1, 2 puis 3 ; aucun tronçon à travers le transfer", async () => {
    render(<SimulatedMapRenderer view={journee(romeFlorence, { moitie: "avant" })} />);
    const termini = screen.getAllByRole("img");
    expect(termini.map((terminus) => terminus.getAttribute("aria-label"))).toEqual(["Logement quitté, Rome", "Nouveau logement, Florence"]);
    expect(termini.map((terminus) => terminus.querySelector("[data-part='etiquette-ville']")?.textContent)).toEqual(["Rome", "Florence"]);
    for (const terminus of termini) expect(terminus).not.toHaveAttribute("tabindex");
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Étape 1 : [Première étape, Rome]",
      "Étape 2 : [Deuxième étape, Rome]",
      "Étape 3 : [Étape d'arrivée, Florence]",
    ]);
    expect(document.querySelectorAll("[data-part='trace'] line")).toHaveLength(3);
    expect(await axeViolations(container())).toEqual([]);
  });

  it("jour ordinaire (J2) : terminus masqués, comme aujourd'hui", () => {
    const route = buildDayRoute(jourDe(romeFlorence.trip, 2), carteDe(romeFlorence.maps, 2));
    render(<SimulatedMapRenderer view={{ mode: "day", fitKey: "jour-2", route }} />);
    expect(screen.queryAllByRole("img")).toEqual([]);
    expect(document.querySelector("[data-part='terminus']")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("M4-suite-carte: cadrage de la Journée du changement de ville (carte simulée)", () => {
  const route = buildDayRoute(jourDe(romeFlorence.trip, 3), carteDe(romeFlorence.maps, 3));

  it("moitié « avant » : ses positions dans la zone visible, le nouveau logement non ; « après » recadre sur sa moitié", () => {
    const { rerender } = render(<SimulatedMapRenderer view={journee(romeFlorence, { moitie: "avant" })} />);
    for (const position of route.moities!.avant) expect(visible(position)).toBe(true);
    expect(visible(route.termini[1]!.position)).toBe(false);
    rerender(<SimulatedMapRenderer view={journee(romeFlorence, { moitie: "apres" })} />);
    for (const position of route.moities!.apres) expect(visible(position)).toBe(true);
    expect(visible(route.termini[0]!.position)).toBe(false);
  });

  it("moitié réduite à une position et journée réduite à une position : zoom 15 au milieu de la zone non couverte", () => {
    const tot = sansEtapes(romeFlorence.trip, romeFlorence.maps, 3, ["cv-j3-arrivee"]);
    render(<SimulatedMapRenderer view={journee(tot, { moitie: "apres" })} />);
    const logement = { lat: 43.769, lng: 11.262 };
    expect(camera()).toEqual({ zoom: 15, center: offsetCamera(logement, INSETS, 15) });
    expect(visible(logement)).toBe(true);
  });

  it("un jour ordinaire à une seule position garde son cadrage actuel", () => {
    const seul = { dayIndex: 2, points: carteDe(romeFlorence.maps, 2).points.slice(0, 1) };
    const routeSeule = buildDayRoute(jourDe(romeFlorence.trip, 2), seul);
    render(<SimulatedMapRenderer view={{ mode: "day", fitKey: "jour-2", route: routeSeule, fitPadding: PADDING }} />);
    expect(camera()).toEqual(fitCamera(routeSeule.positions, { width: WIDTH, height: HEIGHT }, PADDING));
  });
});

describe("M4-suite-carte: sélection dans l'autre moitié (carte simulée)", () => {
  it("J3 sur « Rome », étape 3 sélectionnée avec la moitié « après » : centre = offsetCamera(étape, visibleInsets, zoom du cadrage)", () => {
    const route = buildDayRoute(jourDe(romeFlorence.trip, 3), carteDe(romeFlorence.maps, 3));
    const { rerender } = render(<SimulatedMapRenderer view={journee(romeFlorence, { moitie: "avant" })} />);
    rerender(<SimulatedMapRenderer view={journee(romeFlorence, { moitie: "apres", selectedStopId: "cv-j3-arrivee" })} />);
    const zoom = fitCamera(route.moities!.apres, { width: WIDTH, height: HEIGHT }, PADDING)!.zoom;
    const etape = route.stops[2]!.position;
    expect(camera()).toEqual({ zoom, center: offsetCamera(etape, INSETS, zoom) });
  });

  it("étape 2 sur « Rome » : recentrage sans changer le zoom", () => {
    const { rerender } = render(<SimulatedMapRenderer view={journee(romeFlorence, { moitie: "avant" })} />);
    const zoom = camera().zoom;
    rerender(<SimulatedMapRenderer view={journee(romeFlorence, { moitie: "avant", selectedStopId: "cv-j3-depart-2" })} />);
    expect(camera().zoom).toBe(zoom);
  });
});
