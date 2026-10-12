import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DayMap } from "@/contracts";
import { messages } from "@/i18n";

import { applyTokens, day2, day4, map2, map4, maps } from "../../../tests/unit/carte-fixtures";

import { GoogleMapRenderer, LOAD_TIMEOUT_MS, MAPS_LIBRARIES } from "./GoogleMapRenderer";
import { buildDayRoute, buildOverview, offsetCenter } from "./route";
import type { MapView } from "./types";

/** Bibliothèque de chargement simulée : aucune requête, classes Google factices. */
const loader = vi.hoisted(() => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(),
}));
vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: loader.setOptions,
  importLibrary: loader.importLibrary,
}));

const created = {
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
  polylines: [] as FakePolyline[],
};

class FakeMap {
  fitBounds = vi.fn();
  panTo = vi.fn();
  setCenter = vi.fn();
  setZoom = vi.fn();
  getZoom = vi.fn(() => 14);
  constructor(
    public element: HTMLElement,
    public options: google.maps.MapOptions,
  ) {
    created.maps.push(this);
  }
}
class FakeMarker {
  map: unknown;
  zIndex: number | null | undefined;
  content: HTMLElement;
  position: google.maps.LatLngLiteral;
  constructor(options: google.maps.marker.AdvancedMarkerElementOptions) {
    this.map = options.map;
    this.zIndex = options.zIndex;
    this.content = options.content as HTMLElement;
    this.position = options.position as google.maps.LatLngLiteral;
    created.markers.push(this);
  }
}
class FakePolyline {
  setMap = vi.fn();
  constructor(public options: google.maps.PolylineOptions) {
    created.polylines.push(this);
  }
}

const LIBRARIES: Record<string, unknown> = {
  maps: { Map: FakeMap, Polyline: FakePolyline },
  marker: { AdvancedMarkerElement: FakeMarker },
};

const CONFIG = { apiKey: "test-key", mapId: "test-map" };

function dayView(day = day2, map: DayMap = map2, extra: Partial<Extract<MapView, { mode: "day" }>> = {}): MapView {
  return { mode: "day", fitKey: `jour-${day.index}`, route: buildDayRoute(day, map), ...extra };
}

async function renderReady(view: MapView) {
  const result = render(<GoogleMapRenderer view={view} config={CONFIG} placesFromGoogle={false} />);
  await act(async () => {});
  return result;
}

/** Contenu HTML des marqueurs avancés (rendu par portails React, hors du document dans ce test). */
const contents = () => created.markers.filter((marker) => marker.map !== null).map((marker) => marker.content);
const markerButtons = () => contents().flatMap((content) => within(content).queryAllByRole("button"));
const markerButton = (name: RegExp) => markerButtons().find((button) => name.test(button.getAttribute("aria-label") ?? ""))!;

beforeAll(() => {
  applyTokens(["--color-line", "--ligne-rail", "--ligne-rail-dash", "--ligne-rail-gap", "--touch-target"]);
});

