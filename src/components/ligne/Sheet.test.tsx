import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { Sheet } from "./Sheet";
import type { SnapPoint } from "./sheet-model";

function Controlled({ onChange }: { onChange?: (snap: SnapPoint) => void }) {
  const [snap, setSnap] = useState<SnapPoint>(0.25);
  return (
    <>
      <button type="button" onClick={() => setSnap(0.55)}>
        relever
      </button>
      <Sheet
        label="Programme"
        snap={snap}
        onSnapChange={(next) => {
          setSnap(next);
          onChange?.(next);
        }}
      >
        <p>contenu</p>
      </Sheet>
    </>
  );
}

const region = () => screen.getByRole("region", { name: "Programme" });

describe("Sheet", () => {
  it("région non modale nommée, 55 % par défaut, contenu dans une zone qui défile", () => {
    render(
      <Sheet label="Programme" header={<nav aria-label="Onglets" />}>
        <p>contenu</p>
      </Sheet>,
    );
    expect(region()).toHaveAttribute("data-snap", "0.55");
    expect(region()).toHaveStyle({ height: "55%" });
    expect(region()).not.toHaveAttribute("aria-modal");
    expect(screen.getByText("contenu").closest("[data-part='contenu']")).toHaveClass("overflow-y-auto");
    expect(screen.getByRole("navigation", { name: "Onglets" })).toBeInTheDocument();
  });

  it("poignée : « Agrandir le panneau » à 25 et 55 %, « Réduire le panneau » à 92 % (retour à 25 %)", () => {
    render(
      <Sheet label="Programme">
        <p>contenu</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Agrandir le panneau" }));
    expect(region()).toHaveAttribute("data-snap", "0.92");
    fireEvent.click(screen.getByRole("button", { name: "Réduire le panneau" }));
    expect(region()).toHaveAttribute("data-snap", "0.25");
    expect(region()).toHaveStyle({ height: "25%" });
    fireEvent.click(screen.getByRole("button", { name: "Agrandir le panneau" }));
    expect(region()).toHaveAttribute("data-snap", "0.55");
  });

  it("flèches haut et bas sur la poignée : une hauteur", () => {
    render(
      <Sheet label="Programme">
        <p>contenu</p>
      </Sheet>,
    );
    const handle = screen.getByRole("button", { name: "Agrandir le panneau" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(region()).toHaveAttribute("data-snap", "0.25");
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(region()).toHaveAttribute("data-snap", "0.25");
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(region()).toHaveAttribute("data-snap", "0.92");
  });

  it("contrôle externe : suit `snap`, signale les changements de la poignée", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    expect(region()).toHaveAttribute("data-snap", "0.25");
    fireEvent.click(screen.getByRole("button", { name: "relever" }));
    expect(region()).toHaveAttribute("data-snap", "0.55");
    fireEvent.click(screen.getByRole("button", { name: "Agrandir le panneau" }));
    expect(onChange).toHaveBeenCalledWith(0.92);
    expect(region()).toHaveAttribute("data-snap", "0.92");
  });

  it("transition coupée sous prefers-reduced-motion, glisser seulement depuis la zone de la poignée", () => {
    render(
      <Sheet label="Programme">
        <p>contenu</p>
      </Sheet>,
    );
    expect(region()).toHaveClass("motion-reduce:transition-none");
    const zone = region().querySelector("[data-part='poignee-zone']");
    expect(zone).toHaveClass("touch-none");
    expect(region().querySelector("[data-part='contenu']")).not.toHaveClass("touch-none");
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <Sheet label="Programme">
        <p>contenu</p>
      </Sheet>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
