import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { IconButton } from "./IconButton";
import { IconPartager, IconRetour } from "./icons";

describe("IconButton", () => {
  it("a pour nom accessible son label", () => {
    render(<IconButton icon={<IconRetour />} label="Retour" />);
    const button = screen.getByRole("button", { name: "Retour" });
    expect(button).toHaveAttribute("aria-label", "Retour");
  });

  it("rend une icône décorative, 44 × 44, carrée par défaut ou ronde", () => {
    render(
      <>
        <IconButton icon={<IconRetour />} label="Retour" />
        <IconButton icon={<IconPartager />} label="Partager" shape="round" />
      </>,
    );
    const square = screen.getByRole("button", { name: "Retour" });
    expect(square).toHaveClass("size-(--touch-target)", "rounded-control", "bg-raised", "border-outline", "text-ink");
    const svg = square.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("stroke-width", "2.2");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(screen.getByRole("button", { name: "Partager" })).toHaveClass("rounded-full");
  });

  it("appelle l'action au clic, pas quand il est désactivé", () => {
    const onClick = vi.fn();
    const { rerender } = render(<IconButton icon={<IconRetour />} label="Retour" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<IconButton icon={<IconRetour />} label="Retour" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("exige un label à la compilation", () => {
    // Vérifié par `pnpm typecheck` : sans `label`, le composant ne compile pas.
    // @ts-expect-error label est obligatoire
    const missing = <IconButton icon={<IconRetour />} />;
    // @ts-expect-error aria-label ne remplace pas label
    const ariaOnly = <IconButton icon={<IconRetour />} aria-label="Retour" />;
    expect(missing).toBeDefined();
    expect(ariaOnly).toBeDefined();
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <>
        <IconButton icon={<IconRetour />} label="Retour" />
        <IconButton icon={<IconPartager />} label="Partager" shape="round" />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
