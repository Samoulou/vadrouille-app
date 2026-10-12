// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * F10a (critères C1, C3) : l'écran 15 et sa page n'importent ni src/mocks ni la carte simulée, n'écrivent dans
 * aucun stockage client et passent par `fr.json` pour tout texte visible. Configuration ESLint réelle.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const FILES = ["src/features/voyage/TodayScreen.tsx", "src/app/voyages/[id]/aujourdhui/page.tsx"];
const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];

describe("écran Aujourd'hui : règles ESLint (F10a)", () => {
  it.each(FILES)("refuse src/mocks dans %s", async (filePath) => {
    const code = `import { edimbourg } from "@/mocks/edimbourg";\nexport const e = edimbourg;\n`;
    expect(await messagesFor(code, filePath, IMPORTS)).toHaveLength(1);
  });

  it.each(FILES)("refuse la carte simulée dans %s", async (filePath) => {
    const code = `import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";\nexport const s = SimulatedMapRenderer;\n`;
    expect(await messagesFor(code, filePath, IMPORTS)).toHaveLength(1);
  });

  it.each(FILES)("refuse localStorage, sessionStorage, indexedDB, caches et document.cookie dans %s", async (filePath) => {
    for (const statement of [
      `localStorage.setItem("jour", "2");`,
      `sessionStorage.getItem("jour");`,
      `indexedDB.open("jour");`,
      `caches.open("jour");`,
      `document.cookie = "jour=2";`,
    ]) {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, [
        "no-restricted-globals",
        "no-restricted-properties",
      ]);
      expect(messages, statement).toHaveLength(1);
    }
  });

  it.each(FILES)("refuse un texte en dur dans le JSX de %s", async (filePath) => {
    const code = `export function E() {\n  return <p>Prochaine étape</p>;\n}\n`;
    expect(await messagesFor(code, filePath, ["react/jsx-no-literals"])).toHaveLength(1);
  });
});
