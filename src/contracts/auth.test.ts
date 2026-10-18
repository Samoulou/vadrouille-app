import { describe, expect, it } from "vitest";

import { CodeRequestSchema, CodeVerificationSchema } from "./auth";
import { stripEdgeSpaces } from "./values";

/**
 * Décision 0084 : le contrat tolère les espaces U+0020 aux extrémités de l'adresse, et eux seuls, sans transformer la
 * valeur ; l'entrée brute est bornée à 320 caractères. Les tests d'`isEmailShape` (`creation.test.ts`) sont inchangés.
 */
describe("contrat auth : espaces aux extrémités de l'adresse (décision 0084)", () => {
  it.each([" a@exemple.test ", "  A@Exemple.test  ", "a@exemple.test"])("« %s » est accepté et rendu inchangé", (email) => {
    expect(CodeRequestSchema.parse({ email })).toEqual({ email });
    expect(CodeVerificationSchema.parse({ email, code: "123456" })).toEqual({ email, code: "123456" });
  });

  it.each([
    ["tabulation en tête", "\ta@exemple.test"],
    ["retour à la ligne en fin", "a@exemple.test\n"],
    ["U+00A0 en tête", " a@exemple.test"],
    ["espace intérieur", "a @exemple.test"],
    ["espaces seuls", "   "],
    ["chaîne vide", ""],
    ["255 caractères sans espace", `${"a".repeat(242)}@exemple.test`],
    ["entrée brute de 321 caractères", ` ${"a".repeat(30)}@exemple.test${" ".repeat(321 - 44)}`],
  ])("%s : refusé", (_cas, email) => {
    expect(CodeRequestSchema.safeParse({ email }).success).toBe(false);
    expect(CodeVerificationSchema.safeParse({ email, code: "123456" }).success).toBe(false);
  });

  it("une entrée brute de 320 caractères dont l'adresse est valide est acceptée", () => {
    const email = ` ${"a".repeat(30)}@exemple.test${" ".repeat(320 - 44)}`;
    expect(email).toHaveLength(320);
    expect(CodeRequestSchema.safeParse({ email }).success).toBe(true);
  });
});

describe("stripEdgeSpaces (décision 0084)", () => {
  it.each([
    ["", ""],
    ["   ", ""],
    [" a b ", "a b"],
    ["  a  ", "a"],
    ["\ta\t", "\ta\t"],
    [" \ta ", "\ta"],
    [" a ", " a "],
  ])("« %j » → « %j »", (entree, attendu) => {
    expect(stripEdgeSpaces(entree)).toBe(attendu);
  });
});
