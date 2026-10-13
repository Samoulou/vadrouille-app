import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { mockTripAdapter } from "@/adapters/mock";
import type { TripSummary } from "@/contracts";
import { TripSessionProvider, useOptionalTripSession, type TabMemory } from "@/features/voyage/TripSessionProvider";
import * as messages from "@/i18n/messages";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { TripsScreen } from "./TripsScreen";

/** Écran 17 « Mes voyages » (spécification F11, « Tests », `TripsScreen` ; C6, C7, C9, C13). */

const t = messages.mesVoyages;
const AUG_01 = Date.parse("2026-08-01T12:00:00+01:00");
const AUG_30 = Date.parse("2026-08-30T10:40:00+01:00");
const OCT_09 = Date.parse("2026-10-09T12:00:00+01:00");

const clocks = new Map<number, () => number>();
const clock = (value: number) => {
  if (!clocks.has(value)) clocks.set(value, () => value);
  return clocks.get(value)!;
};

async function trips(): Promise<TripSummary[]> {
  return mockTripAdapter.listTrips({ organizationId: MOCK_ORGANIZATION_ID, userId: "user_test", role: "owner" as const });
}

const section = (name: string) => screen.getByRole("region", { name });
const sectionTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
const plates = (container: HTMLElement) => container.querySelectorAll("[data-destination-plate]");
const linkIn = (name: string, destination: RegExp) => within(section(name)).getByRole("link", { name: destination });

