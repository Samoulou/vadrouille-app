import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messages } from "@/i18n";

import { axeViolations } from "../../../tests/unit/axe";
import { day2, days, map2, maps, stubLayout, stubOnline } from "../../../tests/unit/carte-fixtures";

import { CarteProvider, type CarteInjection } from "./config";
import { DayMap, type DayMapProps } from "./DayMap";
import { buildOverview } from "./route";
import { SimulatedMapRenderer } from "./SimulatedMapRenderer";

const loader = vi.hoisted(() => ({ setOptions: vi.fn(), importLibrary: vi.fn() }));
vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: loader.setOptions,
  importLibrary: loader.importLibrary,
}));

const t = messages.carte;
const EMPTY: CarteInjection = { config: {} };
const FAKE: CarteInjection = { config: { apiKey: "test-key", mapId: "test-map" } };
const SIMULATED_EMPTY: CarteInjection = { config: {}, simulated: SimulatedMapRenderer };

const dayProps: DayMapProps = { mode: "day", day: day2, map: map2, listId: "liste", placesFromGoogle: false };

function renderMap(injection: CarteInjection, props: DayMapProps = dayProps, after?: ReactNode) {
  return render(
    <CarteProvider value={injection}>
      <DayMap {...props} />
      {after}
    </CarteProvider>,
  );
}

