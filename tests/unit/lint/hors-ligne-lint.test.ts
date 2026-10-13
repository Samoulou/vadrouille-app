// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Hors-ligne (spécification F10, F10b ; F10-TL-5, critère C26) : seul le module hors ligne désigné enregistre le
 * service worker, seul `public/sw.js` ouvre un cache ; le service worker n'a ni IndexedDB, ni Web Storage, ni
 * cookie, ni horloge, ni script d'une autre origine ; la page de repli suit les règles des écrans. Configuration
 * ESLint réelle.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules?: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && (!rules || rules.includes(m.ruleId))) ?? [];
}

const REGISTER = "ligne/no-service-worker-register";
const OPEN = "ligne/no-cache-storage-open";

describe("enregistrement du service worker (F10-TL-5)", () => {
  it.each([
    "src/features/voyage/Autre.tsx",
    "src/lib/autre.ts",
    "src/app/hors-ligne/Autre.tsx",
    "src/components/ligne/Autre.tsx",
    "scripts/autre.mjs",
  ])("refusé hors du module désigné : %s", async (filePath) => {
    for (const statement of [
      `navigator.serviceWorker.register("/sw.js");`,
      `window.navigator.serviceWorker.register("/sw.js");`,
      `navigator.serviceWorker?.register("/sw.js");`,
    ]) {
      expect(await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, [REGISTER]), statement).toHaveLength(1);
    }
  });

  it("permis dans src/lib/offline/register.ts", async () => {
    const code = `export function f() {\n  navigator.serviceWorker.register("/sw.js");\n}\n`;
    expect(await messagesFor(code, "src/lib/offline/register.ts", [REGISTER])).toHaveLength(0);
  });
});

describe("Cache Storage (F10-TL-5)", () => {
  it.each(["src/lib/offline/register.ts", "src/features/sejour/Autre.tsx", "src/lib/autre.ts", "public/autre.js"])(
    "caches.open refusé : %s",
    async (filePath) => {
      for (const statement of [`caches.open("a");`, `self.caches.open("a");`, `window.caches.open("a");`]) {
        expect(await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, [OPEN]), statement).toHaveLength(1);
      }
    },
  );

  it("caches.open permis dans public/sw.js", async () => {
    expect(await messagesFor(`caches.open("vadrouille-interface-1");\n`, "public/sw.js")).toEqual([]);
  });
});

describe("public/sw.js et son aiguillage (F10-TL-5)", () => {
  it.each(["public/sw.js", "public/sw-route.js"])("refuse IndexedDB, Web Storage, cookie et horloge dans %s", async (filePath) => {
    for (const statement of [
      `indexedDB.open("a");`,
      `self.indexedDB.open("a");`,
      `localStorage.setItem("a", "b");`,
      `sessionStorage.getItem("a");`,
      `self.localStorage.clear();`,
      `document.cookie;`,
      `Date.now();`,
      `new Date();`,
      `performance.now();`,
      `self.Date.now();`,
    ]) {
      expect((await messagesFor(`${statement}\n`, filePath)).length, statement).toBeGreaterThan(0);
    }
  });

  it("refuse un script d'une autre origine ou un import", async () => {
    for (const statement of [
      `importScripts("https://example.org/x.js");`,
      `importScripts("//example.org/x.js");`,
      `importScripts("/sw-route.js", "/autre.js");`,
      `import("https://example.org/x.mjs");`,
    ]) {
      expect((await messagesFor(`${statement}\n`, "public/sw.js")).length, statement).toBeGreaterThan(0);
    }
  });

  it("accepte le service worker et l'aiguillage tels qu'écrits (pnpm lint couvre public/)", async () => {
    const results = await eslint.lintFiles(["public/sw.js", "public/sw-route.js"]);
    expect(results.map((result) => result.filePath.replace(/.*public\//, "public/"))).toEqual(["public/sw.js", "public/sw-route.js"]);
    expect(results.flatMap((result) => result.messages)).toEqual([]);
  });
});

describe("page de repli (F10-TL-5, C3, C4)", () => {
  const FILE = "src/app/hors-ligne/page.tsx";

  it("refuse src/mocks, la carte simulée et la carte", async () => {
    for (const code of [
      `import { edimbourg } from "@/mocks/edimbourg";\nexport const e = edimbourg;\n`,
      `import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";\nexport const s = SimulatedMapRenderer;\n`,
      `import { DayMap } from "@/components/carte/DayMap";\nexport const d = DayMap;\n`,
    ]) {
      expect((await messagesFor(code, FILE, ["no-restricted-imports"])).length, code).toBeGreaterThan(0);
    }
  });

  it("refuse tout stockage client et un texte en dur", async () => {
    for (const statement of [`localStorage.setItem("a", "b");`, `indexedDB.open("a");`, `caches.keys();`, `document.cookie = "a=b";`]) {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, FILE, ["no-restricted-globals", "no-restricted-properties"]);
      expect(messages, statement).toHaveLength(1);
    }
    expect(await messagesFor(`export function E() {\n  return <p>Tu es hors ligne</p>;\n}\n`, FILE, ["react/jsx-no-literals"])).toHaveLength(1);
  });
});
