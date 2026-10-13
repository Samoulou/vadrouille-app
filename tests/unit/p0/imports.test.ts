// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { IMPORTS_DOMAINE, sourcesDomaine } from "../lint/domaine-cas-communs";

/**
 * `p0: aucun client réel ni accès réseau dans le code de P0a1` — liste d'autorisation des imports (décision 0032,
 * A3.2), contrôlée sur l'arbre syntaxique de chaque fichier par l'API du compilateur TypeScript. Couvre `import`,
 * `import type`, `export … from`, `import x = require()`, et refuse les constructions listées par la spécification.
 *
 * Fichiers : les six dossiers de P0a1 ne contiennent que des `.ts`, `scripts/p0/enregistrer.mjs` et des JSON de
 * données (liste fermée, hors `package.json`, `tsconfig*.json` et `jsconfig*.json`) ; tout autre fichier fait échouer
 * le test. Chaque test de P0 (`*.test.ts` de ces dossiers et de `tests/unit/p0/`) commence par
 * `// @vitest-environment node` : jamais `jsdom`, où `window`, `document` ou `Image` existeraient.
 *
 * Les fichiers `*.test.ts` sont exclus, sauf pour la règle `node:net` et, dans `src/ai` et `src/research`, pour les
 * modules et constructions réseau (`fetch`, `getBuiltinModule`, `node:http`, `node:https`, `import.meta.glob`…). Les
 * clients simulés (`*.simule.ts`) ne le sont **pas** (écart plus strict de A3.2). Un fichier non test n'importe aucun
 * fichier de test, résolu ou non. `node:fs` et `node:fs/promises` sont réservés à `scripts/p0/fichiers.ts`.
 *
 * `process` suit une liste d'autorisation : refusé partout, sauf dans `scripts/p0/main.ts` pour `argv`, `exitCode`,
 * `stdout.write` et `stderr.write` en accès littéral. `import.meta` aussi : seuls `url`, `dirname` et `filename` en
 * accès littéral, et seulement dans `scripts/p0/fichiers.ts` et les fichiers de test ; `import.meta.env` est refusé
 * partout, tests de `src/ai` et `src/research` compris (correction 1 de #216). Les accès `x[expr]` non littéraux, les noms calculés en déstructuration (même
 * à travers `as`, `<T>`, `!`, `satisfies` ou des parenthèses) et le reste d'objet (`...r`) déstructuré sont refusés
 * partout (revue Sécurité de #180). Une clé littérale n'admet, en fait de symbole, que la liste fermée
 * `Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.toStringTag` et `Symbol.hasInstance` ; toute autre occurrence de
 * l'identifiant `Symbol` (redéclaré, réaffecté, en alias, `typeof Symbol`…) et `with` sont refusés.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const rel = (absolu: string) => path.relative(RACINE, absolu).split(path.sep).join("/");

function fichiers(dossier: string, extensions = [".ts", ".tsx"]): string[] {
  const absolu = path.join(RACINE, dossier);
  if (!existsSync(absolu)) return [];
  const resultat: string[] = [];
  for (const nom of readdirSync(absolu)) {
    const chemin = path.join(absolu, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(rel(chemin), extensions));
    else if (extensions.some((extension) => nom.endsWith(extension)) && !nom.endsWith(".d.ts")) resultat.push(rel(chemin));
  }
  return resultat.sort();
}

const estTest = (fichier: string) => /\.test\.tsx?$/.test(fichier);

// --- Résolution des spécificateurs --------------------------------------------------------------------------

type Cible = { type: "projet"; chemin: string } | { type: "externe"; nom: string };

function resoudreProjet(base: string): string | undefined {
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const absolu = path.join(RACINE, candidat);
    if (existsSync(absolu) && statSync(absolu).isFile()) return rel(absolu);
  }
  return undefined;
}

function resoudre(depuis: string, specificateur: string): Cible {
  if (specificateur.startsWith("@/")) {
    const chemin = resoudreProjet(path.posix.join("src", specificateur.slice(2)));
    return chemin ? { type: "projet", chemin } : { type: "externe", nom: specificateur };
  }
  if (specificateur.startsWith("./") || specificateur.startsWith("../")) {
    const chemin = resoudreProjet(path.posix.normalize(path.posix.join(path.posix.dirname(depuis), specificateur)));
    return chemin ? { type: "projet", chemin } : { type: "externe", nom: specificateur };
  }
  return { type: "externe", nom: specificateur };
}

// --- Analyse d'un fichier -----------------------------------------------------------------------------------

type Import = { specificateur: string; noeud: ts.Node; forme: string };

const IDENTIFIANTS_INTERDITS = new Set([
  "require",
  "createRequire",
  "eval",
  "fetch",
  "WebSocket",
  "XMLHttpRequest",
  "EventSource",
  "sendBeacon",
  "mainModule",
  "binding",
  "dlopen",
  "net",
  "undici",
  // Revue Sécurité de #180 (bloquant 1) : chargement d'un module intégré sans import (Node ≥ 22.3), accès à
  // l'objet global (et donc à `process`, `fetch`… sans les nommer), constructeur de code, réflexion, code
  // natif et fils d'exécution.
  "getBuiltinModule",
  "globalThis",
  "global",
  "Function",
  "Reflect",
  "WebAssembly",
  "Worker",
]);
const PROPRIETES_INTERDITES = new Set(["constructor", "connect", "createConnection"]);
// Revue Sécurité de #180 (bloquant 1, correction 2) : réflexion sur les prototypes et les descripteurs, qui
// permettrait d'atteindre `Function` ou une propriété de `process` sans les nommer.
for (const nom of [
  "getPrototypeOf",
  "setPrototypeOf",
  "getOwnPropertyDescriptor",
  "getOwnPropertyDescriptors",
  "getOwnPropertyNames",
  "getOwnPropertySymbols",
  "__proto__",
  "__lookupGetter__",
  "__lookupSetter__",
  "__defineGetter__",
  "__defineSetter__",
]) {
  IDENTIFIANTS_INTERDITS.add(nom);
}

/**
 * Liste d'autorisation de `process` (revue Sécurité de #180, bloquant 1) : l'identifiant est refusé partout, sauf
 * dans `scripts/p0/main.ts`, et seulement en accès littéral à `argv`, `exitCode`, `stdout.write` et `stderr.write`.
 */
const FICHIER_PROCESS = "scripts/p0/main.ts";
function processAutorise(fichier: string, noeud: ts.Identifier): boolean {
  if (fichier !== FICHIER_PROCESS) return false;
  const acces = noeud.parent;
  if (!ts.isPropertyAccessExpression(acces) || acces.expression !== noeud || acces.questionDotToken) return false;
  const nom = acces.name.text;
  if (nom === "argv" || nom === "exitCode") return true;
  if (nom !== "stdout" && nom !== "stderr") return false;
  const ecrire = acces.parent;
  return (
    ts.isPropertyAccessExpression(ecrire) &&
    ecrire.expression === acces &&
    ecrire.name.text === "write" &&
    !ecrire.questionDotToken &&
    ts.isCallExpression(ecrire.parent) &&
    ecrire.parent.expression === ecrire
  );
}

