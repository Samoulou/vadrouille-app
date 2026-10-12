// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `p0: enregistrer.mjs est figé` (décision 0032, A3.4). Changer le fichier oblige à changer l'empreinte ci-dessous,
 * ce qui se voit dans la PR et demande une nouvelle revue Sécurité.
 */

const EMPREINTE_SHA256 = "5b500e1cb37b683237893dace043e170f3edbbc987d58f78514d164e3c05194f";

const lire = (chemin: string) => readFileSync(new URL(`../../../${chemin}`, import.meta.url), "utf8");
const source = lire("scripts/p0/enregistrer.mjs");

describe("p0: enregistrer.mjs est figé", () => {
  it("empreinte SHA-256 inchangée", () => {
    expect(createHash("sha256").update(source).digest("hex")).toBe(EMPREINTE_SHA256);
  });

  it("forme imposée : un seul import, un seul appel registerHooks({ resolve }), aucun load", () => {
    const sf = ts.createSourceFile("enregistrer.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const imports = sf.statements.filter(ts.isImportDeclaration);
    expect(imports.map((noeud) => noeud.getText(sf))).toEqual(['import { registerHooks } from "node:module";']);
    expect(sf.statements.filter((noeud) => ts.isExportDeclaration(noeud) || ts.isExportAssignment(noeud))).toHaveLength(0);

    const appels: ts.CallExpression[] = [];
    const identifiants = new Set<string>();
    const visiter = (noeud: ts.Node) => {
      if (ts.isCallExpression(noeud)) {
        appels.push(noeud);
        expect(noeud.expression.kind, "import() dynamique").not.toBe(ts.SyntaxKind.ImportKeyword);
      }
      if (ts.isIdentifier(noeud)) identifiants.add(noeud.text);
      ts.forEachChild(noeud, visiter);
    };
    visiter(sf);

    const enregistrements = appels.filter((appel) => ts.isIdentifier(appel.expression) && appel.expression.text === "registerHooks");
    expect(enregistrements).toHaveLength(1);
    const argument = enregistrements[0]?.arguments[0];
    expect(argument !== undefined && ts.isObjectLiteralExpression(argument)).toBe(true);
    const proprietes = (argument as ts.ObjectLiteralExpression).properties.map((p) => p.name?.getText(sf));
    expect(proprietes).toEqual(["resolve"]);
    // L'appel est au niveau supérieur du module.
    expect(sf.statements.some((s) => ts.isExpressionStatement(s) && s.expression === enregistrements[0])).toBe(true);

    for (const interdit of ["load", "initialize", "register", "process", "fetch", "require", "createRequire", "globalThis", "Buffer", "eval"]) {
      expect(identifiants.has(interdit), interdit).toBe(false);
    }
  });

  it("aucun autre programme ne charge enregistrer.mjs (package.json, next.config.ts, vitest.config.mts)", () => {
    const paquet = JSON.parse(lire("package.json")) as { scripts: Record<string, string> };
    const scripts = Object.entries(paquet.scripts).filter(([, commande]) => /enregistrer|--import|--loader|--experimental-loader/.test(commande));
    expect(scripts).toEqual([["p0", "node --import ./scripts/p0/enregistrer.mjs scripts/p0/main.ts"]]);
    expect(JSON.stringify(paquet)).not.toMatch(/NODE_OPTIONS/);
    for (const fichier of ["next.config.ts", "vitest.config.mts"]) {
      expect(lire(fichier), fichier).not.toMatch(/enregistrer|registerHooks|scripts\/p0/);
    }
  });
});
