import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as messages from "@/i18n/messages";

import { day2, map2, stubLayout, stubOnline } from "../../../tests/unit/carte-fixtures";

import type { CarteInjection } from "./config";
import type { DayMapProps } from "./DayMap";

/**
 * Bloc du rendu Google chargé à la demande (ticket 991, décision 0152 § 4) : pendant son chargement, puis en cas d'échec
 * du téléchargement. Chaque test recharge `DayMap` (`vi.resetModules`) pour partir d'un composant paresseux neuf.
 */

const loader = vi.hoisted(() => ({ setOptions: vi.fn(), importLibrary: vi.fn() }));
vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: loader.setOptions,
  importLibrary: loader.importLibrary,
}));

// Comportement du téléchargement du bloc : servi, refusé, ou retenu jusqu'à `liberer`.
const bloc = vi.hoisted(() => ({ mode: "servi" as "servi" | "refuse" | "retenu", liberer: () => {}, imports: 0 }));
const t = messages.carte;
const FAKE: CarteInjection = { config: { apiKey: "test-key", mapId: "test-map" } };
const dayProps: DayMapProps = { mode: "day", day: day2, map: map2, listId: "liste", placesFromGoogle: false };

/** Usine du module simulé, réenregistrée à chaque rendu (`vi.doMock`) pour être appelée à chaque import du bloc. */
async function blocSimule(importOriginal: () => Promise<unknown>) {
  bloc.imports += 1;
  if (bloc.mode === "refuse") {
    throw new Error("bloc introuvable");
  }
  if (bloc.mode === "retenu") {
    await new Promise<void>((resolve) => {
      bloc.liberer = resolve;
    });
  }
  return importOriginal();
}

async function renderMap() {
  vi.resetModules();
  vi.doMock("./GoogleMapRenderer", blocSimule);
  const [{ DayMap }, { CarteProvider }] = await Promise.all([import("./DayMap"), import("./config")]);
  return render(
    <CarteProvider value={FAKE}>
      <DayMap {...dayProps} />
    </CarteProvider>,
  );
}

beforeEach(() => {
  stubLayout(390, 320);
  stubOnline(true);
  bloc.mode = "servi";
  bloc.imports = 0;
  // Le chargement Google ne se termine jamais : seul compte ici le montage du rendu.
  loader.importLibrary.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("DayMap : bloc du rendu Google chargé à la demande", () => {
  it("pendant le chargement du bloc : région live vide, ni carte ni état de remplacement ; puis la carte", async () => {
    bloc.mode = "retenu";
    const { container } = await renderMap();
    await waitFor(() => expect(bloc.imports).toBe(1));
    await act(async () => {});
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(container.querySelector("[data-renderer='google']")).toBeNull();
    expect(container.querySelector("[data-fallback]")).toBeNull();
    expect(loader.importLibrary).not.toHaveBeenCalled();

    await act(async () => bloc.liberer());
    await waitFor(() => expect(container.querySelector("[data-renderer='google']")).not.toBeNull());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(loader.importLibrary).toHaveBeenCalled();
  });

  it("bloc refusé : état « erreur » annoncé avec « Réessayer », aucune exception ; « Réessayer » retélécharge le bloc", async () => {
    bloc.mode = "refuse";
    const { container } = await renderMap();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(t.erreur));
    expect(container.querySelector("[data-fallback='error']")).not.toBeNull();
    expect(container.querySelector("[data-renderer='google']")).toBeNull();
    expect(screen.getByRole("region", { name: "Carte du jour 2" })).toBeInTheDocument();
    const imports = bloc.imports;

    bloc.mode = "servi";
    fireEvent.click(screen.getByRole("button", { name: t.reessayer }));
    await waitFor(() => {
      expect(container.querySelector("[data-renderer='google']")).not.toBeNull();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
    expect(bloc.imports).toBeGreaterThan(imports);
    expect(screen.queryByRole("button", { name: t.reessayer })).toBeNull();
  });
});