beforeEach(() => {
  stubLayout(390, 320);
  // Le chargement Google ne se termine jamais : seul compte ici qu'il soit tenté ou non.
  loader.importLibrary.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("DayMap : précédence des états de remplacement (rendu Google, bibliothèque simulée)", () => {
  it("hors ligne avec une configuration vide → « Carte indisponible hors ligne »", () => {
    stubOnline(false);
    renderMap(EMPTY);
    expect(screen.getByRole("status")).toHaveTextContent(t.horsLigne);
  });

  it("de retour en ligne avec la configuration vide → « Carte indisponible. La liste contient tout le programme. »", () => {
    const setOnline = stubOnline(false);
    renderMap(EMPTY);
    act(() => setOnline(true));
    expect(screen.getByRole("status")).toHaveTextContent(t.indisponible);
    expect(loader.importLibrary).not.toHaveBeenCalled();
  });

  it("hors ligne avec une configuration factice → aucun chargement tenté, jamais l'état d'erreur", async () => {
    stubOnline(false);
    loader.importLibrary.mockRejectedValue(new Error("bloqué"));
    renderMap(FAKE);
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent(t.horsLigne);
    expect(screen.queryByText(t.erreur)).toBeNull();
    expect(loader.setOptions).not.toHaveBeenCalled();
    expect(loader.importLibrary).not.toHaveBeenCalled();
  });

  it("de retour en ligne avec une configuration factice → nouveau chargement", async () => {
    const setOnline = stubOnline(false);
    renderMap(FAKE);
    act(() => setOnline(true));
    await act(async () => {});
    expect(loader.importLibrary).toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    ["sans clé", { config: { mapId: "test-map" } }],
    ["sans Map ID", { config: { apiKey: "test-key" } }],
    ["vide", EMPTY],
  ])("configuration %s → aucun script demandé, « Carte indisponible… », role status, aucun nom de variable", (_, injection) => {
    stubOnline(true);
    const { container } = renderMap(injection);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(t.indisponible);
    expect(within(status).queryByRole("button")).toBeNull();
    expect(loader.setOptions).not.toHaveBeenCalled();
    expect(loader.importLibrary).not.toHaveBeenCalled();
    expect(document.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toMatch(/NEXT_PUBLIC|GOOGLE_MAPS/);
  });

  it("sans contexte : la configuration vient de l'environnement (vide ici)", () => {
    stubOnline(true);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    render(<DayMap {...dayProps} />);
    expect(screen.getByRole("status")).toHaveTextContent(t.indisponible);
    expect(loader.importLibrary).not.toHaveBeenCalled();
  });

  it("jour sans position (null ou vide) → « Carte indisponible… » sans Réessayer, aucun script, même configuré", () => {
    stubOnline(true);
    for (const map of [null, { ...map2, points: [] }]) {
      const { unmount } = renderMap(FAKE, { ...dayProps, map });
      expect(screen.getByRole("status")).toHaveTextContent(t.indisponible);
      expect(screen.queryByRole("button", { name: t.reessayer })).toBeNull();
      unmount();
    }
    expect(loader.importLibrary).not.toHaveBeenCalled();
  });

  it("jour sans position hors ligne → l'état hors ligne l'emporte", () => {
    stubOnline(false);
    renderMap(FAKE, { ...dayProps, map: null });
    expect(screen.getByRole("status")).toHaveTextContent(t.horsLigne);
  });

  it("configuration complète en ligne → le rendu Google charge la carte", async () => {
    stubOnline(true);
    renderMap(FAKE);
    await act(async () => {});
    expect(loader.importLibrary).toHaveBeenCalled();
    expect(document.querySelector("[data-renderer='google']")).not.toBeNull();
  });
});

describe("DayMap : carte simulée injectée", () => {
  it("s'affiche avec une configuration vide (aucun état de remplacement, aucun chargement Google)", () => {
    stubOnline(true);
    renderMap(SIMULATED_EMPTY);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("[data-renderer='simulated']")).not.toBeNull();
    expect(loader.importLibrary).not.toHaveBeenCalled();
  });

  it("passe à l'état hors ligne puis revient à la carte simulée en ligne", () => {
    const setOnline = stubOnline(true);
    renderMap(SIMULATED_EMPTY);
    act(() => setOnline(false));
    expect(screen.getByRole("status")).toHaveTextContent(t.horsLigne);
    expect(document.querySelector("[data-renderer='simulated']")).toBeNull();
    act(() => setOnline(true));
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("[data-renderer='simulated']")).not.toBeNull();
  });
});

describe("DayMap : accessibilité", () => {
  it("région « Carte du jour 2 », lien d'évitement vers la liste en premier, puis les marqueurs", () => {
    stubOnline(true);
    renderMap(SIMULATED_EMPTY);
    expect(screen.getByRole("region", { name: "Carte du jour 2" })).toBeInTheDocument();
    const skip = screen.getByRole("link", { name: t.evitement });
    expect(skip).toHaveAttribute("href", "#liste");
    const focusables = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, [tabindex]")).filter(
      (el) => el.tabIndex >= 0,
    );
    expect(focusables[0]).toBe(skip);
    expect(focusables.slice(1).map((el) => el.getAttribute("aria-label"))).toEqual([
      "Étape 1 : [Royal Mile]",
      "Étape 2 : [Dean Village]",
      "Étape 3 : [Café de Stockbridge]",
      "Étape 4 : [Jardin botanique royal]",
      "Étape 5 : [Bonne table de New Town]",
    ]);
  });

  it("activer le lien d'évitement donne le focus à la liste sans changer l'adresse", () => {
    stubOnline(true);
    const before = window.location.href;
    renderMap(SIMULATED_EMPTY, dayProps, <ol id="liste" tabIndex={-1} />);
    fireEvent.click(screen.getByRole("link", { name: t.evitement }));
    expect(document.activeElement).toBe(document.getElementById("liste"));
    expect(window.location.href).toBe(before);
  });

  it("n'a aucune violation axe (carte simulée, chaque état de remplacement)", async () => {
    const setOnline = stubOnline(true);
    const { container, unmount } = renderMap(SIMULATED_EMPTY);
    expect(await axeViolations(container)).toEqual([]);
    act(() => setOnline(false));
    expect(await axeViolations(container)).toEqual([]);
    unmount();
    act(() => setOnline(true));
    const empty = renderMap(EMPTY);
    expect(await axeViolations(empty.container)).toEqual([]);
  });
});

describe("DayMap : vue d'ensemble", () => {
  it("région « Carte du séjour », un anneau masqué par position, aucun bouton, aucun tracé, aucun lien", async () => {
    stubOnline(true);
    const { container } = renderMap(SIMULATED_EMPTY, { mode: "overview", days, maps, placesFromGoogle: false });
    expect(screen.getByRole("region", { name: t.regionSejour })).toBeInTheDocument();
    const rings = container.querySelectorAll("[data-part='anneau']");
    expect(rings).toHaveLength(buildOverview(maps).length);
    for (const ring of rings) {
      expect(ring).toHaveAttribute("aria-hidden", "true");
      expect(ring.querySelector("[data-kind='overview']")).not.toBeNull();
    }
    expect(container.querySelector("[data-kind='terminus'], [data-kind='stop']")).toBeNull();
    expect(container.querySelector("button, a, [tabindex], line")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });
});
