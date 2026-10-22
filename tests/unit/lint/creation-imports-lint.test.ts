// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * `lint: @/server/creation, @/server/generation, la composition de génération et le contexte système, importateurs
 * nommés` (décisions 0081 B9-TL-1 point 3, 0087 § 1.6 et 0101 § 4, conséquences testables), sur la configuration réelle.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const REGLE = "ligne/creation-imports";

async function signalements(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === REGLE) ?? [];
}

const imp = (source: string) => `import { x } from "${source}";\nexport const y = x;\n`;

/** Toutes les formes de chargement d'une source. */
const formes = (source: string) => [
  imp(source),
  `import type { X } from "${source}";\nexport type Y = X;\n`,
  `export { x } from "${source}";\n`,
  `export * from "${source}";\n`,
  `export const y = () => import("${source}");\n`,
  `export type Y = typeof import("${source}");\n`,
];

const COMPOSITION = "@/server/composition/generation";
const CREATION = "@/server/creation";
const GENERATION = "@/server/generation/etapes";
const REPRISE = "@/server/generation/reprise";
const SYSTEME = "@/server/with-system-org";

describe("lint: importateurs nommés de la création et de la génération (0101 § 4)", () => {
  it.each([
    // composition de génération
    ["src/workflows/apercu.ts", COMPOSITION],
    ["src/server/payment/suite.ts", COMPOSITION],
    ["src/server/actions/creation.ts", COMPOSITION],
    ["src/adapters/api-creation.ts", COMPOSITION],
    ["src/server/composition/lecture.ts", COMPOSITION],
    ["scripts/reprise-studio.ts", COMPOSITION],
    // @/server/generation/*
    ["src/server/actions/creation.ts", GENERATION],
    ["src/adapters/api-creation.ts", GENERATION],
    ["src/adapters/index.ts", GENERATION],
    ["src/workflows/complet.ts", GENERATION],
    ["src/workflows/p0-run.ts", GENERATION],
    ["src/server/voyages/lecture.ts", GENERATION],
    // B10b : seul `tri.ts` de src/server/presentation est nommé (0119 § 1.3 point 2) ; ses voisins restent refusés.
    ["src/server/presentation/etat.ts", GENERATION],
    ["src/server/presentation/tri-autre.ts", GENERATION],
    ["src/server/presentation/tri.ts/x.ts", GENERATION],
    ["src/workflows/recalcul-autre.ts", GENERATION],
    // `tri.ts` : les seuls modules lot, expiration et demarrage (revue de la PR 667, mineurs 3 et 4).
    ["src/server/presentation/tri.ts", GENERATION],
    ["src/server/presentation/tri.ts", REPRISE],
    ["src/server/presentation/tri.ts", "@/server/generation/etapes-lot"],
    ["src/server/presentation/tri.ts", "@/server/generation/lot-autre"],
    ["src/server/presentation/tri.ts", CREATION],
    ["src/server/presentation/tri.ts", `${CREATION}/commun`],
    ["src/server/presentation/tri.ts", COMPOSITION],
    ["src/features/creation/exemple.ts", GENERATION],
    ["scripts/reprise-studio.ts", GENERATION],
    ["scripts/autre.ts", REPRISE],
    ["src/adapters/api-creation.ts", REPRISE],
    // @/server/creation/*
    ["src/adapters/api.ts", CREATION],
    ["src/adapters/index.ts", CREATION],
    ["src/adapters/mock-creation.ts", `${CREATION}/brouillon`],
    ["src/server/actions/compte.ts", CREATION],
    ["src/server/generation/exemple.ts", `${CREATION}/commun`],
    ["src/server/payment/suite.ts", CREATION],
    ["src/workflows/apercu.ts", CREATION],
    ["src/features/creation/exemple.ts", CREATION],
    ["scripts/reprise-studio.ts", CREATION],
    ["src/adapters/exemple.ts", "../server/creation/commun"],
    // contexte système
    ["src/server/creation/exemple.ts", SYSTEME],
    ["src/server/actions/creation.ts", SYSTEME],
    ["src/workflows/voyage-complet.ts", SYSTEME],
    ["src/workflows/recalcul.ts", SYSTEME],
    ["src/server/presentation/tri.ts", SYSTEME],
    ["scripts/autre.ts", SYSTEME],
  ])("%s : chargement de %s signalé sous toutes ses formes", async (fichier, source) => {
    for (const code of formes(source)) expect(await signalements(code, fichier), code).not.toHaveLength(0);
  });

  it.each([
    // composition de génération
    ["src/server/creation/exemple.ts", COMPOSITION],
    ["src/server/generation/etapes.ts", "../composition/generation"],
    ["src/server/composition/generation.test.ts", "./generation"],
    // @/server/generation/*
    ["src/workflows/apercu.ts", GENERATION],
    ["src/workflows/voyage-complet.ts", GENERATION],
    // B10b : pont du workflow 5 (0119 § 1.8, 0120 S9 point 2) et `completeDeck` (0119 § 1.3 point 2 ; 0120 S9 point 3).
    ["src/workflows/recalcul.ts", GENERATION],
    ["src/workflows/recalcul.ts", "@/server/generation/etapes-lot"],
    ["src/server/presentation/tri.ts", "@/server/generation/lot"],
    ["src/server/presentation/tri.ts", "@/server/generation/expiration"],
    ["src/server/presentation/tri.ts", "@/server/generation/demarrage"],
    ["src/workflows/index.ts", GENERATION],
    ["src/server/creation/nouvel-essai.ts", "@/server/generation/raison-echec"],
    ["src/server/generation/exemple.ts", "./raison-echec"],
    ["src/server/payment/suite.ts", GENERATION],
    ["scripts/reprise-studio.ts", REPRISE],
    ["scripts/reprise-studio.ts", "../src/server/generation/reprise"],
    ["src/server/creation/nouvel-essai.ts", REPRISE],
    // @/server/creation/*
    ["src/server/actions/creation.ts", CREATION],
    ["src/server/actions/creation.ts", `${CREATION}/brouillon`],
    ["src/adapters/api-creation.ts", CREATION],
    ["src/server/creation/index.ts", "./commun"],
    ["src/server/creation/nouvel-essai.ts", "@/server/creation/commun"],
    // contexte système
    ["src/server/payment/suite.ts", SYSTEME],
    ["src/server/generation/reconciliation.ts", SYSTEME],
    ["scripts/reprise-studio.ts", SYSTEME],
    // tests : admis partout
    ["src/server/creation/commun.test.ts", COMPOSITION],
    ["src/server/actions/creation-lancement.test.ts", GENERATION],
    ["tests/db/creation.test.ts", `${CREATION}/brouillon`],
    ["tests/unit/db/migration-creation.test.ts", "@/server/generation/raison-echec"],
    ["tests/db/autre.test.ts", SYSTEME],
    // sources voisines non visées
    ["src/features/creation/exemple.ts", "@/server/creationx"],
    ["src/features/creation/exemple.ts", "@/server/generations/x"],
    ["src/server/relecture/relectures.ts", "@/server/config/generation"],
    ["src/features/voyage/exemple.ts", "@/server/actions/creation"],
  ])("%s : chargement de %s admis", async (fichier, source) => {
    for (const code of formes(source)) expect(await signalements(code, fichier), code).toEqual([]);
  });

  it("src/adapters/api-creation.ts est la seule dérogation de src/adapters (0101 § 1)", async () => {
    expect(await signalements(imp(CREATION), "src/adapters/api-creation.ts")).toEqual([]);
    expect(await signalements(imp(CREATION), "src/adapters/api.ts")).not.toHaveLength(0);
    expect(await signalements(imp(CREATION), "src/adapters/mock-creation.ts")).not.toHaveLength(0);
  });

  it("le module feuille de reprise est le seul de src/server/generation que la commande du studio charge (0087 § 1.6)", async () => {
    expect(await signalements(imp(REPRISE), "scripts/reprise-studio.ts")).toEqual([]);
    expect(await signalements(imp("@/server/generation/codes"), "scripts/reprise-studio.ts")).not.toHaveLength(0);
    expect(await signalements(imp("@/server/generation/reprise-etendue"), "scripts/reprise-studio.ts")).not.toHaveLength(0);
  });
});
