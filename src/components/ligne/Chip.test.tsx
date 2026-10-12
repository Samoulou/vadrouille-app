import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { Chip } from "./Chip";

describe("Chip", () => {
  it("aria-pressed suit selected", () => {
    const { rerender } = render(<Chip label="Histoire" selected={false} />);
    const chip = screen.getByRole("button", { name: "Histoire" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    rerender(<Chip label="Histoire" selected />);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveClass("bg-line", "text-on-line");
  });

  it("un clic bascule l'état (non contrôlé)", () => {
    const onSelectedChange = vi.fn();
    render(<Chip label="Histoire" onSelectedChange={onSelectedChange} />);
    const chip = screen.getByRole("button", { name: "Histoire" });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(onSelectedChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(onSelectedChange).toHaveBeenLastCalledWith(false);
  });

  it("un clic bascule l'état (contrôlé)", () => {
    function Controlled() {
      const [selected, setSelected] = useState(true);
      return <Chip label="Balades en ville" selected={selected} onSelectedChange={setSelected} />;
    }
    render(<Controlled />);
    const chip = screen.getByRole("button", { name: "Balades en ville" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("inferred est rendu en pointillé ink sur raised, sélectionnée ou non, sans aplat line (0012, Q13)", () => {
    render(
      <>
        <Chip label="Musées" inferred />
        <Chip label="Marchés" inferred defaultSelected />
        <Chip label="Histoire" />
      </>,
    );
    const musees = screen.getByRole("button", { name: "Musées" });
    const marches = screen.getByRole("button", { name: "Marchés" });
    expect(musees).toHaveClass("border-dashed", "border-ink", "bg-raised", "text-ink");
    expect(marches).toHaveClass("border-dashed", "border-ink", "bg-raised", "text-ink");
    expect(marches).toHaveAttribute("aria-pressed", "true");
    expect(marches).not.toHaveClass("bg-line");
    expect(marches).not.toHaveClass("text-on-line");
    expect(screen.getByRole("button", { name: "Histoire" })).not.toHaveClass("border-dashed");
    expect(musees).toHaveAttribute("data-inferred", "true");
  });

  it("choisie : coche de 20 px décorative, à la couleur du texte (on-line, ou ink si déduite)", () => {
    render(
      <>
        <Chip label="Histoire" />
        <Chip label="Balades en ville" defaultSelected />
        <Chip label="Musées" inferred />
        <Chip label="Marchés" inferred defaultSelected />
      </>,
    );
    const check = (name: string) => screen.getByRole("button", { name }).querySelector("[data-part='chip-check']");
    expect(check("Histoire")).toBeNull();
    expect(check("Musées")).toBeNull();

    const choisie = check("Balades en ville");
    expect(choisie).toHaveClass("size-5");
    expect(choisie).toHaveAttribute("aria-hidden", "true");
    expect(choisie).toHaveAttribute("stroke", "currentColor");
    expect(choisie).toHaveAttribute("stroke-width", "2.2");
    expect(screen.getByRole("button", { name: "Balades en ville" })).toHaveClass("text-on-line");

    const deduite = check("Marchés");
    expect(deduite).toHaveClass("size-5");
    expect(deduite).toHaveAttribute("stroke", "currentColor");
    expect(screen.getByRole("button", { name: "Marchés" })).toHaveClass("text-ink");
  });

  it("indisponible : fond muted, texte ink-soft, sans contour", () => {
    render(
      <>
        <Chip label="Histoire" disabled />
        <Chip label="Balades en ville" aria-disabled="true" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Histoire" })).toHaveClass(
      "disabled:border-transparent",
      "disabled:bg-muted",
      "disabled:text-ink-soft",
    );
    expect(screen.getByRole("button", { name: "Balades en ville" })).toHaveClass(
      "aria-disabled:border-transparent",
      "aria-disabled:bg-muted",
      "aria-disabled:text-ink-soft",
    );
  });

  it("aria-disabled : un clic ne bascule pas l'état", () => {
    const onSelectedChange = vi.fn();
    render(<Chip label="Histoire" aria-disabled="true" onSelectedChange={onSelectedChange} />);
    const chip = screen.getByRole("button", { name: "Histoire" });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("mesure au moins 44 px de haut", () => {
    render(<Chip label="Histoire" />);
    expect(screen.getByRole("button", { name: "Histoire" })).toHaveClass("min-h-(--touch-target)");
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <>
        <Chip label="Histoire" />
        <Chip label="Balades en ville" defaultSelected />
        <Chip label="Musées" inferred />
        <Chip label="Marchés" inferred defaultSelected />
        <Chip label="Châteaux" disabled />
        <Chip label="Plages" aria-disabled="true" />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
