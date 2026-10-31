import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Day } from "@/contracts";
import { edimbourg, edimbourgDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { AjouterAuCalendrier, etapesACalendrier } from "./AjouterAuCalendrier";
import { SejourPanel } from "./SejourPanel";
import { TripShell } from "./TripShell";

/**
 * « Ajouter au calendrier » (spécification M6 § 4 points 7 et § 6.2, critères 1, 10 et 11 ; ticket 1005, M6b), rendu seul
 * puis dans le Séjour : aucune étape (toutes les journées en préparation), lien vers le fichier, hors ligne
 * (`navigator.onLine` simulé, lu par `useOnline`).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

const HREF = "/api/v1/voyages/mock_trip_edimbourg_debloque/calendrier";
const HORS_LIGNE = "Tu es hors ligne. Ajouter au calendrier demande une connexion.";
const enPreparation = (days: readonly Day[]) => days.map((day) => ({ ...day, generating: true }));

function enLigne(valeur: boolean) {
  return vi.spyOn(navigator, "onLine", "get").mockReturnValue(valeur);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AjouterAuCalendrier", () => {
  it("critère 10 : toutes les journées en préparation → « Aucune étape à ajouter pour l'instant. » seul, sans lien", async () => {
    enLigne(true);
    const { container } = render(<AjouterAuCalendrier href={HREF} days={enPreparation(edimbourgDebloque.days)} />);
    expect(container).toHaveTextContent(/^Aucune étape à ajouter pour l'instant\.$/);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("critère 10 : hors ligne aussi, sans étape, le texte seul (aucun bandeau, aucun lien)", () => {
    enLigne(false);
    const { container } = render(<AjouterAuCalendrier href={HREF} days={enPreparation(edimbourgDebloque.days)} />);
    expect(container).toHaveTextContent(/^Aucune étape à ajouter pour l'instant\.$/);
    expect(container.querySelector("a")).toBeNull();
  });

  it("avec des étapes : lien vers le fichier, aide, mention des journées en préparation", async () => {
    enLigne(true);
    const { container } = render(<AjouterAuCalendrier href={HREF} days={edimbourgDebloque.days} />);
    const lien = screen.getByRole("link", { name: "Ajouter au calendrier" });
    expect(lien).toHaveAttribute("href", HREF);
    expect(lien).not.toHaveAttribute("aria-disabled");
    expect(lien).not.toHaveAttribute("aria-describedby");
    expect(container).toHaveTextContent("Un fichier pour ton agenda, avec une entrée par étape. Si ton programme change, ajoute-le à nouveau.");
    expect(container).toHaveTextContent("Les journées encore en préparation n'y sont pas.");
    expect(screen.queryByRole("status")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("sans journée en préparation : pas de mention des journées en préparation", () => {
    enLigne(true);
    const { container } = render(<AjouterAuCalendrier href={HREF} days={edimbourg.days} />);
    expect(screen.getByRole("link", { name: "Ajouter au calendrier" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Les journées encore en préparation n'y sont pas.");
  });

  it("critère 11 : hors ligne → aria-disabled et aria-describedby vers le bandeau ; le clic n'a pas d'effet", async () => {
    enLigne(false);
    const { container } = render(<AjouterAuCalendrier href={HREF} days={edimbourgDebloque.days} />);
    const lien = screen.getByRole("link", { name: "Ajouter au calendrier" });
    expect(lien).toHaveAttribute("aria-disabled", "true");
    const id = lien.getAttribute("aria-describedby") ?? "";
    expect(id).not.toBe("");
    expect(container.querySelector(`[id="${id}"]`)).toHaveTextContent(HORS_LIGNE);
    expect(lien).toHaveAccessibleDescription(HORS_LIGNE);
    expect(screen.getByRole("status")).toHaveTextContent(HORS_LIGNE);
    const clic = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(lien, clic);
    expect(clic.defaultPrevented).toBe(true);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("en ligne : le clic suit le lien (aucun preventDefault)", () => {
    enLigne(true);
    render(<AjouterAuCalendrier href={HREF} days={edimbourgDebloque.days} />);
    const lien = screen.getByRole("link", { name: "Ajouter au calendrier" });
    const clic = new MouseEvent("click", { bubbles: true, cancelable: true });
    // Le composant ne bloque pas le clic ; jsdom n'implémente pas la navigation, on l'arrête après le composant.
    document.addEventListener("click", (event) => {
      if (!event.defaultPrevented) (event as MouseEvent & { suivi?: boolean }).suivi = true;
      event.preventDefault();
    });
    fireEvent(lien, clic);
    expect((clic as MouseEvent & { suivi?: boolean }).suivi).toBe(true);
  });

  it("etapesACalendrier : étapes des journées servies, hors engagements", () => {
    expect(etapesACalendrier(enPreparation(edimbourgDebloque.days))).toBe(0);
    expect(etapesACalendrier(edimbourgDebloque.days)).toBeGreaterThan(0);
  });
});

describe("SejourPanel : « Ajouter au calendrier » (critère 1, M6-PO-6)", () => {
  function renderSejour(trip: typeof edimbourg, calendrierHref: string | null) {
    return render(
      <TripShell trip={trip} maps={[]} base="/voyages">
        <SejourPanel calendrierHref={calendrierHref} />
      </TripShell>,
    );
  }

  it("voyage débloqué avec l'adresse de la page : le lien est rendu", () => {
    enLigne(true);
    renderSejour(edimbourgDebloque, HREF);
    expect(screen.getByRole("link", { name: "Ajouter au calendrier" })).toHaveAttribute("href", HREF);
  });

  it("voyage non débloqué, ou sans adresse (page de développement, site d'essai) : aucun lien", () => {
    enLigne(true);
    const { unmount } = renderSejour(edimbourg, "/api/v1/voyages/mock_trip_edimbourg/calendrier");
    expect(screen.queryByRole("link", { name: "Ajouter au calendrier" })).toBeNull();
    unmount();
    renderSejour(edimbourgDebloque, null);
    expect(screen.queryByRole("link", { name: "Ajouter au calendrier" })).toBeNull();
  });
});
