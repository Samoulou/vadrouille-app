// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Critères F6 : `pnpm lint` échoue si la présentation utilise un stockage client (localStorage,
 * sessionStorage, indexedDB, caches, document.cookie), et `react/jsx-no-literals` est actif sur ses
 * nouveaux fichiers. Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const STORAGE_RULES = ["no-restricted-globals", "no-restricted-properties"];

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const STORAGE_FILES = [
  "src/features/presentation/Exemple.tsx",
  "src/features/presentation/deck.ts",
  "src/app/voyages/[id]/presentation/page.tsx",
  "src/analytics/track.ts",
  "src/components/ui/dialog.tsx",
  "src/components/ligne/DeckCard.tsx",
  "src/components/ligne/DeckProgress.tsx",
  "src/components/ligne/UndoToast.tsx",
];
const FORBIDDEN = [
  `localStorage.setItem("paquet", "1");`,
  `sessionStorage.getItem("paquet");`,
  `indexedDB.open("paquet");`,
  `caches.open("paquet");`,
  `window.localStorage.clear();`,
  `globalThis.sessionStorage.clear();`,
  `document.cookie = "paquet=1";`,
];

describe("règle ESLint : aucune persistance côté client dans la présentation", () => {
  for (const filePath of STORAGE_FILES) {
    it.each(FORBIDDEN)(`refuse « %s » dans ${filePath}`, async (statement) => {
      const messages = await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, STORAGE_RULES);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.severity).toBe(2);
    });
  }

  it("accepte le code de la présentation sans stockage", async () => {
    expect(await messagesFor(`export const n = () => [1, 2].length;\n`, STORAGE_FILES[0]!, STORAGE_RULES)).toHaveLength(0);
  });
});

describe("règle react/jsx-no-literals sur les fichiers de F6", () => {
  it.each([
    "src/features/presentation/Exemple.tsx",
    "src/app/voyages/[id]/presentation/page.tsx",
    "src/components/ui/dialog.tsx",
    "src/components/ligne/DeckCard.tsx",
  ])("refuse un texte en dur dans %s", async (filePath) => {
    const messages = await messagesFor(`export function E() {\n  return <span>J'aime</span>;\n}\n`, filePath, ["react/jsx-no-literals"]);
    expect(messages).toHaveLength(1);
  });

  it("ne s'applique pas aux tests", async () => {
    const messages = await messagesFor(
      `export function E() {\n  return <span>J'aime</span>;\n}\n`,
      "src/features/presentation/Exemple.test.tsx",
      ["react/jsx-no-literals"],
    );
    expect(messages).toHaveLength(0);
  });
});

/**
 * B10a (décision 0112 § 2 point 2, amendement de 0016 § 3.1 règle 4) : `src/domain/preferences.ts` n'importe que des types de
 * @/contracts et des valeurs de @/contracts/values ; depuis src/features, seul @/domain/preferences s'importe de src/domain.
 */
describe("lint: règles du tri partagées sans zod (B10a)", () => {
  const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];
  const PREFERENCES = "src/domain/preferences.ts";
  const ECRAN = "src/features/presentation/Exemple.ts";

  it.each([
    'import type { PreferencePrompt } from "@/contracts";\nexport type X = PreferencePrompt;\n',
    'import { CATEGORIES } from "@/contracts/values";\nexport const x = CATEGORIES;\n',
  ])("accepté dans src/domain/preferences.ts : %s", async (code) => {
    expect(await messagesFor(code, PREFERENCES, IMPORTS)).toHaveLength(0);
  });

  it.each([
    'import { z } from "zod";\nexport const x = z;\n',
    'import { z } from "zod/mini";\nexport const x = z;\n',
    'import { PreferencePromptSchema } from "@/contracts";\nexport const x = PreferencePromptSchema;\n',
    'import { DeckSessionSchema } from "@/contracts/deck";\nexport const x = DeckSessionSchema;\n',
    'import { classer } from "@/domain/classement";\nexport const x = classer;\n',
    'import { x } from "./calculs";\nexport const y = x;\n',
  ])("refusé dans src/domain/preferences.ts : %s", async (code) => {
    expect(await messagesFor(code, PREFERENCES, IMPORTS)).not.toHaveLength(0);
  });

  it("depuis src/features, @/domain/preferences s'importe ; un autre module de src/domain est refusé", async () => {
    expect(await messagesFor('import { ordreDuPaquet } from "@/domain/preferences";\nexport const x = ordreDuPaquet;\n', ECRAN, IMPORTS)).toHaveLength(0);
    expect(await messagesFor('import { classer } from "@/domain/classement";\nexport const x = classer;\n', ECRAN, IMPORTS)).not.toHaveLength(0);
    expect(await messagesFor('import { x } from "../../domain/calculs";\nexport const y = x;\n', ECRAN, IMPORTS)).not.toHaveLength(0);
  });

  it("M4c : depuis src/features, @/domain/villes-du-voyage s'importe (fonction pure unique, décision 0148 § 6 point 3) ; les autres modules restent refusés", async () => {
    expect(await messagesFor('import { villesDeLaDate } from "@/domain/villes-du-voyage";\nexport const x = villesDeLaDate;\n', ECRAN, IMPORTS)).toHaveLength(0);
    expect(await messagesFor('import { x } from "@/domain/villes-du-voyage-bis";\nexport const y = x;\n', ECRAN, IMPORTS)).not.toHaveLength(0);
    expect(await messagesFor('import { classer } from "@/domain/classement";\nexport const x = classer;\n', ECRAN, IMPORTS)).not.toHaveLength(0);
  });

  it("depuis src/features/presentation, @/server/actions/presentation s'importe ; un autre module de src/server est refusé (0112 § 2 point 4, 0020 § 11)", async () => {
    const ACTIONS = "src/features/presentation/server-actions.ts";
    expect(await messagesFor('import { decideCard } from "@/server/actions/presentation";\nexport const x = decideCard;\n', ACTIONS, IMPORTS)).toHaveLength(0);
    for (const code of [
      'import { deciderCarte } from "@/server/presentation/tri";\nexport const x = deciderCarte;\n',
      'import { creerLectureDuTri } from "@/server/presentation/lecture";\nexport const x = creerLectureDuTri;\n',
      'import { executerActionVoyage } from "@/server/voyages/actions";\nexport const x = executerActionVoyage;\n',
      'import { x } from "../../server/presentation/etat";\nexport const y = x;\n',
    ]) {
      expect(await messagesFor(code, ACTIONS, IMPORTS), code).not.toHaveLength(0);
    }
  });

  it("les interdictions de 0016 § 3.1 tiennent toujours dans src/features", async () => {
    expect(await messagesFor('import { z } from "zod";\nexport const x = z;\n', ECRAN, IMPORTS)).not.toHaveLength(0);
    expect(await messagesFor('import { PreferencePromptSchema } from "@/contracts";\nexport const x = PreferencePromptSchema;\n', ECRAN, IMPORTS)).not.toHaveLength(0);
    expect(await messagesFor('import type { PreferencePrompt } from "@/contracts";\nexport type X = PreferencePrompt;\n', ECRAN, IMPORTS)).toHaveLength(0);
  });
});