/**
 * Symboles bien connus admis comme clé (décision du CEO, 43e cycle, point 1) : liste fermée. `Symbol` lui-même ne
 * peut être ni redéclaré (variable, paramètre, import, classe, fonction…), ni réaffecté, ni nommé autrement que
 * dans `Symbol.<un de ces quatre>` : voir la construction « Symbol hors liste fermée » dans `analyser`.
 */
const SYMBOLES_BIEN_CONNUS = new Set(["iterator", "asyncIterator", "toStringTag", "hasInstance"]);

/** `Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.toStringTag` ou `Symbol.hasInstance`, en accès littéral. */
function symboleBienConnu(expression: ts.Node): expression is ts.PropertyAccessExpression {
  return (
    ts.isPropertyAccessExpression(expression) &&
    !expression.questionDotToken &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "Symbol" &&
    SYMBOLES_BIEN_CONNUS.has(expression.name.text)
  );
}

/** Clé d'accès admise : chaîne (littéral ou gabarit sans substitution), nombre, ou symbole de la liste fermée. */
function cleLitterale(expression: ts.Expression): boolean {
  return ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression) || symboleBienConnu(expression);
}

/**
 * Conversion de type sans effet à l'exécution : `x as T`, `<T>x`, `x!`, `x satisfies T`, `x<T>` (expression
 * d'instanciation) et parenthèses. Le compilateur les efface : `({ [k]: e } as any) = x` devient
 * `({ [k]: e } = x)`. Revue Sécurité du head 49837e5 de #180, bloquant 1 (ticket 195).
 */
function conversionEffacee(noeud: ts.Node): boolean {
  return (
    ts.isParenthesizedExpression(noeud) ||
    ts.isAsExpression(noeud) ||
    ts.isTypeAssertionExpression(noeud) ||
    ts.isNonNullExpression(noeud) ||
    ts.isSatisfiesExpression(noeud) ||
    ts.isExpressionWithTypeArguments(noeud)
  );
}

/**
 * Vrai si un littéral objet est la cible d'une affectation par déstructuration (`({ a, ...r } = x)`), y compris à
 * travers une conversion effacée (`({ [k]: e } as any) = x`, `({ [k]: e }!) = x`, `(<any>{ [k]: e }) = x`).
 */
