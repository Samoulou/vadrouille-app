// @vitest-environment node
import { describe, expect, it } from "vitest";

import { contientUrl, texteMaison } from "./texte";

/**
 * Règle de texte maison du contrat (décision 0094 § 7, revue de #631) : `src/contracts/texte.ts` en est l'unique
 * définition ; `src/ai/candidat.ts` et `src/prototype/candidat.ts` la réexportent (ticket 633, test d'identité dans
 * `tests/unit/p0/copies.test.ts`). La table qui comparait les anciennes copies est reprise ici (« table commune »).
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

  // Table commune des anciennes copies (`tests/unit/p0/copies.test.ts` jusqu'au ticket 633), mêmes verdicts :
  // [texte, longueur maximale, contientUrl, admis par texteMaison].
  const COMMUNE: [string, number, boolean, boolean][] = [
    ["Musée maison", 80, false, true],
    ["", 80, false, false],
    ["   ", 80, false, false],
    ["x".repeat(80), 80, false, true],
    ["x".repeat(81), 80, false, false],
    ["ligne\u0007son", 80, false, false],
    ["un <b>lieu</b>", 80, false, false],
    ["voir https://exemple.org", 300, true, false],
    ["voir www.exemple", 300, true, false],
    ["voir exemple.com", 300, true, false],
    ["mailto:a", 300, true, false],
    ["javascript:alert(1)", 300, true, false],
    ["texte\u200bcaché", 300, false, false],
    ["droite\u202egauche", 300, false, false],
    ["Café du Lac, 12 €", 300, false, true],
    ["東京の美術館", 300, false, true],
  ];
  it.each(COMMUNE)("table commune : %j (max %d)", (texte, max, url, admis) => {
    expect(contientUrl(texte)).toBe(url);
    expect(texteMaison(max).safeParse(texte).success).toBe(admis);
  });

  it("linéaire : un long texte sans domaine se contrôle vite", () => {
    const debut = performance.now();
    for (const motif of ["a", "a-", "a.", "a․"]) contientUrl(motif.repeat(50_000));
    expect(performance.now() - debut).toBeLessThan(1000);
  });
});
