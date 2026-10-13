// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { messages } from "@/i18n";

/**
 * Critères transverses de F7a (spécification F7, C3, C4 et C7) sur les nouveaux fichiers : ni carte simulée ni
 * `src/mocks`, aucun stockage client, `react/jsx-no-literals`, aucune valeur en dur, vocabulaire du handover § 10.
 * Configuration ESLint réelle.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messagesFor(code: string, filePath: string, rules: string[]) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && rules.includes(m.ruleId)) ?? [];
}

const FILES = [
  "src/features/sejour/ReplaceScreen.tsx",
  "src/features/sejour/RevisionPreview.tsx",
  "src/features/sejour/screen-remplacer.tsx",
  "src/app/voyages/[id]/(programme)/jour/[n]/remplacer/[stopId]/page.tsx",
  "src/components/ligne/ChangeSet.tsx",
];

describe("règles ESLint sur les fichiers de F7a", () => {
  it.each(FILES.filter((file) => !file.startsWith("src/components")))("refuse la carte simulée et src/mocks dans %s", async (filePath) => {
    const code =
      `import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";\n` +
      `import { edimbourg } from "@/mocks/edimbourg";\nexport const s = [SimulatedMapRenderer, edimbourg];\n`;
    const found = await messagesFor(code, filePath, ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"]);
    expect(found).toHaveLength(2);
  });

  it.each(FILES)("refuse localStorage, sessionStorage, indexedDB, caches et document.cookie dans %s", async (filePath) => {
    for (const statement of [
      `localStorage.setItem("souhait", "x");`,
      `sessionStorage.getItem("souhait");`,
      `indexedDB.open("souhait");`,
      `caches.open("souhait");`,
      `document.cookie = "souhait=1";`,
    ]) {
      const found = await messagesFor(`export function f() {\n  ${statement}\n}\n`, filePath, ["no-restricted-globals", "no-restricted-properties"]);
      expect(found, statement).toHaveLength(1);
    }
  });

  it.each(FILES.filter((file) => file.endsWith(".tsx")))("refuse un texte en dur dans %s", async (filePath) => {
    const found = await messagesFor(`export function E() {\n  return <span>Voir une proposition</span>;\n}\n`, filePath, ["react/jsx-no-literals"]);
    expect(found).toHaveLength(1);
  });
});

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(?:rgba?|hsla?)\(/i;
const PX = /\d(?:\.\d+)?px\b/;
const ARBITRARY = /\b[a-z-]+-\[[^\]]+\]/;

describe("valeurs en dur dans les fichiers de F7a", () => {
  it.each([...FILES, "src/features/sejour/revision.ts", "src/components/ligne/SegmentedControl.tsx", "src/components/ligne/StopMarker.tsx"])(
    "%s : ni couleur, ni px, ni valeur arbitraire",
    (file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(HEX);
      expect(source).not.toMatch(COLOR_FN);
      expect(source).not.toMatch(PX);
      expect(source).not.toMatch(ARBITRARY);
    },
  );
});

describe("textes de la révision (handover § 10, C7)", () => {
  const text = JSON.stringify({ revision: messages.revision, changeSet: messages.ligne.changeSet });

  it.each(["Vérifié", "vérifié", "Aperçu", "Supprimer", "OK", "Valider", "!"])("n'emploie pas « %s »", (word) => {
    expect(text).not.toContain(word);
  });

  it("aucun bouton nommé « Retour » seul ; « Retour à la fiche » et « Retour à la Journée » (décision 0018 § 5)", () => {
    expect(messages.revision.retourFiche).toBe("Retour à la fiche");
    expect(messages.revision.remplacer.retourJournee).toBe("Retour à la Journée");
    expect(Object.values(messages.revision)).not.toContain("Retour");
  });
});
