import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectSharedMaps, projectSharedPoints, projectSharedTrip } from "@/adapters/share-projection";
import { CarteProvider, type CarteInjection } from "@/components/carte/config";
import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";
import { deriveEdimbourgCarte } from "@/mocks/edimbourg-carte";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";
import { stubLayout } from "../../../tests/unit/carte-fixtures";

import { SharedDayScreen } from "./SharedDayScreen";
import { SharedShell, sharedRouteDay, sharedRouteMap } from "./SharedShell";
import { SharedTripScreen } from "./SharedTripScreen";

vi.mock("@googlemaps/js-api-loader", () => ({ setOptions: vi.fn(), importLibrary: vi.fn(() => new Promise(() => {})) }));

/** Vue partagée (spécification F10, F10c : C5, C29, C30, C31 ; décision 0039, F10-TL-14). */

const TOKEN = "A".repeat(43);
const trip = projectSharedTrip(edimbourgDebloque);
const carte = deriveEdimbourgCarte(edimbourgDebloque);
const maps = projectSharedMaps(edimbourgDebloque, carte);
const day2 = trip.days[1]!;
const day6 = trip.days.find((day) => day.generating)!;
const points2 = projectSharedPoints(edimbourgDebloque.days[1]!, carte[1]);
const SIMULATED: CarteInjection = { config: {}, simulated: SimulatedMapRenderer };
const EMPTY: CarteInjection = { config: {} };

function renderDay(injection: CarteInjection = SIMULATED, placesFromGoogle = false) {
  return render(
    <CarteProvider value={injection}>
      <SharedShell token={TOKEN} days={trip.days} current={2} maps={[{ index: 2, points: points2 }]} placesFromGoogle={placesFromGoogle}>
        <SharedDayScreen day={day2} placesFromGoogle={placesFromGoogle} />
      </SharedShell>
    </CarteProvider>,
  );
}

function renderTrip(injection: CarteInjection = SIMULATED, placesFromGoogle = false) {
  return render(
    <CarteProvider value={injection}>
      <SharedShell token={TOKEN} days={trip.days} current="sejour" maps={maps} placesFromGoogle={placesFromGoogle}>
        <SharedTripScreen token={TOKEN} trip={trip} placesFromGoogle={placesFromGoogle} />
      </SharedShell>
    </CarteProvider>,
  );
}

