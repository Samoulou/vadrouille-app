import { act, render, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTokens } from "../../../tests/unit/carte-fixtures";
import { carteDe, jourDe, parisBerlin, romeFlorence, sansEtapes, villesParJour } from "../../../tests/unit/carte-villes-fixtures";

import { CADRAGE_IDLE_MAX_MS, GoogleMapRenderer, MAPS_LIBRARIES } from "./GoogleMapRenderer";
import { boundsOf, buildCityOverview, buildDayRoute, offsetCenter } from "./route";
import type { FitPadding, MapView } from "./types";

/**
 * Rendu Google de la carte à plusieurs villes (décision 0150, critères 3, 5, 6, 8 et 9) sur une bibliothèque simulée qui
 * émet `idle` et `zoom_changed` (`addListener`) ; aucune requête.
 */
const loader = vi.hoisted(() => ({ setOptions: vi.fn(), importLibrary: vi.fn() }));
vi.mock("@googlemaps/js-api-loader", () => ({ setOptions: loader.setOptions, importLibrary: loader.importLibrary }));

type Listener = () => void;

class FakeMap {
  static created: FakeMap[] = [];
  fitBounds = vi.fn();
  panTo = vi.fn();
  setCenter = vi.fn();
  setZoom = vi.fn();
  zoom = 9;
  getZoom = vi.fn(() => this.zoom);
  listeners: { event: string; listener: Listener; removed: boolean }[] = [];
  constructor(public element: HTMLElement) {
    FakeMap.created.push(this);
  }
  addListener(event: string, listener: Listener) {
    const entry = { event, listener, removed: false };
    this.listeners.push(entry);
    return { remove: () => (entry.removed = true) };
  }
  /** Émet un événement de la bibliothèque (`idle`, `zoom_changed`). */
  emit(event: string) {
    for (const entry of this.listeners.filter((candidate) => candidate.event === event && !candidate.removed)) entry.listener();
  }
}
class FakeMarker {
  static created: FakeMarker[] = [];
  map: unknown;
  content: HTMLElement;
  position: google.maps.LatLngLiteral;
  zIndex: number | null | undefined;
  constructor(options: google.maps.marker.AdvancedMarkerElementOptions) {
    this.map = options.map;
    this.content = options.content as HTMLElement;
    this.position = options.position as google.maps.LatLngLiteral;
    this.zIndex = options.zIndex;
    FakeMarker.created.push(this);
  }
}
class FakePolyline {
  setMap = vi.fn();
}

const LIBRARIES: Record<string, unknown> = {
  maps: { Map: FakeMap, Polyline: FakePolyline },
  marker: { AdvancedMarkerElement: FakeMarker },
};
const CONFIG = { apiKey: "test-key", mapId: "test-map" };
const PADDING: FitPadding = { top: 88, right: 44, bottom: 464, left: 44 };
const INSETS: FitPadding = { top: 0, right: 0, bottom: 464, left: 0 };

function sejour(jeu = parisBerlin, cityView?: string): MapView {
  const cities = buildCityOverview(jeu.trip.days, jeu.maps, villesParJour(jeu.trip), (jeu.trip.cities ?? []).map((city) => city.name));
  return { mode: "overview", fitKey: `sejour:${cityView ?? "toutes"}`, rings: [], cities, ...(cityView ? { cityView } : {}), fitPadding: PADDING, visibleInsets: INSETS };
}

function journee(jeu = romeFlorence, extra: Partial<Extract<MapView, { mode: "day" }>> = {}): MapView {
  return {
    mode: "day",
    fitKey: `jour-3:${extra.moitie ?? "journee"}`,
    route: buildDayRoute(jourDe(jeu.trip, 3), carteDe(jeu.maps, 3)),
    transferCities: { de: "Rome", vers: "Florence" },
    fitPadding: PADDING,
    visibleInsets: INSETS,
    ...extra,
  };
}

const map = () => FakeMap.created.at(-1)!;
const ringMarkers = () => FakeMarker.created.filter((marker) => marker.content.querySelector("[data-part='anneau']"));

async function renderReady(view: MapView) {
  const result = render(<GoogleMapRenderer view={view} config={CONFIG} placesFromGoogle={false} />);
  await act(async () => {});
  // Repères de ville chargés à la demande (décision 0152 § 4).
  await act(async () => {
    await import("./CityLabel");
  });
  return result;
}

beforeAll(() => {
  applyTokens(["--touch-target"]);
});

