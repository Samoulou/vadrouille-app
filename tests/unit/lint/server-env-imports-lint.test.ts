// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Règle `ligne/server-env-imports` (P0r1, `p0: modules d'environnement étroits`, partie lint ; décision 0031 § 6) :
 * les modules de `src/server/env/` ne sont importés que depuis les dossiers permis. Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const RULE = "ligne/server-env-imports";

async function messagesFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === RULE) ?? [];
}

const imp = (source: string) => `import { x } from "${source}";\nexport const y = x;\n`;

describe("p0: modules d'environnement étroits (lint des imports)", () => {
  const ADMIS: [string, string][] = [
    ["src/ai/exemple.ts", "@/server/env/ai"],
    ["src/ai/sous/exemple.ts", "@/server/env/egress"],
    ["src/grounding/exemple.ts", "@/server/env/grounding"],
    ["src/grounding/exemple.ts", "@/server/env/egress"],
    ["src/research/undici-transport.ts", "@/server/env/egress"],
    ["src/server/env/ai.ts", "./egress"],
    ["src/server/env/exemple.test.ts", "@/server/env/ai"],
    ["tests/unit/setup.ts", "@/server/env/garde-cles"],
    ["playwright.config.ts", "./src/server/env/garde-cles"],
  ];
  it.each(ADMIS)("%s peut importer %s", async (fichier, source) => {
    expect(await messagesFor(imp(source), fichier)).toHaveLength(0);
  });

  const REFUSES: [string, string][] = [
    ["src/grounding/exemple.ts", "@/server/env/ai"],
    ["src/ai/exemple.ts", "@/server/env/grounding"],
    ["src/research/agent.ts", "@/server/env/egress"],
    ["src/research/fetch-page.ts", "@/server/env/ai"],
    ["src/app/page.tsx", "@/server/env/ai"],
    ["src/server/actions/exemple.ts", "@/server/env/grounding"],
    ["scripts/p0/main.ts", "../../src/server/env/ai"],
    ["src/ai/exemple.ts", "../server/env/../env/grounding"],
    ["src/ai/exemple.ts", "@/server/env/garde-cles"],
    ["tests/unit/exemple.test.ts", "@/server/env/egress"],
    ["src/ai/exemple.ts", "@/server/env"],
    ["src/ai/exemple.ts", "@/server/env/autre"],
  ];
  it.each(REFUSES)("%s ne peut pas importer %s", async (fichier, source) => {
    expect(await messagesFor(imp(source), fichier)).toHaveLength(1);
  });

  it("toutes les formes de chargement sont lues", async () => {
    const fichier = "src/app/exemple.ts";
    const formes = [
      'export { x } from "@/server/env/ai";\n',
      'export * from "@/server/env/ai";\n',
      'type T = typeof import("@/server/env/ai");\nexport const t: T | null = null;\n',
      'import type { X } from "@/server/env/grounding";\nexport type Y = X;\n',
    ];
    for (const code of formes) expect(await messagesFor(code, fichier), code).toHaveLength(1);
  });
});
