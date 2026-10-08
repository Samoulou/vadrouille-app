// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ColorToken } from "@/styles/tokens";

/** Contrastes WCAG 2.2 des paires de tokens utilisées par les composants (handover § 11). */
const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");

function hex(token: ColorToken): string {
  const match = css.match(new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6});`));
  if (!match?.[1]) {
    throw new Error(`Token --color-${token} introuvable dans globals.css`);
  }
  return match[1];
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: ColorToken, background: ColorToken): number {
  const [light, dark] = [luminance(hex(foreground)), luminance(hex(background))].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const TEXT = 4.5;
const CONTROL_BORDER = 3;

const TEXT_PAIRS: [ColorToken, ColorToken][] = [
  ["on-line", "line"], // Button principal, option choisie, chip sélectionnée
  ["ink", "quai"], // Tag « À réserver », Counter
  ["ink", "page"],
  ["ink-soft", "page"],
  ["ink-soft", "muted"], // état désactivé
  ["ink", "raised"], // Button secondaire, IconButton, Chip, OtpInput
  ["ink-2", "muted"], // StatusBanner, SegmentedControl
];

describe("contrastes des paires de tokens (WCAG 2.2 AA)", () => {
  it("retrouve les valeurs du design system (formule WCAG)", () => {
    expect(contrast("ink-soft", "page")).toBeCloseTo(7.5, 0);
    expect(contrast("on-line", "line")).toBeCloseTo(6.3, 0);
    expect(contrast("border-control", "page")).toBeCloseTo(3.2, 0);
  });

  for (const [foreground, background] of TEXT_PAIRS) {
    it(`${foreground} sur ${background} : au moins 4,5:1 pour le texte`, () => {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(TEXT);
    });
  }

  it("border-control sur page : au moins 3:1 pour un contour de contrôle", () => {
    expect(contrast("border-control", "page")).toBeGreaterThanOrEqual(CONTROL_BORDER);
  });

  it("border-control sur raised (cases du code) : au moins 3:1", () => {
    expect(contrast("border-control", "raised")).toBeGreaterThanOrEqual(CONTROL_BORDER);
  });

  it("line sur page : au moins 3:1 pour l'anneau de focus", () => {
    expect(contrast("line", "page")).toBeGreaterThanOrEqual(CONTROL_BORDER);
  });
});
