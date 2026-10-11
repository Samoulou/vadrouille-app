// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * T4, décision 0016 § 3.1 règle 4 (Q95) : dans le code chargé par le navigateur (`src/components`,
 * `src/features`, `src/analytics`, `src/lib`, `src/i18n`), ni `zod` ni import de valeur de `@/contracts` ;
 * `zod/mini`, `@/contracts/values` et `import type` de `@/contracts` passent. Les interdictions précédentes
 * (src/mocks, carte simulée, src/server hors actions, portée des simulations) tiennent toujours dans le même
 * bloc (point d'attention de 0015 § 1). Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });

const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];

async function messagesFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && IMPORTS.includes(m.ruleId)) ?? [];
}

const CLIENT_FILES = [
  "src/components/carte/route.ts",
  "src/components/ligne/Exemple.tsx",
  "src/features/presentation/Exemple.tsx",
  "src/features/sejour/Exemple.ts",
  "src/analytics/exemple.ts",
  "src/lib/exemple.ts",
  "src/i18n/exemple.ts",
];

const code = {
  zod: `import { z } from "zod";\nexport const s = z.string();\n`,
  contractsValue: `import { mapPointKey } from "@/contracts";\nexport const k = mapPointKey;\n`,
  contractsMixed: `import { DETOUR_THRESHOLD_MINUTES, type Proposal } from "@/contracts";\nexport const d: Proposal | number = DETOUR_THRESHOLD_MINUTES;\n`,
  contractsModule: `import { CategorySchema } from "@/contracts/category";\nexport const c = CategorySchema;\n`,
  mocks: `import { edimbourg } from "@/mocks/edimbourg";\nexport const e = edimbourg;\n`,
  simulee: `import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";\nexport const s = SimulatedMapRenderer;\n`,
  server: `import { offer } from "@/server/config/offer";\nexport const o = offer;\n`,
  simulation: `import { scope } from "@/adapters/simulation";\nexport const s = scope;\n`,
};

describe("imports du code client (décision 0016 § 3.1 règle 4)", () => {
  it.each(CLIENT_FILES)("@/contracts/values, import type de @/contracts et zod/mini passent dans %s", async (filePath) => {
    const allowed = [
      `import { CATEGORIES, mapPointKey } from "@/contracts/values";`,
      `import type { Trip } from "@/contracts";`,
      `import { type Proposal } from "@/contracts";`,
      `import type { MapPointRef } from "@/contracts/map";`,
      `import * as z from "zod/mini";`,
      `export const c = [CATEGORIES, mapPointKey];`,
      `export type T = Trip | Proposal | MapPointRef;`,
      `export const m = z.string();`,
      "",
    ].join("\n");
    expect(await messagesFor(allowed, filePath)).toHaveLength(0);
  });

  for (const filePath of CLIENT_FILES) {
    it.each(Object.keys(code) as (keyof typeof code)[])(`%s refusé dans ${filePath}, signalé une seule fois`, async (name) => {
      const messages = await messagesFor(code[name], filePath);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.severity).toBe(2);
    });
  }

  it("les fichiers de test et le code serveur gardent le droit d'importer zod et les schémas", async () => {
    expect(await messagesFor(code.zod, "src/analytics/events.test.ts")).toHaveLength(0);
    expect(await messagesFor(code.contractsValue, "src/components/carte/route.test.ts")).toHaveLength(0);
    expect(await messagesFor(code.zod, "src/server/actions/exemple.ts")).toHaveLength(0);
    expect(await messagesFor(code.contractsModule, "src/adapters/exemple.ts")).toHaveLength(0);
  });

  it("les fichiers réels du correctif respectent la règle", async () => {
    const results = await eslint.lintFiles([
      "src/contracts/values.ts",
      "src/components/carte/route.ts",
      "src/components/ligne/DeckCard.tsx",
      "src/features/presentation/PreferenceSheet.tsx",
      "src/analytics/events.ts",
    ]);
    const messages = results.flatMap((r) => r.messages.filter((m) => m.ruleId !== null && IMPORTS.includes(m.ruleId)));
    expect(messages).toEqual([]);
  });
});
