import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { messages } from "@/i18n";

import { axeViolations } from "../../../tests/unit/axe";

import { DayBadge } from "./DayBadge";

describe("DayBadge", () => {
  it("affiche « J{day} » et porte le nom « Jour {day} », complété par le jour abrégé", () => {
    const { rerender } = render(<DayBadge day={2} href="/j2" />);
    expect(screen.getByRole("link", { name: "Jour 2" })).toHaveAttribute("href", "/j2");
    expect(screen.getByText("J2")).toBeVisible();

    rerender(<DayBadge day={2} weekday="lun." href="/j2" />);
    const link = screen.getByRole("link", { name: "Jour 2, lun." });
    expect(link).toBeInTheDocument();
    // Le jour abrégé n'est pas dans le texte visible (Q18).
    const visible = link.querySelector("[aria-hidden='true']");
    expect(visible).toHaveTextContent(/^J2$/);
    expect(visible?.textContent).not.toContain("lun.");
  });

  it("active : aria-current « true » par défaut, « page » sur demande, et aplat line", () => {
    const { rerender } = render(<DayBadge day={3} href="/j3" active />);
    const link = screen.getByRole("link", { name: "Jour 3" });
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link).toHaveClass("bg-line", "text-on-line");

    rerender(<DayBadge day={3} href="/j3" active currentValue="page" />);
    expect(screen.getByRole("link", { name: "Jour 3" })).toHaveAttribute("aria-current", "page");
  });

  it("inactive : pas d'aria-current, fond raised, contour outline-strong, texte ink", () => {
    render(<DayBadge day={1} href="/j1" />);
    const link = screen.getByRole("link", { name: "Jour 1" });
    expect(link).not.toHaveAttribute("aria-current");
    expect(link).toHaveClass("bg-raised", "border-outline-strong", "text-ink", "rounded-badge");
  });

  it("désactivée : aucun lien, aria-disabled, « complet » visible et dans le nom, sans navigation", () => {
    const { container } = render(<DayBadge day={4} weekday="jeu." href="/j4" disabled active />);
    expect(container.querySelector("a[href]")).toBeNull();
    const badge = screen.getByRole("link", { name: `Jour 4, jeu., ${messages.ligne.jour.complet}` });
    expect(badge).toHaveAttribute("aria-disabled", "true");
    expect(badge).not.toHaveAttribute("aria-current");
    expect(badge).not.toHaveAttribute("tabindex");
    expect(badge).toHaveClass("bg-muted", "text-ink-soft");
    expect(screen.getByText(messages.ligne.jour.complet)).toBeVisible();
    const before = window.location.href;
    fireEvent.click(badge);
    fireEvent.keyDown(badge, { key: "Enter" });
    expect(window.location.href).toBe(before);
  });

  it("sans href : pastille non interactive", () => {
    const { container } = render(<DayBadge day={5} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container).toHaveTextContent("J5");
  });

  it("réduite (sm) : ni lien ni focusable, même avec href", () => {
    const { container } = render(<DayBadge day={6} size="sm" href="/j6" />);
    expect(screen.queryByRole("link")).toBeNull();
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.tabIndex).toBe(-1);
    expect(badge).toHaveClass("h-(--ligne-pastille-reduite)", "rounded-(--ligne-rayon-mini)", "text-etiquette");
    expect(badge).toHaveTextContent("J6");
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <ul>
        <li>
          <DayBadge day={1} href="/j1" />
        </li>
        <li>
          <DayBadge day={2} weekday="lun." href="/j2" active />
        </li>
        <li>
          <DayBadge day={3} href="/j3" disabled />
        </li>
        <li>
          <DayBadge day={4} size="sm" />
        </li>
      </ul>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
