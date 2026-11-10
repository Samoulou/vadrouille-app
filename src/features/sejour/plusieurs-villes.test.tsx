import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { Day, Trip } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { romeFlorence } from "@/mocks/rome-florence";

import { axeViolations } from "../../../tests/unit/axe";

import { JourneePanel } from "./JourneePanel";
import { tripRoutes } from "./routes";
import { SejourOriginProvider } from "./SejourOrigin";
import { SejourPanel } from "./SejourPanel";
import { TripShell } from "./TripShell";

// Jour courant simulé de l'adresse (`n`), lu par `TripShell` pour la pastille active.
const location: { n?: string } = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => (location.n === undefined ? {} : { n: location.n }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

function renderSejour(trip: Trip, unlockHref: string | null = null) {
  location.n = undefined;
  return render(
    <TripShell trip={trip} maps={[]} base="/voyages" unlockHref={unlockHref}>
      <SejourOriginProvider>
        <SejourPanel recorder={createMemoryRecorder()} />
      </SejourOriginProvider>
    </TripShell>,
  );
}

const panel = () => screen.getByRole("region", { name: "Programme" });
const jourParJour = () => within(panel()).getByRole("heading", { level: 2, name: "Jour par jour" }).closest("section")!;
const jour3 = (): Day => romeFlorence.days.find((day) => day.index === 3)!;
/** « Jour par jour » groupé par ville est chargé à la demande (`lazy`) : attend ses groupes. */
const groupesDeVille = async () => {
  await waitFor(() => expect(jourParJour().querySelector("[data-part='jours-ville']")).not.toBeNull());
  return jourParJour().querySelectorAll("[data-part='jours-ville']");
};

/** Critère 16 (spécification M4 § 7.5) et critère 22 (titres de niveau 3, contraste ailleurs). */
describe("Séjour: jour par jour groupé par ville", () => {
  it("titres de niveau 3 « Rome · 2 nuits » et « Florence · 2 nuits » sous « Jour par jour », non focalisables", async () => {
    const { container } = renderSejour(romeFlorence);
    const titres = await within(jourParJour()).findAllByRole("heading", { level: 3 });
    expect(titres.map((titre) => titre.textContent)).toEqual(["Rome · 2 nuits", "Florence · 2 nuits"]);
    for (const titre of titres) expect(titre).not.toHaveAttribute("tabindex");
    // Ordre des titres : niveau 2 « Jour par jour » puis les niveaux 3.
    const tous = within(panel()).getAllByRole("heading").map((titre) => `${titre.tagName}:${titre.textContent}`);
    expect(tous.slice(-3)).toEqual(["H2:Jour par jour", "H3:Rome · 2 nuits", "H3:Florence · 2 nuits"]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("le 12.04 (changement de ville) est rangé sous Florence ; son résumé est sur deux lignes, « Vers Florence » puis le résumé actuel", async () => {
    renderSejour(romeFlorence);
    const groupes = await groupesDeVille();
    expect(groupes).toHaveLength(2);
    const jours = (groupe: Element) => Array.from(groupe.querySelectorAll("a[data-part='jour']")).map((lien) => lien.getAttribute("href"));
    expect(jours(groupes[0]!)).toEqual(["/voyages/mock_trip_rome_florence/jour/1", "/voyages/mock_trip_rome_florence/jour/2"]);
    expect(jours(groupes[1]!)).toEqual(["/voyages/mock_trip_rome_florence/jour/3", "/voyages/mock_trip_rome_florence/jour/4", "/voyages/mock_trip_rome_florence/jour/5"]);
    const lien = groupes[1]!.querySelector("a[data-part='jour']")!;
    const vers = lien.querySelector("[data-part='vers-ville']")!;
    expect(vers).toHaveTextContent(/^Vers Florence$/);
    expect(vers.nextElementSibling).toHaveTextContent(/^2 étapes · /);
    // Aucun autre jour n'a de ligne « Vers ».
    expect(jourParJour().querySelectorAll("[data-part='vers-ville']")).toHaveLength(1);
  });

  it("sous la plaque, en dehors d'elle : « Rome · Florence » en ink-2, qui passe à la ligne", () => {
    renderSejour(romeFlorence);
    const villes = panel().querySelector("[data-part='villes']")!;
    expect(villes).toHaveTextContent(/^Rome · Florence$/);
    expect(villes).toHaveClass("text-ink-2", "break-words");
    expect(villes.closest("[data-destination-plate]")).toBeNull();
  });

  it("journées « À débloquer » rangées sous leur ville", async () => {
    const apercu: Trip = { ...romeFlorence, unlocked: false, days: romeFlorence.days.filter((day) => day.index <= 2) };
    renderSejour(apercu, "/voyages/mock_trip_rome_florence/debloquer");
    const groupes = await groupesDeVille();
    expect(within(groupes[1] as HTMLElement).getAllByText("À débloquer")).toHaveLength(3);
  });
});

describe("Séjour: une seule ville inchangée", () => {
  it("Édimbourg : ni liste de villes sous la plaque, ni titre de niveau 3, ni ligne « Vers »", () => {
    renderSejour(edimbourg);
    expect(panel().querySelector("[data-part='villes']")).toBeNull();
    expect(within(panel()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(panel().querySelector("[data-part='jours-ville'], [data-part='vers-ville']")).toBeNull();
  });
});

/** Critère 17 (spécification M4 § 7.6 et § 7.7). */
describe("Journée: ligne « Vers {ville} »", () => {
  const routes = tripRoutes("/voyages", romeFlorence.id);

  it("ni fiche, ni action, ni focus ; nom « Vers Florence, {détail} » ; thème « De Rome à Florence »", async () => {
    const { container } = render(<JourneePanel day={jour3()} routes={routes} />);
    // Ligne chargée à la demande (`lazy`).
    const ligne = await screen.findByRole("listitem", { name: "Vers Florence, [Train Rome–Florence], 12:00 – 13:40" });
    expect(within(ligne).queryByRole("link")).toBeNull();
    expect(within(ligne).queryByRole("button")).toBeNull();
    expect(ligne.querySelector("[tabindex]")).toBeNull();
    expect(container.querySelector("[data-part='theme-jour']")).toHaveTextContent("De Rome à Florence");
    // Les étapes avant et après restent des liens vers leur fiche ; la ligne n'en est pas une.
    expect(screen.getAllByRole("link", { name: /Basilique/ })).toHaveLength(2);
    // J3 simulé n'a aucun événement, donc aucun bandeau de chevauchement (spécification M4-suite § 5 ; l'absence de tout
    // bandeau de M4 § 7.6 est remplacée par le critère 12, M4-suite § 9.1 point 6, `BandeauChevauchement.test.tsx`) ; ce
    // jour-là, le budget de trajet n'est pas dépassé : aucun bandeau.
    expect(container.querySelectorAll("[data-rail=''][data-kind], [data-kind] > [data-rail='']")).toHaveLength(0);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("pastille du jour de la Journée : « Jour 3, lun., de Rome à Florence », état actif par aria-current", () => {
    location.n = "3";
    render(
      <TripShell trip={romeFlorence} maps={[]} base="/voyages">
        <JourneePanel day={jour3()} routes={routes} />
      </TripShell>,
    );
    expect(screen.getByRole("link", { name: "Jour 3, lun., de Rome à Florence" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Jour 2, dim." })).not.toHaveAttribute("aria-current");
  });
});
