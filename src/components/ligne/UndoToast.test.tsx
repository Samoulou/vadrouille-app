import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { UndoToast, UndoToastRegion } from "./UndoToast";

const toast = () => document.querySelector<HTMLElement>("[data-undo-toast]")!;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("UndoToast", () => {
  it("UndoToast: 5 s et focus non volé", () => {
    const onExpire = vi.fn();
    const onUndo = vi.fn();
    render(
      <>
        <button type="button">Avant</button>
        <UndoToastRegion>
          <UndoToast message="[Château] écarté." onUndo={onUndo} onExpire={onExpire} />
        </UndoToastRegion>
      </>,
    );
    const before = screen.getByRole("button", { name: "Avant" });
    before.focus();
    expect(screen.getByRole("status")).toHaveTextContent("[Château] écarté.");
    expect(document.activeElement).toBe(before);
    act(() => vi.advanceTimersByTime(4999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("UndoToast: suspendu au focus, puis reprend à la sortie", () => {
    const onExpire = vi.fn();
    render(
      <>
        <UndoToastRegion>
          <UndoToast message="Jour 1 gardé." onUndo={() => {}} onExpire={onExpire} />
        </UndoToastRegion>
        <button type="button">Après</button>
      </>,
    );
    act(() => vi.advanceTimersByTime(3000));
    const annuler = screen.getByRole("button", { name: "Annuler" });
    act(() => annuler.focus());
    expect(toast()).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(10_000));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => screen.getByRole("button", { name: "Après" }).focus());
    act(() => vi.advanceTimersByTime(1999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("UndoToast: région live persistante, contenu injecté ensuite", () => {
    const { rerender } = render(<UndoToastRegion />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    rerender(
      <UndoToastRegion>
        <UndoToast message="[Château] écarté." onUndo={() => {}} onExpire={() => {}} />
      </UndoToastRegion>,
    );
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("[Château] écarté.");
    expect(toast()).not.toHaveAttribute("role");
    rerender(<UndoToastRegion />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });

  it("suspendu au survol", () => {
    const onExpire = vi.fn();
    render(<UndoToast message="Jour 1 gardé." onUndo={() => {}} onExpire={onExpire} duration={1000} />);
    fireEvent.mouseEnter(toast());
    act(() => vi.advanceTimersByTime(5000));
    expect(onExpire).not.toHaveBeenCalled();
    fireEvent.mouseLeave(toast());
    act(() => vi.advanceTimersByTime(1000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("UndoToast: « Annuler » en aplat page et texte ink au focus clavier (décision 0014, § 1.2)", () => {
    render(<UndoToast message="[Château] écarté." onUndo={() => {}} onExpire={() => {}} />);
    const annuler = screen.getByRole("button", { name: "Annuler" });
    // Le rendu calculé au focus clavier est vérifié dans le navigateur (presentation.a11y.spec.ts).
    expect(annuler).toHaveClass("focus-visible:bg-page", "focus-visible:text-ink", "text-page");
    // Le contour global (globals.css) n'est pas remplacé.
    expect(annuler.className).not.toMatch(/(^|\s)(focus-visible:)?(outline|ring)/);
  });

  it("aucune violation axe", async () => {
    vi.useRealTimers();
    const { container } = render(
      <UndoToastRegion>
        <UndoToast message="[Château] écarté." onUndo={() => {}} onExpire={() => {}} />
      </UndoToastRegion>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
