// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { RACINE, rel, resoudre } from "../p0/resolution";

/**
 * `coordonnées: écrites par un seul module, en paramètres liés` (décision 0060 § 1.4 et § 4, B8c ; spécification B8,
 * critère du même nom) : règles d'import et de nommage du cache de positions, contrôlées sur l'arbre syntaxique de chaque
 * fichier par l'API du compilateur TypeScript (`import`, `import type`, `export … from`, `import x = require()`,
 * `import()` et `vi.mock()` à spécificateur littéral).
 *
 * Mise en œuvre choisie par B8c (0060 § 1.4, « au choix de B8c ») : un test du dépôt plutôt que des blocs
 * `no-restricted-imports` dans `eslint.config.mjs`. En configuration plate, le dernier bloc qui règle cette règle pour un
 * fichier remplace les précédents : un bloc de plus pour `src/app`, `src/features`, `src/components`, `src/adapters`…
 * effacerait leurs restrictions existantes, ou serait effacé par elles. Le test couvre tous les fichiers, tests compris.
 *
 * 1. `@/server/positions/cache-positions` : importé seulement par `src/server/voyages/**`, `src/server/relecture/**`,
 *    `src/workflows/**` et les tests ; jamais par `src/grounding` (le port y est injecté par la composition).
 * 2. `@/server/positions/lecture` : importé seulement par `cache-positions.ts`, `src/server/voyages/**` et les tests.
 * 3. `@/grounding/port-positions` : `import type` seulement, hors de `src/grounding`.
 * 4. La chaîne `store_place_coordinates` n'apparaît, dans `src/`, `scripts/`, `eslint-rules/` et `.github/`, que dans
 *    `cache-positions.ts` (hors de `db/`, `tests/db/` et `tests/support/`, que ces règles ne lisent pas) ; la chaîne
 *    `purge_expired_coordinates` n'apparaît dans aucun fichier de `src/`.
 * 5. Aucun littéral de chaîne d'un fichier de `src/` autre que `lecture.ts` ne contient `\bplace_coordinates\b` (nom de
 *    la table ; `store_place_coordinates` n'y répond pas ; les commentaires ne comptent pas). Les fichiers de test et
 *    l'exception nommée `TABLE_NOMMEE_PERMISE` (lecture du prototype, P0r4) n'y sont pas soumis.
 * 6. La chaîne `as PositionGoogleFraiche` n'apparaît dans aucun fichier de `src/` autre que le module de conversion des
 *    fiches (`src/grounding/fiches.ts`, B8b, `ASSERTION_PERMISE`), où elle n'apparaît qu'une fois.
 */

const CACHE = "src/server/positions/cache-positions.ts";
const LECTURE = "src/server/positions/lecture.ts";
const PORT = "src/grounding/port-positions.ts";
/** Module de conversion des fiches Place Details (0060 § 1.1) : `positionsFraiches` (B8b, 0100 § 3.2 point 4). */
const ASSERTION_PERMISE: readonly string[] = ["src/grounding/fiches.ts"];
/**
 * Exception nommée à la règle 5, hors de 0060 § 1.4 (signalée au Tech Lead dans la PR de B8c) : lecture des positions
 * d'`org_prototype` sous `vadrouille_prototype` (P0r4, ticket 414 ; décision 0079), fusionnée avant B8c. Ce n'est pas
 * la lecture du MVP (0077 § 4 : « aucune reprise n'est exigée entre les deux ») ; elle disparaît avec la phase 0.
 */
const TABLE_NOMMEE_PERMISE: readonly string[] = ["src/adapters/prototype-lecture.ts"];

const EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const IGNORES = new Set(["node_modules", ".next", ".git", "coverage", "playwright-report", "test-results"]);

function fichiers(dossier: string, filtre: (nom: string) => boolean = (nom) => EXTENSIONS.test(nom)): string[] {
  const absolu = path.join(RACINE, dossier);
  if (!existsSync(absolu)) return [];
  const resultat: string[] = [];
  for (const nom of readdirSync(absolu)) {
    if (IGNORES.has(nom)) continue;
    const chemin = path.join(absolu, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(rel(chemin), filtre));
    else if (filtre(nom)) resultat.push(rel(chemin));
  }
  return resultat.sort();
}

const estTest = (fichier: string) => fichier.startsWith("tests/") || /\.test\.(ts|tsx|mts)$/.test(fichier);

type Import = { cible: string; typeSeul: boolean };

