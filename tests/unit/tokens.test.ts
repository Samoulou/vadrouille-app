// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COLOR_TOKENS, RADIUS_TOKENS, TEXT_STYLES } from "@/styles/tokens";

const root = process.cwd();
const css = readFileSync(join(root, "src/styles/globals.css"), "utf8");
const designTokens = JSON.parse(
  readFileSync(join(root, "docs/design-system/tokens.json"), "utf8"),
) as {
  color: { tokens: { name: string; value: string }[] };
  radius: { tokens: { name: string; value: string }[] };
};

function declared(variable: string): string | undefined {
  const match = css.match(new RegExp(`${variable}:\\s*([^;]+);`));
  return match?.[1]?.trim();
}

describe("tokens Ligne dans globals.css (handover § 4.1)", () => {
  it("déclare chaque couleur avec la valeur du design system", () => {
    for (const name of COLOR_TOKENS) {
      const expected = designTokens.color.tokens.find((token) => token.name === name)?.value;
      expect(expected, name).toBeDefined();
      expect(declared(`--color-${name}`), name).toBe(expected);
    }
  });

  it("déclare chaque rayon avec la valeur du design system", () => {
    for (const name of RADIUS_TOKENS) {
      const expected = designTokens.radius.tokens.find((token) => token.name === `radius-${name}`)?.value;
      expect(declared(`--radius-${name}`), name).toBe(expected);
    }
  });

  it("déclare chaque style de texte avec sa hauteur de ligne", () => {
    for (const { name } of TEXT_STYLES) {
      expect(declared(`--text-${name}`), name).toMatch(/^\d+px$/);
      expect(declared(`--text-${name}--line-height`), name).toMatch(/^\d+px$/);
    }
  });

  it("branche la correspondance shadcn/ui sur les tokens", () => {
    expect(declared("--background")).toBe("var(--color-page)");
    expect(declared("--foreground")).toBe("var(--color-ink)");
    expect(declared("--primary")).toBe("var(--color-line)");
    expect(declared("--primary-foreground")).toBe("var(--color-on-line)");
    expect(declared("--input")).toBe("var(--color-border-control)");
    expect(declared("--ring")).toBe("var(--color-line)");
    expect(declared("--radius")).toBe("12px");
  });

  it("déclare la géométrie de la ligne et la cible tactile", () => {
    expect(declared("--ligne-rail")).toBe("4px");
    expect(declared("--touch-target")).toBe("44px");
  });
});
