import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { ChecklistRow } from "./ChecklistRow";

const base = {
  label: "[Château d'Édimbourg]",
  when: "[Une semaine avant]",
  bookingUrl: "https://example.org/mock/chateau",
  sponsored: false,
};

describe("ChecklistRow", () => {
  it("à faire : case aria-pressed=false nommée par le libellé, moment, lien « Réserver » dans un nouvel onglet", () => {
    render(<ChecklistRow {...base} done={false} onToggle={() => {}} />);
    const box = screen.getByRole("button", { name: "[Château d'Édimbourg]" });
    expect(box).toHaveAttribute("aria-pressed", "false");
    expect(box).toHaveClass("size-(--touch-target)");
    expect(screen.getByText("[Une semaine avant]")).toHaveClass("text-legende", "text-ink-soft", "tabular-nums");
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

  it("rémunéré : « Lien rémunéré » en legende ink-soft à côté de « Réserver » ; rien une fois faite", () => {
    const { rerender } = render(<ChecklistRow {...base} sponsored done={false} onToggle={() => {}} />);
    expect(screen.getByText("Lien rémunéré")).toHaveClass("text-legende", "text-ink-soft");
    rerender(<ChecklistRow {...base} sponsored done onToggle={() => {}} />);
    expect(screen.queryByText("Lien rémunéré")).not.toBeInTheDocument();
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
