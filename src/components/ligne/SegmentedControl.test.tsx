import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { SegmentedControl } from "./SegmentedControl";

const OPTIONS = [
  { value: "calme", label: "Calme" },
  { value: "equilibre", label: "Équilibré" },
  { value: "soutenu", label: "Soutenu" },
] as const;
type Value = (typeof OPTIONS)[number]["value"];

function Harness({ onChange }: { onChange?: (value: Value) => void }) {
  const [value, setValue] = useState<Value>("equilibre");
  return (
    <SegmentedControl
      label="Rythme"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("SegmentedControl", () => {
  it("expose un radiogroup nommé et des radios, aria-checked sur l'option choisie", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Rythme" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Équilibré" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Calme" })).toHaveAttribute("aria-checked", "false");
  });

  it("n'a qu'un seul arrêt de tabulation, sur l'option choisie", () => {
    render(<Harness />);
    const tabbable = screen.getAllByRole("radio").filter((radio) => radio.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName("Équilibré");
  });

  it("change d'option avec les flèches droite et gauche, en boucle", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const middle = screen.getByRole("radio", { name: "Équilibré" });
    middle.focus();

    fireEvent.keyDown(middle, { key: "ArrowRight" });
    const last = screen.getByRole("radio", { name: "Soutenu" });
    expect(onChange).toHaveBeenLastCalledWith("soutenu");
    expect(last).toHaveAttribute("aria-checked", "true");
    expect(last).toHaveFocus();
    expect(last.tabIndex).toBe(0);
    expect(middle.tabIndex).toBe(-1);

    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("calme");
    expect(screen.getByRole("radio", { name: "Calme" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("radio", { name: "Calme" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("soutenu");
    expect(screen.getByRole("radio", { name: "Soutenu" })).toHaveAttribute("aria-checked", "true");
  });

  it("choisit une option au clic", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Calme" }));
    expect(onChange).toHaveBeenCalledWith("calme");
    expect(screen.getByRole("radio", { name: "Calme" })).toHaveAttribute("aria-checked", "true");
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(<Harness />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
