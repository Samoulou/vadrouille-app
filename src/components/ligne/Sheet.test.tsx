import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { LARGE_SCREEN_QUERY } from "@/lib/large-screen";

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

/** `matchMedia` simulé pour la requête du grand écran : `set(true)` passe le seuil et émet `change`. */
function stubLargeScreen(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === LARGE_SCREEN_QUERY ? matches : false;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return (next: boolean) =>
    act(() => {
      matches = next;
      for (const listener of listeners) listener();
    });
}

describe("Sheet en mode latéral (`sideOnLargeScreen`, F12-PO-7, décision 0022 § 6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disposition en CSS : pleine hauteur et largeur `--ligne-panneau-large` à partir de `lg`, poignée masquée, hauteur en variable", () => {
    stubLargeScreen(false);
    render(
      <Sheet label="Programme" header={<nav aria-label="Onglets" />} sideOnLargeScreen>
        <p>contenu</p>
      </Sheet>,
    );
    expect(region()).toHaveClass("h-(--sheet-height)", "lg:h-full", "lg:w-(--ligne-panneau-large)", "lg:transition-none");
    expect(region().style.getPropertyValue("--sheet-height")).toBe("55%");
    expect(region().style.height).toBe("");
    // Poignée et ses boutons retirés de l'arbre d'accessibilité en grand écran (display: none).
    expect(region().querySelector("[data-part='poignee-zone']")).toHaveClass("lg:hidden");
    // Région nommée, en-tête fixe, contenu qui défile, comme en mobile.
    expect(region()).not.toHaveAttribute("aria-modal");
    expect(screen.getByRole("navigation", { name: "Onglets" })).toBeInTheDocument();
    expect(screen.getByText("contenu").closest("[data-part='contenu']")).toHaveClass("overflow-y-auto");
  });

  it("sans la prop : rendu mobile inchangé à toutes les tailles", () => {
    stubLargeScreen(true);
    render(
      <Sheet label="Programme">
        <p>contenu</p>
      </Sheet>,
    );
    expect(region()).toHaveStyle({ height: "55%" });
    expect(region().className).not.toMatch(/lg:/);
    fireEvent.click(screen.getByRole("button", { name: "Agrandir le panneau" }));
    expect(region()).toHaveAttribute("data-snap", "0.92");
  });

  it("grand écran : aucun point d'arrêt ni glisser, `snap` conservé ; sous le seuil, le panneau reprend sa hauteur précédente", () => {
    const setLarge = stubLargeScreen(false);
    const onChange = vi.fn();
    render(<ControlledSide onChange={onChange} />);
    // Mobile : panneau monté à 92 %.
    fireEvent.click(screen.getByRole("button", { name: "Agrandir le panneau" }));
    expect(region()).toHaveAttribute("data-snap", "0.92");
    onChange.mockClear();
    setLarge(true);
    // Poignée (masquée par CSS, présente dans jsdom) : sans effet.
    const handle = region().querySelector<HTMLButtonElement>("[data-part='poignee']")!;
    fireEvent.click(handle);
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    // Glisser : ne démarre pas.
    const zone = region().querySelector<HTMLElement>("[data-part='poignee-zone']")!;
    fireEvent.pointerDown(zone, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 400 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 400 });
    expect(region()).not.toHaveAttribute("data-dragging");
    expect(onChange).not.toHaveBeenCalled();
    expect(region()).toHaveAttribute("data-snap", "0.92");
    setLarge(false);
    expect(region()).toHaveAttribute("data-snap", "0.92");
    expect(region().style.getPropertyValue("--sheet-height")).toBe("92%");
    fireEvent.click(screen.getByRole("button", { name: "Réduire le panneau" }));
    expect(onChange).toHaveBeenCalledWith(0.25);
  });

  it("n'a aucune violation axe en grand écran", async () => {
    stubLargeScreen(true);
    const { container } = render(
      <Sheet label="Fiche étape" sideOnLargeScreen>
        <p>contenu</p>
      </Sheet>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

function ControlledSide({ onChange }: { onChange: (snap: SnapPoint) => void }) {
  const [snap, setSnap] = useState<SnapPoint>(0.55);
  return (
    <Sheet
      label="Programme"
      snap={snap}
      sideOnLargeScreen
      onSnapChange={(next) => {
        setSnap(next);
        onChange(next);
      }}
    >
      <p>contenu</p>
    </Sheet>
  );
}
