import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { DateConsultation, LienSource } from "./LienSource";

describe("LienSource", () => {
  it("nouvel onglet, rel noopener noreferrer, césure du libellé, nom accessible inchangé sans mention", () => {
    render(<LienSource href="https://example.org/mock/site">[Site]</LienSource>);
    const link = screen.getByRole("link", { name: "[Site]" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("wrap-anywhere", "min-h-(--touch-target)");
  });

  it("mention « nouvel onglet » lue après le libellé, masquée à l'écran", () => {
    render(
      <LienSource href="https://example.org/mock/site" nouvelOnglet=" [nouvel onglet]">
        [Site]
      </LienSource>,
    );
    const link = screen.getByRole("link", { name: /^\[Site\]\s*\[nouvel onglet\]$/ });
    expect(link.querySelector(".sr-only")).toHaveTextContent("[nouvel onglet]");
  });

  it("date de consultation seulement si elle existe", async () => {
    const { container, rerender } = render(<DateConsultation />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DateConsultation verifiedAt="2026-08-15" />);
    expect(screen.getByText("Source consultée le 15 août 2026")).toHaveClass("text-legende", "text-ink-soft");
    expect(await axeViolations(container)).toEqual([]);
  });
});
