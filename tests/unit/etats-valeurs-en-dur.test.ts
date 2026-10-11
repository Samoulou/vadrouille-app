// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { messages } from "@/i18n";

/**
 * Critère C4 [c] (spécification F11) : aucune couleur, taille ni valeur en px en dur dans les fichiers de F11c ;
 * textes sous etats.* sans les mots interdits du handover § 10 ni point d'exclamation.
 */
const ROOT = process.cwd();
const FILES = [
  "src/app/not-found.tsx",
  "src/app/error.tsx",
  "src/app/global-error.tsx",
  "src/app/fonts.ts",
  "src/app/dev/etats/page.tsx",
  "src/app/dev/etats/erreur/page.tsx",
  "src/dev/EtatsShowcase.tsx",
  "src/features/etats/EtatPage.tsx",
  "src/features/etats/ErrorContent.tsx",
];

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(?:rgba?|hsla?)\(/i;
const PX = /\d(?:\.\d+)?px\b/;
const ARBITRARY = /\b[a-z-]+-\[[^\]]+\]/;

describe("valeurs en dur dans les fichiers de F11c", () => {
  for (const file of FILES) {
    it(`${file} : ni couleur, ni px, ni valeur arbitraire`, () => {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(HEX);
      expect(source).not.toMatch(COLOR_FN);
      expect(source).not.toMatch(PX);
      expect(source).not.toMatch(ARBITRARY);
    });
  }
});

describe("textes des états transverses (handover § 10)", () => {
  const text = JSON.stringify(messages.etats);

  it.each(["Aperçu", "Supprimer", "OK", "Valider", "Vérifié", "vérifié", "Premium", "!"])("n'emploie pas « %s »", (word) => {
    expect(text).not.toContain(word);
  });

  it("textes de la spécification F11 (écran 18)", () => {
    expect(messages.etats.introuvable.titre).toBe("Page introuvable");
    expect(messages.etats.introuvable.texte).toBe("Cette page n'existe pas ou n'est plus disponible.");
    expect(messages.etats.erreur.titre).toBe("Cette page n'a pas pu s'afficher");
    expect(messages.etats.erreur.texte).toBe("Réessaie dans un instant. Si le problème continue, reviens à l'accueil.");
    expect(messages.etats.erreur.reessayer).toBe("Réessayer");
    expect(messages.etats.accueil).toBe("Retour à l'accueil");
  });
});
