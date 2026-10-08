// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Critère F3 : aucune couleur ni valeur en px dans src/components/ligne, hors provisoire.css ;
 * chaque déclaration de provisoire.css cite la question qui la tranchera.
 */
const DIR = join(process.cwd(), "src/components/ligne");
const files = readdirSync(DIR).filter(
  (name) => /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "provisoire.css",
);

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(?:rgba?|hsla?)\(/i;
const PX = /\d(?:\.\d+)?px\b/;

describe("valeurs en dur dans src/components/ligne", () => {
  it("couvre les composants de F2 et F3", () => {
    expect(files).toEqual(expect.arrayContaining(["DayBadge.tsx", "DayLine.tsx", "DayTabs.tsx", "StopMarker.tsx", "Tag.tsx"]));
  });

  for (const name of files) {
    it(`${name} : ni couleur ni px`, () => {
      const source = readFileSync(join(DIR, name), "utf8");
      expect(source).not.toMatch(HEX);
      expect(source).not.toMatch(COLOR_FN);
      expect(source).not.toMatch(PX);
    });
  }

  it("provisoire.css : chaque déclaration porte le numéro de sa question", () => {
    const css = readFileSync(join(DIR, "provisoire.css"), "utf8");
    const lines = css.split("\n");
    const declarations = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^\s*--[\w-]+\s*:/.test(line));
    expect(declarations.length).toBeGreaterThan(0);
    for (const { line, index } of declarations) {
      expect(lines[index - 1] ?? "", line).toMatch(/\/\* Q(11|13|19)\b.*\*\//);
    }
  });
});
