// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { messages } from "@/i18n";

/**
 * Critère transverse F5 : aucune couleur, taille ni valeur en px en dur hors provisoire.css dans les
 * fichiers du programme ; textes dans fr.json sous sejour.* ; vocabulaire du handover § 10.
 */
const ROOT = process.cwd();
const DIRS = ["src/features/sejour", "src/app/dev/voyages", "src/app/voyages"];

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(ROOT, dir, name);
    if (statSync(path).isDirectory()) return sources(relative(ROOT, path));
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(ROOT, path)] : [];
  });
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(?:rgba?|hsla?)\(/i;
const PX = /\d(?:\.\d+)?px\b/;
const ARBITRARY = /\b[a-z-]+-\[[^\]]+\]/;

describe("valeurs en dur dans les fichiers de F5", () => {
  const files = DIRS.flatMap(sources);

  it("couvre le programme, ses routes et leurs pages de développement", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "src/features/sejour/TripShell.tsx",
        "src/features/sejour/JourneePanel.tsx",
        "src/app/voyages/[id]/(programme)/layout.tsx",
        "src/app/dev/voyages/SimulatedCarte.tsx",
      ]),
    );
  });

  for (const file of [...files, "src/components/ligne/Sheet.tsx", "src/components/ligne/ReasonBlock.tsx"]) {
    it(`${file} : ni couleur, ni px, ni valeur arbitraire`, () => {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(HEX);
      expect(source).not.toMatch(COLOR_FN);
      expect(source).not.toMatch(PX);
      expect(source).not.toMatch(ARBITRARY);
    });
  }
});

describe("textes du programme (handover § 10)", () => {
  const text = JSON.stringify({ sejour: messages.sejour, raison: messages.ligne.raison, panneau: messages.ligne.panneau });

  it.each(["Vérifié", "vérifié", "Aperçu", "Supprimer", "OK", "!"])("n'emploie pas « %s »", (word) => {
    expect(text).not.toContain(word);
  });

  it("emploie « Séjour » pour l'onglet du voyage et « Pourquoi pour toi »", () => {
    expect(messages.ligne.jours.sejour).toBe("Séjour");
    expect(messages.ligne.raison.titre).toBe("Pourquoi pour toi");
  });
});
