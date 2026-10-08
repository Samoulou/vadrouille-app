// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Critère F1 : un import de `src/mocks` depuis `src/features` ou `src/app`
 * fait échouer `pnpm lint`. On passe par la configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImports(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === "no-restricted-imports") ?? [];
}

const aliasImport = `import { edimbourg } from "@/mocks/edimbourg";\nexport const trip = edimbourg;\n`;

describe("règle ESLint : src/mocks réservé aux adaptateurs et aux tests", () => {
  it.each([
    ["src/features/sejour/Sejour.tsx", aliasImport],
    ["src/app/voyages/page.tsx", aliasImport],
    [
      "src/features/presentation/deck.ts",
      `import { propositions } from "../../mocks/edimbourg";\nexport const p = propositions;\n`,
    ],
    ["src/app/page.tsx", `export * from "@/mocks";\n`],
  ])("refuse l'import depuis %s", async (filePath, code) => {
    const messages = await restrictedImports(code, filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });

  it.each([
    ["src/adapters/mock.ts", aliasImport],
    ["src/adapters/autre.ts", `import { edimbourg } from "../mocks/edimbourg";\nexport const t = edimbourg;\n`],
    ["src/mocks/edimbourg.test.ts", aliasImport],
    ["tests/unit/exemple.test.ts", aliasImport],
  ])("accepte l'import depuis %s", async (filePath, code) => {
    expect(await restrictedImports(code, filePath)).toHaveLength(0);
  });

  it("accepte les adaptateurs depuis les écrans", async () => {
    const code = `import { getTripAdapter } from "@/adapters";\nexport const a = getTripAdapter;\n`;
    expect(await restrictedImports(code, "src/features/sejour/Sejour.tsx")).toHaveLength(0);
  });
});
