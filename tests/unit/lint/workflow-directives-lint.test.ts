// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * `ligne/workflow-directives` (décision 0009, points 1 et 2 ; décision 0063, points 3 et 4) sur la configuration réelle
 * du projet : directives du SDK confinées à `src/workflows/`, paquet `workflow` importé depuis `src/workflows/` (et
 * `workflow/next` depuis `next.config.ts`) seulement, webhooks et hooks refusés partout.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const REGLE = "ligne/workflow-directives";

async function messages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === REGLE) ?? [];
}

const STEP = `export async function f() {\n  "use step";\n  return 1;\n}\n`;
const WORKFLOW = `export async function w() {\n  "use workflow";\n  return 1;\n}\n`;

describe("ligne/workflow-directives (décisions 0009 et 0063)", () => {
  it("la règle est active sur un fichier quelconque du dépôt (un seul bloc, jamais remplacé)", async () => {
    for (const filePath of ["src/app/page.tsx", "src/server/x.ts", "src/workflows/p0-run.ts", "scripts/p0/x.ts", "next.config.ts"]) {
      const config = (await eslint.calculateConfigForFile(filePath)) as { rules?: Record<string, unknown> };
      expect(new Map(Object.entries(config.rules ?? {})).get(REGLE), filePath).toEqual([2]);
    }
  });

  it.each(["src/workflows/p0-run.ts", "src/workflows/autre.ts"])("directives admises dans %s", async (filePath) => {
    expect(await messages(STEP, filePath)).toHaveLength(0);
    expect(await messages(WORKFLOW, filePath)).toHaveLength(0);
  });

  it.each(["src/server/x.ts", "src/app/api/x/route.ts", "src/ai/x.ts", "src/workflows/x.test.ts", "scripts/p0/x.ts", "src/lib/x.ts"])(
    "directives refusées dans %s",
    async (filePath) => {
      expect((await messages(STEP, filePath)).map((m) => m.messageId)).toEqual(["directive"]);
      expect((await messages(WORKFLOW, filePath)).map((m) => m.messageId)).toEqual(["directive"]);
    },
  );

  it("une chaîne ordinaire n'est pas une directive", async () => {
    expect(await messages(`export const x = () => { const s = "use step"; return s; };\n`, "src/lib/x.ts")).toHaveLength(0);
  });

  it("import du SDK : admis dans src/workflows/ et les tests, refusé ailleurs, sous toutes les formes", async () => {
    expect(await messages(`import { start } from "workflow/api";\n`, "src/workflows/index.ts")).toHaveLength(0);
    expect(await messages(`import { FatalError } from "workflow";\n`, "tests/unit/workflows/x.test.ts")).toHaveLength(0);
    const formes = [
      `import { start } from "workflow/api";\n`,
      `import { FatalError } from "workflow";\n`,
      `export { start } from "workflow/api";\n`,
      `import { x } from "@workflow/core";\n`,
      `import type { Run } from "workflow/api";\n`,
    ];
    for (const code of formes) expect((await messages(code, "src/server/x.ts")).map((m) => m.messageId), code).toContain("import");
    expect((await messages(`export const f = () => import("workflow/api");\n`, "src/server/x.ts")).map((m) => m.messageId)).toContain("import");
    expect((await messages(`const w = require("workflow");\nexport default w;\n`, "src/lib/x.ts")).map((m) => m.messageId)).toContain("import");
  });

  it("workflow/next : admis dans next.config.ts seulement", async () => {
    expect(await messages(`import { withWorkflow } from "workflow/next";\nexport default withWorkflow({});\n`, "next.config.ts")).toHaveLength(0);
    expect((await messages(`import { start } from "workflow/api";\nexport { start };\n`, "next.config.ts")).map((m) => m.messageId)).toEqual(["import"]);
    expect((await messages(`import { withWorkflow } from "workflow/next";\nexport { withWorkflow };\n`, "src/lib/x.ts")).map((m) => m.messageId)).toEqual([
      "import",
    ]);
  });

  it.each(["createWebhook", "createHook", "defineHook", "resumeHook", "resumeWebhook", "getHookByToken"])(
    "%s refusé partout, src/workflows/ et tests compris",
    async (nom) => {
      for (const filePath of ["src/workflows/p0-run.ts", "tests/unit/workflows/x.test.ts"]) {
        expect((await messages(`import { ${nom} } from "workflow";\nexport { ${nom} };\n`, filePath)).map((m) => m.messageId), filePath).toEqual(["nom"]);
        expect((await messages(`import { ${nom} as x } from "workflow/api";\nexport { x };\n`, filePath)).map((m) => m.messageId), filePath).toEqual(["nom"]);
        expect((await messages(`export { ${nom} } from "workflow";\n`, filePath)).map((m) => m.messageId), filePath).toEqual(["nom"]);
      }
    },
  );

  it("imports globaux du SDK refusés (ils exposeraient createWebhook et createHook)", async () => {
    const formes = [
      `import * as sdk from "workflow";\nexport { sdk };\n`,
      `export * from "workflow/api";\n`,
      `export const f = () => import("workflow");\n`,
      `const w = require("workflow");\nexport default w;\n`,
      "export const f = () => import(`workflow`);\n",
      "const w = require(`workflow/api`);\nexport default w;\n",
    ];
    for (const code of formes) expect((await messages(code, "src/workflows/x.ts")).map((m) => m.messageId), code).toContain("espace");
    // Gabarit sans substitution hors de src/workflows/ : refusé comme une chaîne (mineur 5 de la revue du head `608ee99`).
    expect((await messages("export const f = () => import(`workflow/api`);\n", "src/server/x.ts")).map((m) => m.messageId)).toContain("import");
    expect((await messages("const w = require(`@workflow/core`);\nexport default w;\n", "src/lib/x.ts")).map((m) => m.messageId)).toContain("import");
  });

  it("le dépôt réel passe la règle", async () => {
    const resultats = await eslint.lintFiles(["src/workflows/**/*.ts", "next.config.ts"]);
    const erreurs = resultats.flatMap((r) => r.messages.filter((m) => m.ruleId === REGLE).map((m) => `${r.filePath}:${m.line} ${m.messageId}`));
    expect(erreurs).toEqual([]);
    expect(resultats.length).toBeGreaterThanOrEqual(3);
  });
});
