// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Critère F0 : une couleur en dur ajoutée dans un composant fait échouer `pnpm lint`.
 * On passe par la configuration réelle du projet (eslint.config.mjs).
 */
const eslint = new ESLint({ cwd: process.cwd() });
const filePath = "src/components/ligne/Exemple.tsx";

async function lint(code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === "ligne/no-hardcoded-colors") ?? [];
}

describe("configuration ESLint du projet", () => {
  it("refuse une couleur hexadécimale en dur dans un composant", async () => {
    const messages = await lint(
      `export function Exemple() {\n  return <div style={{ color: "#ff0000" }} />;\n}\n`,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });

  it("refuse une valeur Tailwind arbitraire de couleur", async () => {
    const messages = await lint(
      `export function Exemple() {\n  return <div className="bg-[#0e1b30]" />;\n}\n`,
    );
    expect(messages).toHaveLength(1);
  });

  it("accepte les tokens Ligne", async () => {
    const messages = await lint(
      `export function Exemple() {\n  return <div className="bg-quai text-ink rounded-tag" />;\n}\n`,
    );
    expect(messages).toHaveLength(0);
  });
});
