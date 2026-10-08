import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { messages } from "@/i18n";

import { axeViolations } from "../../../tests/unit/axe";

import { MapFallback, type MapFallbackCause } from "./MapFallback";
import { PlacesAttribution } from "./PlacesAttribution";

const t = messages.carte;

describe("MapFallback", () => {
  it.each([
    ["offline", t.horsLigne],
    ["unavailable", t.indisponible],
    ["error", t.erreur],
  ] as [MapFallbackCause, string][])("%s : texte, role status, fond muted, texte ink-2", async (cause, text) => {
    const { container } = render(<MapFallback cause={cause} onRetry={() => {}} placesFromGoogle={false} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(text);
    expect(status).toHaveClass("bg-muted", "text-ink-2", "size-full");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("« Réessayer » (Button secondary sm) seulement pour l'erreur de chargement", () => {
    const onRetry = vi.fn();
    const { unmount } = render(<MapFallback cause="error" onRetry={onRetry} placesFromGoogle={false} />);
    const button = screen.getByRole("button", { name: t.reessayer });
    expect(button).toHaveClass("h-11", "border-ink");
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();
    for (const cause of ["offline", "unavailable"] as const) {
      const other = render(<MapFallback cause={cause} onRetry={onRetry} placesFromGoogle={false} />);
      expect(screen.queryByRole("button")).toBeNull();
      other.unmount();
    }
  });

  it("affiche la mention d'attribution selon placesFromGoogle", () => {
    const { unmount } = render(<MapFallback cause="unavailable" placesFromGoogle />);
    expect(screen.getByText(t.attribution)).toBeInTheDocument();
    unmount();
    render(<MapFallback cause="unavailable" placesFromGoogle={false} />);
    expect(screen.queryByText(t.attribution)).toBeNull();
  });
});

describe("PlacesAttribution", () => {
  it("affiche « Données de lieux : Google » si et seulement si placesFromGoogle vaut true", () => {
    const { container, rerender } = render(<PlacesAttribution placesFromGoogle />);
    expect(container).toHaveTextContent("Données de lieux : Google");
    rerender(<PlacesAttribution placesFromGoogle={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
