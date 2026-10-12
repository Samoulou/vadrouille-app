import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useElementSize } from "./use-element-size";

/** `ResizeObserver` simulé : `resize()` rappelle les observateurs actifs. */
function stubResizeObserver() {
  const active = new Set<() => void>();
  class FakeObserver {
    constructor(private readonly callback: () => void) {}
    observe() {
      active.add(this.callback);
    }
    disconnect() {
      active.delete(this.callback);
    }
  }
  vi.stubGlobal("ResizeObserver", FakeObserver);
  return {
    active,
    resize() {
      for (const callback of active) callback();
    },
  };
}

let width = 0;
let height = 0;

function Probe({ mounted = true }: { mounted?: boolean }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  return (
    <>
      <p>{size ? `${size.width}×${size.height}` : "aucune"}</p>
      {mounted ? <div ref={ref} /> : null}
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useElementSize (décision 0022 § 6)", () => {
  it("mesure le conteneur dès le montage, suit ses changements de taille, rien après le démontage", () => {
    const observer = stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => height);
    width = 860;
    height = 800;
    const { rerender } = render(<Probe />);
    expect(screen.getByText("860×800")).toBeInTheDocument();
    width = 390;
    height = 844;
    act(() => observer.resize());
    expect(screen.getByText("390×844")).toBeInTheDocument();
    rerender(<Probe mounted={false} />);
    expect(screen.getByText("aucune")).toBeInTheDocument();
    expect(observer.active.size).toBe(0);
  });

  it("élément monté plus tard : mesuré à son montage", () => {
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(420);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
    const { rerender } = render(<Probe mounted={false} />);
    expect(screen.getByText("aucune")).toBeInTheDocument();
    rerender(<Probe />);
    expect(screen.getByText("420×800")).toBeInTheDocument();
  });
});
