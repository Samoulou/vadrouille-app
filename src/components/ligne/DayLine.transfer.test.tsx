import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DayLineItem } from "@/contracts";

import { axeViolations } from "../../../tests/unit/axe";

import { DayLine, type DayLineTransferText } from "./DayLine";

const ITEMS: DayLineItem[] = [
  { type: "terminus", role: "start", time: "08:30", label: "[Hôtel, Monti]" },
  { type: "free", from: "08:30", to: "12:00" },
  { type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "12:00", end: "13:40", label: "[Train Rome–Florence]" },
  { type: "free", from: "13:40", to: "16:40" },
  { type: "terminus", role: "end", time: "16:40", label: "[Hôtel, Santa Croce]" },
];

const TEXTE: DayLineTransferText = {
  title: "Vers Florence",
  detail: "[Train Rome–Florence], 12:00 – 13:40",
  name: "Vers Florence, [Train Rome–Florence], 12:00 – 13:40",
  time: "12:00",
};

/** Ligne « Vers {ville} » (spécification M4 § 7.6 ; critère 17) : gabarit de segment, sans lien ni focus. */
describe("DayLine : ligne « Vers {ville} » (M4c)", () => {
  it("rendue avec les textes de l'écran : élément de la liste ordonnée nommé « Vers Florence, {détail} », ni lien ni focus", async () => {
    const { container } = render(<DayLine items={ITEMS} renderTransfer={() => <DayLine.Transfer text={TEXTE} />} />);
    const ligne = screen.getByRole("listitem", { name: TEXTE.name });
    expect(ligne).toHaveAttribute("data-type", "transfer");
    expect(ligne).toHaveTextContent("Vers Florence");
    expect(ligne).toHaveTextContent("[Train Rome–Florence], 12:00 – 13:40");
    expect(within(ligne).queryByRole("link")).toBeNull();
    expect(within(ligne).queryByRole("button")).toBeNull();
    expect(ligne).not.toHaveAttribute("tabindex");
    expect(ligne.querySelector("[tabindex]")).toBeNull();
    // Ni marqueur d'étape : rail seul, comme un segment.
    expect(ligne.querySelector("[data-part='rail'] [data-rail='plein']")).not.toBeNull();
    expect(ligne.querySelector("[data-stop-marker], svg")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("à sa place dans la ligne : après le temps libre de la ville quittée, avant celui de la ville d'arrivée", () => {
    const { container } = render(<DayLine items={ITEMS} renderTransfer={() => <DayLine.Transfer text={TEXTE} />} />);
    expect(Array.from(container.querySelectorAll("ol > li")).map((li) => li.getAttribute("data-type"))).toEqual(["terminus", "free", "transfer", "free", "terminus"]);
  });

  it("départ estimé : la colonne des heures reste vide (jamais l'heure seule)", () => {
    render(<DayLine items={ITEMS} renderTransfer={() => <DayLine.Transfer text={{ ...TEXTE, time: undefined }} />} />);
    expect(screen.getByRole("listitem", { name: TEXTE.name }).querySelector("[data-part='heure']")).toBeEmptyDOMElement();
  });

  it("sans textes de l'écran (vue partagée, écran 15) : rien n'est rendu", () => {
    const { container } = render(<DayLine items={ITEMS} />);
    expect(container.querySelector("[data-type='transfer']")).toBeNull();
  });
});