beforeEach(() => {
  stubLayout(390, 844);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("carte de la vue partagée (C31)", () => {
  it("conversion : étapes seulement, désignées par leur clé ; aucun terminus", () => {
    const route = sharedRouteDay(day2);
    expect(route.items.every((item) => item.type === "stop")).toBe(true);
    expect(route.items.map((item) => (item.type === "stop" ? item.stop.id : ""))).toEqual(
      day2.items.flatMap((item) => (item.type === "stop" ? [item.stop.key] : [])),
    );
    expect(sharedRouteMap({ index: 2, points: points2 }).points.every((point) => point.ref.type === "stop")).toBe(true);
  });

  it("jour 2, rendu simulé : un marqueur par étape, non interactif, aucun terminus, tracé de la première à la dernière étape", () => {
    renderDay();
    const region = screen.getByRole("region", { name: /carte/i });
    const stops = day2.items.filter((item) => item.type === "stop");
    const markers = region.querySelectorAll("[data-stop-id]");
    expect(markers).toHaveLength(stops.length);
    for (const marker of markers) expect(marker.tagName).not.toBe("BUTTON");
    expect(within(region).queryAllByRole("button")).toEqual([]);
    expect(within(region).getAllByRole("img").length).toBe(stops.length);
    expect(region.querySelector("[data-part='terminus']")).toBeNull();
    expect(region.querySelectorAll("[data-part='trace'] line")).toHaveLength(stops.length - 1);
  });

  it("sans configuration ni carte simulée : état de remplacement, comme la Journée", () => {
    renderDay(EMPTY);
    expect(screen.getByRole("status", { name: "" })).toBeDefined();
    expect(document.querySelector("[data-stop-id]")).toBeNull();
  });

  it("vue d'ensemble : un anneau par étape positionnée, aucun terminus", () => {
    renderTrip();
    const positioned = maps.reduce((sum, map) => sum + map.points.length, 0);
    expect(document.querySelectorAll("[data-part='anneau']")).toHaveLength(positioned);
  });
});

describe("Séjour partagé, RP (C29)", () => {
  it("mention, plaque en titre de niveau 1, « Pendant le séjour » sans lien, « Jour par jour » vers RPJ", async () => {
    const { container } = renderTrip(EMPTY);
    expect(screen.getByText("Programme partagé · lecture seule")).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(trip.destination);
    expect(container).toHaveTextContent("2 adultes");
    const pendant = screen.getByRole("region", { name: "Pendant le séjour" });
    expect(within(pendant).queryAllByRole("link")).toEqual([]);
    expect(within(pendant).getAllByRole("listitem").length).toBeGreaterThan(0);
    const jours = screen.getByRole("region", { name: "Jour par jour" });
    const links = within(jours).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(trip.days.map((day) => `/p/${TOKEN}/jour/${day.index}`));
    expect(jours).not.toHaveTextContent("de trajet");
    for (const text of ["À faire avant de partir", "Budget", "Partager", "Aujourd'hui", "Pendant ton séjour"]) {
      expect(container).not.toHaveTextContent(text);
    }
    expect(container.querySelector("[data-part='retour']")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("C5 : mention « Données de lieux : Google » une fois avec placesFromGoogle, absente sinon", () => {
    const { unmount } = render(<SharedTripScreen token={TOKEN} trip={trip} placesFromGoogle />);
    expect(screen.getAllByText("Données de lieux : Google")).toHaveLength(1);
    unmount();
    render(<SharedTripScreen token={TOKEN} trip={trip} placesFromGoogle={false} />);
    expect(screen.queryByText("Données de lieux : Google")).toBeNull();
  });
});

describe("Journée partagée, RPJ (C30)", () => {
  it("ligne du jour sans lien ; terminus sans libellé ; « À réserver » absent ; « Non confirmé » sur le concert ; Retour vers RP", async () => {
    const { container } = renderDay(EMPTY);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dimanche 30 août");
    const list = container.querySelector("ol")!;
    expect(list).not.toBeNull();
    expect(within(list).queryAllByRole("link")).toEqual([]);
    const dean = within(list).getByText("[Dean Village]").closest("li")!;
    expect(dean).toHaveTextContent("10:50");
    expect(list).toHaveTextContent("Début de journée");
    expect(list).toHaveTextContent("Fin de journée");
    const table = within(list).getByText("[Bonne table de New Town]").closest("li")!;
    expect(table).toHaveTextContent("19:00");
    expect(container).not.toHaveTextContent("À réserver");
    const concert = screen.getByText("[Concert d'orgue à St Giles]").closest("li")!;
    expect(concert).toHaveTextContent("Non confirmé");
    expect(container).not.toHaveTextContent("[Tu as choisi la musique]");
    expect(container.querySelector("[data-kind='travel']")).toBeNull();
    expect(container.querySelector("[data-part='retour']")).toHaveAttribute("href", `/p/${TOKEN}`);
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", `/p/${TOKEN}`);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("jour en préparation : « Cette journée est encore en préparation. », sans ligne du jour", () => {
    const { container } = render(<SharedDayScreen day={day6} placesFromGoogle={false} />);
    expect(screen.getByText("Cette journée est encore en préparation.")).toBeVisible();
    expect(container.querySelector("ol")).toBeNull();
  });

  it("C5 : mention « Données de lieux : Google » une fois avec placesFromGoogle, absente sinon", () => {
    const { unmount } = render(<SharedDayScreen day={day2} placesFromGoogle />);
    expect(screen.getAllByText("Données de lieux : Google")).toHaveLength(1);
    unmount();
    render(<SharedDayScreen day={day2} placesFromGoogle={false} />);
    expect(screen.queryByText("Données de lieux : Google")).toBeNull();
  });
});
