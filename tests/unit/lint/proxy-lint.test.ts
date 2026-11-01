// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Ticket 1013 (M6a ; décision 0157 § 2.1 ; spécification M6 § 3.3 point 1) : bloc d'`eslint.config.mjs` propre à
 * `src/proxy.ts`. Liste blanche d'imports : `next/server`, `@/adapters/share-guard` et `@/server/partage/limite-vue` ;
 * aucun journal. Configuration ESLint réelle.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const PROXY = "src/proxy.ts";

async function messagesFor(code: string, rules: string[], filePath = PROXY) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];
const imp = (specificateur: string) => `import * as m from "${specificateur}";\nexport const x = m;\n`;

describe("src/proxy.ts : règles ESLint (ticket 1013, M6a)", () => {
  it.each(["next/server", "@/adapters/share-guard", "@/server/partage/limite-vue"])("admet %s", async (specificateur) => {
    expect(await messagesFor(imp(specificateur), IMPORTS)).toEqual([]);
  });

  it.each([
    "@/server/env",
    "@/server/rate-limit",
    "@/server/partage/vue",
    "@/server/partage/liens",
    "@/server/voyages/carte-partagee",
    "@/server/with-system-org",
    "@/server/actions/partage",
    "@/adapters",
    "@/adapters/api-share",
    "@/adapters/api-share-instance",
    "@/adapters/share-guard/../index",
    "./server/partage/limite-vue",
    "./adapters/share-guard",
    "@/mocks/edimbourg",
    "@/i18n/messages",
    "next/headers",
    "node:crypto",
    "zod",
  ])("refuse %s", async (specificateur) => {
    expect(await messagesFor(imp(specificateur), IMPORTS)).toHaveLength(1);
  });

  it("refuse un import() et un réexport hors de la liste", async () => {
    expect(await messagesFor(`export { serverEnv } from "@/server/env";\n`, IMPORTS)).toHaveLength(1);
  });

  it("refuse un journal", async () => {
    expect(await messagesFor(`export function f(p: string) {\n  console.log(p);\n}\n`, ["no-console"])).toHaveLength(1);
  });

  it("le fichier réel passe sa propre configuration", async () => {
    const [result] = await eslint.lintFiles([PROXY]);
    expect(result?.messages ?? []).toEqual([]);
  });

  it("la liste blanche ne s'applique qu'au proxy (src/app/p garde son bloc)", async () => {
    expect(await messagesFor(imp("@/server/partage/limite-vue"), IMPORTS, "src/app/p/[token]/page.tsx")).toHaveLength(1);
  });
});
