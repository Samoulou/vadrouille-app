// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import * as messages from "@/i18n/messages";

/**
 * Découpage des textes par espace de noms (décision 0047) : chaque page n'embarque que les fichiers de
 * `src/i18n/fr/` qu'elle lit. Le budget du JavaScript initial (R15 en premier) en dépend.
 */

const ROOT = process.cwd();
const IMPORT = 'import * as messages from "@/i18n/messages";';

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(ROOT, dir, name);
    if (statSync(path).isDirectory()) return sources(relative(ROOT, path));
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(ROOT, path)] : [];
  });
}

describe("textes découpés par espace de noms (0047)", () => {
  it("chaque fichier de src/i18n/fr/ est exporté par messages.ts, et rien d'autre", () => {
    const files = readdirSync(join(ROOT, "src/i18n/fr"))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/, ""));
    expect(Object.keys(messages).sort()).toEqual(files.sort());
  });

  it("@/i18n n'importe aucun texte : importer format n'embarque rien", () => {
    expect(readFileSync(join(ROOT, "src/i18n/index.ts"), "utf8")).not.toMatch(/^\s*(import|export\b.*\bfrom)\b/m);
  });

  it("hors des tests, messages se lit par un chemin statique, jamais en entier", () => {
    const offenders = sources("src").flatMap((path) => {
      const code = readFileSync(join(ROOT, path), "utf8");
      if (!code.includes("@/i18n/messages")) return [];
      const body = code
        .replace(IMPORT, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      return /\bmessages\b(?!\.[A-Za-z_$])/.test(body) ? [path] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("aucune page ne lit encore fr.json ni un fichier de textes hors de messages.ts", () => {
    const offenders = sources("src").filter((path) =>
      /from "@\/i18n\/fr|from "\.\/fr|i18n\/fr\.json/.test(readFileSync(join(ROOT, path), "utf8")) && path !== "src/i18n/messages.ts",
    );
    expect(offenders).toEqual([]);
  });
});
