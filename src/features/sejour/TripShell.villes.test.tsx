import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CarteProvider } from "@/components/carte/config";
import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";
import type { DayMap, Trip } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";

import { axeViolations } from "../../../tests/unit/axe";
import { applyTokens, stubLayout } from "../../../tests/unit/carte-fixtures";
import { CARTE_VILLES, romeFlorence, romeFlorenceRome } from "../../../tests/unit/carte-villes-fixtures";

import { TripShell } from "./TripShell";

/**
 * Choix « Afficher sur la carte » de `TripShell` (décision 0150 § 2 point 4, § 3 points 4 et 5 ; critères 6, 8 et 9), avec
 * la carte simulée injectée.
 */
const location: { n?: string; etape: string | null } = { etape: null };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => (location.n === undefined ? {} : { n: location.n }),
  useSearchParams: () => new URLSearchParams(location.etape ? { etape: location.etape } : {}),
}));

function tree(trip: Trip, maps: DayMap[]): ReactElement {
  return (
    <CarteProvider value={{ simulated: SimulatedMapRenderer }}>
      <TripShell trip={trip} maps={maps} base="/voyages">
        <p>{trip.destination}</p>
      </TripShell>
    </CarteProvider>
  );
}

async function renderAt(jeu: { trip: Trip; maps: DayMap[] }, at: { n?: string; etape?: string | null } = {}) {
  location.n = at.n;
  location.etape = at.etape ?? null;
  const result = render(tree(jeu.trip, jeu.maps));
  // Choix « Afficher sur la carte » chargé à la demande (décision 0152 § 4).
  await act(async () => {
    await import("@/components/ligne/SegmentedControl");
  });
  return {
    ...result,
    navigate: (next: { n?: string; etape?: string | null }) => {
      location.n = next.n;
      location.etape = next.etape ?? null;
      result.rerender(tree(jeu.trip, jeu.maps));
    },
  };
}

/** Panneau du voyage (« Programme », ou « Fiche » quand une fiche est ouverte). */
const panneau = () => document.querySelector<HTMLElement>("[data-sheet]")!;
const choix = () => within(panneau()).queryByRole("radiogroup", { name: "Afficher sur la carte" });
const options = () => within(choix()!).getAllByRole("radio");
const choisie = () => options().find((option) => option.getAttribute("aria-checked") === "true")?.textContent;
const camera = () => {
  const element = document.querySelector<HTMLElement>("[data-renderer='simulated']")!;
  return `${element.dataset.centerLat}|${element.dataset.centerLng}|${element.dataset.zoom}`;
};

beforeAll(() => {
  applyTokens(["--touch-target"]);
});