beforeEach(() => {
  FakeMap.created = [];
  FakeMarker.created = [];
  loader.importLibrary.mockImplementation(async (name: string) => LIBRARIES[name]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("M4-suite-carte: repères par ville (rendu Google)", () => {
  it("un marqueur avancé par repère, dans l'ordre des villes, image nommée avec terminus et étiquette", async () => {
    await renderReady(sejour());
    const reperes = FakeMarker.created.filter((marker) => marker.content.querySelector("[data-part='repere-ville']"));
    expect(reperes.map((marker) => within(marker.content).getByRole("img").getAttribute("aria-label"))).toEqual(["Paris, ville 1", "Berlin, ville 2"]);
    expect(reperes.map((marker) => marker.content.querySelector("[data-part='etiquette-ville']")?.textContent)).toEqual([
      "1 · Paris",
      "2 · Berlin",
    ]);
    expect(MAPS_LIBRARIES).toEqual(["maps", "marker"]);
  });

  it("J3 : terminus nommés « Logement quitté, Rome » et « Nouveau logement, Florence »", async () => {
    await renderReady(journee(romeFlorence, { moitie: "avant" }));
    const noms = FakeMarker.created.flatMap((marker) => within(marker.content).queryAllByRole("img")).map((img) => img.getAttribute("aria-label"));
    expect(noms).toEqual(["Logement quitté, Rome", "Nouveau logement, Florence"]);
  });
});

describe("M4-suite-carte: regroupement (rendu Google)", () => {
  it("avant le premier idle aucun anneau attaché ; au zoom 9 aucun ; de 9 à 10 attachés sans en créer ni recadrer ; de 10 à 9 détachés", async () => {
    await renderReady(sejour());
    expect(ringMarkers().length).toBeGreaterThan(0);
    expect(ringMarkers().every((marker) => marker.map === null)).toBe(true);
    act(() => map().emit("idle"));
    expect(ringMarkers().every((marker) => marker.map === null)).toBe(true);
    const created = FakeMarker.created.length;
    const fits = map().fitBounds.mock.calls.length;
    map().zoom = 10;
    act(() => map().emit("zoom_changed"));
    expect(ringMarkers().every((marker) => marker.map === map())).toBe(true);
    expect(FakeMarker.created).toHaveLength(created);
    expect(map().fitBounds.mock.calls).toHaveLength(fits);
    map().zoom = 9;
    act(() => map().emit("zoom_changed"));
    expect(ringMarkers().every((marker) => marker.map === null)).toBe(true);
  });

  it("vue « Paris » au zoom 9 : anneaux de Paris attachés, anneaux de Berlin détachés", async () => {
    await renderReady(sejour(parisBerlin, "Paris"));
    act(() => map().emit("idle"));
    const overview = buildCityOverview(parisBerlin.trip.days, parisBerlin.maps, villesParJour(parisBerlin.trip), ["Paris", "Berlin"]);
    const villeDe = (marker: FakeMarker) => overview.rings.find((ring) => ring.position.lat === marker.position.lat && ring.position.lng === marker.position.lng)!.city;
    for (const marker of ringMarkers()) expect(marker.map === null).toBe(villeDe(marker) === "Berlin");
  });
});

describe("M4-suite-carte: choix de la vue et cadrage (rendu Google)", () => {
  it("vue « Berlin » : fitBounds reçoit la boîte des seules positions de Berlin ; « Toutes les villes » recadre sur toutes", async () => {
    const { rerender } = render(<GoogleMapRenderer view={sejour()} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {});
    const overview = buildCityOverview(parisBerlin.trip.days, parisBerlin.maps, villesParJour(parisBerlin.trip), ["Paris", "Berlin"]);
    expect(map().fitBounds).toHaveBeenLastCalledWith(boundsOf(overview.all), PADDING);
    rerender(<GoogleMapRenderer view={sejour(parisBerlin, "Berlin")} config={CONFIG} placesFromGoogle={false} />);
    expect(map().fitBounds).toHaveBeenLastCalledWith(boundsOf(overview.cities[1]!.positions), PADDING);
    rerender(<GoogleMapRenderer view={sejour()} config={CONFIG} placesFromGoogle={false} />);
    expect(map().fitBounds).toHaveBeenLastCalledWith(boundsOf(overview.all), PADDING);
    expect(map().fitBounds).toHaveBeenCalledTimes(3);
  });

  it("J3 « Florence » : fitBounds reçoit la boîte de la moitié « après »", async () => {
    await renderReady(journee(romeFlorence, { moitie: "apres" }));
    const route = buildDayRoute(jourDe(romeFlorence.trip, 3), carteDe(romeFlorence.maps, 3));
    expect(map().fitBounds).toHaveBeenCalledWith(boundsOf(route.moities!.apres), PADDING);
  });

  it("moitié réduite à une position : setZoom(15) puis setCenter(offsetCenter(position, visibleInsets, 15)), aucun fitBounds", async () => {
    const tot = sansEtapes(romeFlorence.trip, romeFlorence.maps, 3, ["cv-j3-arrivee"]);
    await renderReady(journee(tot, { moitie: "apres" }));
    expect(map().fitBounds).not.toHaveBeenCalled();
    expect(map().setZoom).toHaveBeenCalledWith(15);
    expect(map().setCenter).toHaveBeenCalledWith(offsetCenter({ lat: 43.769, lng: 11.262 }, INSETS, 15));
    expect(map().setZoom.mock.invocationCallOrder[0]).toBeLessThan(map().setCenter.mock.invocationCallOrder[0]!);
  });
});

describe("M4-suite-carte: sélection dans l'autre moitié (rendu Google)", () => {
  it("fitBounds de la moitié, aucun panTo avant idle, puis un seul panTo vers offsetCenter(étape, visibleInsets, getZoom())", async () => {
    const { rerender } = render(<GoogleMapRenderer view={journee(romeFlorence, { moitie: "avant" })} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {});
    act(() => map().emit("idle"));
    const route = buildDayRoute(jourDe(romeFlorence.trip, 3), carteDe(romeFlorence.maps, 3));
    rerender(
      <GoogleMapRenderer view={journee(romeFlorence, { moitie: "apres", selectedStopId: "cv-j3-arrivee" })} config={CONFIG} placesFromGoogle={false} />,
    );
    expect(map().fitBounds).toHaveBeenLastCalledWith(boundsOf(route.moities!.apres), PADDING);
    expect(map().panTo).not.toHaveBeenCalled();
    map().zoom = 16;
    act(() => map().emit("idle"));
    expect(map().panTo).toHaveBeenCalledTimes(1);
    expect(map().panTo).toHaveBeenCalledWith(offsetCenter(route.stops[2]!.position, INSETS, 16));
  });

  it("cadrage sans idle (vue inchangée) : le recentrage en attente part après CADRAGE_IDLE_MAX_MS", async () => {
    const { rerender } = render(<GoogleMapRenderer view={journee(romeFlorence, { moitie: "avant" })} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {});
    act(() => map().emit("idle"));
    vi.useFakeTimers();
    try {
      rerender(
        <GoogleMapRenderer view={journee(romeFlorence, { moitie: "apres", selectedStopId: "cv-j3-arrivee" })} config={CONFIG} placesFromGoogle={false} />,
      );
      expect(map().panTo).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(CADRAGE_IDLE_MAX_MS));
      expect(map().panTo).toHaveBeenCalledTimes(1);
      // L'écoute du cadrage est retirée : un idle plus tard ne recentre pas une seconde fois.
      act(() => map().emit("idle"));
      expect(map().panTo).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("démontage avant l'idle du cadrage : l'écoute est retirée", async () => {
    const { unmount } = render(<GoogleMapRenderer view={journee(romeFlorence, { moitie: "apres" })} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {});
    unmount();
    expect(map().listeners.filter((entry) => entry.event === "idle").every((entry) => entry.removed)).toBe(true);
  });

  it("étape de la moitié affichée : recentrage immédiat sans changer le zoom", async () => {
    const { rerender } = render(<GoogleMapRenderer view={journee(romeFlorence, { moitie: "avant" })} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {});
    act(() => map().emit("idle"));
    rerender(<GoogleMapRenderer view={journee(romeFlorence, { moitie: "avant", selectedStopId: "cv-j3-depart-2" })} config={CONFIG} placesFromGoogle={false} />);
    expect(map().panTo).toHaveBeenCalledTimes(1);
    expect(map().setZoom).not.toHaveBeenCalled();
  });
});

describe("M4-suite-carte: étiquette de ville (rendu Google)", () => {
  it("après un idle simulé, la place de chaque étiquette est recalculée (côté gauche quand la droite déborde)", async () => {
    await renderReady(sejour());
    const host = map().element;
    vi.spyOn(host, "clientWidth", "get").mockReturnValue(390);
    vi.spyOn(host, "clientHeight", "get").mockReturnValue(844);
    const reperes = FakeMarker.created.filter((marker) => marker.content.querySelector("[data-part='repere-ville']"));
    // Hôtes posés dans le conteneur, comme le fait la bibliothèque : Paris tout à droite, Berlin à gauche.
    reperes.forEach((marker, index) => {
      host.appendChild(marker.content);
      const x = index === 0 ? 350 : 60;
      vi.spyOn(marker.content.querySelector("[data-kind='terminus']")!, "getBoundingClientRect").mockReturnValue(new DOMRect(x, 300 + index * 200, 24, 24));
      const etiquette = marker.content.querySelector<HTMLElement>("[data-part='etiquette-ville']")!;
      vi.spyOn(etiquette, "offsetWidth", "get").mockReturnValue(80);
      vi.spyOn(etiquette, "offsetHeight", "get").mockReturnValue(30);
    });
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 390, 844));
    // Mesure chargée à la demande (décision 0152 § 4).
    await act(async () => {
      map().emit("idle");
      await import("./CityLabel");
    });
    const cotes = reperes.map((marker) => marker.content.querySelector("[data-part='etiquette-ville']")!.getAttribute("data-cote"));
    expect(cotes).toEqual(["gauche", "droite"]);
  });
});
