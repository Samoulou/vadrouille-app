import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DevComposantsPage from "@/app/dev/composants/page";
import { ComposantsShowcase } from "@/dev/ComposantsShowcase";
import { messages } from "@/i18n";

import { axeViolations } from "./axe";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const COMPONENTS = [
  "Button",
  "IconButton",
  "Tag",
  "Counter",
  "Chip",
  "SegmentedControl",
  "OtpInput",
  "StatusBanner",
  "Ligne",
];

describe("/dev/composants", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("répond 404 en production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "");
    expect(() => DevComposantsPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("s'affiche en développement", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(DevComposantsPage());
    expect(screen.getByRole("heading", { level: 1, name: messages.dev.composants.titre })).toBeInTheDocument();
  });

  it("montre chacun des huit composants de F2 et la section Ligne de F3", () => {
    render(<ComposantsShowcase />);
    for (const name of COMPONENTS) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("montre la section Présentation de F6 : DeckCard (activité avec trajet, repas, dernière option), DeckProgress, UndoToast", () => {
    render(<ComposantsShowcase />);
    const section = screen.getByRole("region", { name: "Présentation" });
    const p = messages.dev.composants.exemples.presentation;
    const bar = within(section).getByRole("progressbar", { name: "Proposition 4 sur 8" });
    expect(bar.nextElementSibling).toHaveTextContent(/^4 sur 8$/);
    expect(bar.nextElementSibling).toHaveAttribute("aria-hidden", "true");
    expect(within(section).getByRole("button", { name: `Voir le détail de ${p.activite.nom}` })).toHaveTextContent(
      "Bus, environ 50 min (estimation)",
    );
    expect(within(section).getByRole("button", { name: `Voir le détail de ${p.repas.nom}` })).toHaveTextContent("option 1 sur 2");
    expect(within(section).getByRole("button", { name: `Voir le détail de ${p.repas2.nom}` })).toHaveTextContent("option 2 sur 2");
    expect(within(section).getAllByRole("button", { name: "Option suivante" })).toHaveLength(1);
    expect(within(section).getAllByRole("button", { name: "Je choisis" })).toHaveLength(2);
    expect(within(section).getByRole("status")).toHaveTextContent(p.toast);
  });

  it("montre la section Programme de F5a : Sheet à 25, 55 et 92 %, ReasonBlock avec et sans date, bandeau travel", () => {
    render(<ComposantsShowcase />);
    const section = screen.getByRole("region", { name: "Programme" });
    const pg = messages.dev.composants.exemples.programme;
    expect(within(section).getByRole("region", { name: pg.panneaux.petit })).toHaveAttribute("data-snap", "0.25");
    expect(within(section).getByRole("region", { name: pg.panneaux.moyen })).toHaveAttribute("data-snap", "0.55");
    expect(within(section).getByRole("region", { name: pg.panneaux.grand })).toHaveAttribute("data-snap", "0.92");
    expect(within(section).getAllByText("Pourquoi pour toi")).toHaveLength(2);
    expect(within(section).getAllByText(/^Source consultée le/)).toHaveLength(1);
    expect(within(section).getByRole("status")).toHaveAttribute("data-kind", "travel");
  });

  it("montre chaque type de Tag et de StatusBanner, et le compteur seulement quand il vaut plus de 0", () => {
    render(<ComposantsShowcase />);
    const ex = messages.dev.composants.exemples;
    const tags = screen.getByRole("region", { name: "Tag" });
    for (const text of Object.values(messages.ligne.tag)) {
      expect(within(tags).getByText(text)).toBeInTheDocument();
    }
    const banners = screen.getByRole("region", { name: "StatusBanner" });
    expect(within(banners).getAllByRole("status")).toHaveLength(5);
    expect(within(banners).getByRole("alert")).toHaveTextContent(ex.bandeaux.error);
    expect(screen.getByRole("img", { name: ex.compteurLabel })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: ex.compteurZeroLabel })).not.toBeInTheDocument();
  });

  it("montre OtpInput vide et rempli, et un SegmentedControl qui répond", () => {
    render(<ComposantsShowcase />);
    const otp = screen.getByRole("region", { name: "OtpInput" });
    const groups = within(otp).getAllByRole("group");
    expect(groups).toHaveLength(2);
    const code = (group: HTMLElement) =>
      within(group)
        .getAllByRole("textbox")
        .map((input) => (input as HTMLInputElement).value)
        .join("");
    expect(code(groups[0]!)).toBe("");
    expect(code(groups[1]!)).toHaveLength(6);

    const options = messages.dev.composants.exemples.segmente.options;
    fireEvent.click(screen.getByRole("radio", { name: options.a }));
    expect(screen.getByRole("radio", { name: options.a })).toHaveAttribute("aria-checked", "true");
  });

  it("section Ligne : pastilles, deux rangées de jours, ligne du jour, segment en voiture, marqueurs", () => {
    render(<ComposantsShowcase />);
    const ligne = screen.getByRole("region", { name: "Ligne" });
    const navs = within(ligne).getAllByRole("navigation", { name: /^Jours du séjour/ });
    expect(navs).toHaveLength(2);
    expect(within(navs[0]!).getByRole("link", { name: messages.ligne.jours.sejour })).toHaveAttribute("aria-current", "page");
    expect(within(navs[1]!).getByRole("link", { name: /^Jour 9/ })).toHaveAttribute("aria-current", "page");
    const lists = ligne.querySelectorAll("ol");
    expect(lists).toHaveLength(2);
    expect(Array.from(lists[0]!.children).map((li) => (li as HTMLElement).dataset.type)).toEqual([
      "terminus",
      "segment",
      "stop",
      "segment",
      "stop",
      "free",
      "segment",
      "terminus",
    ]);
    expect(lists[1]).toHaveTextContent("En voiture, 15 min");
    const markers = Array.from(ligne.querySelectorAll("[data-variant]"));
    expect(markers.filter((marker) => !marker.closest("ol"))).toHaveLength(6);
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(<ComposantsShowcase />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
