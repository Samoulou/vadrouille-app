// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Critères F6 : `pnpm lint` échoue si la présentation utilise un stockage client (localStorage,
 * sessionStorage, indexedDB, caches, document.cookie), et `react/jsx-no-literals` est actif sur ses
 * nouveaux fichiers. Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const STORAGE_RULES = ["no-restricted-globals", "no-restricted-properties"];

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const STORAGE_FILES = [
  "src/features/presentation/Exemple.tsx",
  "src/features/presentation/deck.ts",
  "src/app/voyages/[id]/presentation/page.tsx",
  "src/analytics/track.ts",
  "src/components/ui/dialog.tsx",
  "src/components/ligne/DeckCard.tsx",
  "src/components/ligne/DeckProgress.tsx",
  "src/components/ligne/UndoToast.tsx",
];
const FORBIDDEN = [
  `localStorage.setItem("paquet", "1");`,
  `sessionStorage.getItem("paquet");`,
  `indexedDB.open("paquet");`,
  `caches.open("paquet");`,
  `window.localStorage.clear();`,
  `globalThis.sessionStorage.clear();`,
  `document.cookie = "paquet=1";`,
];

describe("règle ESLint : aucune persistance côté client dans la présentation", () => {
  for (const filePath of STORAGE_FILES) {
    it.each(FORBIDDEN)(`refuse « %s » dans ${filePath}`, async (statement) => {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, STORAGE_RULES);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.severity).toBe(2);
    });
  }

  it("accepte le code de la présentation sans stockage", async () => {
    expect(await messagesFor(`export const n = () => [1, 2].length;\n`, STORAGE_FILES[0]!, STORAGE_RULES)).toHaveLength(0);
  });
});

describe("règle react/jsx-no-literals sur les fichiers de F6", () => {
  it.each([
    "src/features/presentation/Exemple.tsx",
    "src/app/voyages/[id]/presentation/page.tsx",
    "src/components/ui/dialog.tsx",
    "src/components/ligne/DeckCard.tsx",
  ])("refuse un texte en dur dans %s", async (filePath) => {
    const messages = await messagesFor(`export function E() {\n  return <span>J'aime</span>;\n}\n`, filePath, ["react/jsx-no-literals"]);
    expect(messages).toHaveLength(1);
  });

  it("ne s'applique pas aux tests", async () => {
    const messages = await messagesFor(
      `export function E() {\n  return <span>J'aime</span>;\n}\n`,
      "src/features/presentation/Exemple.test.tsx",
      ["react/jsx-no-literals"],
    );
    expect(messages).toHaveLength(0);
  });
});
