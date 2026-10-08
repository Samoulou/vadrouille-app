import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { Button } from "./Button";

describe("Button", () => {
  it("rend un bouton principal en aplat line, 52 px par défaut", () => {
    render(<Button>Garder</Button>);
    const button = screen.getByRole("button", { name: "Garder" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("bg-line", "text-on-line", "font-extrabold", "h-13", "rounded-control");
  });

  it("applique les variantes secondaire et texte, et la taille sm", () => {
    render(
      <>
        <Button variant="secondary" size="sm">
          Remplacer
        </Button>
        <Button variant="text" tone="soft">
          Plus tard
        </Button>
      </>,
    );
    const secondary = screen.getByRole("button", { name: "Remplacer" });
    expect(secondary).toHaveClass("bg-raised", "border-ink", "text-ink", "font-bold", "h-11");
    const text = screen.getByRole("button", { name: "Plus tard" });
    expect(text).toHaveClass("underline", "text-ink-soft");
    expect(text).not.toHaveClass("text-ink");
  });

  it("appelle l'action au clic", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Appliquer</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("désactivé, n'appelle pas l'action et passe en muted + ink-soft", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Débloquer
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Débloquer" });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    expect(button).toHaveClass("disabled:bg-muted", "disabled:text-ink-soft");
  });

  it("asChild rend un lien avec le style du bouton", () => {
    render(
      <Button asChild variant="secondary">
        <a href="/reserver">Réserver</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Réserver" });
    expect(link).toHaveAttribute("href", "/reserver");
    expect(link).toHaveClass("bg-raised", "border-ink", "h-13", "rounded-control");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("garde la taille de texte du token à côté de la couleur (tailwind-merge configuré)", () => {
    render(<Button variant="text" className="text-ink-soft">Passer</Button>);
    expect(screen.getByRole("button", { name: "Passer" })).toHaveClass("text-corps", "text-ink-soft");
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <>
        <Button>Garder</Button>
        <Button variant="secondary">Remplacer</Button>
        <Button variant="text">Passer</Button>
        <Button disabled>Débloquer</Button>
        <Button asChild>
          <a href="/reserver">Réserver</a>
        </Button>
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
