import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { DeckProgress } from "./DeckProgress";

describe("DeckProgress", () => {
  it("DeckProgress: valeurs accessibles", () => {
    const { rerender, container } = render(<DeckProgress current={4} total={8} label="Proposition 4 sur 8" />);
    const bar = screen.getByRole("progressbar", { name: "Proposition 4 sur 8" });
    expect(bar).toHaveAttribute("aria-valuemin", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuetext", "Proposition 4 sur 8");
    const stops = container.querySelectorAll("[data-part='arret']");
    expect(stops).toHaveLength(8);
    expect([...stops].map((s) => s.getAttribute("data-state"))).toEqual([
      "fait",
      "fait",
      "fait",
      "en-cours",
      "a-venir",
      "a-venir",
      "a-venir",
      "a-venir",
    ]);
    // Après un retrait : le total diminue, la carte en cours garde son rang.
    rerender(<DeckProgress current={3} total={7} label="Proposition 3 sur 7" />);
    expect(bar).toHaveAttribute("aria-valuemax", "7");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAccessibleName("Proposition 3 sur 7");
    expect(container.querySelectorAll("[data-part='arret']")).toHaveLength(7);
  });

  it("les arrêts sont décoratifs et sans texte visible", () => {
    const { container } = render(<DeckProgress current={1} total={3} label="Proposition 1 sur 3" />);
    expect(container.textContent).toBe("");
    for (const child of screen.getByRole("progressbar").children) {
      expect(child).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("aucune violation axe", async () => {
    const { container } = render(<DeckProgress current={2} total={8} label="Proposition 2 sur 8" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
