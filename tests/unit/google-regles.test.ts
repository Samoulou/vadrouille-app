// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/** Règles Google de F4 vérifiées sur les fichiers du dépôt (spécification F4, « Règles Google »). */
const ROOT = process.cwd();
const SKIPPED_DIRS = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", "coverage", "blob-report"]);
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz)$/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIPPED_DIRS.has(name)) {
      return [];
    }
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(ROOT).filter((path) => !BINARY.test(path));

describe("aucune clé Google dans le dépôt", () => {
  it("aucune chaîne au format d'une clé Google (préfixe de 4 caractères suivi de 35 caractères)", () => {
    // Motif construit par morceaux pour que ce fichier ne se détecte pas lui-même.
    const prefix = ["A", "I", "z", "a"].join("");
    const pattern = new RegExp(prefix + "[0-9A-Za-z_\\-]{35}");
    const found = files.filter((path) => pattern.test(readFileSync(path, "utf8"))).map((path) => relative(ROOT, path));
    expect(found).toEqual([]);
  });

  it(".env.example contient les deux noms de variables, valeurs vides", () => {
    const lines = readFileSync(join(ROOT, ".env.example"), "utf8")
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("#"));
    expect(lines).toEqual(expect.arrayContaining(["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=", "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID="]));
    for (const line of lines) {
      expect(line).toMatch(/=$/);
    }
  });
});

describe("attribution native de Google jamais masquée", () => {
  it("aucun style ni composant ne cible les éléments d'attribution de la carte Google", () => {
    const sources = files.filter(
      (path) =>
        relative(ROOT, path).startsWith("src") && /\.(css|tsx?)$/.test(path) && !/\.test\.tsx?$/.test(path),
    );
    // Noms construits par morceaux pour que ce fichier ne se détecte pas lui-même.
    const targets = [["gm", "style"].join("-"), ["gm", "noprint"].join(""), ["google", "com/maps"].join(".")];
    const found = sources.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return targets.filter((target) => source.includes(target)).map((target) => `${relative(ROOT, path)} : ${target}`);
    });
    expect(found).toEqual([]);
  });
});
