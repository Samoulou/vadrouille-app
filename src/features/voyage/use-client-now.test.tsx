import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { useClientNow } from "./use-client-now";

/** `useClientNow` (décision 0021 § 3) : `null` au rendu serveur, puis l'instant après le montage. */

function Probe({ now, seen }: { now: () => number; seen: (number | null)[] }) {
  const value = useClientNow({ now });
  seen.push(value);
  return <p>{value === null ? "attente" : String(value)}</p>;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useClientNow", () => {
  it("null au rendu serveur (le serveur ne choisit jamais la date)", () => {
    const html = renderToString(<Probe now={() => 42} seen={[]} />);
    expect(html).toContain("attente");
    expect(html).not.toContain("42");
  });

  it("null au premier rendu client, puis la valeur après le montage", () => {
    const seen: (number | null)[] = [];
    const { container } = render(<Probe now={() => 42} seen={seen} />);
    expect(seen[0]).toBeNull();
    expect(container.textContent).toBe("42");
  });

  it("relue quand la page redevient visible ; pas quand elle est cachée ; nettoyée au démontage", () => {
    let clock = 1;
    const now = vi.fn(() => clock);
    const { container, unmount } = render(<Probe now={now} seen={[]} />);
    expect(container.textContent).toBe("1");
    clock = 2;
    act(() => setVisibility("hidden"));
    expect(container.textContent).toBe("1");
    act(() => setVisibility("visible"));
    expect(container.textContent).toBe("2");
    const calls = now.mock.calls.length;
    unmount();
    clock = 3;
    setVisibility("visible");
    expect(now.mock.calls.length).toBe(calls);
  });
});
