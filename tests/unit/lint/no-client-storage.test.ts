// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Critère F4 : `pnpm lint` échoue si la carte ou sa démonstration utilisent un stockage client
 * (localStorage, sessionStorage, indexedDB, caches, document.cookie). Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const RULES = ["no-restricted-globals", "no-restricted-properties"];

async function storageErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && RULES.includes(m.ruleId)) ?? [];
}

const FILES = ["src/components/carte/Exemple.tsx", "src/app/dev/carte/Exemple.tsx"];
const FORBIDDEN = [
  `localStorage.setItem("a", "b");`,
  `sessionStorage.getItem("a");`,
  `indexedDB.open("carte");`,
  `caches.open("tuiles");`,
  `window.localStorage.clear();`,
  `globalThis.sessionStorage.clear();`,
  `document.cookie = "a=b";`,
  `navigator.serviceWorker.register("/sw.js");`,
];

describe("règle ESLint : aucune persistance côté client dans la carte", () => {
  for (const filePath of FILES) {
    it.each(FORBIDDEN)(`refuse « %s » dans ${filePath}`, async (statement) => {
      const messages = await storageErrors(`export function f() {\n  ${statement}\n}\n`, filePath);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.severity).toBe(2);
    });
  }

  it("ne vise pas les autres dossiers", async () => {
    expect(await storageErrors(`export function f() {\n  localStorage.clear();\n}\n`, "src/features/compte/Exemple.tsx")).toHaveLength(0);
  });

  it("accepte le code de la carte sans stockage", async () => {
    expect(await storageErrors(`export const online = () => navigator.onLine;\n`, FILES[0]!)).toHaveLength(0);
  });
});
