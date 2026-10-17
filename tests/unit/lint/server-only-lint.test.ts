// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Règle « `import "server-only"` obligatoire » (spécification B1, décision 0006, handover § 3), sur la
 * configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const RULE = "ligne/require-server-only";

async function messagesFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === RULE) ?? [];
}

const WITHOUT = "export const x = 1;\n";
const WITH = 'import "server-only";\n\nexport const x = 1;\n';

describe("server-only obligatoire", () => {
  const SERVER_FILES = [
    "db/exemple.ts",
    "db/schema/exemple.ts",
    "src/server/exemple.ts",
    "src/server/config/exemple.ts",
    "src/tenancy/exemple.ts",
    "src/ai/exemple.ts",
    "src/research/exemple.ts",
    "src/grounding/exemple.ts",
    "src/workflows/exemple.ts",
  ];

  it.each(SERVER_FILES)("un fichier de %s sans import \"server-only\" est signalé", async (filePath) => {
    const messages = await messagesFor(WITHOUT, filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });

  it.each(SERVER_FILES)("un fichier de %s qui l'importe passe", async (filePath) => {
    expect(await messagesFor(WITH, filePath)).toHaveLength(0);
  });

  it("une simple mention ou un import nommé ne suffisent pas", async () => {
    expect(await messagesFor('// import "server-only";\nexport const x = "server-only";\n', "db/exemple.ts")).toHaveLength(1);
    expect(await messagesFor('import type {} from "server-only";\nexport const x = 1;\n', "db/exemple.ts")).toHaveLength(1);
  });

  it("hors périmètre : actions serveur, tests, composants", async () => {
    for (const filePath of ["src/server/actions/exemple.ts", "src/server/exemple.test.ts", "src/components/ligne/Exemple.tsx", "tests/db/exemple.test.ts"]) {
      expect(await messagesFor(WITHOUT, filePath), filePath).toHaveLength(0);
    }
  });

  it("B3a : src/server/env/resolve.ts sans import \"server-only\" est accepté ; tout autre fichier de src/server/env reste signalé", async () => {
    expect(await messagesFor(WITHOUT, "src/server/env/resolve.ts")).toHaveLength(0);
    for (const filePath of ["src/server/env/index.ts", "src/server/env/resolve2.ts", "src/server/env/sous/resolve.ts", "src/server/resolve.ts"]) {
      expect(await messagesFor(WITHOUT, filePath), filePath).toHaveLength(1);
    }
  });

  it("P0r3c-5a : assemblage et vers-moteur de src/server/p0 sans import \"server-only\" sont acceptés ; tout autre fichier de src/server/p0 reste signalé", async () => {
    for (const filePath of ["src/server/p0/assemblage.ts", "src/server/p0/vers-moteur.ts"]) {
      expect(await messagesFor(WITHOUT, filePath), filePath).toHaveLength(0);
    }
    for (const filePath of ["src/server/p0/garde.ts", "src/server/p0/assemblage2.ts", "src/server/p0/sous/assemblage.ts", "src/server/assemblage.ts"]) {
      expect(await messagesFor(WITHOUT, filePath), filePath).toHaveLength(1);
    }
  });

  it("B7a : vers-couche-ia de src/server/p0 sans import \"server-only\" est accepté (décision 0077 § 1 point 5) ; ses voisins de nom restent signalés", async () => {
    expect(await messagesFor(WITHOUT, "src/server/p0/vers-couche-ia.ts")).toHaveLength(0);
    for (const filePath of ["src/server/p0/vers-couche-ia2.ts", "src/server/p0/sous/vers-couche-ia.ts", "src/server/vers-couche-ia.ts"]) {
      expect(await messagesFor(WITHOUT, filePath), filePath).toHaveLength(1);
    }
  });
});
