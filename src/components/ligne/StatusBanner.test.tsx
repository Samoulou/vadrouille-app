import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { StatusBanner, statusBannerRole, type StatusBannerKind } from "./StatusBanner";

const KINDS: StatusBannerKind[] = ["offline", "conflict", "noOption", "error", "generating", "travel"];

describe("StatusBanner", () => {
  it("utilise role=alert pour error et conflict, role=status pour les autres types (0012, Q13)", () => {
    for (const kind of KINDS) {
      const { unmount } = render(<StatusBanner kind={kind} message={`Message ${kind}`} />);
      const expected = kind === "error" || kind === "conflict" ? "alert" : "status";
      expect(statusBannerRole(kind)).toBe(expected);
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

  it("generating : filet ink-soft, sans aucune animation (0012, Q13)", () => {
    render(<StatusBanner kind="generating" message="Jour 2 en préparation" />);
    const banner = screen.getByRole("status");
    const rail = banner.querySelector("[data-rail]");
    expect(rail).toHaveClass("bg-ink-soft");
    expect(rail).not.toHaveClass("bg-line");
    expect(banner.outerHTML).not.toMatch(/animate-/);
  });

  it("filet ink pour error et conflict, ink-soft pour les autres, jamais line", () => {
    for (const kind of KINDS) {
      const { container, unmount } = render(<StatusBanner kind={kind} message={`Message ${kind}`} />);
      const rail = container.querySelector("[data-rail]");
      expect(rail, kind).toHaveClass(kind === "error" || kind === "conflict" ? "bg-ink" : "bg-ink-soft");
      expect(rail?.className, kind).not.toMatch(/bg-line/);
      unmount();
    }
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

  it("announce={false} : aucun rôle propre, la région live déjà présente de l'écran annonce le bandeau (0018)", () => {
    render(
      <div role="alert">
        <StatusBanner kind="error" announce={false} message="Impossible de préparer ton brief pour le moment." />
      </div>,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de préparer ton brief pour le moment.");
    expect(screen.getByText("Impossible de préparer ton brief pour le moment.").closest("[data-kind]")).not.toHaveAttribute("role");
  });
});
