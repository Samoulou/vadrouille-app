// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Critères F4 : aucune couleur ni valeur en px en dur dans src/components/carte ; aucun texte en dur
 * (react/jsx-no-literals actif sur src/components/carte et src/app/dev/carte).
 */
const DIR = join(process.cwd(), "src/components/carte");
const files = readdirSync(DIR).filter((name) => /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name));

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(?:rgba?|hsla?)\(/i;
const PX = /\d(?:\.\d+)?px\b/;

describe("valeurs en dur dans src/components/carte", () => {
  it("couvre les composants de F4", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "DayMap.tsx",
        "GoogleMapRenderer.tsx",
        "SimulatedMapRenderer.tsx",
        "MapFallback.tsx",
        "PlacesAttribution.tsx",
        "route.ts",
      ]),
    );
  });

  for (const name of files) {
    it(`${name} : ni couleur ni px`, () => {
      const source = readFileSync(join(DIR, name), "utf8");
      expect(source).not.toMatch(HEX);
      expect(source).not.toMatch(COLOR_FN);
      expect(source).not.toMatch(PX);
    });
  }
});

describe("règle react/jsx-no-literals sur la carte", () => {
  const eslint = new ESLint({ cwd: process.cwd() });

  it.each(["src/components/carte/Exemple.tsx", "src/app/dev/carte/Exemple.tsx"])("refuse un texte en dur dans %s", async (filePath) => {
    const [result] = await eslint.lintText(`export function Exemple() {\n  return <p>Carte indisponible</p>;\n}\n`, { filePath });
    const messages = result?.messages.filter((m) => m.ruleId === "react/jsx-no-literals") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });
});
