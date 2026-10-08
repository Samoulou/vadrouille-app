import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { messages } from "@/i18n";

import { axeViolations } from "../../../tests/unit/axe";

import { DayTabs } from "./DayTabs";

const DAYS = [1, 2, 3, 4, 5].map((index) => ({ index, href: `/voyages/v/jour/${index}` }));

describe("DayTabs", () => {
  it("rend un nav nommé depuis fr.json, « Séjour » en premier puis un lien par jour", () => {
    render(<DayTabs days={DAYS} current="sejour" sejourHref="/voyages/v" />);
    expect(messages.ligne.jours).toEqual({ navigation: "Jours du séjour", sejour: "Séjour" });
    const nav = screen.getByRole("navigation", { name: messages.ligne.jours.navigation });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(DAYS.length + 1);
    expect(links[0]).toHaveTextContent(messages.ligne.jours.sejour);
    expect(links[0]).toHaveAttribute("href", "/voyages/v");
    DAYS.forEach((day, i) => {
      expect(links[i + 1]).toHaveAccessibleName(`Jour ${day.index}`);
      expect(links[i + 1]).toHaveAttribute("href", day.href);
    });
    expect(nav).not.toHaveTextContent("Aperçu");
  });

  it.each([
    ["sejour" as const, messages.ligne.jours.sejour],
    [3, "Jour 3"],
  ])("current = %s : un seul aria-current=page", (current, name) => {
    const { container } = render(<DayTabs days={DAYS} current={current} sejourHref="/voyages/v" />);
    const currents = container.querySelectorAll("[aria-current]");
    expect(currents).toHaveLength(1);
    expect(currents[0]).toHaveAttribute("aria-current", "page");
    expect(currents[0]).toHaveAccessibleName(name);
  });

  it("l'onglet « Séjour » actif passe en ink 800 avec le trait line", () => {
    const { rerender } = render(<DayTabs days={DAYS} current="sejour" sejourHref="/voyages/v" />);
    const sejour = screen.getByRole("link", { name: messages.ligne.jours.sejour });
    expect(sejour).toHaveClass("text-ink", "font-extrabold", "border-line");
    rerender(<DayTabs days={DAYS} current={2} sejourHref="/voyages/v" />);
    expect(sejour).toHaveClass("text-ink-soft", "font-semibold", "border-transparent");
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(<DayTabs days={DAYS} current={2} sejourHref="/voyages/v" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("DayTabs, nom du repère", () => {
  it("accepte un nom propre quand deux rangées coexistent", () => {
    render(<DayTabs days={DAYS} current={1} sejourHref="/v" label="[Autre rangée]" />);
    expect(screen.getByRole("navigation", { name: "[Autre rangée]" })).toBeInTheDocument();
  });
});
