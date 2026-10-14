// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
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

describe("contexte de l'image : prototype/ exclu sauf ce que lit p0Run (0032 § A4.4, 0063)", () => {
  it("chaque JSON importé par src/workflows/ est dans le contexte", () => {
    expect(importsJson.length).toBeGreaterThanOrEqual(8);
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
