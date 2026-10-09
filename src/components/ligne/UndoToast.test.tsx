import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { UndoToast } from "./UndoToast";

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
        <UndoToast message="[Château] écarté." onUndo={onUndo} onExpire={onExpire} />
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
        <UndoToast message="Jour 1 gardé." onUndo={() => {}} onExpire={onExpire} />
        <button type="button">Après</button>
      </>,
    );
    act(() => vi.advanceTimersByTime(3000));
    const annuler = screen.getByRole("button", { name: "Annuler" });
    act(() => annuler.focus());
    expect(screen.getByRole("status")).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(10_000));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => screen.getByRole("button", { name: "Après" }).focus());
    act(() => vi.advanceTimersByTime(1999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("suspendu au survol", () => {
    const onExpire = vi.fn();
    render(<UndoToast message="Jour 1 gardé." onUndo={() => {}} onExpire={onExpire} duration={1000} />);
    fireEvent.mouseEnter(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(5000));
    expect(onExpire).not.toHaveBeenCalled();
    fireEvent.mouseLeave(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(1000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("aucune violation axe", async () => {
    vi.useRealTimers();
    const { container } = render(<UndoToast message="[Château] écarté." onUndo={() => {}} onExpire={() => {}} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
