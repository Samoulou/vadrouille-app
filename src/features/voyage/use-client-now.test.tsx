import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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

function Ticking({ now }: { now: () => number }) {
  const value = useClientNow({ now, tickEveryMinute: true });
  return <p>{value === null ? "attente" : String(value)}</p>;
}

describe("useClientNow avec tickEveryMinute (F10-TL-2)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("minuteur aligné sur la minute suivante, puis chaque minute ; reprogrammé au retour de la page ; nettoyé", () => {
    vi.useFakeTimers();
    // 10:49:30 : prochaine lecture à 10:50:00, soit 30 s plus tard.
    vi.setSystemTime(Date.parse("2026-08-30T10:49:30+01:00"));
    const { container, unmount } = render(<Ticking now={Date.now} />);
    expect(container.textContent).toBe(String(Date.parse("2026-08-30T10:49:30+01:00")));
    act(() => vi.advanceTimersByTime(29_000));
    expect(container.textContent).toBe(String(Date.parse("2026-08-30T10:49:30+01:00")));
    act(() => vi.advanceTimersByTime(1_000));
    expect(container.textContent).toBe(String(Date.parse("2026-08-30T10:50:00+01:00")));
    act(() => vi.advanceTimersByTime(60_000));
    expect(container.textContent).toBe(String(Date.parse("2026-08-30T10:51:00+01:00")));
    // Page cachée, horloge déplacée sans minuteur : relue au retour, minuteur réaligné sur la minute suivante.
    act(() => setVisibility("hidden"));
    vi.setSystemTime(Date.parse("2026-08-30T12:10:20+01:00"));
    act(() => setVisibility("visible"));
    expect(container.textContent).toBe(String(Date.parse("2026-08-30T12:10:20+01:00")));
    act(() => vi.advanceTimersByTime(40_000));
    expect(container.textContent).toBe(String(Date.parse("2026-08-30T12:11:00+01:00")));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sans l'option : aucun minuteur", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Probe now={() => 1} seen={[]} />);
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });
});
