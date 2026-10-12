import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { Counter } from "./Counter";

describe("Counter", () => {
  it("expose label comme nom accessible et affiche le nombre en chiffres tabulaires", () => {
    render(<Counter value={4} label="4 réservations à faire" />);
    const counter = screen.getByRole("img", { name: "4 réservations à faire" });
    expect(counter).toHaveTextContent("4");
    expect(counter).toHaveClass("bg-quai", "text-ink", "font-extrabold", "tabular-nums", "rounded-tag", "min-w-6", "h-6");
  });

  it("n'affiche rien à 0 : pas de jaune sans action requise", () => {
    const { container } = render(<Counter value={0} label="Aucune réservation à faire" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <h2>
        À faire avant de partir <Counter value={12} label="12 réservations à faire" />
      </h2>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
