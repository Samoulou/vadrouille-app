// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Règles de lint de F9a (décision 0020 § 11, amende 0016 § 3.1 règle 4 ; 0017 § 10.1 et § 10.2), sur la
 * configuration réelle du projet. Les interdictions précédentes (src/mocks, carte simulée) tiennent toujours :
 * en configuration plate, le dernier bloc remplace les précédents (point d'attention de 0015 § 1).
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const IMPORTS = ["no-restricted-imports"];
const importOf = (source: string) => `import * as m from "${source}";\nexport const x = m;\n`;

describe("imports de src/server hors de src/server", () => {
  const CLIENT_FILES = [
    "src/features/presentation/Exemple.tsx",
    "src/features/voyage/exemple.ts",
    "src/components/ligne/Exemple.tsx",
    "src/lib/exemple.ts",
    "src/app/voyages/[id]/debloquer/page.tsx",
    "src/app/page.tsx",
  ];

  it.each(CLIENT_FILES)("@/server/actions/paiement passe dans %s", async (filePath) => {
    expect(await messagesFor(importOf("@/server/actions/paiement"), filePath, IMPORTS)).toHaveLength(0);
  });

  for (const filePath of CLIENT_FILES) {
    it.each(["@/server/config/offer", "@/server/parse-input", "@/server/actions/sous/dossier", "../../server/config/offer"])(
      `%s refusé dans ${filePath}`,
      async (source) => {
        const messages = await messagesFor(importOf(source), filePath, IMPORTS);
        expect(messages).toHaveLength(1);
        expect(messages[0]?.severity).toBe(2);
      },
    );
  }

  it("src/server et src/adapters peuvent importer la configuration", async () => {
    expect(await messagesFor(importOf("@/server/config/offer"), "src/server/actions/exemple.ts", IMPORTS)).toHaveLength(0);
    expect(await messagesFor(importOf("@/server/config/offer"), "src/adapters/exemple.ts", IMPORTS)).toHaveLength(0);
  });
});

describe("zod et portée des simulations dans les écrans", () => {
  it.each(["src/features/presentation/Exemple.tsx", "src/features/voyage/exemple.ts", "src/components/ligne/Exemple.tsx", "src/lib/exemple.ts"])(
    "zod refusé dans %s ; zod/mini et @/contracts/values passent",
    async (filePath) => {
      expect(await messagesFor(importOf("zod"), filePath, IMPORTS)).toHaveLength(1);
      expect(await messagesFor(importOf("zod/mini"), filePath, IMPORTS)).toHaveLength(0);
      expect(await messagesFor(importOf("@/contracts/values"), filePath, IMPORTS)).toHaveLength(0);
    },
  );

  it.each(["src/features/presentation/Exemple.tsx", "src/components/ligne/Exemple.tsx"])("@/adapters/simulation refusé dans %s", async (filePath) => {
    expect(await messagesFor(importOf("@/adapters/simulation"), filePath, IMPORTS)).toHaveLength(1);
  });

  it("les interdictions précédentes tiennent : src/mocks et carte simulée", async () => {
    expect(await messagesFor(importOf("@/mocks/edimbourg"), "src/features/presentation/Exemple.tsx", IMPORTS)).toHaveLength(1);
    expect(await messagesFor(importOf("@/components/carte/SimulatedMapRenderer"), "src/features/sejour/Exemple.tsx", IMPORTS)).toHaveLength(1);
    expect(await messagesFor(importOf("@/components/carte/SimulatedMapRenderer"), "src/app/voyages/[id]/page.tsx", IMPORTS)).toHaveLength(1);
    expect(await messagesFor(importOf("@/mocks/edimbourg"), "src/components/ligne/Exemple.tsx", IMPORTS)).toHaveLength(1);
    expect(await messagesFor(importOf("@/mocks/edimbourg"), "src/app/page.tsx", IMPORTS)).toHaveLength(1);
    expect(await messagesFor(importOf("@/mocks/edimbourg"), "src/adapters/exemple.ts", IMPORTS)).toHaveLength(0);
  });
});

describe("paiement simulé : ni journal ni horloge système", () => {
  it.each(["src/server/actions/paiement.ts", "src/adapters/mock-payment.ts", "src/adapters/mock-unlock.ts"])("console refusé dans %s", async (filePath) => {
    expect(await messagesFor(`export function f() {\n  console.info("x");\n}\n`, filePath, ["no-console"])).toHaveLength(1);
  });

  it("Date.now et new Date() refusés dans l'adaptateur de paiement simulé", async () => {
    const rules = ["no-restricted-syntax"];
    expect(await messagesFor(`export const t = () => Date.now();\n`, "src/adapters/mock-payment.ts", rules)).toHaveLength(1);
    expect(await messagesFor(`export const t = () => new Date();\n`, "src/adapters/mock-payment.ts", rules)).toHaveLength(1);
    expect(await messagesFor(`export const t = (now: () => number) => now();\n`, "src/adapters/mock-payment.ts", rules)).toHaveLength(0);
  });
});

describe("fournisseur de l'onglet : aucun stockage, aucun texte en dur", () => {
  it.each([`localStorage.setItem("a", "1");`, `sessionStorage.getItem("a");`, `indexedDB.open("a");`, `caches.open("a");`, `document.cookie = "a=1";`])(
    "refuse « %s » dans src/features/voyage",
    async (statement) => {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, "src/features/voyage/Exemple.tsx", [
        "no-restricted-globals",
        "no-restricted-properties",
      ]);
      expect(messages).toHaveLength(1);
    },
  );

  it.each(["src/features/voyage/Exemple.tsx", "src/app/voyages/[id]/debloquer/page.tsx", "src/features/presentation/OfferScreen.tsx", "src/components/ligne/DestinationPlate.tsx"])(
    "react/jsx-no-literals actif sur %s",
    async (filePath) => {
      const messages = await messagesFor(`export function E() {\n  return <span>Payer</span>;\n}\n`, filePath, ["react/jsx-no-literals"]);
      expect(messages).toHaveLength(1);
    },
  );
});
