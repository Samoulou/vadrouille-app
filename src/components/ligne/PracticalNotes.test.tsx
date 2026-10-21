import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { PracticalNotes, practicalNotesRows } from "./PracticalNotes";

const FACTS = { tip: "[Arrive avant 9 h]", priceNote: "[Environ 18 EUR]", hoursNote: "[Fermé le lundi]" };

describe("PracticalNotes (lot 1 bis, décision 0116 § 6)", () => {
  it("titre « Infos pratiques », lignes conseil, prix, horaires dans cet ordre, mention fixe", () => {
    const { container } = render(<PracticalNotes facts={{ ...FACTS, durationMinutes: 60 } as never} />);
    const section = screen.getByRole("region", { name: "Infos pratiques" });
    expect(screen.getByRole("heading", { level: 2, name: "Infos pratiques" })).toBeInTheDocument();
    expect([...section.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["Conseil", "Prix", "Horaires"]);
    expect([...section.querySelectorAll("dd")].map((dd) => dd.textContent)).toEqual(Object.values(FACTS));
    expect(container.querySelector("[data-part='mention-infos']")).toHaveTextContent("D'après l'IA, à confirmer sur place.");
    expect(container.textContent).not.toMatch(/[Vv]érifi/);
  });

  it("une valeur absente n'a pas de ligne ; aucune valeur : rien n'est rendu", () => {
    expect(practicalNotesRows({ priceNote: "[Gratuit]" }).map((row) => row.key)).toEqual(["priceNote"]);
    expect(practicalNotesRows({ tip: "" })).toEqual([]);
    const { container } = render(<PracticalNotes facts={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("titre de niveau 3 dans une feuille titrée en 2", () => {
    render(<PracticalNotes facts={{ tip: "[x]" }} headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "Infos pratiques" })).toBeInTheDocument();
  });

  it("texte brut : une balise ou une adresse s'affiche telle quelle, jamais en élément ni en lien (0094 § 8, 0103)", () => {
    // Le schéma refuse ces valeurs en amont : le test le contourne exprès.
    const { container } = render(<PracticalNotes facts={{ tip: "<b>x</b>", priceNote: "https://exemple.org", hoursNote: "**gras**" }} />);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(screen.getByText("<b>x</b>")).toBeInTheDocument();
    expect(screen.getByText("**gras**")).toBeInTheDocument();
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(<PracticalNotes facts={FACTS} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
