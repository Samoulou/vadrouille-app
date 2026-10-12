import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { ReasonBlock } from "./ReasonBlock";

describe("ReasonBlock", () => {
  it("titre « Pourquoi pour toi », texte et lien de source toujours rendu", () => {
    render(<ReasonBlock text="[Tu as choisi l'histoire]" sourceLabel="[Site]" sourceUrl="https://example.org/mock/site" />);
    expect(screen.getByText("Pourquoi pour toi")).toBeInTheDocument();
    expect(screen.getByText("[Tu as choisi l'histoire]")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Source\u00a0: [Site]" });
    expect(link).toHaveAttribute("href", "https://example.org/mock/site");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(/consultée/)).toBeNull();
  });

  it("date de consultation sous le bloc, jamais « Vérifié »", () => {
    const { container } = render(
      <ReasonBlock text="[Texte]" sourceLabel="[Site]" sourceUrl="https://example.org/mock/site" verifiedAt="2026-08-15" />,
    );
    expect(screen.getByText("Source consultée le 15 août 2026")).toHaveClass("text-legende", "text-ink-soft");
    expect(container.textContent).not.toMatch(/[Vv]érifi/);
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <ReasonBlock text="[Texte]" sourceLabel="[Site]" sourceUrl="https://example.org/mock/site" verifiedAt="2026-08-15" />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
