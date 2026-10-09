import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { StatusBanner, statusBannerRole, type StatusBannerKind } from "./StatusBanner";

const KINDS: StatusBannerKind[] = ["offline", "conflict", "noOption", "error", "generating", "travel"];

describe("StatusBanner", () => {
  it("utilise role=alert pour error et role=status pour les autres types (provisoire, Q13)", () => {
    for (const kind of KINDS) {
      const { unmount } = render(<StatusBanner kind={kind} message={`Message ${kind}`} />);
      const expected = kind === "error" ? "alert" : "status";
      expect(screen.getByRole(expected)).toHaveAttribute("data-kind", kind);
      unmount();
    }
  });

  it("le message est lu sans dépendre de la couleur", () => {
    const message = "Les temps de trajet n'ont pas pu être recalculés. Ton programme précédent est conservé.";
    render(<StatusBanner kind="error" message={message} />);
    const banner = screen.getByRole("alert");
    // Tout le texte lisible du bandeau est le message ; le filet coloré est masqué aux technologies d'assistance.
    expect(banner).toHaveTextContent(message);
    expect(banner.textContent).toBe(message);
    expect(banner.querySelector("[data-rail]")).toHaveAttribute("aria-hidden", "true");
  });

  it("n'anime le filet de génération que hors prefers-reduced-motion", () => {
    render(<StatusBanner kind="generating" message="Jour 2 en préparation" />);
    const rail = screen.getByRole("status").querySelector("[data-rail]");
    expect(rail).toHaveClass("motion-safe:animate-pulse");
    expect(rail?.className).not.toMatch(/(^|\s)animate-/);
  });

  it("type travel (décision 0015 § 7) : role=status, filet ink-soft fixe", () => {
    expect(statusBannerRole("travel")).toBe("status");
    render(<StatusBanner kind="travel" message="2 h 45 de trajet ce jour" />);
    const rail = screen.getByRole("status").querySelector("[data-rail]");
    expect(rail).toHaveClass("bg-ink-soft");
    expect(rail?.className).not.toMatch(/animate-/);
  });

  it("affiche une action éventuelle sous le message", () => {
    render(
      <StatusBanner kind="noOption" message="Aucune option" action={<button type="button">Réessayer</button>} />,
    );
    expect(screen.getByRole("status")).toContainElement(screen.getByRole("button", { name: "Réessayer" }));
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <>
        {KINDS.map((kind) => (
          <StatusBanner key={kind} kind={kind} message={`Message ${kind}`} />
        ))}
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
