// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { IMPORTS_DOMAINE, sourcesDomaine } from "./domaine-cas-communs";

/**
 * `lint: src/domain sans entrée-sortie` (spécification B5a ; décision 0045 § 3, B5-TL-3 ; handover § 3), sur la
 * configuration réelle du projet. La même liste est contrôlée par `tests/unit/p0/imports.test.ts` tant que P0 tourne
 * (cas commun ci-dessous, `src/domain` n'admet plus `@/prototype/*`).
 */
const eslint = new ESLint({ cwd: process.cwd() });
const REGLES = new Set(["no-restricted-imports", "no-restricted-globals", "no-restricted-properties", "no-restricted-syntax"]);

async function signalements(code: string, filePath = "src/domain/exemple.ts") {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && REGLES.has(m.ruleId)) ?? [];
}

describe("lint: src/domain sans entrée-sortie", () => {
  const IMPORTS_REFUSES = [
    'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n',
    'import { moteur } from "@/server/config/moteur";\nexport const x = moteur;\n',
    'import { ancrerCandidats } from "@/grounding/ancrage";\nexport const x = ancrerCandidats;\n',
    'import type { Brief } from "@/prototype/brief";\nexport type X = Brief;\n',
    'export { BriefSchema } from "@/prototype/brief";\n',
    'export * from "@/ai/requetes";\n',
    'import { x } from "../server/config/offer";\nexport const y = x;\n',
    'import { it } from "vitest";\nexport const y = it;\n',
  ];
  it.each(IMPORTS_REFUSES)("import refusé : %s", async (code) => {
    expect(await signalements(code)).not.toHaveLength(0);
  });

  const CONSTRUCTIONS_REFUSEES = [
    "export const x = process.env.X;\n",
    "export const x = process.argv;\n",
    'export const x = () => fetch("https://exemple.example");\n',
    "export const x = Date.now();\n",
    "export const x = new Date();\n",
    "export const x = Date();\n",
    "export const x = Math.random();\n",
    "export const x = crypto.randomUUID();\n",
    "export const x = performance.now();\n",
    "export const x = globalThis.fetch;\n",
    'export const x = () => import("node:fs");\n',
    'export const x = require("node:fs");\n',
    'export const x = eval("1");\n',
    'export const x = Function("return 1");\n',
  ];
  it.each(CONSTRUCTIONS_REFUSEES)("construction refusée : %s", async (code) => {
    expect(await signalements(code)).not.toHaveLength(0);
  });

  it("un fichier qui n'importe que @/contracts, zod et @/domain/* passe, ainsi que new Date(argument), Date.parse et Date.UTC", async () => {
    const code = [
      'import { z } from "zod";',
      'import { TripSnapshotSchema } from "@/contracts";',
      'import { requireWeekday } from "@/contracts/values";',
      'import type { CandidatMoteur } from "@/domain/entrees";',
      'import { lire } from "./tables";',
      'export { versHeure } from "@/domain/temps";',
      'export const a = new Date("2026-10-13");',
      'export const b = Date.parse("2026-10-13T00:00:00Z") + Date.UTC(2026, 9, 13);',
      "export const c = [z, TripSnapshotSchema, requireWeekday, lire];",
      "export type D = CandidatMoteur;",
      "",
    ].join("\n");
    expect(await signalements(code)).toEqual([]);
  });

  it("un *.test.ts de src/domain peut importer vitest, mais rien d'autre hors de la liste", async () => {
    expect(await signalements('import { expect, it } from "vitest";\nit("x", () => expect(1).toBe(1));\n', "src/domain/exemple.test.ts")).toEqual([]);
    expect(await signalements('import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n', "src/domain/exemple.test.ts")).not.toHaveLength(0);
    expect(await signalements("export const x = Date.now();\n", "src/domain/exemple.test.ts")).not.toHaveLength(0);
  });

  it("cas communs avec la ligne src/domain de tests/unit/p0/imports.test.ts (décision 0045 § 3.2)", async () => {
    for (const { specificateur, admis } of IMPORTS_DOMAINE) {
      for (const source of sourcesDomaine(specificateur)) {
        const messages = await signalements(source);
        expect(messages.length === 0, `${specificateur} : ${source}`).toBe(admis);
      }
    }
  });

  it("hors de src/domain, la règle ne s'applique pas", async () => {
    expect(await signalements('import type { Brief } from "@/prototype/brief";\nexport type X = Brief;\n', "scripts/p0/exemple.ts")).toEqual([]);
  });
});
