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

/**
 * P0r3b (décision 0055, section 1 point 2 ; S-1 point 3) : la preuve `GardeOuverte` n'est fabriquée que par
 * `src/server/p0/garde.ts`, même règle ; seule exemption en plus : les fichiers de `tests/`. `CanonicalEmail` reste
 * interdit dans ces deux exemptions.
 */
async function messagesGarde(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === RULE && m.message.includes("GardeOuverte")) ?? [];
}

const TYPE_GARDE = 'import type { GardeOuverte } from "@/server/p0/garde";\n\n';
const CAS_GARDE: [string, string][] = [
  ["as GardeOuverte", `${TYPE_GARDE}export const g = { runId: "x" } as GardeOuverte;\n`],
  ["as unknown as GardeOuverte", `${TYPE_GARDE}export const g = "x" as unknown as GardeOuverte;\n`],
  ["<GardeOuverte>x", `${TYPE_GARDE}const x: unknown = {};\nexport const g = <GardeOuverte>x;\n`],
  ["x is GardeOuverte", `${TYPE_GARDE}export function estGarde(x: unknown): x is GardeOuverte {\n  return x !== null;\n}\n`],
];

describe("GardeOuverte fabriquée par src/server/p0/garde.ts seul (tests de tests/ exceptés)", () => {
  const REFUSES = [
    "src/server/p0/acces.ts",
    "src/server/composition/p0-reel.ts",
    "src/workflows/p0-run.ts",
    "src/server/p0/garde.test.ts",
    "src/server/email.ts",
    "src/domain/exemple.ts",
    "src/adapters/mock-auth.ts",
  ];
  for (const [nom, code] of CAS_GARDE) {
    it.each(REFUSES)(`${nom} refusé dans %s`, async (fichier) => {
      expect(await messagesGarde(code, fichier)).toHaveLength(1);
    });
  }

  it("accepté dans src/server/p0/garde.ts et dans un test de tests/", async () => {
    for (const fichier of ["src/server/p0/garde.ts", "tests/unit/p0/garde.test.ts", "tests/support/exemple.ts"]) {
      for (const [nom, code] of CAS_GARDE) expect(await messagesGarde(code, fichier), `${nom} ${fichier}`).toHaveLength(0);
    }
  });

  it("CanonicalEmail reste interdit dans les exemptions de GardeOuverte", async () => {
    for (const fichier of ["src/server/p0/garde.ts", "tests/unit/p0/garde.test.ts"]) {
      for (const [nom, code] of CAS) expect(await messagesFor(code, fichier), `${nom} ${fichier}`).toHaveLength(1);
    }
  });
});
