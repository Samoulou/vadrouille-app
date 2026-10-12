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

  it("href (décision 0021 § 11) : la plaque entière est un lien, nom accessible = contenu visible, sans aria-label", () => {
    const { container } = render(
      <DestinationPlate as="p" name="Porto" meta="sam. 08.05 – mar. 11.05.2027 · 2 adultes" color="granit" href="/voyages/mock_trip_porto" />,
    );
    const link = screen.getByRole("link", { name: "Porto sam. 08.05 – mar. 11.05.2027 · 2 adultes" });
    expect(link.getAttribute("href")).toBe("/voyages/mock_trip_porto");
    expect(link).not.toHaveAttribute("aria-label");
    expect(link).toHaveAttribute("data-destination-plate", "granit");
    expect(link).toHaveClass("bg-dest-granit", "text-on-line", "rounded-plate", "min-h-(--touch-target)");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-destination-plate]")).toHaveLength(1);
  });

  it("sans href : aucun lien (rendu de F5 et F9 inchangé)", () => {
    render(<DestinationPlate name="Lisbonne" meta="2 adultes" color="azulejo" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("axe sans violation, en lien", async () => {
    const { container } = render(<DestinationPlate as="p" name="Lisbonne" meta="2 adultes" color="azulejo" href="/voyages/x" />);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("axe sans violation", async () => {
    const { container } = render(<DestinationPlate name="Lisbonne" meta="2 adultes" color="bruyere" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
