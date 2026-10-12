import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { ActionBanner } from "./ActionBanner";

/** `ActionBanner` (spécification F10, F10-TL-12, C19) ; contraste `ink` sur `quai` : tests/unit/contrast.test.ts. */
describe("ActionBanner", () => {
  it("aplat quai, texte ink, rayon block ; région nommée par son titre de niveau 2 par défaut", () => {
    render(
      <ActionBanner title="À réserver" titleId="a-reserver">
        <p>19:00 [Bonne table]</p>
      </ActionBanner>,
    );
    const region = screen.getByRole("region", { name: "À réserver" });
    expect(region).toHaveClass("bg-quai", "text-ink", "rounded-block");
    expect(screen.getByRole("heading", { level: 2, name: "À réserver" })).toHaveClass("text-ink");
    expect(region).toHaveTextContent("19:00 [Bonne table]");
  });

  it("titre au niveau demandé", () => {
    render(
      <ActionBanner title="À réserver" titleId="t3" headingLevel={3}>
        <p>[Contenu]</p>
      </ActionBanner>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "À réserver" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("pas de zone vivante : ce n'est pas un état (StatusBanner)", () => {
    const { container } = render(
      <ActionBanner title="À réserver" titleId="a">
        <p>[Contenu]</p>
      </ActionBanner>,
    );
    expect(container.querySelector("[role='status'], [role='alert'], [aria-live]")).toBeNull();
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <ActionBanner title="À réserver" titleId="a">
        <ul>
          <li>[Ligne]</li>
        </ul>
      </ActionBanner>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