beforeEach(() => {
  stubLayout(390, 844);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M4-suite-carte: choix de la vue sur Séjour", () => {
  it("radiogroup « Afficher sur la carte » dans l'en-tête du panneau, sous les onglets, « Toutes les villes » choisie", async () => {
    const { container } = await renderAt(romeFlorence);
    expect(options().map((option) => option.textContent)).toEqual(["Toutes les villes", "Rome", "Florence"]);
    expect(choisie()).toBe("Toutes les villes");
    // Sous les onglets du voyage, dans l'en-tête (avant le contenu du panneau).
    const onglets = within(panneau()).getByRole("link", { name: /Séjour/ });
    expect(onglets.compareDocumentPosition(choix()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(choix()!.compareDocumentPosition(within(panneau()).getByText("Rome", { selector: "p" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Aucun élément focalisable nouveau dans la région de la carte.
    const carte = screen.getByRole("region", { name: "Carte du séjour" });
    expect(carte.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("choisir « Florence » recadre ; rechoisir ne recadre pas ; « Toutes les villes » recadre sur toutes", async () => {
    await renderAt(romeFlorence);
    const toutes = camera();
    fireEvent.click(screen.getByRole("radio", { name: "Florence" }));
    expect(choisie()).toBe("Florence");
    const florence = camera();
    expect(florence).not.toBe(toutes);
    fireEvent.click(screen.getByRole("radio", { name: "Florence" }));
    expect(camera()).toBe(florence);
    fireEvent.click(screen.getByRole("radio", { name: "Toutes les villes" }));
    expect(camera()).toBe(toutes);
  });

  it("quitter le Séjour pour une Journée puis revenir : « Toutes les villes » choisie, carte cadrée sur toutes les villes", async () => {
    const { navigate } = await renderAt(romeFlorence);
    const toutes = camera();
    fireEvent.click(screen.getByRole("radio", { name: "Florence" }));
    navigate({ n: "2" });
    navigate({});
    expect(choisie()).toBe("Toutes les villes");
    expect(camera()).toBe(toutes);
  });

  it("Rome, Florence, Rome : trois options", async () => {
    await renderAt(romeFlorenceRome(false));
    expect(options().map((option) => option.textContent)).toEqual(["Toutes les villes", "Rome", "Florence"]);
  });

  it("une seule ville (Édimbourg) : aucun choix, aucun repère de ville, logement en anneau", async () => {
    await renderAt({ trip: edimbourg, maps: edimbourgCarte });
    expect(choix()).toBeNull();
    expect(screen.queryAllByRole("img")).toEqual([]);
    expect(document.querySelectorAll("[data-part='anneau']").length).toBeGreaterThan(0);
  });
});

describe("M4-suite-carte: cadrage de la Journée du changement de ville", () => {
  it("J3 : choix « Rome » et « Florence », « Rome » à l'ouverture ; J2 : aucun choix, terminus masqués", async () => {
    const { navigate } = await renderAt(romeFlorence, { n: "3" });
    expect(options().map((option) => option.textContent)).toEqual(["Rome", "Florence"]);
    expect(choisie()).toBe("Rome");
    expect(screen.getAllByRole("img").map((img) => img.getAttribute("aria-label"))).toEqual(["Logement quitté, Rome", "Nouveau logement, Florence"]);
    navigate({ n: "2" });
    expect(choix()).toBeNull();
    expect(screen.queryAllByRole("img")).toEqual([]);
  });

  it("ouvrir J3 avec l'étape 3 déjà sélectionnée : ouverture sur « Florence »", async () => {
    await renderAt(romeFlorence, { n: "3", etape: "cv-j3-arrivee" });
    expect(choisie()).toBe("Florence");
  });

  it("choisir « Florence » recadre sur la moitié « après »", async () => {
    await renderAt(romeFlorence, { n: "3" });
    const avant = camera();
    fireEvent.click(screen.getByRole("radio", { name: "Florence" }));
    expect(camera()).not.toBe(avant);
  });
});

describe("M4-suite-carte: sélection dans l'autre moitié", () => {
  it("J3 sur « Rome » : sélectionner l'étape 3 fait passer le choix à « Florence » ; l'étape 2 le laisse sur « Rome »", async () => {
    const { navigate } = await renderAt(romeFlorence, { n: "3" });
    navigate({ n: "3", etape: "cv-j3-depart-2" });
    expect(choisie()).toBe("Rome");
    navigate({ n: "3", etape: "cv-j3-arrivee" });
    expect(choisie()).toBe("Florence");
    expect(screen.getByRole("radio", { name: "Florence" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("M4-suite-carte: accessibilité", () => {
  it("axe sans violation : Séjour à trois villes (toutes, une ville) et Journée J3 (chaque moitié)", async () => {
    const { container, unmount } = await renderAt(CARTE_VILLES["rome-florence-venise"]!);
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("radio", { name: "Venise" }));
    expect(await axeViolations(container)).toEqual([]);
    unmount();
    const journee = await renderAt(romeFlorence, { n: "3" });
    expect(await axeViolations(journee.container)).toEqual([]);
    fireEvent.click(screen.getByRole("radio", { name: "Florence" }));
    expect(await axeViolations(journee.container)).toEqual([]);
  });
});