/** Imports d'un fichier, résolus vers un chemin du dépôt quand c'en est un. */
function imports(fichier: string, texte: string): Import[] {
  const source = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const resultat: Import[] = [];
  const ajouter = (specificateur: string, typeSeul: boolean) => {
    const cible = resoudre(fichier, specificateur);
    resultat.push({ cible: cible.type === "projet" ? cible.chemin : cible.nom, typeSeul });
  };
  const visiter = (noeud: ts.Node) => {
    if (ts.isImportDeclaration(noeud) && ts.isStringLiteral(noeud.moduleSpecifier)) {
      const clause = noeud.importClause;
      const nommes = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : undefined;
      const typeSeul =
        clause !== undefined &&
        (clause.isTypeOnly || (clause.name === undefined && nommes !== undefined && nommes.length > 0 && nommes.every((e) => e.isTypeOnly)));
      ajouter(noeud.moduleSpecifier.text, typeSeul);
    } else if (ts.isExportDeclaration(noeud) && noeud.moduleSpecifier && ts.isStringLiteral(noeud.moduleSpecifier)) {
      const nommes = noeud.exportClause && ts.isNamedExports(noeud.exportClause) ? noeud.exportClause.elements : undefined;
      ajouter(noeud.moduleSpecifier.text, noeud.isTypeOnly || (nommes !== undefined && nommes.length > 0 && nommes.every((e) => e.isTypeOnly)));
    } else if (
      ts.isImportEqualsDeclaration(noeud) &&
      ts.isExternalModuleReference(noeud.moduleReference) &&
      ts.isStringLiteral(noeud.moduleReference.expression)
    ) {
      ajouter(noeud.moduleReference.expression.text, noeud.isTypeOnly);
    } else if (ts.isCallExpression(noeud) && noeud.arguments[0] !== undefined && ts.isStringLiteralLike(noeud.arguments[0])) {
      const premier = noeud.arguments[0];
      const appel = noeud.expression;
      const estImport = appel.kind === ts.SyntaxKind.ImportKeyword;
      const estRequire = ts.isIdentifier(appel) && appel.text === "require";
      const estMock = ts.isPropertyAccessExpression(appel) && ts.isIdentifier(appel.expression) && appel.expression.text === "vi" && /^(mock|doMock|importActual|importMock)$/.test(appel.name.text);
      if (estImport || estRequire || estMock) ajouter(premier.text, false);
    } else if (ts.isImportTypeNode(noeud) && ts.isLiteralTypeNode(noeud.argument) && ts.isStringLiteral(noeud.argument.literal)) {
      ajouter(noeud.argument.literal.text, true);
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(source);
  return resultat;
}

/** Textes des littéraux de chaîne d'un fichier (commentaires exclus). */
function litteraux(fichier: string, texte: string): string[] {
  const source = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const resultat: string[] = [];
  const visiter = (noeud: ts.Node) => {
    if (ts.isStringLiteralLike(noeud) || ts.isTemplateHead(noeud) || ts.isTemplateMiddle(noeud) || ts.isTemplateTail(noeud)) resultat.push(noeud.text);
    else if (ts.isJsxText(noeud)) resultat.push(noeud.text);
    ts.forEachChild(noeud, visiter);
  };
  visiter(source);
  return resultat;
}

/** Écarts aux règles 1 à 3 pour un fichier. */
function ecartsImports(fichier: string, texte: string): string[] {
  const ecarts: string[] = [];
  for (const { cible, typeSeul } of imports(fichier, texte)) {
    if (cible === CACHE && !(estTest(fichier) || /^src\/(server\/voyages|server\/relecture|workflows)\//.test(fichier))) {
      ecarts.push(`${fichier} importe cache-positions`);
    }
    if (cible === LECTURE && !(estTest(fichier) || fichier === CACHE || fichier.startsWith("src/server/voyages/"))) {
      ecarts.push(`${fichier} importe lecture`);
    }
    if (cible === PORT && !fichier.startsWith("src/grounding/") && !typeSeul) {
      ecarts.push(`${fichier} importe port-positions hors import type`);
    }
  }
  return ecarts;
}

/** Écarts aux règles 4 à 6 pour un fichier de `src/`, `scripts/`, `eslint-rules/` ou `.github/`. */
function ecartsNoms(fichier: string, texte: string): string[] {
  const ecarts: string[] = [];
  if (texte.includes("store_place_coordinates") && fichier !== CACHE) ecarts.push(`${fichier} nomme store_place_coordinates`);
  if (!fichier.startsWith("src/")) return ecarts;
  if (texte.includes("purge_expired_coordinates")) ecarts.push(`${fichier} nomme purge_expired_coordinates`);
  if (/as\s+PositionGoogleFraiche\b/.test(texte) && !ASSERTION_PERMISE.includes(fichier)) ecarts.push(`${fichier} affirme PositionGoogleFraiche`);
  const soumis = EXTENSIONS.test(fichier) && fichier !== LECTURE && !estTest(fichier) && !TABLE_NOMMEE_PERMISE.includes(fichier);
  if (soumis && litteraux(fichier, texte).some((t) => /\bplace_coordinates\b/.test(t))) {
    ecarts.push(`${fichier} nomme la table place_coordinates dans un littéral`);
  }
  return ecarts;
}

const lire = (fichier: string) => readFileSync(path.join(RACINE, fichier), "utf8");

describe("coordonnées: écrites par un seul module, en paramètres liés (règles du dépôt, 0060 § 1.4)", () => {
  it("les trois modules existent ; port-positions ne déclare que des types", () => {
    for (const f of [CACHE, LECTURE, PORT]) expect(existsSync(path.join(RACINE, f)), f).toBe(true);
    const port = ts.createSourceFile(PORT, lire(PORT), ts.ScriptTarget.Latest, true);
    const genres = port.statements.map((s) =>
      ts.isImportDeclaration(s) ? "import" : ts.isTypeAliasDeclaration(s) ? "type" : ts.isVariableStatement(s) ? "variable" : "autre",
    );
    expect(genres).toEqual(["import", "import", "variable", "type", "type", "type", "type"]);
    const marque = port.statements[2];
    expect(marque && ts.isVariableStatement(marque) ? marque.modifiers?.map((m) => m.kind) : undefined).toEqual([ts.SyntaxKind.DeclareKeyword]);
    // Seuls les types sont exportés ; la marque ne l'est pas.
    const exportes = port.statements.filter((s) => ts.canHaveModifiers(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    expect(exportes.every((s) => ts.isTypeAliasDeclaration(s))).toBe(true);
    expect(imports(PORT, lire(PORT)).map((i) => i.cible)).toEqual(["server-only", "src/grounding/interfaces.ts"]);
    expect(imports(PORT, lire(PORT))[1]?.typeSeul).toBe(true);
  });

  it("règles 1 à 3 : imports de cache-positions, lecture et port-positions, sur tout le dépôt (tests compris)", () => {
    const ecarts = ["src", "tests", "scripts", "eslint-rules", "db", "prototype"].flatMap((d) => fichiers(d)).flatMap((f) => ecartsImports(f, lire(f)));
    expect(ecarts).toEqual([]);
  });

  it("règles 4 à 6 : noms des fonctions de la base, de la table et assertion de la marque", () => {
    const tout = () => true;
    const ecarts = [...fichiers("src", tout), ...fichiers("scripts", tout), ...fichiers("eslint-rules", tout), ...fichiers(".github", tout)].flatMap((f) =>
      ecartsNoms(f, lire(f)),
    );
    expect(ecarts).toEqual([]);
    expect(lire(CACHE)).toContain("store_place_coordinates");
  });

  it("règle 6 : le module de conversion des fiches affirme PositionGoogleFraiche une fois, et lui seul (B8b)", () => {
    expect(ASSERTION_PERMISE).toEqual(["src/grounding/fiches.ts"]);
    const texte = lire("src/grounding/fiches.ts");
    expect(texte.match(/as\s+PositionGoogleFraiche\b/g)).toHaveLength(1);
    expect(ecartsNoms("src/grounding/fiches.ts", texte)).toEqual([]);
    expect(ecartsNoms("src/server/relecture/source.ts", "const p = position as PositionGoogleFraiche;")).toEqual(["src/server/relecture/source.ts affirme PositionGoogleFraiche"]);
  });

  it("cas éprouvés : chaque règle signale son écart et laisse passer le cas permis", () => {
    const imp = (fichier: string, texte: string) => ecartsImports(fichier, texte).length;
    expect(imp("src/grounding/carte.ts", 'import { creerPortPositions } from "@/server/positions/cache-positions";')).toBe(1);
    expect(imp("src/app/page.tsx", 'export { creerPortPositions } from "@/server/positions/cache-positions";')).toBe(1);
    expect(imp("src/adapters/api.ts", 'const m = await import("@/server/positions/cache-positions");')).toBe(1);
    expect(imp("src/server/usage/x.ts", 'import type { PortPositions } from "../positions/cache-positions";')).toBe(1);
    expect(imp("src/server/voyages/carte.ts", 'import { creerPortPositions } from "@/server/positions/cache-positions";')).toBe(0);
    expect(imp("src/workflows/generation.ts", 'import { creerPortPositions } from "@/server/positions/cache-positions";')).toBe(0);
    expect(imp("src/server/relecture/recomposer.ts", 'import { lirePositions } from "@/server/positions/lecture";')).toBe(1);
    expect(imp("src/server/voyages/carte.ts", 'import { lirePositions } from "@/server/positions/lecture";')).toBe(0);
    expect(imp("src/server/relecture/recomposer.ts", 'import { type PortPositions } from "@/grounding/port-positions";')).toBe(0);
    expect(imp("src/server/relecture/recomposer.ts", 'import type { PortPositions } from "@/grounding/port-positions";')).toBe(0);
    expect(imp("src/server/relecture/recomposer.ts", 'import { PortPositions } from "@/grounding/port-positions";')).toBe(1);
    expect(imp("src/server/relecture/recomposer.ts", 'import * as port from "@/grounding/port-positions";')).toBe(1);
    expect(imp("src/server/relecture/recomposer.ts", 'import "@/grounding/port-positions";')).toBe(1);
    expect(imp("src/grounding/carte.ts", 'import { PortPositions } from "./port-positions";')).toBe(0);
    expect(imp("tests/unit/x.test.ts", 'vi.mock("@/server/positions/lecture");')).toBe(0);
    expect(imp("src/app/x.ts", 'vi.mock("@/server/positions/lecture");')).toBe(1);

    const noms = (fichier: string, texte: string) => ecartsNoms(fichier, texte).length;
    expect(noms("src/server/voyages/carte.ts", 'const SQL = "SELECT public.store_place_coordinates($1, $2, $3)";')).toBe(1);
    expect(noms("scripts/outil.mjs", "// store_place_coordinates")).toBe(1);
    expect(noms("src/server/voyages/carte.ts", "// purge_expired_coordinates")).toBe(1);
    expect(noms("src/server/voyages/carte.ts", 'const SQL = "SELECT lat FROM public.place_coordinates";')).toBe(1);
    expect(noms("src/server/voyages/carte.ts", "const SQL = `SELECT lat FROM ${schema}.place_coordinates`;")).toBe(1);
    expect(noms("src/server/voyages/carte.ts", "// lit place_coordinates par lecture.ts")).toBe(0);
    expect(noms(LECTURE, 'const SQL = "SELECT lat FROM public.place_coordinates";')).toBe(0);
    expect(noms("src/server/voyages/carte.test.ts", 'const SQL = "SELECT lat FROM public.place_coordinates";')).toBe(0);
    expect(noms("src/grounding/zone.ts", "const p = position as PositionGoogleFraiche;")).toBe(1);
    expect(noms("src/grounding/zone.ts", "const p = position as  PositionGoogleFraiche;")).toBe(1);
  });
});

/**
 * Ticket 1013 (M6a ; décision 0157 § 1.4 point 8) : `src/server/voyages/carte-partagee.ts` n'a qu'un importateur hors
 * des tests, `src/server/partage/vue.ts`. Tant que Samuel n'a pas répondu à Q814 (S7), la vue partagée est livrée sans
 * carte : le module n'importe rien de `src/server` (ni `@/server/positions/lecture`, ni `@/server/with-system-org`), et
 * ne nomme ni `lirePositions` ni `withSystemOrg`.
 */
const CARTE_PARTAGEE = "src/server/voyages/carte-partagee.ts";
const VUE_PARTAGEE = "src/server/partage/vue.ts";

describe("carte de la vue partagée : un seul importateur, aucune position lue (0157 § 1.4 point 8, ticket 1013)", () => {
  it("seul src/server/partage/vue.ts importe carte-partagee.ts hors des tests", () => {
    const importateurs = ["src", "scripts", "eslint-rules", "db", "prototype"]
      .flatMap((d) => fichiers(d))
      .filter((f) => !estTest(f) && imports(f, lire(f)).some((i) => i.cible === CARTE_PARTAGEE));
    expect(importateurs).toEqual([VUE_PARTAGEE]);
  });

  it("carte-partagee.ts n'importe rien de src/server et ne lit aucune position", () => {
    const texte = lire(CARTE_PARTAGEE);
    const cibles = imports(CARTE_PARTAGEE, texte).map((i) => i.cible);
    expect(cibles.filter((c) => c.startsWith("src/server/"))).toEqual([]);
    expect(cibles).not.toContain(LECTURE);
    expect(cibles).not.toContain("src/server/with-system-org.ts");
    // Code sans les commentaires (le commentaire de tête explique ce qui n'est pas fait).
    const code = ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile(CARTE_PARTAGEE, texte, ts.ScriptTarget.Latest, true));
    expect(code).not.toMatch(/place_coordinates|lirePositions|withSystemOrg/);
  });
});
