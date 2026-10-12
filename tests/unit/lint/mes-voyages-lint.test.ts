// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Décision 0021 § 10 (F11a) : `react/jsx-no-literals`, `noClientStorage` et les imports interdits (src/mocks,
 * carte Google, carte simulée, `zod`, valeur de @/contracts) sur « Mes voyages » (`src/features/compte`) et sa
 * page (`src/app/voyages/page.tsx`). Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const FILES = ["src/features/compte/TripsScreen.tsx", "src/features/compte/Exemple.tsx", "src/app/voyages/page.tsx"];

const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];

const imports = {
  mocks: `import { avis } from "@/mocks/avis";\nexport const a = avis;\n`,
  carte: `import { TripMap } from "@/components/carte";\nexport const c = TripMap;\n`,
  carteModule: `import { DayMap } from "@/components/carte/DayMap";\nexport const d = DayMap;\n`,
  simulee: `import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";\nexport const s = SimulatedMapRenderer;\n`,
  zod: `import { z } from "zod";\nexport const s = z.string();\n`,
  contracts: `import { TripSummarySchema } from "@/contracts";\nexport const s = TripSummarySchema;\n`,
  contractsModule: `import { TripSummarySchema } from "@/contracts/trip-summary";\nexport const s = TripSummarySchema;\n`,
  server: `import { OFFER_CONFIG } from "@/server/config/offer";\nexport const o = OFFER_CONFIG;\n`,
};

describe("règle react/jsx-no-literals sur « Mes voyages »", () => {
  it.each(FILES)("refuse un texte en dur dans %s", async (filePath) => {
    const messages = await messagesFor(`export function E() {\n  return <h1>Mes voyages</h1>;\n}\n`, filePath, ["react/jsx-no-literals"]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });
});

describe("règle noClientStorage sur « Mes voyages »", () => {
  const STORAGE_RULES = ["no-restricted-globals", "no-restricted-properties"];
  it.each(FILES)("refuse localStorage, sessionStorage, indexedDB, caches et document.cookie dans %s", async (filePath) => {
    for (const statement of [
      `localStorage.setItem("onglet", "1");`,
      `sessionStorage.getItem("onglet");`,
      `indexedDB.open("onglet");`,
      `caches.open("onglet");`,
      `document.cookie = "onglet=1";`,
    ]) {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, STORAGE_RULES);
      expect(messages, statement).toHaveLength(1);
    }
  });
});

describe("imports interdits dans « Mes voyages »", () => {
  it.each(FILES)("refuse src/mocks, la carte, la carte simulée, zod, une valeur de @/contracts et src/server dans %s", async (filePath) => {
    for (const [name, code] of Object.entries(imports)) {
      const messages = await messagesFor(code, filePath, IMPORTS);
      expect(messages.length, name).toBeGreaterThanOrEqual(1);
      expect(messages.every((m) => m.severity === 2), name).toBe(true);
    }
  });

  it.each(FILES)("accepte @/contracts/values, un import de type de @/contracts et zod/mini dans %s", async (filePath) => {
    const code = [
      `import { countToReserve } from "@/contracts/values";`,
      `import type { TripSummary } from "@/contracts";`,
      `import * as z from "zod/mini";`,
      `export const c = countToReserve;`,
      `export type T = TripSummary;`,
      `export const m = z.string();`,
      "",
    ].join("\n");
    expect(await messagesFor(code, filePath, IMPORTS)).toHaveLength(0);
  });

  it("la page lit les adaptateurs ; les règles précédentes tiennent ailleurs (la carte reste permise dans le programme)", async () => {
    expect(await messagesFor(`import { getTripReader } from "@/adapters";\nexport const r = getTripReader;\n`, "src/app/voyages/page.tsx", IMPORTS)).toHaveLength(0);
    expect(await messagesFor(imports.carte, "src/features/sejour/Exemple.tsx", IMPORTS)).toHaveLength(0);
    expect(await messagesFor(imports.mocks, "src/features/sejour/Exemple.tsx", IMPORTS)).toHaveLength(1);
  });
});
