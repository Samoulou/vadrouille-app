// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Décision 0007 (« Suppression de compte ») ; handover back-end § 3 ; revue de #1108, bloquant 2 : la chaîne
 * `purge_organization_data` n'apparaît que dans `src/server/account/delete.ts` et dans `db/`, tests de `tests/` exceptés
 * (ils éprouvent la fonction). Règle `no-restricted-syntax` d'`eslint.config.mjs` (`PURGE_SYNTAX`), y compris dans les
 * fichiers dont un autre bloc règle aussi `no-restricted-syntax`. Le dépôt lui-même est tenu par `pnpm lint` (`eslint .`).
 */
const eslint = new ESLint({ cwd: process.cwd() });
const RULE = "no-restricted-syntax";
const NOM = "purge_organization_data";

async function messagesFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === RULE && m.message.includes(NOM)) ?? [];
}

const CAS: [string, string][] = [
  ["chaîne entre guillemets", `export const SQL = "SELECT public.${NOM}($1)";\n`],
  ["chaîne entre apostrophes", `export const SQL = 'SELECT ${NOM}($1)';\n`],
  ["gabarit sans expression", `export const SQL = \`SELECT public.${NOM}($1)\`;\n`],
  ["gabarit avec expression", `const org = "o";\nexport const SQL = \`SELECT public.${NOM}('\${org}')\`;\n`],
  ["gabarit étiqueté", `declare const sql: (t: TemplateStringsArray) => unknown;\nexport const SQL = sql\`SELECT ${NOM}(1)\`;\n`],
];

describe("purge_organization_data nommée par src/server/account/delete.ts et db/ seuls (décision 0007)", () => {
  const REFUSES = [
    "src/server/exemple.ts",
    "src/server/account/export.ts",
    "src/server/account/exemple.ts",
    "src/server/actions/compte.ts",
    "src/server/auth/reprise.ts",
    "src/server/email.ts",
    "src/server/p0/garde.ts",
    "src/domain/exemple.ts",
    "src/adapters/mock-auth.ts",
    "src/adapters/api-share.ts",
    "src/tenancy/exemple.ts",
    "src/app/exemple.tsx",
    "scripts/exemple.ts",
    "workflows/exemple.ts",
  ];
  const ADMIS = ["src/server/account/delete.ts", "db/index.ts", "db/schema/business.ts", "tests/db/exemple.test.ts", "tests/unit/db/exemple.test.ts"];

  for (const [nom, code] of CAS) {
    it.each(REFUSES)(`${nom} refusé dans %s`, async (fichier) => {
      expect(await messagesFor(code, fichier)).toHaveLength(1);
    });

    it.each(ADMIS)(`${nom} admis dans %s`, async (fichier) => {
      expect(await messagesFor(code, fichier)).toHaveLength(0);
    });
  }

  it.each(["scripts/exemple.mjs", "scripts/ci/exemple.js", "public/sw.js", "exemple.config.mjs"])("refusé aussi dans un fichier JavaScript : %s", async (fichier) => {
    expect(await messagesFor(`export const SQL = "SELECT ${NOM}($1)";\n`, fichier)).toHaveLength(1);
  });

  it("un identifiant ou un commentaire qui porte le nom passe : seules les chaînes et les gabarits sont visés", async () => {
    const code = `// ${NOM} : voir src/server/account/delete.ts\nexport const autre = "SELECT 1";\n`;
    expect(await messagesFor(code, "src/server/exemple.ts")).toHaveLength(0);
  });

  it("les autres interdictions de la même règle restent posées dans les fichiers admis", async () => {
    const code = 'import type { CanonicalEmail } from "@/server/email";\n\nexport const e = "a@exemple.test" as CanonicalEmail;\n';
    for (const fichier of ["src/server/account/delete.ts", "db/index.ts"]) {
      const [result] = await eslint.lintText(code, { filePath: fichier });
      expect(result?.messages.filter((m) => m.ruleId === RULE && m.message.includes("CanonicalEmail")), fichier).toHaveLength(1);
    }
  });
});
