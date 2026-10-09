import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";
import { applyTokens, day2, day4, map2, map4, stubLayout } from "../../../tests/unit/carte-fixtures";

import { buildDayRoute, offsetCenter } from "./route";
import { fitCamera, scaleAt } from "./simulated-model";
import { SimulatedMapRenderer } from "./SimulatedMapRenderer";
import type { MapView } from "./types";

const PADDING = { top: 44, right: 44, bottom: 44, left: 44 };

function view(extra: Partial<Extract<MapView, { mode: "day" }>> = {}, day = day2, map = map2): MapView {
  return { mode: "day", fitKey: `jour-${day.index}`, route: buildDayRoute(day, map), ...extra };
}

const container = () => document.querySelector<HTMLElement>("[data-renderer='simulated']")!;
const camera = () => ({
  lat: Number(container().dataset.centerLat),
  lng: Number(container().dataset.centerLng),
  zoom: Number(container().dataset.zoom),
});

beforeAll(() => {
  applyTokens(["--touch-target"]);
});

beforeEach(() => {
  stubLayout(390, 320);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SimulatedMapRenderer", () => {
  it("cadre selon le modèle et expose center et zoom en attributs", () => {
    render(<SimulatedMapRenderer view={view()} />);
    const expected = fitCamera(buildDayRoute(day2, map2).positions, { width: 390, height: 320 }, PADDING)!;
    expect(camera()).toEqual({ lat: expected.center.lat, lng: expected.center.lng, zoom: expected.zoom });
  });

  it("un bouton par étape positionnée, nommé dans l'ordre ; terminus masqué, non focusable", () => {
    render(<SimulatedMapRenderer view={view()} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Étape 1 : [Royal Mile]",
      "Étape 2 : [Dean Village]",
      "Étape 3 : [Café de Stockbridge]",
      "Étape 4 : [Jardin botanique royal]",
      "Étape 5 : [Bonne table de New Town]",
    ]);
    const termini = document.querySelectorAll("[data-part='terminus']");
    expect(termini).toHaveLength(1);
    expect(termini[0]).toHaveAttribute("aria-hidden", "true");
    expect(termini[0]?.querySelector("button, [tabindex]")).toBeNull();
    expect(termini[0]).not.toHaveAttribute("tabindex");
  });

  it("dessine n + 1 tronçons, seul le retour à pied en pointillé", () => {
    render(<SimulatedMapRenderer view={view()} />);
    const lines = Array.from(document.querySelectorAll("line"));
    expect(lines).toHaveLength(6);
    expect(lines.map((line) => line.dataset.dashed)).toEqual(["false", "false", "false", "false", "false", "true"]);
    expect(document.querySelector("[data-part='trace']")).toHaveAttribute("aria-hidden", "true");
  });

  it("toucher un marqueur appelle onMarkerPress, sans le sélectionner", () => {
    const onMarkerPress = vi.fn();
    render(<SimulatedMapRenderer view={view({ onMarkerPress })} />);
    fireEvent.click(screen.getByRole("button", { name: /^Étape 3 :/ }));
    expect(onMarkerPress).toHaveBeenCalledWith("j2-dejeuner");
    expect(screen.getByRole("button", { name: /^Étape 3 :/ })).not.toHaveAttribute("aria-current");
  });

  it("une sélection recentre sur l'étape sans changer le zoom ; un seul marqueur sélectionné", () => {
    const { rerender } = render(<SimulatedMapRenderer view={view()} />);
    const { zoom } = camera();
    rerender(<SimulatedMapRenderer view={view({ selectedStopId: "j2-dejeuner" })} />);
    const target = map2.points.find((p) => p.ref.type === "stop" && p.ref.stopId === "j2-dejeuner")!;
    expect(camera()).toEqual({ lat: target.lat, lng: target.lng, zoom });
    const selected = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAccessibleName(/^Étape 3 :/);
    expect(selected[0]?.querySelector("[data-selected='true']")).not.toBeNull();
  });

  it("visibleInsets : la sélection place l'étape au centre décalé (offsetCenter), zoom inchangé (décision 0015 § 4)", () => {
    const insets = { top: 0, right: 0, bottom: 200, left: 0 };
    const { rerender } = render(<SimulatedMapRenderer view={view({ visibleInsets: insets })} />);
    const { zoom } = camera();
    rerender(<SimulatedMapRenderer view={view({ visibleInsets: insets, selectedStopId: "j2-dejeuner" })} />);
    const target = map2.points.find((p) => p.ref.type === "stop" && p.ref.stopId === "j2-dejeuner")!;
    const expected = offsetCenter({ lat: target.lat, lng: target.lng }, insets, zoom);
    expect(camera()).toEqual({ lat: expected.lat, lng: expected.lng, zoom });
    expect(camera().lat).toBeLessThan(target.lat);
  });

  it("glisser déplace le centre de l'opposé du geste, sans rappel ni changement de zoom", () => {
    const onMarkerPress = vi.fn();
    render(<SimulatedMapRenderer view={view({ onMarkerPress })} />);
    const before = camera();
    const el = container();
    fireEvent.pointerDown(el, { pointerId: 1, isPrimary: true, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 100 });
    const after = camera();
    expect(after.zoom).toBe(before.zoom);
    expect(after.lng).toBeCloseTo(before.lng + 100 / scaleAt(before.zoom));
    expect(after.lat).toBeCloseTo(before.lat);
    expect(onMarkerPress).not.toHaveBeenCalled();
  });

  it("seul un changement de jour recadre", () => {
    const { rerender } = render(<SimulatedMapRenderer view={view()} />);
    const el = container();
    fireEvent.pointerDown(el, { pointerId: 1, isPrimary: true, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, isPrimary: true, clientX: 250, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true });
    const dragged = camera();
    rerender(<SimulatedMapRenderer view={view()} />);
    expect(camera()).toEqual(dragged);
    rerender(<SimulatedMapRenderer view={view({}, day4, map4)} />);
    const expected = fitCamera(buildDayRoute(day4, map4).positions, { width: 390, height: 320 }, PADDING)!;
    expect(camera()).toEqual({ lat: expected.center.lat, lng: expected.center.lng, zoom: expected.zoom });
  });

  it("n'a aucune violation axe", async () => {
    const { container: root } = render(<SimulatedMapRenderer view={view({ selectedStopId: "j2-dejeuner" })} />);
    expect(await axeViolations(root)).toEqual([]);
  });
});
