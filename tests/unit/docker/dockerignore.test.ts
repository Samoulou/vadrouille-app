// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Revue de la PR 563, bloquant 1 (décision 0105 § 2) : le balayage couvre tout `src/` hors tests ; tout spécificateur
 * **littéral** (import statique ou `import()`), JSON ou module, qui aboutit à un fichier exclu du contexte est refusé.
 *
 * Contexte de construction de l'image (décision 0002 ; 0032 § A4.4 ; 0063 point 11) : `.dockerignore` lu et appliqué
 * selon les règles de Docker (motifs relatifs à la racine, `*` sans `/`, un dossier exclu exclut son contenu, la
 * dernière règle qui correspond l'emporte, `!` ré-inclut). Docker ne tourne pas en CI unitaire : ce test garantit que
 * chaque JSON importé par `src/workflows/` est dans le contexte, et que rien d'autre de `prototype/` n'y entre.
 */

const RACINE = process.cwd();
const regles = readFileSync(path.join(RACINE, ".dockerignore"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l !== "" && !l.startsWith("#"))
  .map((l) => ({ inverse: l.startsWith("!"), motif: l.replace(/^!/, "").replace(/\/$/, "") }));

const versRegex = (motif: string) =>
  new RegExp(`^${motif.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*")}$`);

/** Vrai si le fichier (chemin relatif, séparateurs `/`) est exclu du contexte. */
function exclu(fichier: string): boolean {
  const segments = fichier.split("/");
  let resultat = false;
  for (const { inverse, motif } of regles) {
    const re = versRegex(motif);
    // Un motif correspond au fichier ou à l'un de ses dossiers parents.
    const correspond = segments.some((_, i) => re.test(segments.slice(0, i + 1).join("/")));
    if (correspond) resultat = !inverse;
  }
  return resultat;
}

function fichiers(dossier: string): string[] {
  return readdirSync(path.join(RACINE, dossier)).flatMap((nom) => {
    const relatif = `${dossier}/${nom}`;
    return statSync(path.join(RACINE, relatif)).isDirectory() ? fichiers(relatif) : [relatif];
  });
}

const importsJson = fichiers("src/workflows")
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .flatMap((f) =>
    [...readFileSync(path.join(RACINE, f), "utf8").matchAll(/from "(\.[^"]+\.json)"/g)].map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1] ?? ""))),
  );

/** Spécificateurs littéraux relatifs d'un source (statiques, `export … from`, `import()` et `require`). */
function specificateurs(source: string): string[] {
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...sansCommentaires.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'`]([^"'`]+)["'`]/g)].map((m) => m[1] ?? "");
}

/** Fichiers exclus du contexte atteints par un spécificateur littéral (relatif ou alias `@/`, qui désigne `src/`). */
function importsExclus(fichier: string, source: string): string[] {
  return specificateurs(source).flatMap((spec) => {
    const cible = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(fichier), spec)) : null;
    if (cible === null) return [];
    const candidats = /\.json$/.test(cible) ? [cible] : [`${cible}.ts`, `${cible}.tsx`, `${cible}/index.ts`];
    return candidats.every((c) => exclu(c)) && /^prototype\/|^docs\/|^tests\//.test(cible) ? [cible] : [];
  });
}

describe("contexte de l'image : aucun module de production n'atteint un fichier exclu (0105 § 2)", () => {
  const sourcesProduction = fichiers("src").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));

  it("tout src/ hors tests : les seuls littéraux vers prototype/ sont les JSON ré-inclus nommément", () => {
    expect(sourcesProduction.length).toBeGreaterThan(100);
    const exclus = sourcesProduction.flatMap((f) => importsExclus(f, readFileSync(path.join(RACINE, f), "utf8")).map((cible) => `${f} -> ${cible}`));
    expect(exclus).toEqual([]);
  });

  it("contrôle : un fichier fictif qui importe une fixture d'Édimbourg (statique ou import()) est refusé", () => {
    const fictif = 'import a from "../../../prototype/fixtures/modeles/edimbourg.json";\nconst b = await import("../../../prototype/fixtures/pages/edimbourg.json");';
    expect(importsExclus("src/server/composition/fictif.ts", fictif)).toEqual(["prototype/fixtures/modeles/edimbourg.json", "prototype/fixtures/pages/edimbourg.json"]);
  });

  it("contrôle : les imports ré-inclus nommément restent admis", () => {
    expect(importsExclus("src/workflows/fictif.ts", 'import b from "../../prototype/briefs/edimbourg-1.json";')).toEqual([]);
  });

  it("generation.ts n'importe rien de prototype/ ; le module de fixtures lit les fichiers à l'exécution", () => {
    const generation = readFileSync(path.join(RACINE, "src/server/composition/generation.ts"), "utf8");
    expect(specificateurs(generation).filter((s) => s.includes("prototype/"))).toEqual([]);
    expect(specificateurs(generation).filter((s) => s.includes("fixtures-simulees"))).toEqual(["@/server/composition/fixtures-simulees"]);
    expect(/import\s*\(/.test(generation.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))).toBe(true);
    // Le module de fixtures n'est importé statiquement par aucun module de production.
    const statiques = sourcesProduction.filter((f) => /^\s*(import|export)\b[^;]*from\s*["'][^"']*fixtures-simulees["']/m.test(readFileSync(path.join(RACINE, f), "utf8")));
    expect(statiques).toEqual([]);
  });
});

describe("contexte de l'image : prototype/ exclu sauf ce que lit p0Run (0032 § A4.4, 0063)", () => {
  it("chaque JSON importé par src/workflows/ est dans le contexte", () => {
    expect(importsJson.length).toBeGreaterThanOrEqual(9);
    expect(importsJson).toContain("prototype/config/classement.json");
    expect(importsJson.filter(exclu)).toEqual([]);
  });

  it("tout autre fichier de prototype/ reste exclu (programmes de test, fixtures, sorties, autres configurations)", () => {
    const admis = fichiers("prototype").filter((f) => !exclu(f));
    expect(admis.sort()).toEqual([...new Set(importsJson)].sort());
    expect(exclu("prototype/config/plafonds.json")).toBe(true);
    expect(exclu("prototype/programmes-test/x.json")).toBe(true);
    expect(exclu("prototype/sorties/x.json")).toBe(true);
  });

  it("le lecteur de règles suit Docker sur des cas connus du dépôt", () => {
    expect(exclu("docs/design-system/tokens.json")).toBe(false);
    expect(exclu("docs/CONTEXT.md")).toBe(true);
    expect(exclu("src/workflows/p0-run.ts")).toBe(false);
    expect(exclu("node_modules/x/index.js")).toBe(true);
  });
});
