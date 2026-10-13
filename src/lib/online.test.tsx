import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOnline } from "./online";

/** `useOnline()` (décision 0016 § 10) : `navigator.onLine`, suivi par les événements `online` et `offline`. */

function Probe() {
  return <p>{useOnline() ? "en ligne" : "hors ligne"}</p>;
}

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

describe("useOnline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("en ligne au rendu serveur", () => {
    expect(renderToString(<Probe />)).toContain("en ligne");
  });

  it("suit les événements offline et online, sans rechargement", () => {
    const { container } = render(<Probe />);
    expect(container.textContent).toBe("en ligne");
    act(() => setOnline(false));
    expect(container.textContent).toBe("hors ligne");
    act(() => setOnline(true));
    expect(container.textContent).toBe("en ligne");
  });
});
