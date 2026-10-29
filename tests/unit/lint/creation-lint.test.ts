// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Règles de lint de F8a (spécification F8, critères transverses) sur la configuration réelle du projet : aucun
 * texte en dur, aucun stockage côté client, aucun journal, ni src/mocks ni carte simulée dans la création.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];
const importOf = (source: string) => `import * as m from "${source}";\nexport const x = m;\n`;
const STORAGE = ["no-restricted-globals", "no-restricted-properties"];

const COMPONENTS = [
  "src/features/creation/Exemple.tsx",
  "src/features/compte/Exemple.tsx",
  "src/app/(creation)/voyages/nouveau/page.tsx",
  "src/app/(creation)/layout.tsx",
];
const MODULES = ["src/features/creation/exemple.ts", "src/features/compte/suite.ts", "src/app/(creation)/voyages/nouveau/brief/page.tsx"];

describe("création du voyage : textes", () => {
  it.each(COMPONENTS)("texte en dur refusé dans %s", async (filePath) => {
    const code = `export function C() {\n  return <p>Bonjour</p>;\n}\n`;
    expect(await messagesFor(code, filePath, ["react/jsx-no-literals"])).toHaveLength(1);
  });
});

describe("création du voyage : aucune persistance côté client", () => {
  for (const filePath of [...COMPONENTS, ...MODULES]) {
    it.each([
      "localStorage.setItem('a', 'b');",
      "window.sessionStorage.clear();",
      "indexedDB.open('a');",
      "caches.keys();",
      "document.cookie = 'a=b';",
      "navigator.serviceWorker.register('/sw.js');",
    ])(`%s refusé dans ${filePath}`, async (statement) => {
      const code = `export function f() {\n  ${statement}\n}\n`;
      expect((await messagesFor(code, filePath, STORAGE)).length).toBeGreaterThan(0);
    });
  }
});

describe("création du voyage : imports", () => {
  it.each([...COMPONENTS, ...MODULES])("src/mocks et la carte simulée refusés dans %s", async (filePath) => {
    expect(await messagesFor(importOf("@/mocks/creation-edimbourg"), filePath, IMPORTS)).toHaveLength(1);
    // Dans src/features/compte, F11a interdit en plus toute carte (décision 0021 § 10) : deux motifs peuvent répondre.
    expect((await messagesFor(importOf("@/components/carte/SimulatedMapRenderer"), filePath, IMPORTS)).length).toBeGreaterThan(0);
    expect(await messagesFor(importOf("@/adapters/simulation"), filePath, IMPORTS)).toHaveLength(1);
    expect(await messagesFor(importOf("@/server/parse-input"), filePath, IMPORTS)).toHaveLength(1);
  });

  it.each(COMPONENTS)("l'action serveur de la création passe dans %s", async (filePath) => {
    expect(await messagesFor(importOf("@/server/actions/creation"), filePath, IMPORTS)).toHaveLength(0);
  });

  it.each(["src/features/creation/Exemple.tsx", "src/features/compte/suite.ts"])("zod et valeurs de @/contracts refusés dans %s", async (filePath) => {
    expect(await messagesFor(importOf("zod"), filePath, IMPORTS)).toHaveLength(1);
    expect(await messagesFor(`import { BriefSchema } from "@/contracts";\nexport const x = BriefSchema;\n`, filePath, IMPORTS)).toHaveLength(1);
    expect(await messagesFor(importOf("@/contracts/values"), filePath, IMPORTS)).toHaveLength(0);
  });
});

describe("création du voyage : exception de la page de l'écran 1 (décision 0141 § 6.4)", () => {
  // Revue consolidée du head `bcaa346`, bloquant 2 : limites de `SERVER_PATTERN_PAGE_VILLES` (eslint.config.mjs).
  const PAGE = "src/app/(creation)/voyages/nouveau/page.tsx";

  it("@/server/composition/villes-api admis dans la page de l'écran 1, et seulement là", async () => {
    const predicat = 'import { rechercheVilleApiOuverte } from "@/server/composition/villes-api";\nexport const x = rechercheVilleApiOuverte;\n';
    expect(await messagesFor(predicat, PAGE, IMPORTS)).toHaveLength(0);
    expect(await messagesFor(importOf("@/server/actions/villes"), PAGE, IMPORTS)).toHaveLength(0);
    for (const ailleurs of ["src/app/(creation)/voyages/nouveau/brief/page.tsx", "src/app/(creation)/voyages/nouveau/lancer/page.tsx", "src/features/creation/Exemple.tsx"]) {
      expect((await messagesFor(predicat, ailleurs, IMPORTS)).length, ailleurs).toBeGreaterThan(0);
    }
  });

  it.each(["barriereApi", "suggererVillesApiTerminal", "choisirVilleApiTerminal", "journaliserExceptionApi", "NIVEAUX_VILLE_API"])(
    "nom %s de villes-api refusé dans la page de l'écran 1 (seul rechercheVilleApiOuverte est admis)",
    async (nom) => {
      const code = `import { ${nom} } from "@/server/composition/villes-api";\nexport const x = ${nom};\n`;
      expect((await messagesFor(code, PAGE, IMPORTS)).length).toBeGreaterThan(0);
      expect((await messagesFor(importOf("@/server/composition/villes-api"), PAGE, IMPORTS)).length).toBeGreaterThan(0);
    },
  );

  it("les autres motifs du bloc restent actifs dans la page : src/mocks, carte simulée, simulations", async () => {
    expect((await messagesFor(importOf("@/mocks/creation-edimbourg"), PAGE, IMPORTS)).length).toBeGreaterThan(0);
    expect((await messagesFor(importOf("@/components/carte/SimulatedMapRenderer"), PAGE, IMPORTS)).length).toBeGreaterThan(0);
    expect((await messagesFor(importOf("@/adapters/simulation"), PAGE, IMPORTS)).length).toBeGreaterThan(0);
  });

  it.each([
    "@/server/composition/villes",
    "@/server/composition/generation",
    "@/server/composition/villes-api/x",
    "@/server/env",
    "@/server/env/index",
    "@/server/env/grounding",
    "@/server/p0/page-acces",
    "@/server/p0/base",
    "@/server/config/villes",
    "@/server/config/usage",
    "../../server/composition/villes-api",
    "../../../../server/composition/villes-api",
  ])("%s refusé dans la page de l'écran 1", async (source) => {
    expect((await messagesFor(importOf(source), PAGE, IMPORTS)).length).toBeGreaterThan(0);
  });
});

describe("création du voyage : aucun journal", () => {
  it.each([
    "src/features/creation/Exemple.tsx",
    "src/features/compte/suite.ts",
    "src/server/actions/creation.ts",
    "src/adapters/mock-creation.ts",
    "src/server/actions/compte.ts",
    "src/adapters/mock-auth.ts",
    "src/adapters/auth-guard.ts",
  ])("console refusé dans %s", async (filePath) => {
    expect(await messagesFor(`export function f(story: string) {\n  console.info(story);\n}\n`, filePath, ["no-console"])).toHaveLength(1);
  });
});

describe("connexion et création simulées : horloge de la portée seulement (F8b, 0017 § 10.1)", () => {
  it.each(["src/adapters/mock-auth.ts", "src/adapters/mock-creation.ts"])("Date.now et new Date() refusés dans %s", async (filePath) => {
    const code = `export function f() {\n  return [Date.now(), new Date()];\n}\n`;
    expect(await messagesFor(code, filePath, ["no-restricted-syntax"])).toHaveLength(2);
  });
});
