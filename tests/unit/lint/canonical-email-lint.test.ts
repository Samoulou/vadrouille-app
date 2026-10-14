// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Type de marque `CanonicalEmail` (décision 0050, B3-TL-6 point 6 ; 0051 point 4.4) : fabriqué par
 * `parseEmailAddress` (`src/server/email.ts`) seul. Ni conversion, ni assertion, ni prédicat de type ailleurs, tests
 * compris, y compris dans les fichiers dont un bloc d'`eslint.config.mjs` règle aussi `no-restricted-syntax`.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const RULE = "no-restricted-syntax";

async function messagesFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === RULE && m.message.includes("CanonicalEmail")) ?? [];
}

const TYPE = 'import type { CanonicalEmail } from "@/server/email";\n\n';
const CAS: [string, string][] = [
  ["as CanonicalEmail", `${TYPE}export const e = "a@exemple.test" as CanonicalEmail;\n`],
  ["as unknown as CanonicalEmail", `${TYPE}export const e = "a@exemple.test" as unknown as CanonicalEmail;\n`],
  ["<CanonicalEmail>x", `${TYPE}const x: unknown = "a@exemple.test";\nexport const e = <CanonicalEmail>x;\n`],
  ["x is CanonicalEmail", `${TYPE}export function estCanonique(x: string): x is CanonicalEmail {\n  return x.length > 0;\n}\n`],
  [
    "asserts x is CanonicalEmail",
    `${TYPE}export function verifier(x: string): asserts x is CanonicalEmail {\n  if (x.length === 0) throw new Error("vide");\n}\n`,
  ],
];

describe("CanonicalEmail fabriqué par src/server/email.ts seul", () => {
  const FICHIERS = ["src/server/exemple.ts", "src/server/auth/exemple.ts", "tests/unit/exemple.test.ts", "src/domain/exemple.ts", "src/adapters/mock-auth.ts"];

  for (const [nom, code] of CAS) {
    it.each(FICHIERS)(`${nom} refusé dans %s`, async (fichier) => {
      expect(await messagesFor(code, fichier)).toHaveLength(1);
    });
  }

  it("accepté dans src/server/email.ts", async () => {
    for (const [nom, code] of CAS) expect(await messagesFor(code, "src/server/email.ts"), nom).toHaveLength(0);
  });

  it("l'usage du type sans fabrication passe", async () => {
    const code = `${TYPE}export function cle(e: CanonicalEmail): string {\n  return e;\n}\n`;
    expect(await messagesFor(code, "src/server/exemple.ts")).toHaveLength(0);
  });
});
