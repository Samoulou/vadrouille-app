import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { DestinationPlate } from "./DestinationPlate";

describe("DestinationPlate", () => {
  it("nom en titre de niveau 1 par défaut, ligne d'informations, couleur de destination", () => {
    const { container } = render(<DestinationPlate name="Lisbonne" meta="sam. 29.08 – jeu. 03.09 · 2 adultes" color="azulejo" />);
    expect(screen.getByRole("heading", { level: 1, name: "Lisbonne" })).toBeInTheDocument();
    expect(screen.getByText("sam. 29.08 – jeu. 03.09 · 2 adultes")).toBeInTheDocument();
    const plate = container.querySelector("[data-destination-plate]");
    expect(plate).toHaveClass("bg-dest-azulejo", "text-on-line", "rounded-plate");
  });

  it("as=\"p\" : aucun titre (écran 9, décision 0020 § 10), même rendu", () => {
    render(<DestinationPlate name="Porto" meta="2 adultes" color="granit" as="p" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Porto").tagName).toBe("P");
    expect(screen.getByText("Porto")).toHaveClass("text-destination", "font-extrabold");
  });

  it("as=\"h2\"", () => {
    render(<DestinationPlate name="Séville" meta="2 adultes" color="ocre" as="h2" />);
    expect(screen.getByRole("heading", { level: 2, name: "Séville" })).toBeInTheDocument();
  });

  it("axe sans violation", async () => {
    const { container } = render(<DestinationPlate name="Lisbonne" meta="2 adultes" color="bruyere" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
