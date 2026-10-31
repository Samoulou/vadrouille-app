import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTokens, stubLayout } from "../../../tests/unit/carte-fixtures";
import { carteDe, jourDe, romeFlorence } from "../../../tests/unit/carte-villes-fixtures";

import { CarteProvider } from "./config";
import { DayMap } from "./DayMap";
import { MAPS_LIBRARIES } from "./GoogleMapRenderer";
import { SimulatedMapRenderer } from "./SimulatedMapRenderer";

const SENTINELLES = ["[Ville A]", "[Ville B]"];
const villesParJour = romeFlorence.trip.days.map((day) =>
  day.index < 3 ? { ville: SENTINELLES[0]! } : day.index === 3 ? { de: SENTINELLES[0]!, vers: SENTINELLES[1]! } : { ville: SENTINELLES[1]! },
);

beforeAll(() => {
  applyTokens(["--touch-target"]);
});

beforeEach(() => {
  stubLayout(390, 844);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M4-suite-carte: conformité", () => {
  it("noms sentinelles : étiquettes et noms des repères ne contiennent que ces noms, un numéro et les textes du § 6 ; rien d'écrit ni de demandé", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new Error("aucun appel")));
    render(
      <CarteProvider value={{ simulated: SimulatedMapRenderer }}>
        <DayMap mode="overview" days={romeFlorence.trip.days} maps={romeFlorence.maps} cities={SENTINELLES} citiesOfDays={villesParJour} placesFromGoogle={false} />
      </CarteProvider>,
    );
    expect(screen.getAllByRole("img").map((img) => img.getAttribute("aria-label"))).toEqual(["[Ville A], ville 1", "[Ville B], ville 2"]);
    const etiquettes = Array.from(document.querySelectorAll("[data-part='etiquette-ville']"), (element) => element.textContent);
    expect(etiquettes).toEqual(["1 · [Ville A]", "2 · [Ville B]"]);
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(MAPS_LIBRARIES).toEqual(["maps", "marker"]);
  });

  it("Journée J3 : terminus nommés aux noms sentinelles", () => {
    render(
      <CarteProvider value={{ simulated: SimulatedMapRenderer }}>
        <DayMap
          mode="day"
          day={jourDe(romeFlorence.trip, 3)}
          map={carteDe(romeFlorence.maps, 3)}
          listId="liste"
          transferCities={{ de: SENTINELLES[0]!, vers: SENTINELLES[1]! }}
          moitie="avant"
          placesFromGoogle={false}
        />
      </CarteProvider>,
    );
    expect(screen.getAllByRole("img").map((img) => img.getAttribute("aria-label"))).toEqual(["Logement quitté, [Ville A]", "Nouveau logement, [Ville B]"]);
  });

  it("sans villes ni transfert : J3 rendu comme un jour ordinaire (terminus masqués), Séjour en anneaux", () => {
    const { unmount } = render(
      <CarteProvider value={{ simulated: SimulatedMapRenderer }}>
        <DayMap mode="day" day={jourDe(romeFlorence.trip, 3)} map={carteDe(romeFlorence.maps, 3)} listId="liste" placesFromGoogle={false} />
      </CarteProvider>,
    );
    expect(screen.queryAllByRole("img")).toEqual([]);
    unmount();
    render(
      <CarteProvider value={{ simulated: SimulatedMapRenderer }}>
        <DayMap mode="overview" days={romeFlorence.trip.days} maps={romeFlorence.maps} placesFromGoogle={false} />
      </CarteProvider>,
    );
    expect(screen.queryAllByRole("img")).toEqual([]);
    expect(document.querySelectorAll("[data-part='anneau']").length).toBeGreaterThan(0);
  });
});