function cibleDeDestructuration(noeud: ts.ObjectLiteralExpression): boolean {
  let enfant: ts.Node = noeud;
  let parent = noeud.parent;
  while (
    conversionEffacee(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isShorthandPropertyAssignment(parent) ||
    ts.isSpreadAssignment(parent) ||
    ts.isSpreadElement(parent) ||
    ts.isArrayLiteralExpression(parent) ||
    ts.isObjectLiteralExpression(parent)
  ) {
    if (ts.isPropertyAssignment(parent) && parent.name === enfant) return false;
    enfant = parent;
    parent = parent.parent;
  }
  if (ts.isBinaryExpression(parent)) return parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.left === enfant;
  if (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) return parent.initializer === enfant;
  return false;
}

/**
 * Propriétés de `import.meta` lisibles en accès littéral. `env` n'y figure pas : sous Vitest, `import.meta.env` expose
 * l'environnement du processus ; il est donc refusé partout, tests compris (revue de #216, bloquant 1).
 */
const PROPRIETES_IMPORT_META = new Set(["url", "dirname", "filename"]);
const IMPORT_META_HORS_LISTE = "import.meta hors liste fermée";

/**
 * Fichiers qui ont besoin de `import.meta.url`, `.dirname` ou `.filename` : `scripts/p0/fichiers.ts` (racine des
 * données) et les tests. Ailleurs, `new URL(…, import.meta.url)` pourrait être traité comme un asset par Vite
 * (revue de #216, mineur 1).
 */
const importMetaPermis = (fichier: string) => fichier === "scripts/p0/fichiers.ts" || estTest(fichier);

function importMetaAdmis(fichier: string, noeud: ts.MetaProperty): boolean {
  const acces = noeud.parent;
  return (
    importMetaPermis(fichier) &&
    noeud.name.text === "meta" &&
    ts.isPropertyAccessExpression(acces) &&
    acces.expression === noeud &&
    !acces.questionDotToken &&
    PROPRIETES_IMPORT_META.has(acces.name.text)
  );
}

function analyser(fichier: string, source: string): { imports: Import[]; constructions: string[] } {
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports: Import[] = [];
  const constructions: string[] = [];
  const visiter = (noeud: ts.Node) => {
    if (ts.isImportDeclaration(noeud) && ts.isStringLiteral(noeud.moduleSpecifier)) {
      imports.push({ specificateur: noeud.moduleSpecifier.text, noeud, forme: noeud.getText(sf) });
    } else if (ts.isExportDeclaration(noeud) && noeud.moduleSpecifier && ts.isStringLiteral(noeud.moduleSpecifier)) {
      imports.push({ specificateur: noeud.moduleSpecifier.text, noeud, forme: noeud.getText(sf) });
    } else if (ts.isImportEqualsDeclaration(noeud) && ts.isExternalModuleReference(noeud.moduleReference)) {
      const expression = noeud.moduleReference.expression;
      imports.push({ specificateur: ts.isStringLiteral(expression) ? expression.text : "?", noeud, forme: noeud.getText(sf) });
    } else if (ts.isImportTypeNode(noeud)) {
      const argument = noeud.argument;
      const texte = ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal) ? argument.literal.text : "?";
      imports.push({ specificateur: texte, noeud, forme: noeud.getText(sf) });
    }
    if (ts.isCallExpression(noeud) && noeud.expression.kind === ts.SyntaxKind.ImportKeyword) constructions.push("import() dynamique");
    if (ts.isNewExpression(noeud) && ts.isIdentifier(noeud.expression) && noeud.expression.text === "Function") constructions.push("new Function");
    if (ts.isCallExpression(noeud) && ts.isIdentifier(noeud.expression) && noeud.expression.text === "Function") constructions.push("Function()");
    // `process` : liste d'autorisation (voir `processAutorise`). Couvre aussi les alias (`const p = process`), la
    // déstructuration, `{ ...process }`, `Object.entries(process)`, `for (k in process)`, `process.report`…
    if (ts.isIdentifier(noeud) && noeud.text === "process" && !processAutorise(fichier, noeud)) {
      constructions.push(`process hors liste d'autorisation : ${noeud.parent.getText(sf).slice(0, 60)}`);
    }
    if (ts.isBindingElement(noeud)) {
      const propriete = noeud.propertyName ?? noeud.name;
      // `const { env } = process`, `const { env: e } = p`, `const { constructor: C } = f`.
      if (ts.isIdentifier(propriete) || ts.isStringLiteralLike(propriete)) {
        if (propriete.text === "env") constructions.push("{ env } déstructuré");
        if (PROPRIETES_INTERDITES.has(propriete.text) || IDENTIFIANTS_INTERDITS.has(propriete.text)) constructions.push(`{ ${propriete.text} } déstructuré`);
      }
      // `const { ...r } = x` : le reste d'un objet emporte des propriétés que le contrôle ne voit pas.
      if (noeud.dotDotDotToken && ts.isObjectBindingPattern(noeud.parent)) constructions.push("...reste d'objet déstructuré");
    }
    // Nom de propriété calculé : refusé en déstructuration (`const { [k]: e } = x`, `({ [k]: e } = x)`) et dans les
    // classes. Admis seulement pour **créer** un littéral objet (`{ [cle]: valeur }` n'atteint aucune propriété
    // existante) et, avec une clé littérale ou un symbole de la liste fermée, pour nommer une méthode
    // (`[Symbol.asyncIterator]()`) ou un membre d'interface ou de type littéral (`[Symbol.iterator](): …`,
    // `readonly [Symbol.toStringTag]: string` ; effacés à la compilation, ticket 195, mineur 3). Une propriété de
    // classe (`PropertyDeclaration`) nommée par un symbole de la liste fermée (`[Symbol.toStringTag] = "X"`) reste
    // refusée : faux positif connu et sans risque, accepté pour ne pas élargir la règle (revue de #216, mineur 4).
    if (ts.isComputedPropertyName(noeud)) {
      const membre = noeud.parent;
      const creation =
        ts.isObjectLiteralElementLike(membre) &&
        !ts.isSpreadAssignment(membre) &&
        ts.isObjectLiteralExpression(membre.parent) &&
        !cibleDeDestructuration(membre.parent);
      const symbole =
        (ts.isMethodDeclaration(membre) || ts.isMethodSignature(membre) || ts.isPropertySignature(membre)) && cleLitterale(noeud.expression);
      if (!creation && !symbole) constructions.push("nom de propriété calculé");
    }
    if (ts.isObjectLiteralExpression(noeud) && cibleDeDestructuration(noeud)) {
      for (const propriete of noeud.properties) {
        if (ts.isSpreadAssignment(propriete)) constructions.push("...reste d'objet déstructuré");
        const nom = ts.isPropertyAssignment(propriete) || ts.isShorthandPropertyAssignment(propriete) ? propriete.name : undefined;
        // Mêmes noms que pour `BindingElement` (ticket 195, mineur 4) : `({ "__proto__": p } = f)` est refusé comme
        // `const { "__proto__": p } = f`.
        const interdit = (texte: string) => texte === "env" || PROPRIETES_INTERDITES.has(texte) || IDENTIFIANTS_INTERDITS.has(texte);
        if (nom && (ts.isIdentifier(nom) || ts.isStringLiteralLike(nom)) && interdit(nom.text)) {
          constructions.push(`{ ${nom.text} } déstructuré`);
        }
      }
    }
    // Décision du CEO, 43e cycle, point 1 : l'identifiant `Symbol` n'est admis que comme objet de
    // `Symbol.<symbole de la liste fermée>`. Toute autre occurrence est refusée : déclaration qui le masque
    // (`const Symbol = …`, paramètre, import, classe, fonction, `catch (Symbol)`), réaffectation, alias,
    // propriété hors liste (`Symbol.c`, `Symbol.e = "env"`). `with` est refusé : il masquerait `Symbol` sans le
    // déclarer.
    if (ts.isIdentifier(noeud) && noeud.text === "Symbol" && !(symboleBienConnu(noeud.parent) && noeud.parent.expression === noeud)) {
      constructions.push(`Symbol hors liste fermée : ${noeud.parent.getText(sf).slice(0, 60)}`);
    }
    if (ts.isWithStatement(noeud)) constructions.push("with");
    // `import.meta` : liste fermée (revue Sécurité du head 49837e5 de #180, bloquant 2 ; ticket 195 ; revue de #216).
    // Seuls `import.meta.url`, `.dirname` et `.filename` sont admis, et seulement dans `scripts/p0/fichiers.ts` et les
    // tests. Tout le reste est refusé, tests de `src/ai` et `src/research` compris : `import.meta.env` (environnement
    // du processus sous Vitest), `import.meta.glob(…)` et `import.meta.resolve(…)` (Vite et Vitest chargent des modules
    // hors de la liste d'autorisation des imports), `import.meta` seul, en alias, déstructuré, en accès calculé ou
    // optionnel.
    if (ts.isMetaProperty(noeud) && noeud.keywordToken === ts.SyntaxKind.ImportKeyword && !importMetaAdmis(fichier, noeud)) {
      constructions.push(IMPORT_META_HORS_LISTE);
    }
    if (ts.isIdentifier(noeud) && IDENTIFIANTS_INTERDITS.has(noeud.text)) constructions.push(noeud.text);
    if (ts.isPropertyAccessExpression(noeud)) {
      const nom = noeud.name.text;
      const objet = noeud.expression.getText(sf);
      if (PROPRIETES_INTERDITES.has(nom)) constructions.push(`.${nom}`);
      if (objet === "process" && nom === "env") constructions.push("process.env");
      else if (nom === "env" && objet !== "import.meta") constructions.push(".env (alias de process)");
      if (objet === "import.meta" && nom === "env") constructions.push("import.meta.env");
      if (objet === "module" && nom === "require") constructions.push("module.require");
    }
    if (ts.isElementAccessExpression(noeud)) {
      if (!cleLitterale(noeud.argumentExpression)) {
        // `x[expr]` : la propriété atteinte ne peut pas être contrôlée (`x["constr" + "uctor"]`, alias de `process`).
        constructions.push(`accès calculé : ${noeud.getText(sf).slice(0, 60)}`);
      } else if (ts.isStringLiteralLike(noeud.argumentExpression)) {
        const nom = noeud.argumentExpression.text;
        if (IDENTIFIANTS_INTERDITS.has(nom) || PROPRIETES_INTERDITES.has(nom) || nom === "env" || nom === "process") constructions.push(`["${nom}"]`);
      }
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(sf);
  return { imports, constructions };
}

// --- Liste d'autorisation (A3.2) ----------------------------------------------------------------------------

const FEUILLES_PROTOTYPE = ["brief", "config", "candidat", "ancrage", "programme-reduit"].map((nom) => `src/prototype/${nom}.ts`);
const proto = (...noms: string[]) => noms.map((nom) => `src/prototype/${nom}.ts`);
const sous = (dossier: string) => (chemin: string) => chemin.startsWith(`${dossier}/`);

type Regle = { projet: (chemin: string) => boolean; externes: readonly string[] };

const contrats = sous("src/contracts");
const FICHIER_FS = "scripts/p0/fichiers.ts";

function regleDe(fichier: string): Regle | undefined {
  if (FEUILLES_PROTOTYPE.includes(fichier)) return { projet: contrats, externes: ["zod"] };
  if (fichier === "src/prototype/reduction.ts") {
    return { projet: (c) => contrats(c) || proto("ancrage", "programme-reduit").includes(c), externes: ["zod"] };
  }
  // Décision 0045 § 1.2 et § 3 (amendement de 0032 A3.2) : `@/contracts`, `zod` et `src/domain` seulement ; plus
  // aucun `@/prototype/*`. Même liste que la règle ESLint « src/domain sans entrée-sortie » (cas communs).
  if (fichier.startsWith("src/domain/")) {
    return { projet: (c) => contrats(c) || sous("src/domain")(c), externes: ["zod"] };
  }
  if (fichier.startsWith("src/ai/")) {
    return { projet: (c) => contrats(c) || sous("src/ai")(c) || proto("brief", "config", "candidat").includes(c), externes: ["zod"] };
  }
  if (fichier.startsWith("src/research/")) {
    const externes = ["zod"];
    if (fichier === "src/research/ip-guard.ts") externes.push("node:net");
    if (fichier === "src/research/extract-text.ts") externes.push("parse5");
    return {
      projet: (c) =>
        contrats(c) ||
        sous("src/ai")(c) ||
        (sous("src/research")(c) && (c !== "src/research/ip-guard.ts" || fichier === "src/research/fetch-page.ts")) ||
        proto("brief", "config", "candidat").includes(c),
      externes,
    };
  }
  if (fichier.startsWith("src/grounding/")) {
    return {
      projet: (c) => contrats(c) || sous("src/grounding")(c) || proto("brief", "config", "candidat", "ancrage").includes(c),
      externes: ["zod"],
    };
  }
  if (fichier.startsWith("scripts/p0/") && fichier.endsWith(".ts")) {
    return {
      projet: (c) =>
        contrats(c) ||
        ["src/prototype", "src/domain", "src/ai", "src/research", "src/grounding", "scripts/p0"].some((d) => sous(d)(c)),
      // Revue Sécurité de #180, mineur 5 (décision du CEO, 43e cycle, point 4) : `node:fs` et `node:fs/promises`
      // réservés à `scripts/p0/fichiers.ts` (pas de `readFileSync("/proc/self/environ")` ailleurs, 0032 A3.2).
      externes: ["zod", "node:path", "node:util", ...(fichier === FICHIER_FS ? ["node:fs", "node:fs/promises"] : [])],
    };
  }
  return undefined;
}

/** Tests de src/ai et src/research : modules et constructions qui ouvriraient le réseau (revue Sécurité de #180, mineur 2). */
const MODULES_RESEAU_TESTS = ["http", "https", "http2", "tls", "dgram", "dns", "child_process", "worker_threads", "undici"];
const CONSTRUCTIONS_RESEAU_TESTS = new Set([
  "fetch",
  "getBuiltinModule",
  "WebSocket",
  "XMLHttpRequest",
  "EventSource",
  "sendBeacon",
  "require",
  "createRequire",
  "eval",
  "Worker",
  "WebAssembly",
  "new Function",
  "Function()",
  "import() dynamique",
  IMPORT_META_HORS_LISTE,
]);

/** Contrôle d'un fichier (chemin relatif au dépôt) : liste des violations, vide si le fichier est conforme. */
function controler(fichier: string, source: string): string[] {
  const { imports, constructions } = analyser(fichier, source);
  const violations: string[] = [];
  const test = estTest(fichier);

  // Règle node:net : appliquée à tous les fichiers, tests compris.
  for (const { specificateur, forme } of imports) {
    const nu = specificateur.replace(/^node:/, "");
    if (nu === "net" || nu.startsWith("net/")) {
      const permis = fichier === "src/research/ip-guard.ts" && forme === 'import { BlockList, isIP } from "node:net";';
      if (!permis) violations.push(`node:net refusé : ${forme}`);
    }
  }
  if (!test && fichier !== "src/research/ip-guard.ts" && constructions.includes("net")) violations.push("identifiant net refusé");
  if (test) {
    // Revue Sécurité de #180 (mineur 2) : les tests de src/ai et src/research n'ouvrent pas non plus le réseau.
    if (fichier.startsWith("src/ai/") || fichier.startsWith("src/research/")) {
      for (const { specificateur, forme } of imports) {
        const nu = specificateur.replace(/^node:/, "");
        if (MODULES_RESEAU_TESTS.some((module) => nu === module || nu.startsWith(`${module}/`))) violations.push(`module réseau refusé dans un test : ${forme}`);
      }
      for (const construction of constructions) {
        if (CONSTRUCTIONS_RESEAU_TESTS.has(construction)) violations.push(`construction refusée dans un test : ${construction}`);
      }
    }
    // ip-guard.ts n'est importé que par fetch-page.ts et par son propre test.
    for (const { specificateur } of imports) {
      const cible = resoudre(fichier, specificateur);
      if (cible.type === "projet" && cible.chemin === "src/research/ip-guard.ts" && fichier !== "src/research/ip-guard.test.ts") {
        violations.push("ip-guard.ts importé par un test autre que le sien");
      }
    }
    return violations;
  }

  const regle = regleDe(fichier);
  if (regle === undefined) return [`fichier hors de la liste : ${fichier}`];
  for (const { specificateur, forme } of imports) {
    const cible = resoudre(fichier, specificateur);
    // Décision du CEO, 43e cycle, point 2 : un fichier non test n'importe aucun fichier de test (exempté de la liste
    // d'autorisation), qu'il soit résolu ou non (`./helper.test`, `./helper.test.ts`, `@/ai/ai.test`).
    if ((cible.type === "projet" && estTest(cible.chemin)) || /\.test(\.[cm]?[jt]sx?)?$/.test(specificateur)) {
      violations.push(`import d'un fichier de test refusé : ${specificateur}`);
      continue;
    }
    if (cible.type === "projet") {
      if (!regle.projet(cible.chemin)) violations.push(`import refusé : ${cible.chemin}`);
    } else if (!regle.externes.includes(cible.nom)) {
      violations.push(`module refusé : ${cible.nom}`);
    } else if (cible.nom === "node:net" && forme !== 'import { BlockList, isIP } from "node:net";') {
      violations.push(`forme refusée : ${forme}`);
    }
  }
  for (const construction of constructions) if (construction !== "net") violations.push(`construction refusée : ${construction}`);
  return violations;
}

// --- Fichiers contrôlés -------------------------------------------------------------------------------------

const DOSSIERS_P0 = ["src/prototype", "src/domain", "src/ai", "src/research", "src/grounding", "scripts/p0"];

/** Tous les fichiers présents sous un dossier, quelle que soit l'extension (`.d.ts` compris). */
function tousLesFichiers(dossier: string): string[] {
  const absolu = path.join(RACINE, dossier);
  if (!existsSync(absolu)) return [];
  const resultat: string[] = [];
  for (const nom of readdirSync(absolu)) {
    const chemin = path.join(absolu, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...tousLesFichiers(rel(chemin)));
    else resultat.push(rel(chemin));
  }
  return resultat.sort();
}

/**
 * Décision du CEO, 43e cycle, point 3 : liste d'exceptions fermée des fichiers admis dans les six dossiers de P0a1.
 * `.ts` (contrôlés un par un), `scripts/p0/enregistrer.mjs` et les JSON de données (hors `package.json`,
 * `tsconfig*.json` et `jsconfig*.json`, qui changeraient la résolution ou le mode des modules). Tout autre fichier
 * (`.tsx`, `.jsx`, `.js`, `.mjs`, `.cts`, `.node`, `.wasm`…) fait échouer le test.
 */
function fichierAdmis(fichier: string): boolean {
  const nom = path.posix.basename(fichier);
  if (fichier.endsWith(".ts")) return true;
  if (fichier === "scripts/p0/enregistrer.mjs") return true;
  return nom.endsWith(".json") && nom !== "package.json" && !/^[tj]sconfig.*\.json$/.test(nom);
}

/** Tous les fichiers présents des six dossiers (sur-ensemble des fichiers suivis). */
const TOUS_FICHIERS_P0 = DOSSIERS_P0.flatMap(tousLesFichiers);
const FICHIERS_P0 = TOUS_FICHIERS_P0.filter((fichier) => fichier.endsWith(".ts"));
const SOURCES_P0 = FICHIERS_P0.filter((fichier) => !estTest(fichier));

/** Graphe des imports de projet d'un fichier, transitif. */
function graphe(depart: string): Set<string> {
  const vus = new Set<string>([depart]);
  const pile = [depart];
  while (pile.length > 0) {
    const courant = pile.pop() as string;
    const source = readFileSync(path.join(RACINE, courant), "utf8");
    for (const { specificateur } of analyser(courant, source).imports) {
      const cible = resoudre(courant, specificateur);
      const cle = cible.type === "projet" ? cible.chemin : `externe:${cible.nom}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (cible.type === "projet") pile.push(cible.chemin);
    }
  }
  return vus;
}

describe("p0: aucun client réel ni accès réseau dans le code de P0a1", () => {
  it("les dossiers de P0a1 ne contiennent que des fichiers .ts, enregistrer.mjs et des JSON de données", () => {
    expect(TOUS_FICHIERS_P0.filter((fichier) => !fichierAdmis(fichier))).toEqual([]);
    expect(TOUS_FICHIERS_P0).toContain("scripts/p0/enregistrer.mjs");
    expect(SOURCES_P0.length).toBeGreaterThan(30);
  });

  describe("test négatif : sélection des fichiers (décision du CEO, 43e cycle, point 3)", () => {
    const refuses = [
      "src/ai/evil.tsx",
      "src/research/x.jsx",
      "src/ai/x.js",
      "scripts/p0/autre.mjs",
      "src/domain/x.cjs",
      "src/grounding/x.mts",
      "src/prototype/x.cts",
      "src/research/x.node",
      "src/ai/x.wasm",
      "src/ai/package.json",
      "scripts/p0/tsconfig.json",
      "src/ai/enregistrer.mjs",
    ];
    for (const fichier of refuses) {
      it(`${fichier} est refusé`, () => {
        expect(fichierAdmis(fichier)).toBe(false);
      });
    }
    it(".ts, scripts/p0/enregistrer.mjs et un JSON de données sont admis", () => {
      expect(["src/ai/client.ts", "scripts/p0/enregistrer.mjs", "src/domain/tables.json"].every(fichierAdmis)).toBe(true);
    });
  });

  it("les tests de P0 tournent dans l'environnement Vitest node (ticket 195, mineur 5)", () => {
    const tests = [...FICHIERS_P0, ...fichiers("tests/unit/p0")].filter(estTest);
    expect(tests).toContain("tests/unit/p0/imports.test.ts");
    const horsNode = tests.filter((fichier) => readFileSync(path.join(RACINE, fichier), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)[0] !== "// @vitest-environment node");
    expect(horsNode).toEqual([]);
  });

  for (const fichier of FICHIERS_P0) {
    it(`liste d'autorisation des imports : ${fichier}`, () => {
      expect(controler(fichier, readFileSync(path.join(RACINE, fichier), "utf8"))).toEqual([]);
    });
  }

  it("aucun hôte réel ni module d'environnement de clé dans le code de P0a1", () => {
    for (const fichier of SOURCES_P0) {
      const source = readFileSync(path.join(RACINE, fichier), "utf8");
      expect(source, fichier).not.toMatch(/openrouter\.ai|googleapis\.com|@\/server\/env|OPENROUTER_API_KEY|GOOGLE_MAPS_SERVER_KEY/);
    }
  });

  it("node:net seulement dans ip-guard.ts, parse5 seulement dans extract-text.ts", () => {
    const parNet: string[] = [];
    const parParse5: string[] = [];
    for (const fichier of [...fichiers("src"), ...fichiers("scripts")]) {
      const { imports } = analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8"));
      for (const { specificateur } of imports) {
        if (/^(node:)?net(\/|$)/.test(specificateur)) parNet.push(fichier);
        if (specificateur === "parse5" || specificateur.startsWith("parse5/")) parParse5.push(fichier);
      }
    }
    expect([...new Set(parNet)]).toEqual(["src/research/ip-guard.ts"]);
    expect([...new Set(parParse5)]).toEqual(["src/research/extract-text.ts"]);
  });

  it("ip-guard.ts n'est importé que par fetch-page.ts (et son test)", () => {
    const importeurs = new Set<string>();
    for (const fichier of [...fichiers("src"), ...fichiers("scripts"), ...fichiers("tests")]) {
      for (const { specificateur } of analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8")).imports) {
        const cible = resoudre(fichier, specificateur);
        if (cible.type === "projet" && cible.chemin === "src/research/ip-guard.ts") importeurs.add(fichier);
      }
    }
    expect([...importeurs].sort()).toEqual(["src/research/fetch-page.ts", "src/research/ip-guard.test.ts"]);
  });

  describe("test négatif : le contrôle échoue sur un texte source interdit", () => {
    const cas: [string, string][] = [
      ["src/research/fetch-page.ts", 'import net from "node:net";'],
      ["src/research/fetch-page.ts", 'import { BlockList } from "@/research/ip-guard";\nnet.connect(443, "10.0.0.1");'],
      ["src/research/agent.ts", 'import * as net from "node:net";'],
      ["src/research/ip-guard.ts", 'import * as net from "node:net";'],
      ["src/research/ip-guard.ts", 'import net from "net";'],
      ["src/research/ip-guard.ts", 'import { BlockList, isIP, connect } from "node:net";'],
      ["src/research/ip-guard.ts", 'import { Socket } from "node:net/x";'],
      ["src/ai/client.ts", 'import { request } from "node:https";'],
      ["src/ai/client.ts", 'import { request } from "http";'],
      ["src/ai/client.ts", 'export { lookup } from "node:dns/promises";'],
      ["src/ai/client.ts", 'import cp = require("child_process");'],
      ["src/ai/client.ts", 'import type { Agent } from "undici";'],
      ["src/ai/client.ts", 'import { generateText } from "ai";'],
      ["src/ai/client.ts", 'const m = await import("node:vm");'],
      ["src/ai/client.ts", 'const m = require("node:tls");'],
      ["src/ai/client.ts", 'import { createRequire } from "node:module";'],
      ["src/ai/client.ts", "const f = eval('1');"],
      ["src/ai/client.ts", "const f = new Function('return 1');"],
      ["src/ai/client.ts", "const f = (() => {}).constructor;"],
      ["src/ai/client.ts", "process.binding('tcp_wrap');"],
      ["src/ai/client.ts", "process.dlopen(module, 'x');"],
      ["src/ai/client.ts", "const m = process.mainModule;"],
      ["src/ai/client.ts", "const m = module.require('x');"],
      ["src/ai/client.ts", "const k = process.env.OPENROUTER_API_KEY;"],
      ["src/ai/client.ts", 'const k = process["env"];'],
      ["src/ai/client.ts", "const k = import.meta.env.X;"],
      ["src/ai/client.ts", "await fetch('https://exemple.org');"],
      ["src/ai/client.ts", "await globalThis.fetch('https://exemple.org');"],
      ["src/ai/client.ts", 'await globalThis["fetch"]("https://exemple.org");'],
      ["src/ai/client.ts", "new WebSocket('wss://exemple.org');"],
      ["src/ai/client.ts", "new XMLHttpRequest();"],
      ["src/ai/client.ts", "new EventSource('https://exemple.org');"],
      ["src/ai/client.ts", "navigator.sendBeacon('https://exemple.org', '');"],
      // Revue Sécurité de #180, bloquant 1 : un cas négatif par construction.
      ["src/ai/client.ts", 'const https = process.getBuiltinModule("node:https");'],
      ["src/ai/client.ts", 'const https = process["getBuiltinModule"]("node:https");'],
      ["src/ai/client.ts", "const p = globalThis.process;"],
      ["src/ai/client.ts", "const p = global.process;"],
      ["src/ai/client.ts", "const f = Function('return process')();"],
      ["src/ai/client.ts", "const { env } = process;"],
      ["src/ai/client.ts", "const { env: e } = process;"],
      ["src/ai/client.ts", "const p = process;\nconst k = p.env.OPENROUTER_API_KEY;"],
      ["src/ai/client.ts", 'const c = "env";\nconst k = process[c];'],
      ["src/ai/client.ts", "const k = Reflect.get(process, 'env');"],
      ["src/ai/client.ts", "const m = await WebAssembly.instantiate(octets);"],
      ["src/ai/client.ts", "new Worker('data:text/javascript,1');"],
      ["scripts/p0/cli.ts", "const { env } = process;"],
      ["src/ai/requetes.ts", 'import { ancrer } from "@/grounding/ancrage";'],
      ["src/ai/requetes.ts", 'import type { Ancrage } from "@/prototype/ancrage";'],
      ["src/research/agent.ts", 'import { classer } from "@/domain/classement";'],
      ["src/research/agent.ts", 'import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";'],
      ["src/research/agent.ts", 'import { executer } from "../../scripts/p0/pipeline";'],
      ["src/prototype/brief.ts", 'import { CandidatSchema } from "@/prototype/candidat";'],
      ["src/prototype/programme-reduit.ts", 'import { valider } from "@/domain/validation";'],
      // Décision 0045 § 1 (« Ce que B5a doit tester ») : src/domain n'importe plus @/prototype/*.
      ["src/domain/x.ts", 'import type { Brief } from "@/prototype/brief";'],
      ["src/domain/x.ts", 'import { ConfigClassementSchema } from "@/prototype/config";'],
      ["src/grounding/ancrage.ts", 'import { lireTour } from "@/ai/sorties";'],
      ["src/research/ai.simule.ts", 'import { request } from "node:https";'],
      ["scripts/p0/cli.ts", 'import { spawn } from "node:child_process";'],
      ["scripts/p0/cli.ts", 'import { registerHooks } from "node:module";'],
      ["scripts/p0/cli.ts", "const cle = process.env.GOOGLE_MAPS_SERVER_KEY;"],
      ["src/research/fetch-page.test.ts", 'import net from "node:net";'],
      ["src/research/agent.test.ts", 'import { adresseAutorisee } from "@/research/ip-guard";'],
      // Revue Sécurité de #180, bloquant 1 (correction 2) : `process` en liste d'autorisation, accès calculés.
      ["src/ai/client.ts", 'const p = process;\np["getBuiltin" + "Module"]("node:https");'],
      ["scripts/p0/main.ts", 'const p = process;\np["getBuiltin" + "Module"]("node:https");'],
      ["scripts/p0/main.ts", "const p = process;"],
      ["src/ai/client.ts", 'const { ["getBuiltinModule"]: g } = process;'],
      ["src/ai/client.ts", 'const { ["env"]: e } = process;'],
      ["scripts/p0/main.ts", 'const { ["getBuiltinModule"]: g } = process;'],
      ["src/ai/client.ts", "const { [k]: e } = objet;"],
      ["src/ai/client.ts", "({ [k]: e } = objet);"],
      ["src/ai/client.ts", "const { ...r } = objet;"],
      ["src/ai/client.ts", "({ ...r } = objet);"],
      ["src/ai/client.ts", "for ({ ...r } of objets);"],
      ["src/ai/client.ts", "const { a: { [k]: e } } = objet;"],
      ["src/ai/client.ts", 'const d = Object.getOwnPropertyDescriptor(process, "env");'],
      ["scripts/p0/main.ts", 'const d = Object.getOwnPropertyDescriptor(process, "env");'],
      ["scripts/p0/main.ts", "const e = Object.entries(process);"],
      ["scripts/p0/main.ts", "const v = Object.values(process);"],
      ["scripts/p0/main.ts", "const c = { ...process };"],
      ["scripts/p0/main.ts", "const t = JSON.stringify(process);"],
      ["scripts/p0/main.ts", "for (const k in process) console.log(k);"],
      ["scripts/p0/main.ts", "const r = process.report.getReport();"],
      ["scripts/p0/main.ts", 'process.loadEnvFile(".env");'],
      ["scripts/p0/main.ts", 'process.execve("/bin/sh");'],
      ["scripts/p0/main.ts", 'const a = process["argv"];'],
      ["scripts/p0/main.ts", "const a = process?.argv;"],
      ["scripts/p0/main.ts", "const s = process.stdout;"],
      ["scripts/p0/main.ts", "const w = process.stdout.write;"],
      ["scripts/p0/main.ts", "const { argv } = process;"],
      ["scripts/p0/cli.ts", "const a = process.argv;"],
      ["src/research/agent.ts", "process.exitCode = 1;"],
      ["src/ai/client.ts", "const n = objet.process;"],
      ["src/ai/client.ts", 'const f = (() => {})["constr" + "uctor"];'],
      ["src/ai/client.ts", 'const c = "constructor";\nconst f = (() => {})[c];'],
      ["src/ai/client.ts", "const valeur = table[cle];"],
      ["src/ai/client.ts", "table[cle] = 1;"],
      ["src/ai/client.ts", 'const f = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(() => {}), "constructor");'],
      ["src/ai/client.ts", "const p = Object.getPrototypeOf(() => {});"],
      ["src/ai/client.ts", "const { constructor: C } = () => {};"],
      ["src/ai/client.ts", "({ constructor: C } = () => {});"],
      ["src/ai/client.ts", 'const p = objet["__proto__"];'],
      ["src/ai/client.ts", "class A { [cle]() {} }"],
      // Revue Sécurité de #180, mineur 2 : tests de src/ai et src/research.
      ["src/ai/client.test.ts", "await fetch('https://exemple.org');"],
      ["src/research/agent.test.ts", 'const https = process.getBuiltinModule("node:https");'],
      ["src/research/agent.test.ts", 'import { request } from "node:https";'],
      ["src/research/agent.test.ts", 'import { request } from "http";'],
      ["src/ai/client.test.ts", 'import { lookup } from "node:dns/promises";'],
      ["src/ai/client.test.ts", 'const m = await import("node:https");'],
      // Décision du CEO, 43e cycle, point 1 : `Symbol` masqué, réaffecté ou hors liste fermée (revue du head 2eecd59).
      ["src/ai/client.ts", 'const Symbol = { c: "constructor" };\nconst F = (() => {})[Symbol.c];'],
      ["src/ai/client.ts", 'Symbol.e = "env";\nconst e = objet[Symbol.e];'],
      ["src/ai/client.ts", "function f(Symbol: { k: string }) { return (() => {})[Symbol.k]; }"],
      ["scripts/p0/main.ts", "function f(Symbol: { k: string }) { return (() => {})[Symbol.k]; }"],
      ["src/ai/client.ts", 'const Symbol = { iterator: "constructor" };\nconst F = (() => {})[Symbol.iterator];'],
      ["src/ai/client.ts", 'const f = (Symbol: { iterator: string }) => (() => {})[Symbol.iterator];'],
      ["src/ai/client.ts", 'import { Symbol } from "@/ai/sorties";\nconst F = (() => {})[Symbol.iterator];'],
      ["src/ai/client.ts", 'class Symbol { static iterator = "constructor"; }\nconst F = (() => {})[Symbol.iterator];'],
      ["src/ai/client.ts", "function Symbol() {}\nconst F = (() => {})[Symbol.iterator];"],
      ["src/ai/client.ts", 'try {} catch (Symbol) {}\nconst F = (() => {})[Symbol.iterator];'],
      ["src/ai/client.ts", 'Symbol = { iterator: "constructor" };\nconst F = (() => {})[Symbol.iterator];'],
      ["src/ai/client.ts", "const S = Symbol;\nconst F = (() => {})[S.iterator];"],
      ["src/ai/client.ts", "const F = (() => {})[Symbol?.iterator];"],
      ["src/ai/client.ts", "const F = (() => {})[Symbol.for('x')];"],
      ["src/ai/client.ts", 'with (o) { const F = (() => {})[Symbol.iterator]; }'],
      // Décision du CEO, 43e cycle, point 2 : un fichier non test n'importe pas un fichier de test.
      ["src/domain/relais.ts", 'import { go } from "./moteur.test";'],
      ["src/domain/relais.ts", 'import { go } from "./helper.test";'],
      ["src/domain/relais.ts", 'export * from "./moteur.test.ts";'],
      ["scripts/p0/main.ts", 'import { go } from "@/ai/ai.test";'],
      ["src/ai/client.ts", 'import type { T } from "./ai.test";'],
      // Décision du CEO, 43e cycle, point 4 (mineur 5) : node:fs réservé à scripts/p0/fichiers.ts.
      ["scripts/p0/main.ts", 'import { readFileSync } from "node:fs";'],
      ["scripts/p0/main.ts", 'export { readFileSync } from "node:fs";'],
      ["scripts/p0/cli.ts", 'import { readFile } from "node:fs/promises";'],
      ["scripts/p0/pipeline.ts", 'import fs = require("node:fs");'],
      ["scripts/p0/main.ts", 'import { readFileSync } from "fs";'],
    ];
    for (const [fichier, source] of cas) {
      it(`${fichier} : ${source.split("\n").at(-1)}`, () => {
        expect(controler(fichier, source).length).toBeGreaterThan(0);
      });
    }

    // Ticket 195 (revue Sécurité du head 49837e5 de #180) : pour chaque cas, la règle attendue figure parmi les
    // violations (`some(includes)`, pas une égalité : un cas peut aussi déclencher d'autres règles, revue de #216,
    // mineur 3). Le titre reprend la source entière pour rester unique.
    const casNommes: [string, string, string][] = [
      // Bloquant 1 : déstructuration à travers une conversion effacée.
      ["src/ai/client.ts", "({ [k]: e } as any) = x;", "nom de propriété calculé"],
      ["src/ai/client.ts", "({ [k]: e }!) = x;", "nom de propriété calculé"],
      ["src/ai/client.ts", "({ [k]: e } satisfies any) = x;", "nom de propriété calculé"],
      ["src/ai/client.ts", "(<any>{ [k]: e }) = x;", "nom de propriété calculé"],
      ["src/ai/client.ts", "({ [k]: e }<any>) = x;", "nom de propriété calculé"],
      ["src/ai/client.ts", "((({ [k]: e }))) = x;", "nom de propriété calculé"],
      ["src/ai/client.ts", "[({ [k]: e } as any)] = x;", "nom de propriété calculé"],
      ["src/ai/client.ts", "({ a: ({ [k]: e } as any) } = x);", "nom de propriété calculé"],
      ["src/ai/client.ts", "for (({ [k]: e } as any) of xs);", "nom de propriété calculé"],
      ["scripts/p0/main.ts", "({ [k]: e } as unknown as object) = x;", "nom de propriété calculé"],
      ["src/ai/client.ts", "({ ...r } as any) = x;", "...reste d'objet déstructuré"],
      ["src/ai/client.ts", "({ constructor: C }!) = () => {};", "{ constructor } déstructuré"],
      ["src/ai/client.ts", "({ env: e } satisfies object) = objet;", "{ env } déstructuré"],
      // Bloquant 2 : import.meta hors de url, dirname, filename.
      ["src/ai/client.ts", "const m = import.meta.glob('../server/*.ts', { eager: true });", IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", "const m = import.meta.glob('/etc/*', { query: '?raw', eager: true });", IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", "const u = import.meta.resolve('node:https');", IMPORT_META_HORS_LISTE],
      ["scripts/p0/main.ts", "const m = import.meta.glob('./*.ts');", IMPORT_META_HORS_LISTE],
      ["scripts/p0/fichiers.ts", "const u = import.meta.resolve('node:https');", IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", 'const m = import.meta["glob"]("./*.ts");', IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", 'const m = import.meta["url"];', IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", "const u = import.meta?.url;", IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", "const m = import.meta;\nconst g = m.glob('./*.ts');", IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", "const { glob } = import.meta;", IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", "const { url } = import.meta;", IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", "const h = import.meta.hot;", IMPORT_META_HORS_LISTE],
      ["src/ai/client.ts", "const k = import.meta.env.X;", IMPORT_META_HORS_LISTE],
      // Correction 1 de #216, bloquant 1 : import.meta.env refusé aussi dans les tests de src/ai et src/research.
      ["src/ai/client.test.ts", "const k = import.meta.env.X;", IMPORT_META_HORS_LISTE],
      ["src/research/agent.test.ts", "const { OPENROUTER_API_KEY } = import.meta.env;", IMPORT_META_HORS_LISTE],
      ["scripts/p0/fichiers.ts", "const k = import.meta.env.X;", IMPORT_META_HORS_LISTE],
      // Correction 1 de #216, mineur 1 : import.meta.url, dirname et filename réservés à fichiers.ts et aux tests.
      ["src/ai/client.ts", 'const r = new URL("../", import.meta.url);', IMPORT_META_HORS_LISTE],
      ["src/research/agent.ts", "const d = import.meta.dirname;", IMPORT_META_HORS_LISTE],
      ["scripts/p0/main.ts", "const f = import.meta.filename;", IMPORT_META_HORS_LISTE],
      ["src/ai/client.test.ts", "const m = import.meta.glob('../server/*.ts', { eager: true });", IMPORT_META_HORS_LISTE],
      ["src/research/agent.test.ts", "const u = import.meta.resolve('node:https');", IMPORT_META_HORS_LISTE],
      // Mineur 3 : un nom calculé non littéral reste refusé dans une interface ou un type littéral.
      ["src/ai/client.ts", "interface I { [cle](): void }", "nom de propriété calculé"],
      ["src/ai/client.ts", "type T = { [cle]: string };", "nom de propriété calculé"],
      ["src/ai/client.ts", "interface I { [Symbol.for('x')]: string }", "Symbol hors liste fermée"],
      // Mineur 4 : l'affectation par déstructuration refuse les mêmes noms que `BindingElement`.
      ["src/ai/client.ts", "({ '__proto__': p } = f);", "{ __proto__ } déstructuré"],
      ["src/ai/client.ts", '({ "getPrototypeOf": g } = Object);', "{ getPrototypeOf } déstructuré"],
      ["src/ai/client.ts", "({ 'fetch': f } = objet);", "{ fetch } déstructuré"],
      // Mineur 7 : `{ Symbol }` et `typeof Symbol`.
      ["src/ai/client.ts", "const { Symbol } = objet;\nconst F = (() => {})[Symbol.iterator];", "Symbol hors liste fermée"],
      ["src/ai/client.ts", "({ Symbol } = objet);\nconst F = (() => {})[Symbol.iterator];", "Symbol hors liste fermée"],
      ["src/ai/client.ts", "const o = { Symbol };", "Symbol hors liste fermée"],
      ["src/ai/client.ts", "const t = typeof Symbol;", "Symbol hors liste fermée"],
      ["src/ai/client.ts", "type S = typeof Symbol;", "Symbol hors liste fermée"],
    ];
    for (const [fichier, source, attendu] of casNommes) {
      it(`${fichier} : ${source.replaceAll("\n", " ⏎ ")} (règle : ${attendu})`, () => {
        expect(controler(fichier, source).some((violation) => violation.includes(attendu))).toBe(true);
      });
    }

    it("la forme exacte de ip-guard.ts passe", () => {
      expect(controler("src/research/ip-guard.ts", 'import { BlockList, isIP } from "node:net";')).toEqual([]);
    });

    it("scripts/p0/main.ts : argv, exitCode, stdout.write et stderr.write en accès littéral passent", () => {
      const source = 'process.exitCode = 1;\nconst a = process.argv.slice(2);\nprocess.stdout.write("x");\nprocess.stderr.write("y");';
      expect(controler("scripts/p0/main.ts", source)).toEqual([]);
    });

    it("accès littéral, symbole bien connu et création d'un littéral objet à clé calculée passent", () => {
      const source = 'const a = t[0];\nconst b = t["cle"];\nconst i = s[Symbol.asyncIterator]();\nconst o = { [cle]: 1 };';
      expect(controler("src/ai/client.ts", source)).toEqual([]);
    });

    it("les quatre symboles de la liste fermée passent, en accès et en nom de méthode", () => {
      const source =
        "const a = s[Symbol.iterator]();\nconst b = s[Symbol.asyncIterator]();\nconst c = s[Symbol.toStringTag];\nconst d = C[Symbol.hasInstance](x);\n" +
        "const o = { async *[Symbol.asyncIterator]() {}, *[Symbol.iterator]() {} };";
      expect(controler("src/ai/client.ts", source)).toEqual([]);
    });

    it("import.meta.url, import.meta.dirname et import.meta.filename passent dans fichiers.ts et les tests (ticket 195, revue de la PR 216)", () => {
      const source = 'const r = new URL("../", import.meta.url);\nconst d = import.meta.dirname;\nconst f = import.meta.filename;';
      expect(controler("scripts/p0/fichiers.ts", source)).toEqual([]);
      expect(controler("src/ai/client.test.ts", source)).toEqual([]);
      expect(controler("src/research/agent.test.ts", source)).toEqual([]);
    });

    it("une conversion de type hors déstructuration reste admise (ticket 195)", () => {
      const source = "const o = { [cle]: 1 } as const;\nconst p = <object>{ [cle]: 2 };\nconst q = ({ [cle]: 3 })!;\nconst r = { [cle]: 4 } satisfies object;\nx = ({ [cle]: 5 } as object);";
      expect(controler("src/ai/client.ts", source)).toEqual([]);
    });

    it("interface et type littéral nommés par un symbole de la liste fermée passent (ticket 195, mineur 3)", () => {
      const source =
        "interface I { [Symbol.asyncIterator](): AsyncIterator<string>; readonly [Symbol.toStringTag]: string }\n" +
        "type T = { [Symbol.iterator](): Iterator<number>; [Symbol.hasInstance]: (x: unknown) => boolean };";
      expect(controler("src/ai/client.ts", source)).toEqual([]);
    });

    it("src/domain : cas communs avec la règle ESLint « src/domain sans entrée-sortie » (décision 0045 § 3.2)", () => {
      for (const { specificateur, admis } of IMPORTS_DOMAINE) {
        for (const source of sourcesDomaine(specificateur)) {
          expect(controler("src/domain/exemple.ts", source).length === 0, `${specificateur} : ${source}`).toBe(admis);
        }
      }
    });

    it("scripts/p0/fichiers.ts peut importer node:fs et node:fs/promises", () => {
      const source = 'import { readFileSync } from "node:fs";\nimport { readFile } from "node:fs/promises";';
      expect(controler("scripts/p0/fichiers.ts", source)).toEqual([]);
    });
  });
});

describe("p0: graphes d'import (décision 0032, A3.2)", () => {
  it("depuis src/ai et src/research, aucun chemin n'atteint src/prototype/ancrage.ts ni src/grounding", () => {
    for (const fichier of SOURCES_P0.filter((f) => f.startsWith("src/ai/") || f.startsWith("src/research/"))) {
      const atteints = [...graphe(fichier)];
      const interdits = atteints.filter(
        (chemin) =>
          chemin === "src/prototype/ancrage.ts" ||
          chemin === "src/prototype/reduction.ts" ||
          chemin === "src/prototype/programme-reduit.ts" ||
          chemin.startsWith("src/grounding/") ||
          chemin.startsWith("src/domain/") ||
          chemin.startsWith("scripts/"),
      );
      expect(interdits, fichier).toEqual([]);
    }
  });

  it("le graphe de programme-reduit.ts ne contient que lui-même, src/contracts et zod", () => {
    const atteints = [...graphe("src/prototype/programme-reduit.ts")];
    for (const chemin of atteints) {
      expect(chemin === "src/prototype/programme-reduit.ts" || chemin.startsWith("src/contracts/") || chemin === "externe:zod", chemin).toBe(true);
    }
  });

  // Décision 0045 § 6 (B5-TL-6) : R3 a une seule définition, importable par le serveur en B11.
  it("le graphe de src/domain/verrous.ts ne contient que lui-même, src/contracts et zod", () => {
    const atteints = [...graphe("src/domain/verrous.ts")];
    expect(atteints).toContain("src/domain/verrous.ts");
    for (const chemin of atteints) {
      expect(chemin === "src/domain/verrous.ts" || chemin.startsWith("src/contracts/") || chemin === "externe:zod", chemin).toBe(true);
    }
  });

  it("le graphe de l'application n'importe ni @/ai, @/research, @/grounding, @/domain ni scripts/ ; de src/prototype, seulement programme-reduit", () => {
    const application = fichiers("src").filter((fichier) => !DOSSIERS_P0.some((d) => fichier.startsWith(`${d}/`)) && !fichier.startsWith("src/contracts/"));
    const configs = ["next.config.ts"].filter((fichier) => existsSync(path.join(RACINE, fichier)));
    for (const fichier of [...application.filter((f) => !estTest(f)), ...configs]) {
      for (const chemin of graphe(fichier)) {
        const interdit =
          ["src/ai/", "src/research/", "src/grounding/", "src/domain/", "scripts/"].some((d) => chemin.startsWith(d)) ||
          (chemin.startsWith("src/prototype/") && chemin !== "src/prototype/programme-reduit.ts");
        expect(interdit, `${fichier} → ${chemin}`).toBe(false);
      }
    }
  });
});
