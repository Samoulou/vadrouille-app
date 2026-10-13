// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * F10c (décision 0039, F10-TL-5 ; critères C3, C4) : la feuille « Partager », la vue partagée et leurs pages
 * n'importent ni src/mocks (jetons fixes compris) ni la carte simulée, n'écrivent dans aucun stockage client,
 * passent par `fr.json` pour tout texte visible ; seul `@/server/actions/partage` s'importe de `src/server` depuis
 * `src/features/partage` ; aucun journal ni horloge système dans le partage simulé. Configuration ESLint réelle.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const FILES = ["src/features/partage/ShareSheet.tsx", "src/features/partage/SharedShell.tsx", "src/app/p/[token]/page.tsx"];
const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];

describe("partage : règles ESLint (F10c)", () => {
  it.each(FILES)("refuse src/mocks et les jetons fixes dans %s", async (filePath) => {
    for (const module of ["@/mocks/edimbourg", "@/mocks/edimbourg-partage"]) {
      const code = `import * as m from "${module}";\nexport const e = m;\n`;
      expect(await messagesFor(code, filePath, IMPORTS), module).toHaveLength(1);
    }
  });

  it.each(FILES)("refuse la carte simulée dans %s", async (filePath) => {
    const code = `import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";\nexport const s = SimulatedMapRenderer;\n`;
    expect(await messagesFor(code, filePath, IMPORTS)).toHaveLength(1);
  });

  it.each(FILES)("refuse la portée des simulations dans %s", async (filePath) => {
    const code = `import { resetScope } from "@/adapters/simulation";\nexport const r = resetScope;\n`;
    expect(await messagesFor(code, filePath, IMPORTS)).toHaveLength(1);
  });

  it.each(FILES)("refuse localStorage, sessionStorage, indexedDB, caches, document.cookie et navigator.serviceWorker dans %s", async (filePath) => {
    for (const statement of [
      `localStorage.setItem("lien", "x");`,
      `sessionStorage.getItem("lien");`,
      `indexedDB.open("lien");`,
      `caches.open("lien");`,
      `document.cookie = "lien=x";`,
      `navigator.serviceWorker.register("/sw.js");`,
    ]) {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, [
        "no-restricted-globals",
        "no-restricted-properties",
      ]);
      expect(messages.length, statement).toBeGreaterThanOrEqual(1);
    }
  });

  it.each(FILES)("refuse un texte en dur dans le JSX de %s", async (filePath) => {
    const code = `export function E() {\n  return <p>Partager ton voyage</p>;\n}\n`;
    expect(await messagesFor(code, filePath, ["react/jsx-no-literals"])).toHaveLength(1);
  });

  it("src/features/partage : seul @/server/actions/partage s'importe de src/server", async () => {
    const filePath = "src/features/partage/ShareSheet.tsx";
    const allowed = `import { createShareLink } from "@/server/actions/partage";\nexport const c = createShareLink;\n`;
    expect(await messagesFor(allowed, filePath, IMPORTS)).toEqual([]);
    for (const module of ["@/server/actions/paiement", "@/server/parse-input", "@/server/config/offer", "../../server/actions/paiement"]) {
      const code = `import * as s from "${module}";\nexport const x = s;\n`;
      expect(await messagesFor(code, filePath, IMPORTS), module).toHaveLength(1);
    }
  });

  it("src/features/partage : ni zod, ni valeur de @/contracts (types seulement)", async () => {
    const filePath = "src/features/partage/ShareSheet.tsx";
    expect(await messagesFor(`import { z } from "zod";\nexport const s = z;\n`, filePath, IMPORTS)).toHaveLength(1);
    expect(await messagesFor(`import { ShareStatusSchema } from "@/contracts/share";\nexport const s = ShareStatusSchema;\n`, filePath, IMPORTS)).toHaveLength(1);
    expect(await messagesFor(`import type { ShareStatus } from "@/contracts";\nexport type S = ShareStatus;\n`, filePath, IMPORTS)).toEqual([]);
  });

  it.each(["src/server/actions/partage.ts", "src/adapters/mock-share.ts", "src/adapters/share-guard.ts"])(
    "refuse console dans %s",
    async (filePath) => {
      expect(await messagesFor(`export function f(token: string) {\n  console.log(token);\n}\n`, filePath, ["no-console"])).toHaveLength(1);
    },
  );

  it("refuse l'horloge système dans l'adaptateur de partage simulé", async () => {
    const filePath = "src/adapters/mock-share.ts";
    expect(await messagesFor(`export const n = () => Date.now();\n`, filePath, ["no-restricted-syntax"])).toHaveLength(1);
    expect(await messagesFor(`export const n = () => new Date();\n`, filePath, ["no-restricted-syntax"])).toHaveLength(1);
  });
});
