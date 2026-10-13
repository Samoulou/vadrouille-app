// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORIES, MOBILITY_MODES, PACES } from "@/contracts/values";
import * as messages from "@/i18n/messages";

/**
 * Critères transverses de F8 (spécification F8) : aucune couleur, taille ni valeur en px en dur hors
 * `provisoire.css` dans les fichiers de la création ; textes dans `fr.json` sous `creation.*` ; ni « Aperçu »,
 * « Supprimer », « OK », « Valider », ni point d'exclamation.
 */
const ROOT = process.cwd();
const DIRS = ["src/features/creation", "src/features/compte", "src/app/(creation)"];

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(ROOT, dir, name);
    if (statSync(path).isDirectory()) return sources(relative(ROOT, path));
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(ROOT, path)] : [];
  });
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(?:rgba?|hsla?|oklch)\(/i;
const PX = /\d(?:\.\d+)?px\b/;

describe("valeurs en dur dans les fichiers de F8a", () => {
  const files = DIRS.flatMap(sources);

  it("couvre les écrans, le brouillon, la suite de connexion et les routes", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "src/features/creation/CreateTripForm.tsx",
        "src/features/creation/BriefReview.tsx",
        "src/features/creation/draft.ts",
        "src/features/compte/suite.ts",
        "src/app/(creation)/voyages/nouveau/brief/page.tsx",
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

describe("textes de la création (handover § 10)", () => {
  const text = JSON.stringify(messages.creation);

  it.each(["Aperçu", "Supprimer", "OK", "Valider", "!"])("aucun « %s »", (word) => {
    const pattern = word === "!" ? /!/ : new RegExp(`\\b${word}\\b`);
    expect(text).not.toMatch(pattern);
  });

  it("un libellé par envie (vocabulaire unique des catégories, F8-PO-6), par rythme et par déplacement", () => {
    expect(Object.keys(messages.creation.envies).sort()).toEqual([...CATEGORIES].sort());
    expect(Object.keys(messages.creation.ecran2.verification.rythme.options).sort()).toEqual([...PACES].sort());
    expect(Object.keys(messages.creation.deplacements).sort()).toEqual([...MOBILITY_MODES].sort());
    expect(Object.keys(messages.presentation.categories).sort()).toEqual([...CATEGORIES].sort());
  });

  it("libellés provisoires des envies de F8-PO-6", () => {
    expect(Object.values(messages.creation.envies)).toEqual([
      "Musées",
      "Balades en ville",
      "Nature",
      "Dégustations",
      "Restaurants",
      "Patrimoine et monuments",
      "Marchés",
      "Bars et soirées",
    ]);
  });

  it("« Retour » est réservé au niveau supérieur ; le retour au récit dit où il mène (F8-PO-18)", () => {
    expect(messages.creation.retour).toBe("Retour");
    expect(messages.creation.ecran2.verification.revenirRecit).toBe("Revenir à mon récit");
  });

  it("compteur au format unique de 0018", () => {
    expect(messages.creation.ecran2.recit.compteur).toBe("{n} sur {max} caractères");
  });
});