beforeEach(() => {
  created.maps.length = 0;
  created.markers.length = 0;
  created.polylines.length = 0;
  loader.importLibrary.mockImplementation(async (name: string) => {
    if (!(name in LIBRARIES)) {
      throw new Error(`bibliothèque inattendue : ${name}`);
    }
    return LIBRARIES[name];
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("GoogleMapRenderer (bibliothèque simulée)", () => {
  it("passe la clé au chargeur et crée la carte au Map ID de la configuration, sans contrôles, gestes « greedy »", async () => {
    await renderReady(dayView());
    expect(loader.setOptions).toHaveBeenCalledWith({ key: "test-key", v: "weekly" });
    expect(created.maps).toHaveLength(1);
    expect(created.maps[0]?.options).toMatchObject({ mapId: "test-map", disableDefaultUI: true, gestureHandling: "greedy" });
  });

  it("ne demande que les bibliothèques de la liste blanche maps et marker (jour et vue d'ensemble)", async () => {
    const view = dayView();
    const { unmount } = await renderReady(view);
    unmount();
    await renderReady({ mode: "overview", fitKey: "sejour", rings: buildOverview(maps) });
    const requested = loader.importLibrary.mock.calls.map(([name]) => name as string);
    const fromOptions = loader.setOptions.mock.calls.flatMap(([options]) => (options as { libraries?: string[] }).libraries ?? []);
    expect(requested.length).toBeGreaterThan(0);
    for (const name of [...requested, ...fromOptions]) {
      expect(["maps", "marker"]).toContain(name);
    }
    expect(new Set(requested)).toEqual(new Set(MAPS_LIBRARIES));
  });

  it("un marqueur avancé par étape positionnée et par terminus distinct, boutons nommés dans l'ordre", async () => {
    await renderReady(dayView());
    // Jour 2 : 5 étapes, départ et retour au même logement.
    expect(contents()).toHaveLength(6);
    const buttons = contents().flatMap((content) => within(content).queryAllByRole("button"));
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Étape 1 : [Royal Mile]",
      "Étape 2 : [Dean Village]",
      "Étape 3 : [Café de Stockbridge]",
      "Étape 4 : [Jardin botanique royal]",
      "Étape 5 : [Bonne table de New Town]",
    ]);
    const terminus = contents().find((content) => content.querySelector("[data-part='terminus']"))!;
    expect(terminus.querySelector("[data-part='terminus']")).toHaveAttribute("aria-hidden", "true");
    expect(terminus.querySelector("button, [tabindex]")).toBeNull();
  });

  it("une étape sans position : pas de marqueur, les autres gardent leur numéro", async () => {
    const map = { ...map2, points: map2.points.filter((p) => !(p.ref.type === "stop" && p.ref.stopId === "j2-dejeuner")) };
    await renderReady(dayView(day2, map));
    const numbers = contents().flatMap((content) => within(content).queryAllByRole("button").map((b) => b.dataset.number));
    expect(numbers).toEqual(["1", "2", "4", "5"]);
  });

  it("polylignes : n + 1 tronçons de la couleur calculée du token line, épaisseur 4 ; retour à pied en pointillé", async () => {
    await renderReady(dayView());
    const line = getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim();
    expect(line).toMatch(/^#/);
    expect(created.polylines).toHaveLength(6);
    for (const polyline of created.polylines) {
      expect(polyline.options.strokeColor).toBe(line);
      expect(polyline.options.strokeWeight).toBe(4);
    }
    const dashed = created.polylines.filter((polyline) => polyline.options.icons);
    expect(dashed).toHaveLength(1);
    expect(dashed[0]).toBe(created.polylines.at(-1));
    expect(dashed[0]?.options.strokeOpacity).toBe(0);
    expect(dashed[0]?.options.icons?.[0]?.icon).toMatchObject({ strokeColor: line, strokeWeight: 4 });
  });

  it("cadre au montage (fitBounds avec la marge --touch-target), puis recentre sur la sélection sans changer le zoom", async () => {
    const view = dayView();
    const { rerender } = await renderReady(view);
    const map = created.maps[0]!;
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0]?.[1]).toEqual({ top: 44, right: 44, bottom: 44, left: 44 });

    const selected = dayView(day2, map2, { selectedStopId: "j2-dejeuner" });
    rerender(<GoogleMapRenderer view={selected} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {});
    const position = map2.points.find((p) => p.ref.type === "stop" && p.ref.stopId === "j2-dejeuner")!;
    expect(map.panTo).toHaveBeenCalledWith({ lat: position.lat, lng: position.lng });
    expect(map.setZoom).not.toHaveBeenCalled();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    const button = markerButton(/^Étape 3 :/);
    expect(button).toHaveAttribute("aria-current", "true");
    expect(markerButtons().filter((b) => b.getAttribute("aria-current") === "true")).toHaveLength(1);
    const marker = created.markers.find((m) => m.content.contains(button))!;
    expect(marker.zIndex).toBeGreaterThan(Math.max(...created.markers.filter((m) => m !== marker && m.map !== null).map((m) => m.zIndex ?? 0)));
  });

  it("avec prefers-reduced-motion, recentre instantanément (setCenter)", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    const { rerender } = await renderReady(dayView());
    rerender(<GoogleMapRenderer view={dayView(day2, map2, { selectedStopId: "j2-royal-mile" })} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {});
    expect(created.maps[0]?.setCenter).toHaveBeenCalledTimes(1);
    expect(created.maps[0]?.panTo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("visibleInsets : un seul panTo vers le centre décalé (étape au milieu de la zone non couverte, décision 0015 § 4)", async () => {
    const insets = { top: 0, right: 0, bottom: 464, left: 0 };
    const { rerender } = await renderReady(dayView(day2, map2, { visibleInsets: insets }));
    const map = created.maps[0]!;
    rerender(
      <GoogleMapRenderer
        view={dayView(day2, map2, { visibleInsets: insets, selectedStopId: "j2-dean-village" })}
        config={CONFIG}
        placesFromGoogle={false}
      />,
    );
    await act(async () => {});
    const point = map2.points.find((p) => p.ref.type === "stop" && p.ref.stopId === "j2-dean-village")!;
    expect(map.panTo).toHaveBeenCalledTimes(1);
    expect(map.panTo).toHaveBeenCalledWith(offsetCenter({ lat: point.lat, lng: point.lng }, insets, 14));
    const center = map.panTo.mock.calls[0]?.[0] as { lat: number; lng: number };
    expect(center.lat).toBeLessThan(point.lat);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("changer visibleInsets ne recadre ni ne recentre", async () => {
    const { rerender } = await renderReady(dayView(day2, map2, { visibleInsets: { top: 0, right: 0, bottom: 200, left: 0 } }));
    const map = created.maps[0]!;
    rerender(
      <GoogleMapRenderer
        view={dayView(day2, map2, { visibleInsets: { top: 0, right: 0, bottom: 700, left: 0 } })}
        config={CONFIG}
        placesFromGoogle={false}
      />,
    );
    await act(async () => {});
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.setCenter).not.toHaveBeenCalled();
  });

  it("un changement de jour recadre ; une nouvelle sélection non", async () => {
    const { rerender } = await renderReady(dayView());
    rerender(<GoogleMapRenderer view={dayView(day4, map4)} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {});
    expect(created.maps[0]?.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("toucher un marqueur appelle onMarkerPress sans sélectionner", async () => {
    const onMarkerPress = vi.fn();
    await renderReady(dayView(day2, map2, { onMarkerPress }));
    fireEvent.click(markerButton(/^Étape 2 :/));
    expect(onMarkerPress).toHaveBeenCalledWith("j2-dean-village");
    expect(markerButton(/^Étape 2 :/)).not.toHaveAttribute("aria-current");
  });

  it("vue d'ensemble : anneaux masqués aux technologies d'assistance, aucun tracé, aucun bouton", async () => {
    const rings = buildOverview(maps);
    await renderReady({ mode: "overview", fitKey: "sejour", rings });
    expect(contents()).toHaveLength(rings.length);
    for (const content of contents()) {
      expect(content.querySelector("[data-part='anneau']")).toHaveAttribute("aria-hidden", "true");
      expect(content.querySelector("[data-kind='overview']")).not.toBeNull();
      expect(content.querySelector("button, [tabindex], [data-kind='terminus']")).toBeNull();
    }
    expect(created.polylines).toHaveLength(0);
    expect(created.maps[0]?.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("échec du chargement : état « erreur » avec Réessayer, qui relance un chargement", async () => {
    loader.importLibrary.mockRejectedValue(new Error("script bloqué"));
    await renderReady(dayView());
    const fallback = await screen.findByText(messages.carte.erreur);
    expect(fallback.closest("[data-fallback='error']")).not.toBeNull();
    const calls = loader.importLibrary.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: messages.carte.reessayer }));
    await act(async () => {});
    expect(loader.importLibrary.mock.calls.length).toBeGreaterThan(calls);
  });

  it("signale l'entrée dans l'état « erreur » et la sortie (onErrorChange), pour la région live de DayMap", async () => {
    loader.importLibrary.mockRejectedValue(new Error("script bloqué"));
    const onErrorChange = vi.fn();
    const { unmount } = render(
      <GoogleMapRenderer view={dayView()} config={CONFIG} placesFromGoogle={false} onErrorChange={onErrorChange} />,
    );
    await act(async () => {});
    expect(onErrorChange).toHaveBeenLastCalledWith(true);
    loader.importLibrary.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: messages.carte.reessayer }));
    await act(async () => {});
    expect(onErrorChange).toHaveBeenLastCalledWith(false);
    unmount();
    expect(onErrorChange).toHaveBeenLastCalledWith(false);
  });

  it("délai de 10 s dépassé : état « erreur »", async () => {
    vi.useFakeTimers();
    loader.importLibrary.mockReturnValue(new Promise(() => {}));
    render(<GoogleMapRenderer view={dayView()} config={CONFIG} placesFromGoogle={false} />);
    await act(async () => {
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 1);
    });
    expect(document.querySelector("[data-fallback]")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector("[data-fallback='error']")).toHaveTextContent(messages.carte.erreur);
  });

  it("clé refusée signalée par l'API (gm_authFailure) : état « erreur »", async () => {
    await renderReady(dayView());
    await act(async () => {
      (window as Window & { gm_authFailure?: () => void }).gm_authFailure?.();
    });
    expect(document.querySelector("[data-fallback='error']")).toHaveTextContent(messages.carte.erreur);
  });
});
