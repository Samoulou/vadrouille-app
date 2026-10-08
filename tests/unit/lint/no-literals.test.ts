// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** Critère F2 : aucune chaîne en dur dans src/components/ligne, tout vient de fr.json. */
const eslint = new ESLint({ cwd: process.cwd() });

async function literals(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === "react/jsx-no-literals") ?? [];
}

describe("règle react/jsx-no-literals", () => {
  const component = "src/components/ligne/Exemple.tsx";

  it("refuse un texte en dur dans un composant Ligne", async () => {
    const messages = await literals(`export function Exemple() {\n  return <span>À réserver</span>;\n}\n`, component);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });

  it("refuse une chaîne entre accolades dans un composant Ligne", async () => {
    const messages = await literals(`export function Exemple() {\n  return <span>{"Garder"}</span>;\n}\n`, component);
    expect(messages).toHaveLength(1);
  });

  it("accepte un texte venu de fr.json et les valeurs d'attributs", async () => {
    const messages = await literals(
      `import { messages } from "@/i18n";\nexport function Exemple() {\n  return <span className="bg-quai text-ink">{messages.ligne.tag.toReserve}</span>;\n}\n`,
      component,
    );
    expect(messages).toHaveLength(0);
  });

  it("ne s'applique pas aux tests des composants", async () => {
    const messages = await literals(
      `export function Exemple() {\n  return <span>Garder</span>;\n}\n`,
      "src/components/ligne/Exemple.test.tsx",
    );
    expect(messages).toHaveLength(0);
  });
});
