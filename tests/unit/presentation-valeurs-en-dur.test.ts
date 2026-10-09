// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { messages } from "@/i18n";

/**
 * Critère F6 : aucune couleur, taille ni valeur en px en dur hors provisoire.css dans les fichiers de
 * la présentation ; textes dans fr.json sous presentation.*, vocabulaire du handover § 10.
 */
const ROOT = process.cwd();
const DIRS = ["src/features/presentation", "src/app/voyages", "src/components/ui", "src/analytics"];

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

describe("valeurs en dur dans les fichiers de F6", () => {
  const files = DIRS.flatMap(sources);

  it("couvre la présentation, sa route, la feuille modale et la mesure", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "src/features/presentation/PresentationScreen.tsx",
        "src/features/presentation/deck.ts",
        "src/app/voyages/[id]/presentation/page.tsx",
        "src/components/ui/dialog.tsx",
        "src/analytics/events.ts",
      ]),
    );
  });

  for (const file of DIRS.flatMap(sources)) {
    it(`${file} : ni couleur ni px`, () => {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(HEX);
      expect(source).not.toMatch(COLOR_FN);
      expect(source).not.toMatch(PX);
    });
  }
});

describe("textes de la présentation (handover § 10)", () => {
  const text = JSON.stringify(messages.presentation);

  it("emploie les mots imposés", () => {
    expect(messages.presentation.actions).toEqual({
      like: "J'aime",
      dislike: "Pas pour moi",
      choose: "Je choisis",
      next: "Option suivante",
    });
    expect(messages.presentation.passer).toBe("Passer");
    expect(messages.presentation.toutGarder).toBe("Tout garder pour le jour {n}");
    expect(Object.values(messages.presentation.raisons)).toEqual([
      "Pas mon style",
      "Trop chargé",
      "Trop cher",
      "Trop loin",
      "Autre raison",
    ]);
  });

  it.each(["Like", "swip", "valider", "Valider", "Aperçu", "Premium", "!"])("n'emploie pas « %s »", (word) => {
    expect(text).not.toContain(word);
  });
});
