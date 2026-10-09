// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Critères F5 (décision 0015 § 1) : ni src/mocks ni la carte simulée dans les routes du voyage et les
 * écrans ; aucun stockage client ; `react/jsx-no-literals` sur les nouveaux fichiers. Configuration réelle.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const IMPORTS = ["no-restricted-imports"];
const simulatedImport = `import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";\nexport const s = SimulatedMapRenderer;\n`;
const modelImport = `import { fitCamera } from "../../components/carte/simulated-model";\nexport const f = fitCamera;\n`;
const mocksImport = `import { edimbourg } from "@/mocks/edimbourg";\nexport const e = edimbourg;\n`;

describe("règle ESLint : carte simulée et src/mocks hors des routes du voyage (décision 0015 § 1)", () => {
  it.each([
    ["src/features/sejour/TripShell.tsx", simulatedImport],
    ["src/features/sejour/Exemple.ts", modelImport],
    ["src/app/voyages/[id]/(programme)/layout.tsx", simulatedImport],
    ["src/features/presentation/Exemple.tsx", simulatedImport],
  ])("refuse la carte simulée dans %s", async (filePath, code) => {
    const messages = await messagesFor(code, filePath, IMPORTS);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });

  it("les deux interdictions tiennent sur un même fichier de src/features/sejour", async () => {
    const messages = await messagesFor(`${simulatedImport}${mocksImport}`, "src/features/sejour/Exemple.tsx", IMPORTS);
    expect(messages).toHaveLength(2);
  });

  it.each([
    ["src/app/dev/voyages/SimulatedCarte.tsx", simulatedImport],
    ["src/app/dev/carte/CarteDemo.tsx", simulatedImport],
    ["src/features/sejour/TripShell.test.tsx", simulatedImport],
    ["tests/e2e/exemple.spec.ts", simulatedImport],
  ])("accepte la carte simulée dans %s", async (filePath, code) => {
    expect(await messagesFor(code, filePath, IMPORTS)).toHaveLength(0);
  });
});

describe("règle ESLint : aucune persistance côté client dans le programme (F5-PO-16)", () => {
  const STORAGE_RULES = ["no-restricted-globals", "no-restricted-properties"];
  it.each([
    "src/features/sejour/TripShell.tsx",
    "src/app/dev/voyages/SimulatedCarte.tsx",
    "src/app/voyages/[id]/(programme)/page.tsx",
    "src/components/ligne/Sheet.tsx",
    "src/components/ligne/ReasonBlock.tsx",
  ])("refuse localStorage, sessionStorage, indexedDB, caches et document.cookie dans %s", async (filePath) => {
    for (const statement of [
      `localStorage.setItem("panneau", "0.92");`,
      `sessionStorage.getItem("panneau");`,
      `indexedDB.open("panneau");`,
      `caches.open("panneau");`,
      `document.cookie = "panneau=1";`,
    ]) {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, STORAGE_RULES);
      expect(messages, statement).toHaveLength(1);
    }
  });
});

describe("règle react/jsx-no-literals sur les fichiers de F5", () => {
  it.each([
    "src/features/sejour/JourneePanel.tsx",
    "src/app/dev/voyages/[id]/layout.tsx",
    "src/app/voyages/[id]/(programme)/page.tsx",
    "src/components/ligne/Sheet.tsx",
  ])("refuse un texte en dur dans %s", async (filePath) => {
    const messages = await messagesFor(`export function E() {\n  return <span>Surprends-moi</span>;\n}\n`, filePath, [
      "react/jsx-no-literals",
    ]);
    expect(messages).toHaveLength(1);
  });
});