describe("TripsScreen : sections", () => {
  it("2026-08-01 : plaque Édimbourg, À venir (compteurs, année de Porto), Pas encore débloqués, Passés (C6)", async () => {
    const { container } = render(<TripsScreen trips={await trips()} now={clock(AUG_01)} />);
    expect(screen.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(plates(container)).toHaveLength(1);
    const plate = plates(container)[0]!;
    expect(plate.getAttribute("data-destination-plate")).toBe("bruyere");
    expect(plate).toHaveClass("bg-dest-bruyere");
    expect(plate.tagName).toBe("A");
    expect(plate.getAttribute("href")).toBe("/voyages/mock_trip_edimbourg_debloque");
    expect(plate).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes");
    expect(sectionTitles()).toEqual(["À venir", "Pas encore débloqués", "Passés"]);

    const upcoming = within(section("À venir")).getAllByRole("link");
    expect(upcoming.map((link) => link.getAttribute("href"))).toEqual(["/voyages/mock_trip_edimbourg_debloque", "/voyages/mock_trip_porto"]);
    expect(upcoming[0]).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes 4 réservations à faire");
    expect(upcoming[1]).toHaveAccessibleName("Porto sam. 08.05 – mar. 11.05.2027 · 2 adultes 2 réservations à faire");

    const locked = linkIn("Pas encore débloqués", /Édimbourg/);
    expect(locked).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes Tes premières propositions");
    expect(locked.getAttribute("href")).toBe("/voyages/mock_trip_edimbourg/presentation");
    expect(within(locked).queryByRole("img")).toBeNull();

    const past = linkIn("Passés", /Lisbonne/);
    expect(past).toHaveAccessibleName("Lisbonne jeu. 14.05 – dim. 17.05 · 2 adultes");
    expect(past.getAttribute("href")).toBe("/voyages/mock_trip_lisbonne");
  });

  it("aucune couleur de destination hors de la plaque", async () => {
    const { container } = render(<TripsScreen trips={await trips()} now={clock(AUG_01)} />);
    expect(container.querySelectorAll("[class*='dest-']")).toHaveLength(1);
  });

  it("2026-08-30 : En cours Édimbourg débloqué, l'autre reste dans Pas encore débloqués (C7)", async () => {
    render(<TripsScreen trips={await trips()} now={clock(AUG_30)} />);
    expect(sectionTitles()).toEqual(["En cours", "À venir", "Pas encore débloqués", "Passés"]);
    expect(linkIn("En cours", /Édimbourg/)).toHaveAccessibleName(/4 réservations à faire$/);
    expect(within(section("Pas encore débloqués")).getAllByRole("link")).toHaveLength(1);
  });

  it("2026-10-09 : plaque Porto (granit), Passés dans l'ordre Édimbourg « Non débloqué », Édimbourg, Lisbonne, sans compteur (C7)", async () => {
    const { container } = render(<TripsScreen trips={await trips()} now={clock(OCT_09)} />);
    expect(sectionTitles()).toEqual(["À venir", "Passés"]);
    expect(plates(container)).toHaveLength(1);
    expect(plates(container)[0]!.getAttribute("data-destination-plate")).toBe("granit");
    expect(plates(container)[0]).toHaveAccessibleName("Porto sam. 08.05 – mar. 11.05.2027 · 2 adultes");
    const past = within(section("Passés")).getAllByRole("link");
    expect(past.map((link) => link.getAttribute("href"))).toEqual([
      "/voyages/mock_trip_edimbourg",
      "/voyages/mock_trip_edimbourg_debloque",
      "/voyages/mock_trip_lisbonne",
    ]);
    expect(past[0]).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes Non débloqué");
    expect(past[1]).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes");
    expect(within(section("Passés")).queryAllByRole("img")).toEqual([]);
  });
});

describe("TripsScreen : compteur de réservations", () => {
  const base: TripSummary = {
    id: "t1",
    destination: "[Ville]",
    destinationColor: "ocre",
    start: "2026-09-10",
    end: "2026-09-12",
    timeZone: "Europe/London",
    travellers: { adults: 2, children: 0 },
    unlocked: true,
    toReserveCount: 1,
    dayCount: 3,
  };

  it("singulier, pluriel, rien à 0 ; compteur jaune (action requise)", () => {
    render(
      <TripsScreen
        trips={[base, { ...base, id: "t2", toReserveCount: 3 }, { ...base, id: "t3", toReserveCount: 0 }]}
        now={clock(AUG_01)}
      />,
    );
    const counters = screen.getAllByRole("img");
    expect(counters.map((counter) => counter.getAttribute("aria-label"))).toEqual(["1 réservation à faire", "3 réservations à faire"]);
    for (const counter of counters) expect(counter).toHaveClass("bg-quai", "text-ink");
    const links = within(section("À venir")).getAllByRole("link");
    expect(links[0]).toHaveAccessibleName("[Ville] jeu. 10.09 – sam. 12.09 · 2 adultes 1 réservation à faire");
    expect(links[2]).toHaveAccessibleName("[Ville] jeu. 10.09 – sam. 12.09 · 2 adultes");
  });
});

describe("TripsScreen : réouverture au dernier onglet consulté", () => {
  it("lit la mémoire de l'onglet ; plaque et ligne mènent à la même cible", async () => {
    let memory: TabMemory | null = null;
    function Probe() {
      memory = useOptionalTripSession();
      return null;
    }
    const list = await trips();
    const { rerender, container } = render(
      <TripSessionProvider>
        <Probe />
      </TripSessionProvider>,
    );
    memory!.recordLastTab("mock_trip_edimbourg_debloque", { kind: "jour", n: 3 });
    memory!.recordLastTab("mock_trip_porto", { kind: "jour", n: 9 });
    rerender(
      <TripSessionProvider>
        <Probe />
        <TripsScreen trips={list} now={clock(AUG_01)} />
      </TripSessionProvider>,
    );
    // Même arbre : le fournisseur reste monté, sa mémoire aussi.
    expect(plates(container)[0]!.getAttribute("href")).toBe("/voyages/mock_trip_edimbourg_debloque/jour/3");
    expect(linkIn("À venir", /Édimbourg/).getAttribute("href")).toBe("/voyages/mock_trip_edimbourg_debloque/jour/3");
    // Jour 9 inexistant pour Porto (4 jours) : ignoré.
    expect(linkIn("À venir", /Porto/).getAttribute("href")).toBe("/voyages/mock_trip_porto");
  });
});

describe("TripsScreen : attente et état vide", () => {
  it("avant le classement : squelette et « Chargement de tes voyages » (role=status), aucune ligne (C9)", async () => {
    const html = renderToString(<TripsScreen trips={await trips()} now={clock(AUG_01)} />);
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(host.querySelector("[role='status']")?.textContent).toBe(t.chargement);
    expect(host.querySelectorAll("[data-part='squelette'] > div")).toHaveLength(3);
    expect(host.querySelector("[data-part='squelette']")?.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelectorAll("a")).toHaveLength(0);
    expect(host.querySelectorAll("[data-destination-plate]")).toHaveLength(0);
    expect(host.querySelector("h1")?.textContent).toBe("Mes voyages");
  });

  it("aucun voyage, sans écran 1 : le texte seul, ni section, ni plaque, ni lien (C13)", () => {
    const { container } = render(<TripsScreen trips={[]} now={clock(AUG_01)} />);
    expect(screen.getByText("Tu n'as pas encore de voyage.")).toHaveClass("text-corps", "text-ink");
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
    expect(plates(container)).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("aucun voyage, avec écran 1 : « Créer un voyage » en primary pleine largeur (C13)", () => {
    render(<TripsScreen trips={[]} createHref="/voyages/nouveau" now={clock(AUG_01)} />);
    const create = screen.getByRole("link", { name: "Créer un voyage" });
    expect(create.getAttribute("href")).toBe("/voyages/nouveau");
    expect(create).toHaveClass("bg-line", "w-full");
  });

  it("avec voyages et écran 1 : « Créer un voyage » secondaire en tête ; sans écran 1 : aucun lien de création", async () => {
    const list = await trips();
    const { unmount } = render(<TripsScreen trips={list} createHref="/voyages/nouveau" now={clock(AUG_01)} />);
    expect(screen.getByRole("link", { name: "Créer un voyage" })).toHaveClass("border-ink", "h-11");
    unmount();
    render(<TripsScreen trips={list} now={clock(AUG_01)} />);
    expect(screen.queryByRole("link", { name: "Créer un voyage" })).toBeNull();
  });

  it("intégré (catalogue des états) : pas de main ni de titre de niveau 1", () => {
    const { container } = render(<TripsScreen trips={[]} embedded />);
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Mes voyages" })).toBeInTheDocument();
  });
});

describe("TripsScreen : accessibilité et vocabulaire", () => {
  it.each([AUG_01, AUG_30, OCT_09])("axe sans violation (%s)", async (now) => {
    const { container } = render(<TripsScreen trips={await trips()} now={clock(now)} />);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("axe sans violation, état vide", async () => {
    const { container } = render(<TripsScreen trips={[]} now={clock(AUG_01)} />);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("textes de mesVoyages.* sans mot interdit ni point d'exclamation", () => {
    const text = JSON.stringify(t);
    for (const word of ["Aperçu", "Supprimer", "OK", "Valider", "Vérifié", "Premium", "!"]) {
      expect(text, word).not.toContain(word);
    }
  });
});
