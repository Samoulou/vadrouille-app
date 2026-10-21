// @vitest-environment node
import { describe, expect, it } from "vitest";

import { contientUrl, texteMaison } from "./texte";

/**
 * Règle de texte maison du contrat (décision 0094 § 7, revue de #631) : table propre à `src/contracts/texte.ts`, plus
 * stricte que les copies de `src/ai/candidat.ts` et `src/prototype/candidat.ts` jusqu'à leur remplacement par des
 * réexportations (la table commune reste dans `tests/unit/p0/copies.test.ts`).
 */

const MAX = 160;

/** Refusés : formes de `REFUSES` de `infos-pratiques.test.ts`, un cas par extension ajoutée, séparateurs, homoglyphes. */
const REFUSES: [string, string][] = [
  ["vide", ""],
  ["espaces seulement", "   "],
  ["balise", "<b>x</b>"],
  ["www", "www.exemple.ch"],
  ["adresse https", "voir https://exemple.org"],
  ["domaine .com", "exemple.com"],
  ["caractère de contrôle", "ligne\u0007son"],
  ["invisible", "texte​caché"],
  ["direction", "droite‮gauche"],
  ["saut de ligne", "un\ndeux"],
  ["domaine .it", "Réserve sur colosseo.it"],
  ["domaine .va", "Billets sur museivaticani.va"],
  ["domaine .es", "Voir sagradafamilia.es"],
  ["domaine .pt", "Horaires sur museu.pt"],
  ["domaine .nl", "Réserve sur rijksmuseum.nl"],
  ["domaine en capitales", "COLOSSEO.IT"],
  ["séparateur de ligne U+2028", "un deux"],
  ["séparateur de paragraphe U+2029", "un deux"],
  ["point de conduite U+2024", "colosseo․it"],
  ["petit point U+FE52", "exemple﹒com"],
  ["point pleine chasse U+FF0E", "exemple．ch"],
  ["point idéographique U+3002", "exemple。org"],
  ["www et point homoglyphe", "www․exemple"],
  ["trop long", "x".repeat(MAX + 1)],
];

/** Admis : nombres décimaux, abréviations, ponctuation courante, Unicode imprimable. */
const ADMIS = [
  "12.50",
  "Environ 12.50 EUR par personne",
  "9.30",
  "Ouvert de 9.30 à 18.00",
  "Dr. Martin",
  "Fermé le lundi. Il est conseillé de réserver.",
  "Café du Lac, 12 €",
  "東京の美術館",
  "x".repeat(MAX),
];

describe("contrats: texte maison (src/contracts/texte.ts)", () => {
  it.each(REFUSES)("refuse : %s", (_nom, valeur) => {
    expect(texteMaison(MAX).safeParse(valeur).success).toBe(false);
  });

  it.each(ADMIS)("admet %j", (valeur) => {
    expect(texteMaison(MAX).safeParse(valeur).success).toBe(true);
    expect(contientUrl(valeur)).toBe(false);
  });

  it.each(["it", "va", "es", "pt", "nl"])("contientUrl : un domaine en .%s", (extension) => {
    expect(contientUrl(`site.${extension}`)).toBe(true);
    expect(contientUrl(`site.${extension}/page`)).toBe(true);
  });

  it("espaces de début et de fin retirés avant de mesurer ; la valeur lue est coupée", () => {
    expect(texteMaison(MAX).parse("  Arrive tôt  ")).toBe("Arrive tôt");
    expect(texteMaison(5).safeParse("  abcde  ").success).toBe(true);
  });

  it("linéaire : un long texte sans domaine se contrôle vite", () => {
    const debut = performance.now();
    for (const motif of ["a", "a-", "a.", "a․"]) contientUrl(motif.repeat(50_000));
    expect(performance.now() - debut).toBeLessThan(1000);
  });
});
