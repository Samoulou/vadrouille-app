// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Décision 0021 § 10 (F11c) : `react/jsx-no-literals`, `noClientStorage` et les imports interdits (src/mocks,
 * carte simulée, carte Google, `zod`, valeur de @/contracts) sur les pages d'erreur, le rendu partagé et le
 * catalogue des états. Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const FILES = [
  "src/app/not-found.tsx",
  "src/app/error.tsx",
  "src/app/global-error.tsx",
  "src/app/dev/etats/page.tsx",
  "src/app/dev/etats/erreur/page.tsx",
  "src/dev/EtatsShowcase.tsx",
  "src/features/etats/ErrorContent.tsx",
];

const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];

const imports = {
  mocks: `import { avis } from "@/mocks/avis";\nexport const a = avis;\n`,
  carte: `import { TripMap } from "@/components/carte";\nexport const c = TripMap;\n`,
  carteModule: `import { route } from "@/components/carte/route";\nexport const r = route;\n`,
  simulee: `import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";\nexport const s = SimulatedMapRenderer;\n`,
  zod: `import { z } from "zod";\nexport const s = z.string();\n`,
  contracts: `import { TripSchema } from "@/contracts";\nexport const s = TripSchema;\n`,
};

describe("règle react/jsx-no-literals sur les fichiers de F11c", () => {
  it.each(FILES)("refuse un texte en dur dans %s", async (filePath) => {
    const messages = await messagesFor(`export function E() {\n  return <h1>Page introuvable</h1>;\n}\n`, filePath, [
      "react/jsx-no-literals",
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });
});

describe("règle noClientStorage sur les fichiers de F11c", () => {
  const STORAGE_RULES = ["no-restricted-globals", "no-restricted-properties"];
  it.each(FILES)("refuse localStorage, sessionStorage, indexedDB, caches et document.cookie dans %s", async (filePath) => {
    for (const statement of [
      `localStorage.setItem("erreur", "1");`,
      `sessionStorage.getItem("erreur");`,
      `indexedDB.open("erreur");`,
      `caches.open("erreur");`,
      `document.cookie = "erreur=1";`,
    ]) {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, STORAGE_RULES);
      expect(messages, statement).toHaveLength(1);
    }
  });
});

describe("imports interdits dans les fichiers de F11c", () => {
  it.each(FILES)("refuse src/mocks, la carte Google, la carte simulée, zod et une valeur de @/contracts dans %s", async (filePath) => {
    for (const [name, code] of Object.entries(imports)) {
      const messages = await messagesFor(code, filePath, IMPORTS);
      // La carte simulée tombe sous deux motifs (carte simulée de 0015 § 1 et carte de 0021 § 10).
      expect(messages.length, name).toBeGreaterThanOrEqual(1);
      expect(messages.every((m) => m.severity === 2), name).toBe(true);
    }
  });

  it("les interdictions tiennent ensemble sur un même fichier : chaque import est refusé", async () => {
    const code = Object.values(imports).join("");
    const lines = new Set((await messagesFor(code, "src/app/not-found.tsx", IMPORTS)).map((m) => m.line));
    expect(lines).toEqual(new Set([1, 3, 5, 7, 9, 11]));
  });

  it.each(FILES)("accepte @/contracts/values, un import de type de @/contracts et zod/mini dans %s", async (filePath) => {
    const code = [
      `import { CATEGORIES } from "@/contracts/values";`,
      `import type { Trip } from "@/contracts";`,
      `import * as z from "zod/mini";`,
      `export const c = CATEGORIES;`,
      `export type T = Trip;`,
      `export const m = z.string();`,
      "",
    ].join("\n");
    expect(await messagesFor(code, filePath, IMPORTS)).toHaveLength(0);
  });

  it("les règles précédentes ne changent pas ailleurs : la carte reste permise dans le programme", async () => {
    expect(await messagesFor(imports.carte, "src/features/sejour/Exemple.tsx", IMPORTS)).toHaveLength(0);
    expect(await messagesFor(imports.simulee, "src/features/sejour/Exemple.tsx", IMPORTS)).toHaveLength(1);
    expect(await messagesFor(imports.mocks, "src/features/sejour/Exemple.tsx", IMPORTS)).toHaveLength(1);
  });
});
