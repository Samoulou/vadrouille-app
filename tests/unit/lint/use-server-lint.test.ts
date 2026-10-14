// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Règle `ligne/use-server-only-in-actions` (spécification B3, critère A12 ; décision 0050, B3-TL-1 point 6) : la
 * directive `"use server"` est refusée dans `src/`, `db/` et `scripts/` hors de `src/server/actions/`, en tête de
 * fichier comme en tête du corps d'une fonction, tests compris. Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const RULE = "ligne/use-server-only-in-actions";

async function messagesFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === RULE) ?? [];
}

const EN_TETE = '"use server";\n\nexport async function agir(): Promise<number> {\n  return 1;\n}\n';
const DANS_UNE_FONCTION = 'export async function agir(): Promise<number> {\n  "use server";\n  return 1;\n}\n';
const COMPOSANT =
  'export function Bouton() {\n  async function envoyer() {\n    "use server";\n  }\n  const fleche = async () => {\n    "use server";\n  };\n  return <form action={envoyer} onSubmit={fleche} />;\n}\n';

describe("modules serveur non exposables (\"use server\" hors de src/server/actions)", () => {
  it.each(["src/server/exemple.ts", "src/server/env/exemple.ts", "src/tenancy/exemple.ts", "src/lib/exemple.ts", "db/exemple.ts", "scripts/exemple.ts", "src/server/exemple.test.ts"])(
    "%s : directive en tête de fichier refusée",
    async (fichier) => {
      expect(await messagesFor(EN_TETE, fichier)).toHaveLength(1);
    },
  );

  it("directive dans une fonction de src/server refusée", async () => {
    expect(await messagesFor(DANS_UNE_FONCTION, "src/server/exemple.ts")).toHaveLength(1);
  });

  it("directive dans une fonction et une flèche d'un composant refusée", async () => {
    expect(await messagesFor(COMPOSANT, "src/components/ligne/Exemple.tsx")).toHaveLength(2);
  });

  it("acceptée dans src/server/actions", async () => {
    expect(await messagesFor(EN_TETE, "src/server/actions/exemple.ts")).toHaveLength(0);
    expect(await messagesFor(DANS_UNE_FONCTION, "src/server/actions/sous/exemple.ts")).toHaveLength(0);
  });

  it("une chaîne qui n'est pas une directive n'est pas signalée", async () => {
    expect(await messagesFor('export const x = 1;\n"use server";\n', "src/lib/exemple.ts")).toHaveLength(0);
    expect(await messagesFor('export const directive = "use server";\n', "src/lib/exemple.ts")).toHaveLength(0);
    expect(await messagesFor('"use client";\n\nexport const x = 1;\n', "src/lib/exemple.ts")).toHaveLength(0);
  });
});
