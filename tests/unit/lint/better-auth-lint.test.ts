// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Règles `ligne/better-auth-confinement` et `ligne/no-raw-auth-secret` (spécification B3, B3b point 4, critère B3 ;
 * décisions 0008 et 0051 § 5.4). Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const CONFINEMENT = "ligne/better-auth-confinement";
const SECRET = "ligne/no-raw-auth-secret";

async function messagesFor(code: string, filePath: string, regle: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === regle) ?? [];
}

const imp = (source: string) => `import { x } from "${source}";\nexport const y = x;\n`;

describe("auth: seules les opérations de la liste blanche sont appelées (lint)", () => {
  const BIBLIOTHEQUE_ADMISE: [string, string][] = [
    ["src/tenancy/auth.ts", "better-auth"],
    ["src/tenancy/auth.ts", "better-auth/plugins"],
    ["src/tenancy/adaptateur.ts", "better-auth/adapters/drizzle"],
    ["src/server/auth/index.ts", "better-auth"],
    ["src/server/auth/index.ts", "@/tenancy/auth"],
    ["src/server/auth/sous/exemple.ts", "../../../tenancy/auth"],
  ];
  it.each(BIBLIOTHEQUE_ADMISE)("%s peut importer %s", async (fichier, source) => {
    expect(await messagesFor(imp(source), fichier, CONFINEMENT)).toHaveLength(0);
  });

  const BIBLIOTHEQUE_REFUSEE: [string, string][] = [
    ["src/server/session.ts", "better-auth"],
    ["src/app/page.tsx", "better-auth/react"],
    ["src/features/exemple.ts", "@better-auth/core"],
    ["tests/unit/exemple.test.ts", "better-auth"],
    ["tests/db/exemple.test.ts", "better-auth/plugins"],
    ["src/server/with-org.ts", "@/tenancy/auth"],
    ["src/tenancy/autre.ts", "./auth"],
    ["tests/db/exemple.test.ts", "@/tenancy/auth"],
  ];
  it.each(BIBLIOTHEQUE_REFUSEE)("%s ne peut pas importer %s", async (fichier, source) => {
    expect(await messagesFor(imp(source), fichier, CONFINEMENT)).not.toHaveLength(0);
  });

  it("import dynamique et require hors des deux dossiers refusés", async () => {
    expect(await messagesFor(`export const m = import("better-auth");\n`, "src/server/session.ts", CONFINEMENT)).toHaveLength(1);
    expect(await messagesFor(`export const m = require("better-auth");\n`, "scripts/exemple.ts", CONFINEMENT)).toHaveLength(1);
  });

  it.each(["sendVerificationOTP", "signInEmailOTP", "getSession", "signOut"])("appel nommé %s accepté", async (op) => {
    const code = `declare const auth: any;\nexport const r = auth.api.${op}({});\n`;
    expect(await messagesFor(code, "src/server/auth/index.ts", CONFINEMENT)).toHaveLength(0);
  });

  const REFUSES: [string, string][] = [
    ["opération hors liste", `export const r = auth.api.listSessions({});\n`],
    ["accès calculé à api", `export const r = auth["api"].getSession({});\n`],
    ["opération calculée", `const nom = "getSession";\nexport const r = auth.api[nom]({});\n`],
    ["déstructuration", `const { api } = auth;\nexport const r = api;\n`],
    ["valeur passée", `declare function f(x: unknown): void;\nf(auth.api);\n`],
    ["référence sans appel", `export const r = auth.api.getSession;\n`],
    ["handler", `export const r = auth.handler;\n`],
    ["$context", `export const r = auth.$context;\n`],
  ];
  it.each(REFUSES)("%s refusé", async (_titre, corps) => {
    const code = `declare const auth: any;\n${corps}`;
    expect(await messagesFor(code, "src/server/auth/index.ts", CONFINEMENT)).not.toHaveLength(0);
    expect(await messagesFor(code, "src/tenancy/auth.ts", CONFINEMENT)).not.toHaveLength(0);
  });
});

describe("auth: secret de Better Auth lu seulement par le module d'environnement (lint)", () => {
  // Textes de cas : ligne nominative de `donnees/lignes-textes.json` (noms secrets dans des textes de test).
  const LECTURES = [
    "export const s = process.env.BETTER_AUTH_SECRET;",
    'export const s = process.env["AUTH_SECRET"];',
    "export const s = process.env.BETTER_AUTH_SECRETS;",
    "const { BETTER_AUTH_SECRET } = process.env; export const s = BETTER_AUTH_SECRET;",
  ];
  it.each(LECTURES)("lecture refusée hors de src/server/env/index.ts : %s", async (code) => {
    expect(await messagesFor(code, "src/server/auth/index.ts", SECRET)).toHaveLength(1);
    expect(await messagesFor(code, "src/tenancy/auth.ts", SECRET)).toHaveLength(1);
  });

  it("lecture permise dans src/server/env/index.ts", async () => {
    expect(await messagesFor(LECTURES[0] ?? "", "src/server/env/index.ts", SECRET)).toHaveLength(0);
  });

  it("autre variable non visée", async () => {
    expect(await messagesFor(`export const s = process.env.NODE_ENV;\n`, "src/server/auth/index.ts", SECRET)).toHaveLength(0);
  });
});
