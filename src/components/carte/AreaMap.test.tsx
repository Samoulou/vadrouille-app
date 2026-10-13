import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messages } from "@/i18n";

import { axeViolations } from "../../../tests/unit/axe";
import { stubLayout, stubOnline } from "../../../tests/unit/carte-fixtures";

import { AreaMap } from "./AreaMap";
import { CarteProvider, type CarteInjection } from "./config";
import { areaCorners, areaRadiusDegrees } from "./route";
import { SimulatedMapRenderer } from "./SimulatedMapRenderer";

const loader = vi.hoisted(() => ({ setOptions: vi.fn(), importLibrary: vi.fn() }));
vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: loader.setOptions,
  importLibrary: loader.importLibrary,
}));

/** Mini-carte de zone de l'écran 3 (F8-TL-7, décision 0017 § 7). */

const t = messages.carte.zone;
const CENTER = { lat: 55.9543, lng: -3.1976 };
const EMPTY: CarteInjection = { config: {} };
const FAKE: CarteInjection = { config: { apiKey: "test-key", mapId: "test-map" } };
const SIMULATED: CarteInjection = { config: {}, simulated: SimulatedMapRenderer };

function renderArea(injection: CarteInjection) {
  return render(
    <CarteProvider value={injection}>
      <AreaMap center={CENTER} radiusM={700} name="[New Town]" />
    </CarteProvider>,
  );
}

beforeEach(() => {
  stubLayout(390, 220);
  loader.importLibrary.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AreaMap", () => {
  it("région nommée par le quartier ; configuration absente : état de F4 avec le texte de la zone, aucun script demandé", async () => {
    const { container } = renderArea(EMPTY);
    const region = screen.getByRole("region", { name: "Carte du quartier [New Town]" });
    expect(region).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.indisponible);
    expect(loader.importLibrary).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("hors ligne : texte « hors ligne » de la zone, même avec la carte simulée", () => {
    stubOnline(false);
    renderArea(SIMULATED);
    expect(screen.getByRole("status")).toHaveTextContent(t.horsLigne);
  });

  it("carte simulée injectée : cercle de la zone, sans clé Google ni script", () => {
    const { container } = renderArea(SIMULATED);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(container.querySelector('[data-part="zone"]')).not.toBeNull();
    expect(loader.importLibrary).not.toHaveBeenCalled();
  });

  it("configuration complète : rendu Google tenté", () => {
    renderArea(FAKE);
    expect(loader.importLibrary).toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("géométrie de la zone", () => {
  it("bornes : deux coins opposés à la distance du rayon, autour du centre", () => {
    const corners = areaCorners(CENTER, 700);
    const lats = corners.map((c) => c.lat);
    const lngs = corners.map((c) => c.lng);
    expect(Math.max(...lats) - CENTER.lat).toBeCloseTo(CENTER.lat - Math.min(...lats), 9);
    expect(Math.max(...lats) - CENTER.lat).toBeCloseTo(areaRadiusDegrees(700), 9);
    // Les longitudes s'écartent davantage à cette latitude (cosinus).
    expect(Math.max(...lngs) - CENTER.lng).toBeGreaterThan(Math.max(...lats) - CENTER.lat);
  });

  it("rayon en degrés : 1 km ≈ 0,009 degré de latitude", () => {
    expect(areaRadiusDegrees(1000)).toBeCloseTo(0.009, 3);
  });
});
