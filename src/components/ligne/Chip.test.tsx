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

  it("inferred est rendu en pointillé, sélectionnée ou non", () => {
    render(
      <>
        <Chip label="Musées" inferred />
        <Chip label="Marchés" inferred defaultSelected />
        <Chip label="Histoire" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Musées" })).toHaveClass("border-dashed");
    expect(screen.getByRole("button", { name: "Marchés" })).toHaveClass("border-dashed", "bg-line");
    expect(screen.getByRole("button", { name: "Histoire" })).not.toHaveClass("border-dashed");
    expect(screen.getByRole("button", { name: "Musées" })).toHaveAttribute("data-inferred", "true");
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
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
