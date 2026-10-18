// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * `lint: @/server/voyages importé hors de src/server par src/adapters/api.ts seul` (spécification B6, B6a point 9,
 * B6-TL-1 ; décision 0086 § 1.1 point 2) et `lint: double de relectures, type seulement` (0086 § 1.2 point 4,
 * conséquences testables), sur la configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const REGLE = "ligne/voyages-imports";

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

describe("lint: @/server/voyages hors de src/server par src/adapters/api.ts seul", () => {
  it.each([
    ["src/features/voyage/exemple.ts", "@/server/voyages/lecture"],
    ["src/components/exemple.tsx", "@/server/voyages/lecture"],
    ["src/app/(app)/voyage/page.tsx", "@/server/voyages/lecture"],
    ["src/lib/exemple.ts", "@/server/voyages/erreurs"],
    ["src/analytics/exemple.ts", "@/server/voyages/lecture"],
    ["src/i18n/exemple.ts", "@/server/voyages/lecture"],
    ["src/domain/exemple.ts", "@/server/voyages/lecture"],
    ["src/mocks/relectures-voyages.ts", "@/server/voyages/lecture"],
    ["src/mocks/exemple.ts", "@/server/voyages/erreurs"],
    ["src/adapters/index.ts", "@/server/voyages/lecture"],
    ["src/adapters/mock.ts", "@/server/voyages/lecture"],
    ["src/adapters/exemple.ts", "./../server/voyages/lecture"],
    ["tests/support/trip-adapter-contrat.ts", "@/server/voyages/lecture"],
    ["tests/support/voyages-en-base.ts", "@/server/voyages/conversion"],
    ["tests/unit/adapters/exemple.test.ts", "@/server/voyages/lecture"],
    ["src/features/voyage/exemple.test.ts", "@/server/voyages/lecture"],
  ])("%s : chargement de %s signalé sous toutes ses formes", async (fichier, source) => {
    for (const code of formes(source)) expect(await signalements(code, fichier), code).not.toHaveLength(0);
  });

  it.each([
    ["src/adapters/api.ts", "@/server/voyages/lecture"],
    ["src/adapters/api.ts", "../server/voyages/lecture"],
    ["src/server/voyages/lecture.ts", "./conversion"],
    ["src/server/voyages/lecture.test.ts", "./lecture"],
    ["src/server/voyages/conversion.test.ts", "@/server/voyages/conversion"],
    ["src/server/actions/exemple.ts", "@/server/voyages/lecture"],
    ["tests/db/adaptateur-api.test.ts", "@/server/voyages/lecture"],
    ["tests/db/autre.test.ts", "@/server/voyages/erreurs"],
    ["src/features/voyage/exemple.ts", "@/server/voyageurs"],
  ])("%s : chargement de %s admis", async (fichier, source) => {
    for (const code of formes(source)) expect(await signalements(code, fichier), code).toEqual([]);
  });
});

describe("lint: double de relectures, type seulement", () => {
  const DOUBLE = "src/mocks/relectures-voyages.ts";

  it("import type de @/domain/relectures admis dans le double", async () => {
    for (const code of [
      `import type { Relectures } from "@/domain/relectures";\nexport type R = Relectures;\n`,
      `import { type Relectures, type Point } from "@/domain/relectures";\nexport type R = [Relectures, Point];\n`,
      `export type R = import("@/domain/relectures").Relectures;\n`,
    ]) {
      expect(await signalements(code, DOUBLE), code).toEqual([]);
    }
  });

  it("import de valeur de @/domain/relectures refusé dans le double", async () => {
    for (const code of [
      imp("@/domain/relectures"),
      `import { INCONNU, type Relectures } from "@/domain/relectures";\nexport const y: [typeof INCONNU, Relectures?] = [INCONNU];\n`,
      `import * as relectures from "@/domain/relectures";\nexport const y = relectures;\n`,
      `import "@/domain/relectures";\n`,
      `export { INCONNU } from "@/domain/relectures";\n`,
      `export type { Relectures } from "@/domain/relectures";\n`,
      `export const y = () => import("@/domain/relectures");\n`,
    ]) {
      expect(await signalements(code, DOUBLE), code).not.toHaveLength(0);
    }
  });

  it.each([
    [DOUBLE, "@/domain/calculs"],
    [DOUBLE, "../domain/propositions"],
    ["src/mocks/edimbourg.ts", "@/domain/relectures"],
    ["src/mocks/exemple.ts", "@/domain/relectures"],
    ["src/mocks/exemple.test.ts", "@/domain/calculs"],
  ])("%s : @/domain (%s) refusé, même en import type", async (fichier, source) => {
    for (const code of [imp(source), `import type { X } from "${source}";\nexport type Y = X;\n`]) {
      expect(await signalements(code, fichier), code).not.toHaveLength(0);
    }
  });

  it("le double réel passe la règle", async () => {
    const { readFile } = await import("node:fs/promises");
    const code = await readFile(DOUBLE, "utf8");
    expect(await signalements(code, DOUBLE)).toEqual([]);
  });
});
