import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Change } from "@/contracts";

import { axeViolations } from "../../../tests/unit/axe";

import { ChangeSet, isShownChange } from "./ChangeSet";

/** Formats de `ChangeSet` (spécification F7, F7-PO-5 ; décision 0018 § 8 ; handover § 5 et § 9). */

const ALL: Change[] = [
  { type: "replaced", time: "10:55", before: "[Dean Village]", after: "[Épicerie]" },
  { type: "added", time: "15:00", label: "[Librairie]" },
  { type: "moved", label: "[Musée]", before: { day: 2, time: "13:25" }, after: { day: 2, time: "14:10" } },
  { type: "moved", label: "[Musée]", before: { day: 2, time: "13:25" }, after: { day: 4, time: "15:45" } },
  { type: "segment", label: "[Épicerie]", before: 20, after: 25, estimated: false },
  { type: "segment", label: "[Café]", before: 15, after: 90, estimated: true },
  { type: "budget", deltaPerPerson: 15 },
  { type: "unchanged", time: "19:00", label: "[Bonne table]" },
];

function lines(container: HTMLElement) {
  return Array.from(container.querySelectorAll("li"));
}

describe("ChangeSet", () => {
  it("une ligne par changement rendu, dans l'ordre des données, sans `unchanged`", () => {
    const { container } = render(<ChangeSet changes={ALL} />);
    expect(screen.getByRole("list")).toHaveAttribute("data-part", "change-set");
    expect(lines(container).map((li) => li.dataset.change)).toEqual(["replaced", "added", "moved", "moved", "segment", "segment", "budget"]);
    expect(container).not.toHaveTextContent("[Bonne table]");
  });

  it("replaced : « {heure} {après} à la place de {avant} », ancien nom barré, sans « avant : » masqué", () => {
    const { container } = render(<ChangeSet changes={[ALL[0]!]} />);
    const li = lines(container)[0]!;
    expect(li).toHaveTextContent("10:55 [Épicerie] à la place de [Dean Village]");
    expect(li.querySelector("del")).toHaveTextContent("[Dean Village]");
    expect(li.querySelector(".sr-only")).toBeNull();
  });

  it("added : « {heure} {nom} ajouté »", () => {
    const { container } = render(<ChangeSet changes={[ALL[1]!]} />);
    expect(lines(container)[0]).toHaveTextContent("15:00 [Librairie] ajouté");
  });

  it("moved : heures seules le même jour, « J{n} {heure} » d'un jour à l'autre ; « avant : » et « après : » masqués, flèche décorative", () => {
    const { container } = render(<ChangeSet changes={[ALL[2]!, ALL[3]!]} />);
    const [same, other] = lines(container);
    expect(same).toHaveTextContent("[Musée] : avant : 13:25 → après : 14:10");
    expect(other).toHaveTextContent("[Musée] : avant : J2 13:25 → après : J4 15:45");
    expect(other!.querySelector("del")).toHaveTextContent("J2 13:25");
    const masked = Array.from(other!.querySelectorAll(".sr-only")).map((node) => node.textContent?.trim());
    expect(masked).toEqual(["avant :", "après :"]);
    expect(other!.querySelector("[aria-hidden='true']")).toHaveTextContent("→");
    // La flèche reste liée à la valeur suivante : jamais seule en fin de ligne.
    const apres = other!.querySelector("[data-part='apres']")!;
    expect(apres).toHaveClass("whitespace-nowrap");
    expect(apres).toHaveTextContent("→ après : J4 15:45");
  });

  it("segment : « Trajet vers {nom} : » ; estimé en « environ {durée} (estimation) »", () => {
    const { container } = render(<ChangeSet changes={[ALL[4]!, ALL[5]!]} />);
    const [measured, estimated] = lines(container);
    expect(measured).toHaveTextContent("Trajet vers [Épicerie] : avant : 20 min → après : 25 min");
    expect(measured!.querySelector("del")).toHaveTextContent("20 min");
    expect(estimated).toHaveTextContent("Trajet vers [Café] : avant : 15 min → après : environ 1 h 30 (estimation)");
  });

  it("budget : signe explicite, nul non rendu", () => {
    const { container, rerender } = render(<ChangeSet changes={[{ type: "budget", deltaPerPerson: 15 }]} />);
    expect(lines(container)[0]).toHaveTextContent("Budget du jour : environ +15 CHF par personne");
    rerender(<ChangeSet changes={[{ type: "budget", deltaPerPerson: -1250 }]} />);
    expect(lines(container)[0]!.textContent).toMatch(/^Budget du jour : environ −1.250 CHF par personne$/u);
    rerender(<ChangeSet changes={[{ type: "budget", deltaPerPerson: 0 }]} />);
    expect(lines(container)).toHaveLength(0);
  });

  it("isShownChange : ni `unchanged`, ni budget nul", () => {
    expect(ALL.filter(isShownChange)).toHaveLength(7);
    expect(isShownChange({ type: "budget", deltaPerPerson: 0 })).toBe(false);
  });

  it("aucun texte interdit (« Aperçu », « Valider », « OK », « Supprimer », « Vérifié ») ; aucune violation axe", async () => {
    const { container } = render(<ChangeSet changes={ALL} />);
    expect(container.textContent).not.toMatch(/Aperçu|Valider|\bOK\b|Supprimer|Vérifié/);
    expect(await axeViolations(container)).toEqual([]);
  });
});
