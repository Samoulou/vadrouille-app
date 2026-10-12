import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { SegmentedControl } from "./SegmentedControl";

/**
 * Marque « déduit » du `SegmentedControl` (F8-TL-4, décision 0017 § 6, rendu 0018 § 16 avec 0012) : contour
 * pointillé `ink`, fond `raised`, coche `ink`, mention « déduit de ton récit » qui décrit le groupe. Les tests de F2
 * (`SegmentedControl.test.tsx`) restent inchangés : sans `inferredValue`, rien ne change.
 */

const OPTIONS = [
  { value: "relaxed", label: "Tranquille" },
  { value: "balanced", label: "Équilibré" },
  { value: "intense", label: "Intense" },
] as const;
type Value = (typeof OPTIONS)[number]["value"];

/** Comme l'écran 2 : la marque tombe dès que la personne choisit une autre option. */
function Harness({ initial = "balanced" as Value | null, inferred = true }) {
  const [value, setValue] = useState<Value | null>(initial);
  const [marked, setMarked] = useState(inferred);
  return (
    <SegmentedControl<Value>
      label="Rythme"
      options={OPTIONS}
      value={value}
      inferredValue={marked && value ? value : undefined}
      onChange={(next) => {
        setValue(next);
        setMarked(false);
      }}
    />
  );
}

describe("SegmentedControl déduit", () => {
  it("l'option déduite choisie porte le pointillé, la coche, et le groupe est décrit « déduit de ton récit »", async () => {
    const { container } = render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Rythme" });
    expect(group).toHaveAccessibleDescription("déduit de ton récit");
    const option = screen.getByRole("radio", { name: "Équilibré" });
    expect(option).toHaveAttribute("aria-checked", "true");
    expect(option).toHaveAttribute("data-inferred", "true");
    expect(option.className).toContain("border-dashed");
    expect(option.className).toContain("border-ink");
    expect(option.className).toContain("bg-raised");
    expect(option.className).not.toContain("bg-line");
    expect(option.querySelector('[data-part="segment-check"]')).not.toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("choisir une autre option retire la marque : aplat `line`, plus de mention", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Intense" }));
    const option = screen.getByRole("radio", { name: "Intense" });
    expect(option).toHaveAttribute("aria-checked", "true");
    expect(option).not.toHaveAttribute("data-inferred");
    expect(option.className).toContain("bg-line");
    expect(option.querySelector('[data-part="segment-check"]')).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Rythme" })).not.toHaveAccessibleDescription();
    expect(screen.queryByText("déduit de ton récit")).toBeNull();
  });

  it("toucher l'option déduite déjà choisie n'a pas d'autre effet", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Équilibré" }));
    expect(screen.getByRole("radio", { name: "Équilibré" })).toHaveAttribute("data-inferred", "true");
  });

  it("sans choix (rythme non déduit) : aucune option cochée, la première reste atteignable au clavier", () => {
    render(<Harness initial={null} inferred={false} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true);
    expect(radios.filter((radio) => radio.tabIndex === 0).map((radio) => radio.textContent)).toEqual(["Tranquille"]);
  });

  it("erreur de choix : aria-invalid et message reliés au groupe, après la mention déduite", () => {
    render(
      <>
        <SegmentedControl label="Rythme" options={OPTIONS} value="balanced" inferredValue="balanced" onChange={() => {}} invalid describedBy="erreur" id="champ-pace" />
        <p id="erreur">Choisis un rythme.</p>
      </>,
    );
    const group = screen.getByRole("radiogroup", { name: "Rythme" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAttribute("id", "champ-pace");
    expect(group).toHaveAccessibleDescription("déduit de ton récit Choisis un rythme.");
    expect(group.tabIndex).toBe(-1);
  });
});
