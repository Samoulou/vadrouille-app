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

describe("SegmentedControl vertical (raisons de l'écran 14, F7a)", () => {
  it("`aria-orientation` vertical, nommé par un titre externe, aucune option cochée, coche sur l'option choisie", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <>
        <h2 id="titre-raisons">Pourquoi ?</h2>
        <SegmentedControl label="Pourquoi ?" labelledBy="titre-raisons" options={OPTIONS} value={null} orientation="vertical" onChange={onChange} />
      </>,
    );
    const group = screen.getByRole("radiogroup", { name: "Pourquoi ?" });
    expect(group).toHaveAttribute("aria-orientation", "vertical");
    expect(group).toHaveAttribute("aria-labelledby", "titre-raisons");
    for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("radio", { name: "Soutenu" }));
    expect(onChange).toHaveBeenCalledWith("soutenu");
    rerender(
      <>
        <h2 id="titre-raisons">Pourquoi ?</h2>
        <SegmentedControl label="Pourquoi ?" labelledBy="titre-raisons" options={OPTIONS} value="soutenu" orientation="vertical" onChange={onChange} />
      </>,
    );
    expect(screen.getByRole("radio", { name: "Soutenu" })).toHaveAttribute("aria-checked", "true");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("choix invalide : `aria-invalid` et contour `ink` du rail (0018, « Champ invalide ») ; valide : ni l'un ni l'autre", () => {
    const { rerender } = render(<SegmentedControl label="Rythme" options={OPTIONS} value={null} onChange={() => {}} invalid />);
    const group = screen.getByRole("radiogroup", { name: "Rythme" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveClass("aria-invalid:ring-(length:--ligne-trait-controle)", "aria-invalid:ring-ink", "aria-invalid:ring-inset");
    rerender(<SegmentedControl label="Rythme" options={OPTIONS} value={null} onChange={() => {}} />);
    expect(group).not.toHaveAttribute("aria-invalid");
  });

  it("focus clavier : l'option de l'arrêt de tabulation reçoit le focus ; aucune classe ne retire l'anneau global", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    radios[1]!.focus();
    fireEvent.keyDown(radios[1]!, { key: "ArrowRight" });
    expect(radios[2]).toHaveFocus();
    for (const radio of radios) expect(radio.className).not.toMatch(/(^|\s)(focus(-visible)?:)?(outline-none|outline-hidden|ring-0)/);
  });
  it("M4-suite-carte: variante wrap : rail flex-wrap, options flex-auto d'au moins une cible tactile, libellé en overflow-wrap anywhere", async () => {
    const villes = [
      { value: "toutes", label: "Toutes les villes" },
      { value: "rome", label: "Rome" },
      { value: "compostelle", label: "Saint-Jacques-de-Compostelle" },
      { value: "florence", label: "Florence" },
    ];
    const { container } = render(<SegmentedControl label="Afficher sur la carte" options={villes} value="toutes" onChange={() => {}} wrap />);
    const group = screen.getByRole("radiogroup", { name: "Afficher sur la carte" });
    expect(group).toHaveClass("flex", "flex-wrap");
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveClass("flex-auto", "min-w-(--touch-target)", "min-h-(--touch-target)", "wrap-anywhere");
      expect(radio).not.toHaveClass("flex-1");
    }
    expect(await axeViolations(container)).toEqual([]);
  });

  it("M4-suite-carte: sans wrap (ou en vertical), classes inchangées", () => {
    const { rerender } = render(<SegmentedControl label="Rythme" options={OPTIONS} value={null} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup")).not.toHaveClass("flex-wrap");
    for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveClass("flex-1");
    rerender(<SegmentedControl label="Rythme" options={OPTIONS} value={null} onChange={() => {}} orientation="vertical" wrap />);
    expect(screen.getByRole("radiogroup")).not.toHaveClass("flex-wrap");
    for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveClass("w-full");
  });
});
