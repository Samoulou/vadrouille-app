import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { DayBadgeGroup, type DayBadgeGroupDay } from "./DayBadgeGroup";
import * as ligne from "./index";

/**
 * `DayBadgeGroup` (spécification F7, F7-TL-5 ; décision 0019 § 1.3) : rôle et nom du groupe, `aria-checked`, jour
 * « complet » en `aria-disabled` nommé « Jour 3, complet » sans effet au clic, à Espace ni aux flèches, ni
 * `aria-pressed` ni `aria-current`.
 */

const DAYS: DayBadgeGroupDay[] = [
  { day: 1, weekday: "sam." },
  { day: 2 },
  { day: 3, disabled: true },
  { day: 4 },
];

function Harness({ initial = null, onChange }: { initial?: number | null; onChange?: (day: number) => void }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <div>
      <h3 id="titre">Vers quel jour ?</h3>
      <DayBadgeGroup
        days={DAYS}
        value={value}
        labelledBy="titre"
        onChange={(day) => {
          setValue(day);
          onChange?.(day);
        }}
      />
    </div>
  );
}

const group = () => screen.getByRole("radiogroup", { name: "Vers quel jour ?" });
const day = (name: string) => within(group()).getByRole("radio", { name });

describe("DayBadgeGroup", () => {
  it("groupe radio nommé par son titre, un radio par jour avec le nom de F3, aucun coché sans valeur", async () => {
    const { container } = render(<Harness />);
    const radios = within(group()).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "false", "false", "false"]);
    expect(day("Jour 1, sam.")).toBeInTheDocument();
    expect(day("Jour 2")).toHaveTextContent("J2");
    // Arrêt de tabulation : premier jour qui n'est pas complet.
    expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([day("Jour 1, sam.")]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("jour coché : `aria-checked`, rendu de la pastille active de F3 ; ni `aria-pressed` ni `aria-current`", () => {
    render(<Harness initial={4} />);
    expect(day("Jour 4")).toHaveAttribute("aria-checked", "true");
    expect(day("Jour 4")).toHaveClass("bg-line", "text-on-line");
    expect(day("Jour 4").tabIndex).toBe(0);
    for (const radio of within(group()).getAllByRole("radio")) {
      expect(radio).not.toHaveAttribute("aria-pressed");
      expect(radio).not.toHaveAttribute("aria-current");
      expect(radio).toHaveAttribute("type", "button");
    }
    expect(group().querySelectorAll("[aria-pressed], [aria-current]")).toHaveLength(0);
  });

  it("jour complet : `aria-disabled`, nom « Jour 3, complet », « complet » visible ; ni clic, ni Espace, ni flèches ne le cochent", () => {
    const onChange = vi.fn();
    render(<Harness initial={2} onChange={onChange} />);
    const full = day("Jour 3, complet");
    expect(full).toHaveAttribute("aria-disabled", "true");
    expect(full).not.toBeDisabled();
    expect(full.querySelector("[aria-hidden='true']")).toHaveTextContent("J3complet");
    expect(full).toHaveClass("bg-muted", "text-ink-soft");

    fireEvent.click(full);
    fireEvent.keyDown(full, { key: " " });
    expect(onChange).not.toHaveBeenCalled();

    day("Jour 2").focus();
    fireEvent.keyDown(day("Jour 2"), { key: "ArrowRight" });
    expect(full).toHaveFocus();
    expect(full).toHaveAttribute("aria-checked", "false");
    expect(day("Jour 2")).toHaveAttribute("aria-checked", "true");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(full, { key: "ArrowRight" });
    expect(day("Jour 4")).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("une valeur qui désigne un jour complet n'est jamais cochée", () => {
    render(<Harness initial={3} />);
    expect(day("Jour 3, complet")).toHaveAttribute("aria-checked", "false");
  });

  it("le rendu radio de `DayBadge` n'est pas exporté par `src/components/ligne` (réservé au groupe)", () => {
    expect("DayBadgeRadio" in ligne).toBe(false);
    expect("DayBadgeGroup" in ligne).toBe(true);
  });
});
