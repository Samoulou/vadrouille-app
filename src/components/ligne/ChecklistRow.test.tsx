import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import type { ChecklistMoment } from "@/contracts";

import { ChecklistRow, formatChecklistMoment } from "./ChecklistRow";

const base = {
  label: "[Château d'Édimbourg]",
  when: { type: "deadline", date: "2026-08-22" } as ChecklistMoment,
  bookingUrl: "https://example.org/mock/chateau",
  sponsored: false,
};

describe("ChecklistRow", () => {
  it("à faire : case aria-pressed=false nommée par le libellé, moment, lien « Réserver » dans un nouvel onglet", () => {
    render(<ChecklistRow {...base} done={false} onToggle={() => {}} />);
    const box = screen.getByRole("button", { name: "[Château d'Édimbourg]" });
    expect(box).toHaveAttribute("aria-pressed", "false");
    expect(box).toHaveClass("size-(--touch-target)");
    expect(screen.getByText("Avant le sam. 22.08")).toHaveClass("text-legende", "text-ink-soft", "tabular-nums");
    const link = screen.getByRole("link", { name: "Réserver" });
    expect(link).toHaveAttribute("href", base.bookingUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("min-h-(--touch-target)", "font-extrabold", "text-line");
    expect(link).toHaveAccessibleDescription("[Château d'Édimbourg]");
    expect(screen.getByText("[Château d'Édimbourg]")).toHaveClass("text-corps", "font-bold");
    expect(screen.queryByText("Lien rémunéré")).not.toBeInTheDocument();
  });

  it("case de 22 px (size-5.5) dans la zone de 44 px, sans coche", () => {
    const { container } = render(<ChecklistRow {...base} done={false} onToggle={() => {}} />);
    const square = container.querySelector("[data-part='case'] > span");
    expect(square).toHaveClass("size-5.5", "border-2", "border-ink");
    expect(square).toHaveClass("bg-transparent");
    expect(square?.querySelector("svg")).toBeNull();
  });

  it("cocher puis décocher : onToggle reçoit le nouvel état", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ChecklistRow {...base} done={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: base.label }));
    expect(onToggle).toHaveBeenLastCalledWith(true);
    rerender(<ChecklistRow {...base} done onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: base.label }));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it("faite : ligne ink-soft, nom barré, case pleine avec coche, sans lien, toujours rendue", () => {
    const { container } = render(<ChecklistRow {...base} done onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: base.label })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("[data-part='checklist-row']")).toHaveClass("text-ink-soft");
    expect(screen.getByText(base.label)).toHaveClass("line-through");
    const square = container.querySelector("[data-part='case'] > span");
    expect(square).toHaveClass("bg-ink", "text-on-line");
    expect(square?.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sans bookingUrl : pas de lien « Réserver »", () => {
    render(<ChecklistRow {...base} bookingUrl={undefined} done={false} onToggle={() => {}} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("rémunéré : « Lien rémunéré » en legende ink-soft à côté de « Réserver », sur la même ligne ; rien une fois faite", () => {
    const { rerender } = render(<ChecklistRow {...base} sponsored done={false} onToggle={() => {}} />);
    const mention = screen.getByText("Lien rémunéré");
    expect(mention).toHaveClass("text-legende", "text-ink-soft");
    const link = screen.getByRole("link", { name: "Réserver" });
    // Même conteneur en ligne (flex en rangée), juste avant le lien ; la mention décrit aussi le lien.
    expect(mention.parentElement).toBe(link.parentElement);
    expect(mention.parentElement).not.toHaveClass("flex-col");
    expect(mention.nextElementSibling).toBe(link);
    expect(link).toHaveAccessibleDescription("[Château d'Édimbourg] Lien rémunéré");
    rerender(<ChecklistRow {...base} sponsored done onToggle={() => {}} />);
    expect(screen.queryByText("Lien rémunéré")).not.toBeInTheDocument();
  });

  it("interface: moment d'une réservation composé depuis ChecklistMoment", () => {
    expect(formatChecklistMoment({ type: "deadline", date: "2026-08-22" })).toBe("Avant le sam. 22.08");
    expect(formatChecklistMoment({ type: "beforeDeparture" })).toBe("Avant le départ");
    expect(formatChecklistMoment({ type: "tripDay", day: 1 })).toBe("À l'arrivée");
    expect(formatChecklistMoment({ type: "tripDay", day: 3 })).toBe("J3");
    const moments: ChecklistMoment[] = [
      { type: "deadline", date: "2026-08-22" },
      { type: "beforeDeparture" },
      { type: "tripDay", day: 1 },
      { type: "tripDay", day: 3 },
    ];
    for (const when of moments) {
      const { unmount } = render(<ChecklistRow {...base} when={when} done={false} onToggle={() => {}} />);
      expect(screen.getByText(formatChecklistMoment(when))).toBeInTheDocument();
      unmount();
    }
  });

  it("axe sans violation, à faire, faite et rémunérée", async () => {
    const { container } = render(
      <ul>
        <li>
          <ChecklistRow {...base} done={false} onToggle={() => {}} />
        </li>
        <li>
          <ChecklistRow {...base} label="[Billets]" done onToggle={() => {}} />
        </li>
        <li>
          <ChecklistRow {...base} label="[Assurance voyage]" sponsored done={false} onToggle={() => {}} />
        </li>
      </ul>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
