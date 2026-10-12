import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LARGE_SCREEN_QUERY, useLargeScreen } from "./large-screen";

/** `matchMedia` simulé : `set(true)` passe le seuil et émet `change`. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  vi.stubGlobal("matchMedia", (query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
  });
  return {
    queries,
    listeners,
    set(next: boolean) {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

function Probe() {
  return <p>{useLargeScreen() ? "grand" : "mobile"}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("large-screen (décision 0022 § 5)", () => {
  it("la requête est le point d'arrêt `lg` de Tailwind, non redéfini par les styles de l'application", () => {
    const require = createRequire(import.meta.url);
    const theme = readFileSync(join(require.resolve("tailwindcss/package.json"), "..", "theme.css"), "utf8");
    const lg = /--breakpoint-lg:\s*([^;]+);/.exec(theme)?.[1]?.trim();
    expect(LARGE_SCREEN_QUERY).toBe(`(min-width: ${lg})`);
    const globals = readFileSync(join(process.cwd(), "src", "styles", "globals.css"), "utf8");
    expect(globals).not.toMatch(/--breakpoint-/);
  });

  it("faux au rendu serveur, quelle que soit la fenêtre", () => {
    stubMatchMedia(true);
    expect(renderToString(<Probe />)).toContain("mobile");
  });

  it("suit le passage du seuil dans les deux sens, puis se désabonne", () => {
    const media = stubMatchMedia(false);
    const { unmount } = render(<Probe />);
    expect(screen.getByText("mobile")).toBeInTheDocument();
    expect(media.queries.every((query) => query === LARGE_SCREEN_QUERY)).toBe(true);
    act(() => media.set(true));
    expect(screen.getByText("grand")).toBeInTheDocument();
    act(() => media.set(false));
    expect(screen.getByText("mobile")).toBeInTheDocument();
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
