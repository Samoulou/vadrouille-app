// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { IMPORTS_DOMAINE, sourcesDomaine } from "../lint/domaine-cas-communs";
import { RACINE, rel, resoudre, type Cible } from "./resolution";

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

// --- Résolution des spécificateurs : module d'appui partagé (`./resolution`, P0r3c-3 ; 0055 § 3 point 2) -------------

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
  // P0r1 (spécification de P0r1, « Lecture des pages », proxy) : agents de proxy et répartiteur global d'`undici`.
  "EnvHttpProxyAgent",
  "ProxyAgent",
  "setGlobalDispatcher",
  "getGlobalDispatcher",
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

/**
 * P0r1, exceptions nominatives (0031 § 5 ; spécification de P0r1, « Règles d'import ») : le `fetch` global n'est
 * admis que dans les trois clients à `fetch`, et seulement comme valeur par défaut du paramètre `transport` de leur
 * fabrique exportée, plus, dans `openrouter-client.ts`, comme nom de l'option `fetch: enveloppe` de l'appel
 * `createOpenRouter({ … })`. Toute autre occurrence reste refusée, dans ces fichiers comme ailleurs.
 */
const FABRIQUES_A_FETCH = new Map([
  ["src/ai/openrouter-client.ts", "createOpenRouterClient"],
  ["src/grounding/places-client.ts", "createPlacesClient"],
  ["src/grounding/routes-client.ts", "createRoutesClient"],
]);

function fetchAdmis(fichier: string, noeud: ts.Identifier): boolean {
  const fabrique = FABRIQUES_A_FETCH.get(fichier);
  if (fabrique === undefined || noeud.text !== "fetch") return false;
  const parent = noeud.parent;
  if (ts.isParameter(parent) && parent.initializer === noeud) {
    const fonction = parent.parent;
    return (
      ts.isIdentifier(parent.name) &&
      parent.name.text === "transport" &&
      ts.isFunctionDeclaration(fonction) &&
      fonction.name?.text === fabrique &&
      (ts.getCombinedModifierFlags(fonction) & ts.ModifierFlags.Export) !== 0
    );
  }
  if (fichier !== "src/ai/openrouter-client.ts" || !ts.isPropertyAssignment(parent) || parent.name !== noeud) return false;
  const objet = parent.parent;
  const appel = objet.parent;
  return (
    ts.isIdentifier(parent.initializer) &&
    parent.initializer.text === "enveloppe" &&
    ts.isObjectLiteralExpression(objet) &&
    ts.isCallExpression(appel) &&
    appel.arguments[0] === objet &&
    ts.isIdentifier(appel.expression) &&
    appel.expression.text === "createOpenRouter"
  );
}

/**
 * B8c (ticket 438, décision 0060 § 1.1) : type du port du cache de positions, déclarations de type seules. Sa marque
 * nominale est une propriété de type littéral nommée par un `unique symbol` ambiant (`declare const marqueFiche`), forme
 * fixée par 0060 : admise dans ce seul fichier, pour ce seul nom, sur une signature de propriété (effacée à la
 * compilation). Hors de `src/grounding`, il ne s'importe qu'en `import type` (`tests/unit/lint/positions-imports.test.ts`) :
 * l'arête de l'application vers lui est admise (`areteAdmise`), et le parcours ne descend pas au-delà.
 */
const PORT_POSITIONS = "src/grounding/port-positions.ts";

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
      const marquePort =
        fichier === PORT_POSITIONS && ts.isPropertySignature(membre) && ts.isIdentifier(noeud.expression) && noeud.expression.text === "marqueFiche";
      if (!creation && !symbole && !marquePort) constructions.push("nom de propriété calculé");
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
    if (ts.isIdentifier(noeud) && IDENTIFIANTS_INTERDITS.has(noeud.text) && !fetchAdmis(fichier, noeud)) constructions.push(noeud.text);
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

/**
 * P0r3c-5a (ticket 349, amendement de 0063 ; réponse 2 du Tech Lead à la revue de #348) : assemblage du programme et
 * adaptateur du moteur, sortis de `scripts/p0` pour que `p0Run` les atteigne sans importer `scripts/`. Ils gardent la
 * liste d'autorisation de A3.2 (contrôlés avec les fichiers de P0) et n'importent de `src/prototype` que le programme
 * réduit (admis partout) et, **en `import type` seulement**, les trois feuilles ci-dessous (contrats et `zod` seulement).
 */
const MODULES_SERVEUR_P0: readonly string[] = ["src/server/p0/assemblage.ts", "src/server/p0/vers-moteur.ts", "src/server/p0/vers-couche-ia.ts"];
const TYPES_PROTOTYPE_SERVEUR_P0: readonly string[] = proto("ancrage", "brief", "candidat");

/**
 * Décision 0136 § 1.5 (M1a-1) : code partagé de la chaîne inversée que `pnpm p0` charge sous Node nu, parce que
 * `assemblage.ts`, `vers-couche-ia.ts` et `vers-moteur.ts` le réexportent. Contrôlé par la liste d'autorisation de A3.2
 * comme les fichiers de P0 ; `@/contracts`, `src/domain` et les autres fichiers de cette liste seulement, aucun module
 * externe (ni `src/prototype`, ni `src/server/p0`). `brief.ts`, `sites.ts` et `apercu.ts` du même dossier ne sont chargés
 * que sous Next.js.
 */
const MODULES_PROGRAMME_P0: readonly string[] = [
  "src/server/programme/forme.ts",
  "src/server/programme/entree.ts",
  "src/server/programme/assemblage.ts",
  // M4b (décision 0149 § 6) : importé par `assemblage.ts` pour le second contrôle du cadrage.
  "src/server/programme/cadrage.ts",
];

type Regle = { projet: (chemin: string) => boolean; externes: readonly string[]; formes?: ReadonlyMap<string, string> };

const contrats = sous("src/contracts");
const FICHIER_FS = "scripts/p0/fichiers.ts";

/**
 * P0r1 : exceptions nominatives à la liste d'autorisation (0031 § 5 ; spécification de P0r1, « Règles d'import »),
 * fichier par fichier, avec la **forme exacte** de chaque import externe. `server-only` (marqueur sans capacité,
 * exigé par `ligne/require-server-only` pour tout nouveau fichier de ces dossiers) est admis sous la seule forme
 * `import "server-only";` dans les nouveaux fichiers non test de P0r1.
 */
const SERVER_ONLY = 'import "server-only";';
const EXCEPTIONS_P0R1 = new Map<string, { externes: ReadonlyMap<string, string>; projet: readonly string[] }>([
  [
    "src/ai/openrouter-client.ts",
    {
      externes: new Map([
        ["server-only", SERVER_ONLY],
        ["ai", 'import { generateText } from "ai";'],
        ["@openrouter/ai-sdk-provider", 'import { createOpenRouter } from "@openrouter/ai-sdk-provider";'],
      ]),
      // B7a (décision 0077 § 3 point 1) : `CODE_CLE_ABSENTE` vient de `src/ai/erreurs.ts` (règle de base de `src/ai`) ;
      // l'import de `src/server/env/egress.ts` disparaît, et ce module sort de la liste.
      projet: ["src/server/env/ai.ts", "src/server/usage/port.ts"],
    },
  ],
  [
    "src/grounding/places-client.ts",
    { externes: new Map([["server-only", SERVER_ONLY]]), projet: ["src/server/env/grounding.ts", "src/server/usage/port.ts"] },
  ],
  [
    "src/grounding/routes-client.ts",
    { externes: new Map([["server-only", SERVER_ONLY]]), projet: ["src/server/env/grounding.ts", "src/server/usage/port.ts"] },
  ],
  ["src/grounding/enveloppe-google.ts", { externes: new Map([["server-only", SERVER_ONLY]]), projet: ["src/server/env/egress.ts"] }],
  // P0r3c-2 (ticket 316, décision 0055, section 6) : modules purs de `p0Run` (ancrage, fiches, budgets Routes, zone),
  // marqueur `server-only` seul, aucun import de projet hors des règles de base.
  ...["ancrage-zone", "budget-routes", "fiches-finales", "zone"].map(
    (nom) => [`src/grounding/${nom}.ts`, { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }] as const,
  ),
  // P0r3c-3 (ticket 316, décision 0055, sections 3 et 7) : prompt et client réel de recherche web, rédaction des raisons ;
  // marqueur `server-only`. B7a (décision 0077 § 1 point 4) : l'interface de recherche web est déplacée dans
  // `src/ai/recherche-web.ts` ; l'exception de `src/research/recherche-web.ts` du client réel est retirée.
  // Décision 0116 § 2 (lot 1 du programme par l'IA) : rédaction du programme, même régime que `rediger-raisons`.
  // Décision 0126 (lot 4 du bout en bout) : entrée et rédaction de la révision, même régime.
  ...["entree-revision", "noter-candidats", "prompts/recherche-web", "rediger-programme", "rediger-raisons", "rediger-revision", "recherche-web-reelle"].map(
    (nom) => [`src/ai/${nom}.ts`, { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }] as const,
  ),
  // B7a (ticket 423, décision 0077 § 1 et § 2) : nouveaux modules de la couche IA non chargés par `pnpm p0`, marqueur
  // `server-only` seul ; imports de projet par les règles de base (`src/contracts`, `src/ai`, et `src/ai` pour
  // `src/research`).
  ...["complement-p0", "couche", "entrees", "natures"].map((nom) => [`src/ai/${nom}.ts`, { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }] as const),
  ["src/research/bornes.ts", { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }],
  // B7b (ticket 524, décision 0096 § 2 et § 5) : traces, candidats maison et recherche de production, non chargés par
  // `pnpm p0`, marqueur `server-only` seul ; imports de projet par les règles de base.
  ...["src/ai/traces.ts", "src/research/candidat-trouve.ts", "src/research/recherche.ts"].map((fichier) => [fichier, { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }] as const),
  // B8a (ticket 462, décision 0085 § 1) : modules de production de `src/grounding`, non chargés par `pnpm p0` ; marqueur
  // `server-only` seul, imports de projet par les règles de base (`src/contracts`, `src/grounding`).
  ...["ancrage-production", "fiches", "resultat", "trajets"].map(
    (nom) => [`src/grounding/${nom}.ts`, { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }] as const,
  ),
  // B8c (ticket 438, décision 0060 § 1.1) : type du port du cache de positions, non chargé par `pnpm p0` ; marqueur
  // `server-only` seul, `@/grounding/interfaces` par les règles de base.
  [PORT_POSITIONS, { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }],
  // P0r3c-4 (ticket 316, décision 0055, section 6 point 5 ; 0063) : plafonds de l'agent du mode réel (recherches web,
  // pages lues), marqueur `server-only` seul ; types de `src/research` par les règles de base.
  ["src/research/plafonds-agent.ts", { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }],
  // B7c (ticket 449 ; spécification B7, B7c point 4) : harnais du jeu d'évaluation `evals/`, non chargé par `pnpm p0` ;
  // marqueur `server-only` seul, imports de projet par les règles de base (`src/contracts`, `src/ai`, `src/research`).
  ["src/research/evaluation.ts", { externes: new Map([["server-only", SERVER_ONLY]]), projet: [] }],
  [
    "src/research/undici-transport.ts",
    {
      externes: new Map([
        ["server-only", SERVER_ONLY],
        ["undici", 'import { Agent } from "undici";'],
        ["node:dns/promises", 'import { lookup as resoudreDns } from "node:dns/promises";'],
      ]),
      projet: ["src/server/env/egress.ts"],
    },
  ],
]);

function regleDe(fichier: string): Regle | undefined {
  const regle = regleDeBase(fichier);
  const exception = EXCEPTIONS_P0R1.get(fichier);
  if (regle === undefined || exception === undefined) return regle;
  return {
    projet: (c) => regle.projet(c) || exception.projet.includes(c),
    externes: [...regle.externes, ...exception.externes.keys()],
    formes: exception.externes,
  };
}

function regleDeBase(fichier: string): Regle | undefined {
  if (MODULES_PROGRAMME_P0.includes(fichier)) {
    // Décision 0136 § 1.5 (b) : `@/contracts`, `src/domain` et les autres fichiers de `MODULES_PROGRAMME_P0` ; aucun module
    // externe (ni `src/prototype`, ni `src/server/p0`).
    return { projet: (c) => contrats(c) || sous("src/domain")(c) || (MODULES_PROGRAMME_P0.includes(c) && c !== fichier), externes: [] };
  }
  if (MODULES_SERVEUR_P0.includes(fichier)) {
    // Décision 0136 § 1.5 : `assemblage.ts`, `vers-couche-ia.ts` et `vers-moteur.ts` réexportent
    // `@/server/programme/{forme,entree,assemblage}` (code déplacé, aucune capacité nouvelle). L'arête de l'assemblage
    // vers `vers-moteur.ts` (revue 1 de #632, `rythmeVersPace`) est retirée : la fonction est dans `src/server/programme`.
    return {
      projet: (c) =>
        contrats(c) || sous("src/domain")(c) || [...TYPES_PROTOTYPE_SERVEUR_P0, "src/prototype/programme-reduit.ts", ...MODULES_PROGRAMME_P0].includes(c),
      externes: [],
    };
  }
  if (FEUILLES_PROTOTYPE.includes(fichier)) return { projet: contrats, externes: ["zod"] };
  if (fichier === "src/prototype/reduction.ts") {
    return { projet: (c) => contrats(c) || proto("ancrage", "programme-reduit").includes(c), externes: ["zod"] };
  }
  // P0r2 (ticket 284 ; décision 0046, D14 et D17) : codes d'arrêt (module pur, sans import) et découpage du programme
  // réduit pour les tables du schéma `prototype` (programme réduit seulement).
  if (fichier === "src/prototype/arret.ts") return { projet: contrats, externes: [] };
  if (fichier === "src/prototype/decoupage.ts") {
    return { projet: (c) => contrats(c) || proto("programme-reduit").includes(c), externes: [] };
  }
  // Décision 0045 § 1.2 et § 3 (amendement de 0032 A3.2) : `@/contracts`, `zod` et `src/domain` seulement ; plus
  // aucun `@/prototype/*`. Même liste que la règle ESLint « src/domain sans entrée-sortie » (cas communs).
  if (fichier.startsWith("src/domain/")) {
    return { projet: (c) => contrats(c) || sous("src/domain")(c), externes: ["zod"] };
  }
  // B7a (décision 0077 § 1 points 7 et 8, amendement de 0032 A3.2) : `src/ai` et `src/research` n'importent plus rien
  // de `src/prototype`, fichiers de test compris.
  if (fichier.startsWith("src/ai/")) {
    return { projet: (c) => contrats(c) || sous("src/ai")(c), externes: ["zod"] };
  }
  if (fichier.startsWith("src/research/")) {
    const externes = ["zod"];
    if (fichier === "src/research/ip-guard.ts") externes.push("node:net");
    if (fichier === "src/research/extract-text.ts") externes.push("parse5");
    return {
      projet: (c) =>
        contrats(c) ||
        sous("src/ai")(c) ||
        (sous("src/research")(c) && (c !== "src/research/ip-guard.ts" || fichier === "src/research/fetch-page.ts")),
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
        ["src/prototype", "src/domain", "src/ai", "src/research", "src/grounding", "scripts/p0"].some((d) => sous(d)(c)) ||
        MODULES_SERVEUR_P0.includes(c),
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
    } else if (regle.formes?.has(cible.nom) === true && regle.formes.get(cible.nom) !== forme) {
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
const FICHIERS_P0 = [...TOUS_FICHIERS_P0.filter((fichier) => fichier.endsWith(".ts")), ...MODULES_SERVEUR_P0, ...MODULES_PROGRAMME_P0];
const SOURCES_P0 = FICHIERS_P0.filter((fichier) => !estTest(fichier));

/** Imports de chaque fichier, analysés une seule fois pour tous les graphes du fichier de test (durée, P0r1). */
const IMPORTS_LUS = new Map<string, readonly string[]>();
function importsDe(fichier: string): readonly string[] {
  let lus = IMPORTS_LUS.get(fichier);
  if (lus === undefined) {
    lus = analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8")).imports.map((i) => i.specificateur);
    IMPORTS_LUS.set(fichier, lus);
  }
  return lus;
}

/** Graphe des imports de projet d'un fichier, transitif. */
function graphe(depart: string): Set<string> {
  const vus = new Set<string>([depart]);
  const pile = [depart];
  while (pile.length > 0) {
    const courant = pile.pop() as string;
    for (const specificateur of importsDe(courant)) {
      const cible = resoudre(courant, specificateur);
      const cle = cible.type === "projet" ? cible.chemin : `externe:${cible.nom}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (cible.type === "projet") pile.push(cible.chemin);
    }
  }
  return vus;
}

/** Imports de projet résolus d'un fichier (un pas du graphe). */
type Voisins = (fichier: string) => readonly string[];

/** Mémoïsé : les deux parcours relisent les mêmes fichiers. */
const voisinsLus = new Map<string, readonly string[]>();
const voisinsReels: Voisins = (fichier) => {
  const connus = voisinsLus.get(fichier);
  if (connus !== undefined) return connus;
  const lus = analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8")).imports.flatMap(({ specificateur }) => {
    const cible = resoudre(fichier, specificateur);
    return cible.type === "projet" ? [cible.chemin] : [];
  });
  voisinsLus.set(fichier, lus);
  return lus;
};

/** Fichiers de projet atteints depuis `depart` ; un fichier pour lequel `arreter` est vrai est atteint, pas parcouru. */
function atteints(depart: string, voisins: Voisins, arreter: (chemin: string) => boolean = () => false): Set<string> {
  const vus = new Set<string>([depart]);
  const pile = [depart];
  while (pile.length > 0) {
    const courant = pile.pop() as string;
    if (courant !== depart && arreter(courant)) continue;
    for (const cible of voisins(courant)) {
      if (vus.has(cible)) continue;
      vus.add(cible);
      pile.push(cible);
    }
  }
  return vus;
}

/**
 * Ponts de l'application vers les modules de P0 (D18, décision 0055, section 3) : la composition du mode réel et le
 * workflow `p0Run` qui l'importe (P0r3c-4, décision 0063 point 9), seul importateur de la composition. Le parcours de
 * la frontière s'arrête à un pont ; chaque pont a ses importateurs contrôlés à part (composition : `composition.test.ts` ;
 * `p0Run` : `src/workflows/index.ts` seul, ci-dessous).
 */
const PONTS_P0: readonly string[] = ["src/server/composition/p0-reel.ts", "src/workflows/p0-run.ts"];
/**
 * B8b (décision 0100 § 5.2) : la fabrique commune des clients Google est un pont de plus vers `src/grounding` (modules de
 * capacité `places-client.ts` et `routes-client.ts`). Le parcours de la frontière s'arrête à elle ; ses importateurs
 * (`composition/lecture.ts` et `composition/generation.ts`, B9c) sont contrôlés à part par `composition.test.ts` et la
 * règle `ligne/relecture-imports`. Admis (décision 0108, qui amende 0100 § 5.2 et § 5.4 : branchement au démarrage, jamais
 * par `src/adapters/index.ts`) : `src/instrumentation.ts` → `composition/lecture.ts` → `composition/clients-google.ts` →
 * `@/grounding/*` (cas fabriqués ci-dessous).
 */
// B9c (décision 0105 § 2) : `fixtures-simulees.ts` est le module des doubles d'Édimbourg de la composition simulée, atteint par
// `import()` dynamique depuis `generation.ts` seulement ; il ouvre `@/ai`, `@/research` et `@/grounding` comme elle (doubles).
const PONTS_LECTURE: readonly string[] = [
  "src/server/composition/clients-google.ts",
  "src/server/composition/generation.ts",
  "src/server/composition/fixtures-simulees.ts",
  "src/server/relecture/planification.ts",
];
const estPont = (chemin: string) => PONTS_P0.includes(chemin) || PONTS_LECTURE.includes(chemin);

/**
 * B7a (décision 0077 § 3 point 1, amende 0048 § 1 et 0055 § 3 sur ce seul point) : `src/ai/erreurs.ts`, **et lui seul**
 * (égalité de chaîne, jamais un préfixe ni un motif), est exempté de `interditPartout`, et admis comme terminal de la
 * frontière de P0r3b (atteint par une entrée admise, ou par l'un des `REEXPORTATEURS_ERREURS_IA`). Aucune clause dans
 * `violationsPont` : `src/ai/` y est déjà une ouverture du pont (`OUVERTURES_PONT`), une exemption serait sans effet
 * (revue du head `5a955f8`, bloquant 3 ; décision 0080 §§ 1 et 2, amendement de 0077). Il n'importe rien (test
 * « p0: src/ai/erreurs.ts n'importe rien ») et ne contient que des listes de codes : `egress.ts` et `port.ts` en
 * réexportent les leurs. Si le test « zéro import » échoue, l'exemption tombe.
 */
const FICHIER_ERREURS_IA = "src/ai/erreurs.ts";
/**
 * Seuls modules qui réexportent les codes de `src/ai/erreurs.ts` sous leur nom d'origine (0077 § 3 point 1). Liste
 * fermée de la décision 0080 § 1 : un ajout demande une décision du Tech Lead et l'avis de la Sécurité.
 */
const REEXPORTATEURS_ERREURS_IA: readonly string[] = ["src/server/env/egress.ts", "src/server/usage/port.ts"];

/** Refusés sur tout le graphe de l'application, src/server compris (0032 A3.2, 0048 § 1.1), hors `FICHIER_ERREURS_IA`. */
const interditPartout = (chemin: string) =>
  chemin !== FICHIER_ERREURS_IA &&
  (["src/ai/", "src/research/", "src/grounding/", "scripts/"].some((d) => chemin.startsWith(d)) ||
    (chemin.startsWith("src/prototype/") && chemin !== "src/prototype/programme-reduit.ts"));

// --- Arêtes admises du graphe de l'application (B9c-graphe : 0081 B9-TL-1 point 4, 0105 § 7) -----------------------

/** Modules de la relecture des voyages (B8a, décision 0085 § 1.7 et § 1.8). */
const MODULES_RELECTURE: readonly string[] = ["src/server/relecture/relectures.ts"];
const TYPES_GROUNDING_RELECTURE: readonly string[] = ["src/grounding/fiches.ts", "src/grounding/trajets.ts"];
/** Source de relectures (B8b, décision 0100 § 5.1) : clients injectés par la composition de la lecture. */
const MODULE_SOURCE_LECTURE = "src/server/relecture/source.ts";
const GROUNDING_SOURCE_LECTURE: readonly string[] = ["src/grounding/fiches.ts", "src/grounding/interfaces.ts", "src/grounding/trajets.ts"];
/** Double de relectures (B6a, décision 0086 § 1.2 point 4). */
const DOUBLE_RELECTURES = "src/mocks/relectures-voyages.ts";
/** B10a (décision 0112 § 2) : règles du tri, importées par l'écran de présentation. */
const PREFERENCES_DOMAINE = "src/domain/preferences.ts";
const TYPES_RELECTURES_DOUBLE = "src/domain/relectures.ts";
/** Classification des codes de la couche IA (B9b, 0081 B9-TL-1 point 2 ; 0077 § 3 point 4). */
const NATURES_IA = "src/ai/natures.ts";

/**
 * Une arête admise : un import **exact** de l'application (origine `de`, cible prise dans `vers`, chemins exacts, jamais
 * un préfixe côté cible) que `violationsApplication` retire du graphe avant le parcours. Le parcours ne descend donc pas
 * au-delà de la cible : ce qu'elle importe n'est pas atteint par cette arête. `typeSeulement` : chaque import réel qui
 * emprunte l'arête est un `import type` (contrôlé sur les fichiers réels ci-dessous). `exemple` est un import fabriqué
 * admis par l'arête, `horsArete` une origine fabriquée qui ne l'est pas (ou `undefined` si toute l'application hors de la
 * zone de la cible l'est) : chaque ligne est exercée par ses propres cas fabriqués (test « chaque arête admise… »).
 */
type AreteAdmise = {
  nom: string;
  de: (chemin: string) => boolean;
  vers: readonly string[];
  typeSeulement: boolean;
  exemple: string;
  horsArete: string | undefined;
};

/**
 * Liste fermée, une ligne par décision ; elle remplace la disjonction écrite à la main de B9c (0105 § 7), sans changement
 * de verdict. Un ajout demande une décision du Tech Lead qui nomme l'arête, et ses cas fabriqués dans cette liste.
 */
const ARETES_ADMISES: readonly AreteAdmise[] = [
  {
    // P0r3c-5a (ticket 349, amendement de 0063) : seules arêtes de l'application vers `src/prototype` (hors programme
    // réduit), d'un module serveur de P0 vers une feuille de types ; rien de `src/prototype` n'est chargé à l'exécution,
    // et les feuilles n'importent que les contrats et `zod`.
    nom: "P0r3c-5a : module serveur de P0 → feuille de types de src/prototype",
    de: (chemin) => MODULES_SERVEUR_P0.includes(chemin),
    vers: TYPES_PROTOTYPE_SERVEUR_P0,
    typeSeulement: true,
    exemple: "src/server/p0/assemblage.ts",
    horsArete: "src/server/p0/garde.ts",
  },
  {
    // B8a (décision 0085 § 1.7 et § 1.8) : `versRelectures` importe de `@/grounding` des types seulement (issues de
    // fiches, table de trajets).
    nom: "B8a : relecture des voyages → types de fiches et de trajets",
    de: (chemin) => MODULES_RELECTURE.includes(chemin),
    vers: TYPES_GROUNDING_RELECTURE,
    typeSeulement: true,
    exemple: "src/server/relecture/relectures.ts",
    horsArete: "src/server/voyages/lecture.ts",
  },
  {
    // B8b (décision 0100 § 5.1) : la source de relectures appelle `chargerFiches`, `chargerTrajetsParCouples`… avec des
    // clients injectés par la composition de la lecture : ces trois modules de fonctions (valeurs), aucun module de capacité.
    nom: "B8b : source de relectures → fiches, interfaces et trajets",
    de: (chemin) => chemin === MODULE_SOURCE_LECTURE,
    vers: GROUNDING_SOURCE_LECTURE,
    typeSeulement: false,
    exemple: MODULE_SOURCE_LECTURE,
    horsArete: "src/server/composition/autre.ts",
  },
  {
    // B8c (décision 0060 § 1.4) : type du port du cache de positions, importé en type seulement hors de src/grounding
    // (`tests/unit/lint/positions-imports.test.ts`).
    nom: "B8c : application → port du cache de positions",
    de: (chemin) => !chemin.startsWith("src/grounding/"),
    vers: [PORT_POSITIONS],
    typeSeulement: true,
    exemple: "src/server/x.ts",
    horsArete: undefined,
  },
  {
    // B6a (décision 0086 § 1.2 point 4, amende 0048 § 1) : le double de relectures importe les types de son port
    // (`SourceRelectures`, `Relectures`), en type seulement (`ligne/voyages-imports`).
    nom: "B6a : double de relectures → types de src/domain/relectures.ts",
    de: (chemin) => chemin === DOUBLE_RELECTURES,
    vers: [TYPES_RELECTURES_DOUBLE],
    typeSeulement: true,
    exemple: DOUBLE_RELECTURES,
    horsArete: "src/mocks/edimbourg.ts",
  },
  {
    // B9b (décision 0081 B9-TL-1 point 2, amende 0048 § 1) : `src/ai/natures.ts`, terminal admis pour la conversion des
    // codes depuis `src/server/generation/**` et `src/server/creation/**` seulement (il n'importe que `@/ai/erreurs` et
    // `@/contracts`). Arête exacte : le parcours ne descend pas au-delà. L'écart de B9c sur ce test (réécriture complète
    // non faite par B9c) est consigné par la décision 0105 § 7 ; la tâche de suite `B9c-graphe` (0081 B9-TL-1 point 4) a
    // réécrit le test du graphe autour de cette liste, sans arête ni verdict nouveaux ; les cinq cas nominatifs « B9c
    // admis/refusé » ci-dessous et `composition.test.ts` couvrent les arêtes de la génération.
    nom: "B9b : src/server/generation et src/server/creation → src/ai/natures.ts",
    de: (chemin) => chemin.startsWith("src/server/generation/") || chemin.startsWith("src/server/creation/"),
    vers: [NATURES_IA],
    typeSeulement: false,
    exemple: "src/server/generation/codes.ts",
    horsArete: "src/server/x.ts",
  },
  {
    // B10a (décision 0112 § 2 points 2 et 4) : les règles du tri (`src/domain/preferences.ts`, sans `zod`, types de
    // `@/contracts` et valeurs de `@/contracts/values` seulement, aucun autre module de src/domain : lint de 0112 § 2
    // point 2) sont importées par l'écran de présentation, qui ne les recopie pas (0013 § 3.2). Les deux autres arêtes
    // nommées par 0112 § 2 point 4 (`src/server/presentation` → `src/domain/preferences`, `src/features/presentation` →
    // `src/server/actions/presentation`) ne franchissent pas cette frontière (src/server atteint src/domain ; l'arrêt aux
    // modules de src/server vaut pour src/features) : la seconde est exercée par « clé côté serveur seulement » (l'action
    // n'atteint les cas d'usage que par le branchement de `src/adapters/api-tri-instance.ts`).
    nom: "B10a : src/features/presentation → src/domain/preferences.ts",
    de: (chemin) => chemin.startsWith("src/features/presentation/"),
    vers: [PREFERENCES_DOMAINE],
    typeSeulement: false,
    exemple: "src/features/presentation/deck.ts",
    horsArete: "src/features/sejour/load.ts",
  },
];

const areteAdmise = (de: string, vers: string) => ARETES_ADMISES.some((arete) => arete.vers.includes(vers) && arete.de(de));

/** Violations de la frontière de 0048 § 1 pour un fichier de l'application, dans l'ordre de découverte. */
function violationsApplication(fichier: string, voisinsBruts: Voisins): string[] {
  const voisins: Voisins = (courant) => voisinsBruts(courant).filter((cible) => !areteAdmise(courant, cible));
  const violations = [...atteints(fichier, voisins, estPont)].filter(interditPartout);
  if (!fichier.startsWith("src/server/")) {
    // L'arrêt aux ponts ne vaut que pour `interditPartout` : la règle de src/domain traverse les ponts (bloquant 1 de la
    // revue du head `608ee99`, PR 348).
    const horsServeur = atteints(fichier, voisins, (chemin) => chemin.startsWith("src/server/"));
    violations.push(...[...horsServeur].filter((chemin) => chemin.startsWith("src/domain/")));
  }
  return violations;
}

/** Modules de P0 auxquels un pont peut mener (réponse 3 du Tech Lead, PR 348) : jamais src/domain ni scripts/. */
const OUVERTURES_PONT = ["src/research/", "src/grounding/", "src/ai/", "src/prototype/"];

/**
 * Violations d'un pont hors de src/server (`src/workflows/p0-run.ts`) : tout ce qu'il atteint sans descendre dans
 * src/server/ est de l'application, des contrats ou un module de P0 ouvert ; src/domain/ et scripts/ sont refusés.
 */
function violationsPont(fichier: string, voisins: Voisins): string[] {
  return [...atteints(fichier, voisins, (chemin) => chemin.startsWith("src/server/"))].filter(
    (chemin) => chemin.startsWith("src/domain/") || chemin.startsWith("scripts/") || (interditPartout(chemin) && !OUVERTURES_PONT.some((d) => chemin.startsWith(d))),
  );
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
    // P0r1 (0031 § 5) : chaque module de capacité ne nomme que son hôte et son module étroit ; `egress` est admis dans
    // `src/ai`, `src/grounding` et le seul `undici-transport.ts`. Aucun nom de variable de clé nulle part.
    // Hôte attendu de chaque client : comparé au texte de l'origine figée (`https://<hôte>"`), sans être écrit ici.
    const HOTE = "hôte";
    const MODULE_ENV = "@/server/env";
    const ADMIS = new Map<string, readonly string[]>([
      ["src/ai/openrouter-client.ts", [HOTE, MODULE_ENV]],
      ["src/grounding/places-client.ts", [HOTE, MODULE_ENV]],
      ["src/grounding/routes-client.ts", [HOTE, MODULE_ENV]],
      ["src/grounding/enveloppe-google.ts", [MODULE_ENV]],
      ["src/research/undici-transport.ts", [MODULE_ENV]],
    ]);
    const MOTIF = new RegExp(/openrouter\.ai|googleapis\.com|@\/server\/env|OPENROUTER_API_KEY|GOOGLE_MAPS_SERVER_KEY/.source, "g");
    // Un hôte contient un point ; un nom de variable n'en contient pas (il est rendu tel quel, donc refusé).
    const nature = (texte: string) => (texte === MODULE_ENV ? MODULE_ENV : texte.includes(".") ? HOTE : texte);
    for (const fichier of SOURCES_P0) {
      const source = readFileSync(path.join(RACINE, fichier), "utf8");
      const trouves = [...new Set([...source.matchAll(MOTIF)].map((m) => nature(m[0])))].sort();
      expect(trouves, fichier).toEqual([...(ADMIS.get(fichier) ?? [])].sort());
    }
    // Chaque client ne nomme qu'une origine, la sienne (préfixe de son nom de fichier).
    const origines = (fichier: string) =>
      [...readFileSync(path.join(RACINE, fichier), "utf8").matchAll(/"https:\/\/([a-z0-9.-]+)[/"]/g)].map((m) => m[1] ?? "");
    expect(new Set(origines("src/grounding/places-client.ts").map((h) => h.split(".")[0]))).toEqual(new Set(["places"]));
    expect(new Set(origines("src/grounding/routes-client.ts").map((h) => h.split(".")[0]))).toEqual(new Set(["routes"]));
    expect(origines("src/ai/openrouter-client.ts").length).toBe(2);
    for (const fichier of ["src/grounding/places-client.ts", "src/grounding/routes-client.ts"]) {
      expect(origines(fichier).every((h) => h.endsWith(".com") && h.split(".").length === 3), fichier).toBe(true);
    }
  });

  it("P0r1 : le fetch global seulement comme transport par défaut des trois clients (et l'option fetch du fournisseur)", () => {
    const admis = (fichier: string, source: string) => controler(fichier, source).filter((v) => v.includes("fetch"));
    // Formes admises.
    expect(admis("src/grounding/places-client.ts", "export function createPlacesClient(o: O, transport: T = fetch) {}")).toEqual([]);
    expect(
      admis("src/ai/openrouter-client.ts", "export function createOpenRouterClient(o: O, transport: T = fetch) { createOpenRouter({ apiKey, fetch: enveloppe }); }"),
    ).toEqual([]);
    // Formes refusées, y compris dans les fichiers d'exception.
    const refuses: [string, string][] = [
      ["src/grounding/places-client.ts", "await fetch('https://exemple.org');"],
      ["src/grounding/places-client.ts", "function createPlacesClient(o: O, transport: T = fetch) {}"],
      ["src/grounding/places-client.ts", "export function autre(o: O, transport: T = fetch) {}"],
      ["src/grounding/places-client.ts", "export function createPlacesClient(o: O, envoi: T = fetch) {}"],
      ["src/grounding/places-client.ts", "export function createPlacesClient(o: O, transport: T = fetch) { transport = fetch; }"],
      ["src/grounding/routes-client.ts", "const f = fetch;"],
      ["src/grounding/enveloppe-google.ts", "export function createRoutesClient(o: O, transport: T = fetch) {}"],
      ["src/ai/openrouter-client.ts", "createOpenRouter({ fetch: fetch });"],
      ["src/ai/openrouter-client.ts", "autre({ fetch: enveloppe });"],
      ["src/ai/client.ts", "export function createOpenRouterClient(o: O, transport: T = fetch) {}"],
      ["src/research/undici-transport.ts", "export function createUndiciTransport(o: O, transport: T = fetch) {}"],
    ];
    for (const [fichier, source] of refuses) expect(admis(fichier, source).length, `${fichier} : ${source}`).toBeGreaterThan(0);
  });

  it("P0r1 : modules et formes d'import des exceptions nominatives, fichier par fichier", () => {
    const refuses: [string, string][] = [
      // Test négatif de la spécification : undici dans fetch-page.ts, fetch dans un autre fichier de src/ai.
      ["src/research/fetch-page.ts", 'import { Agent } from "undici";'],
      ["src/ai/requetes.ts", "await fetch('https://exemple.org');"],
      ["src/research/undici-transport.ts", 'import { Agent, ProxyAgent } from "undici";'],
      ["src/research/undici-transport.ts", 'import { EnvHttpProxyAgent } from "undici";'],
      ["src/research/undici-transport.ts", 'import { Agent, setGlobalDispatcher } from "undici";'],
      ["src/research/undici-transport.ts", 'import * as undici from "undici";'],
      ["src/research/undici-transport.ts", 'import { lookup } from "node:dns";'],
      ["src/research/undici-transport.ts", 'import { Resolver as resoudreDns } from "node:dns/promises";'],
      ["src/research/undici-transport.ts", 'import { createGunzip } from "node:zlib";'],
      ["src/research/undici-transport.ts", 'import { lireCleOpenRouter } from "@/server/env/ai";'],
      ["src/research/agent.ts", 'import { verifierSortie } from "@/server/env/egress";'],
      ["src/research/agent.ts", 'import "server-only";'],
      ["src/ai/openrouter-client.ts", 'import { generateText, streamText } from "ai";'],
      ["src/ai/openrouter-client.ts", 'import { gateway } from "ai";'],
      ["src/ai/openrouter-client.ts", 'import { createGateway } from "@ai-sdk/gateway";'],
      ["src/ai/openrouter-client.ts", 'import { lireCleGoogle } from "@/server/env/grounding";'],
      ["src/ai/openrouter-client.ts", 'import { creerPortMemoire } from "../../tests/support/port-consommation-memoire";'],
      ["src/ai/openrouter-client.ts", 'import { coutSku } from "@/server/usage/cout-google";'],
      ["src/ai/requetes.ts", 'import { avecReservation } from "@/server/usage/port";'],
      ["src/ai/requetes.ts", 'import { generateText } from "ai";'],
      ["src/grounding/places-client.ts", 'import { lireCleOpenRouter } from "@/server/env/ai";'],
      ["src/grounding/places-client.ts", 'import "server-only.js";'],
      ["src/grounding/places-client.ts", 'import x from "server-only";'],
      ["src/grounding/enveloppe-google.ts", 'import { avecReservation } from "@/server/usage/port";'],
      ["src/grounding/ancrage.ts", 'import { lireCleGoogle } from "@/server/env/grounding";'],
    ];
    for (const [fichier, source] of refuses) expect(controler(fichier, source).length, `${fichier} : ${source}`).toBeGreaterThan(0);
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
    // B3a (ticket 293) : `src/server/ip.ts` (clé d'adresse du limiteur, `isIP` seulement) admis par la décision 0050,
    // « Lignes du régime de confinement », et 0051 point 6.7.4 ; hors du code de P0a1.
    expect([...new Set(parNet)].sort()).toEqual(["src/research/ip-guard.ts", "src/server/ip.ts"]);
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
      // B7a (décision 0077 § 1 point 7) : `src/ai` et `src/research` n'importent plus rien de `src/prototype`, pas même un type.
      ["src/ai/x.ts", 'import type { Brief } from "@/prototype/brief";'],
      ["src/research/x.ts", 'import type { Brief } from "@/prototype/brief";'],
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

  /*
   * Décision 0048 § 1, amendée par 0081 B9-TL-1 point 2 : frontière « src/domain n'est atteint que par src/server » et
   * « @/ai, @/research, @/grounding seulement par les compositions ». Deux parcours sur le graphe de l'application :
   * (1) parcours complet, arrêté aux ponts (`PONTS_P0`, `PONTS_LECTURE`), @/ai, @/research, @/grounding, scripts/ et
   * src/prototype (sauf programme-reduit) refusés pour tout fichier, src/server compris ; (2) parcours qui ne descend pas
   * dans src/server/, src/domain/ refusé pour tout fichier hors src/server. Les deux retirent d'abord les arêtes exactes
   * de `ARETES_ADMISES`. Réécrit par B9c-graphe (0081 B9-TL-1 point 4, écart de B9c consigné par 0105 § 7) : liste
   * déclarative des arêtes admises, chacune exercée par ses cas fabriqués et sur les fichiers réels ; verdicts inchangés.
   */
  describe("graphe de l'application : @/domain seulement par src/server (décision 0048 § 1), @/ai, @/research et @/grounding par les compositions (0081 B9-TL-1)", () => {
    const application = fichiers("src").filter((fichier) => !DOSSIERS_P0.some((d) => fichier.startsWith(`${d}/`)) && !fichier.startsWith("src/contracts/"));
    const configs = ["next.config.ts"].filter((fichier) => existsSync(path.join(RACINE, fichier)));

    it("aucun fichier n'atteint @/ai, @/research, @/grounding, scripts/ ni src/prototype (sauf programme-reduit) ; hors src/server, aucun n'atteint @/domain", () => {
      // D18 (décision 0055, section 3) : la composition du mode réel est le seul pont de l'application vers les modules
      // de P0 ; elle est contrôlée à part (`tests/unit/p0/composition.test.ts` : seul importateur des modules de
      // capacité, importée par le seul workflow `p0Run`). Tout autre fichier qui l'atteint reste une violation ici.
      const sources = [...application.filter((f) => !estTest(f) && !estPont(f)), ...configs];
      expect([...PONTS_P0, ...PONTS_LECTURE].every((f) => application.includes(f))).toBe(true);
      expect(sources).toContain("src/server/config/moteur.ts");
      for (const fichier of sources) expect(violationsApplication(fichier, voisinsReels), fichier).toEqual([]);
      // Le module serveur de configuration atteint bien src/domain : la frontière est exercée sur un cas réel.
      expect([...atteints("src/server/config/moteur.ts", voisinsReels)]).toContain("src/domain/configuration.ts");
    });

    it("pont p0Run : ouvert vers src/research, src/grounding, src/ai et src/prototype seulement, jamais src/domain ni scripts/", () => {
      const ponts = PONTS_P0.filter((f) => !f.startsWith("src/server/"));
      expect(ponts).toEqual(["src/workflows/p0-run.ts"]);
      for (const pont of ponts) expect(violationsPont(pont, voisinsReels), pont).toEqual([]);
    });

    it.each([
      ["refusé : pont → @/domain", { "src/workflows/p0-run.ts": ["src/domain/configuration.ts"] }, ["src/domain/configuration.ts"]],
      [
        "refusé : pont → @/research → @/domain",
        { "src/workflows/p0-run.ts": ["src/research/agent.ts"], "src/research/agent.ts": ["src/domain/generation.ts"] },
        ["src/domain/generation.ts"],
      ],
      ["refusé : pont → scripts/p0", { "src/workflows/p0-run.ts": ["scripts/p0/pipeline.ts"] }, ["scripts/p0/pipeline.ts"]],
      ["admis : pont → @/research, @/prototype", { "src/workflows/p0-run.ts": ["src/research/agent.ts", "src/prototype/config.ts"] }, []],
      ["admis : pont → src/server → @/domain", { "src/workflows/p0-run.ts": ["src/server/p0/x.ts"], "src/server/p0/x.ts": ["src/domain/generation.ts"] }, []],
    ] satisfies [string, Record<string, string[]>, string[]][])("cas fabriqué du pont : %s", (_nom, aretes, attendu) => {
      const graphe: Voisins = (fichier) => Object.entries(aretes).find(([nom]) => nom === fichier)?.[1] ?? [];
      expect(violationsPont("src/workflows/p0-run.ts", graphe)).toEqual(attendu);
      // L'index qui importe le pont est refusé de même : la règle de src/domain traverse le pont.
      const avecIndex: Voisins = (fichier) => (fichier === "src/workflows/index.ts" ? ["src/workflows/p0-run.ts"] : graphe(fichier));
      const domaine = (liste: readonly string[]) => liste.filter((c) => c.startsWith("src/domain/"));
      expect(domaine(violationsApplication("src/workflows/index.ts", avecIndex))).toEqual(domaine(attendu));
    });

    it("P0r3c-5a : assemblage et vers-moteur n'atteignent ni scripts/ ni src/prototype hors des feuilles de types, importées en type seulement", () => {
      for (const fichier of MODULES_SERVEUR_P0) {
        expect(application, fichier).toContain(fichier);
        const atteint = [...atteints(fichier, voisinsReels)];
        expect(atteint.filter((c) => c.startsWith("scripts/")), fichier).toEqual([]);
        expect(
          atteint.filter((c) => c.startsWith("src/prototype/") && !TYPES_PROTOTYPE_SERVEUR_P0.includes(c) && c !== "src/prototype/programme-reduit.ts"),
          fichier,
        ).toEqual([]);
        const { imports } = analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8"));
        const versTypes = imports.filter(({ specificateur }) => {
          const cible = resoudre(fichier, specificateur);
          return cible.type === "projet" && TYPES_PROTOTYPE_SERVEUR_P0.includes(cible.chemin);
        });
        expect(versTypes.length, fichier).toBeGreaterThan(0);
        for (const { forme } of versTypes) expect(forme, fichier).toMatch(/^import type \{/);
      }
      // scripts/p0 les ré-importe ; rien d'autre de src/server n'est importé par scripts/p0.
      const importsScripts = fichiers("scripts/p0")
        .filter((f) => !estTest(f))
        .flatMap((f) => voisinsReels(f).filter((c) => c.startsWith("src/server/")));
      expect([...new Set(importsScripts)].sort()).toEqual([...MODULES_SERVEUR_P0].sort());
    });

    it("B8a : src/server/relecture n'importe de src/grounding que des types (fiches, trajets) et n'est importé par aucun module de l'application", () => {
      for (const fichier of MODULES_RELECTURE) {
        expect(application, fichier).toContain(fichier);
        const { imports } = analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8"));
        const versGrounding = imports.filter(({ specificateur }) => {
          const cible = resoudre(fichier, specificateur);
          return cible.type === "projet" && cible.chemin.startsWith("src/grounding/");
        });
        expect(versGrounding.length, fichier).toBeGreaterThan(0);
        for (const { specificateur, forme } of versGrounding) {
          const cible = resoudre(fichier, specificateur);
          expect(cible.type === "projet" && TYPES_GROUNDING_RELECTURE.includes(cible.chemin), specificateur).toBe(true);
          expect(forme, fichier).toMatch(/^import type \{/);
        }
      }
      // 0085 § 1.8 et 0100 § 5.2 : seules les compositions `generation.ts` (B9c) et `lecture.ts` (B8b) l'importent.
      // `src/instrumentation.ts` (0108) n'importe que la composition de la lecture, jamais `@/server/relecture/*` directement.
      const importeurs = application.filter(
        (f) => !estTest(f) && !MODULES_RELECTURE.includes(f) && f !== MODULE_SOURCE_LECTURE && f !== "src/server/relecture/planification.ts" && voisinsReels(f).some((c) => c.startsWith("src/server/relecture/")),
      );
      expect(importeurs.filter((f) => f !== "src/server/composition/generation.ts" && f !== "src/server/composition/lecture.ts")).toEqual([]);
      expect(importeurs).toContain("src/server/composition/lecture.ts");
    });

    it("B8b : la source de relectures n'importe de src/grounding que fiches, interfaces et trajets (aucun module de capacité), ni l'environnement ni src/adapters", () => {
      expect(application).toContain(MODULE_SOURCE_LECTURE);
      const { imports } = analyser(MODULE_SOURCE_LECTURE, readFileSync(path.join(RACINE, MODULE_SOURCE_LECTURE), "utf8"));
      const cibles = imports.map(({ specificateur }) => resoudre(MODULE_SOURCE_LECTURE, specificateur));
      const grounding = cibles.flatMap((c) => (c.type === "projet" && c.chemin.startsWith("src/grounding/") ? [c.chemin] : []));
      expect(grounding.sort()).toEqual([...GROUNDING_SOURCE_LECTURE, "src/grounding/port-positions.ts"].sort());
      for (const c of cibles) {
        if (c.type !== "projet") continue;
        expect(c.chemin.startsWith("src/adapters/") || c.chemin.startsWith("src/server/env/") || c.chemin.startsWith("src/server/composition/"), c.chemin).toBe(false);
      }
      // Le type du port du cache est importé en type seulement.
      const port = imports.filter(({ specificateur }) => resoudre(MODULE_SOURCE_LECTURE, specificateur).type === "projet" && specificateur.endsWith("port-positions"));
      expect(port).toHaveLength(1);
      for (const { forme } of port) expect(forme).toMatch(/^import type \{/);
    });

    it.each([
      [
        "admis : src/instrumentation.ts → composition/lecture → fabrique → modules de capacité (0108 ; le parcours s'arrête à la fabrique)",
        {
          "src/instrumentation.ts": ["src/server/composition/lecture.ts"],
          "src/server/composition/lecture.ts": ["src/server/composition/clients-google.ts", "src/server/relecture/source.ts"],
          "src/server/composition/clients-google.ts": ["src/grounding/places-client.ts", "src/grounding/routes-client.ts"],
          "src/server/relecture/source.ts": ["src/grounding/fiches.ts", "src/grounding/trajets.ts"],
        },
        "src/instrumentation.ts",
        [],
      ],
      ["admis : source → fiches, trajets, interfaces (arêtes exactes)", { "src/server/relecture/source.ts": ["src/grounding/fiches.ts", "src/grounding/trajets.ts", "src/grounding/interfaces.ts"] }, "src/server/relecture/source.ts", []],
      ["refusé : source → module de capacité", { "src/server/relecture/source.ts": ["src/grounding/places-client.ts"] }, "src/server/relecture/source.ts", ["src/grounding/places-client.ts"]],
      ["refusé : source → un autre module de src/grounding", { "src/server/relecture/source.ts": ["src/grounding/ancrage-zone.ts"] }, "src/server/relecture/source.ts", ["src/grounding/ancrage-zone.ts"]],
      [
        "refusé : une autre composition de src/server → src/grounding (pas par la fabrique)",
        { "src/server/composition/autre.ts": ["src/grounding/places-client.ts"] },
        "src/server/composition/autre.ts",
        ["src/grounding/places-client.ts"],
      ],
      [
        "B9c admis (0081 B9-TL-4 point 4) : src/features/x.tsx → action de création → src/server/creation/y.ts → composition/generation → @/ai/couche",
        {
          "src/features/x.tsx": ["src/server/actions/creation.ts"],
          "src/server/actions/creation.ts": ["src/server/creation/y.ts"],
          "src/server/creation/y.ts": ["src/server/composition/generation.ts"],
          "src/server/composition/generation.ts": ["src/ai/couche.ts", "src/grounding/places-client.ts"],
        },
        "src/features/x.tsx",
        [],
      ],
      ["B9c admis : src/server/generation → src/ai/natures (terminal exact)", { "src/server/generation/codes.ts": ["src/ai/natures.ts"] }, "src/server/generation/codes.ts", []],
      ["B9c refusé : src/server/creation → src/ai sans la composition", { "src/server/creation/y.ts": ["src/ai/couche.ts"] }, "src/server/creation/y.ts", ["src/ai/couche.ts"]],
      ["B9c refusé : un module de src/server → src/research", { "src/server/x.ts": ["src/research/agent.ts"] }, "src/server/x.ts", ["src/research/agent.ts"]],
      [
        "B9c refusé : une étape de génération → src/grounding (chemin direct, sans la composition)",
        { "src/server/generation/etapes.ts": ["src/grounding/fiches.ts"] },
        "src/server/generation/etapes.ts",
        ["src/grounding/fiches.ts"],
      ],
      [
        "refusé : module de la lecture des voyages → src/grounding (chemin direct)",
        { "src/server/voyages/lecture.ts": ["src/grounding/fiches.ts"] },
        "src/server/voyages/lecture.ts",
        ["src/grounding/fiches.ts"],
      ],
    ] satisfies [string, Record<string, string[]>, string, string[]][])("B8b, graphe de la lecture : %s", (_nom, aretes, depart, attendu) => {
      const graphe: Voisins = (fichier) => Object.entries(aretes).find(([nom]) => nom === fichier)?.[1] ?? [];
      expect(violationsApplication(depart, graphe)).toEqual(attendu);
    });

    it("B6a : le double de relectures n'atteint src/domain que par les types de src/domain/relectures.ts ; aucun autre fichier hors de src/server n'atteint src/domain", () => {
      expect(application).toContain(DOUBLE_RELECTURES);
      const { imports } = analyser(DOUBLE_RELECTURES, readFileSync(path.join(RACINE, DOUBLE_RELECTURES), "utf8"));
      const versDomaine = imports.filter(({ specificateur }) => {
        const cible = resoudre(DOUBLE_RELECTURES, specificateur);
        return cible.type === "projet" && cible.chemin.startsWith("src/domain/");
      });
      expect(versDomaine.length).toBeGreaterThan(0);
      for (const { specificateur, forme } of versDomaine) {
        const cible = resoudre(DOUBLE_RELECTURES, specificateur);
        expect(cible.type === "projet" && cible.chemin === TYPES_RELECTURES_DOUBLE, specificateur).toBe(true);
        expect(forme).toMatch(/^import type \{/);
      }
      // Sans l'arête admise, le double atteint bien src/domain : la frontière est exercée sur un cas réel.
      const horsServeur = (depart: string, voisins: Voisins) => [...atteints(depart, voisins, (c) => c.startsWith("src/server/"))].filter((c) => c.startsWith("src/domain/"));
      expect(horsServeur(DOUBLE_RELECTURES, voisinsReels)).toEqual([TYPES_RELECTURES_DOUBLE]);
      expect(violationsApplication(DOUBLE_RELECTURES, voisinsReels)).toEqual([]);
      // Aucun autre fichier de l'application hors de src/server n'importe src/domain : l'arête ne vaut que pour le double.
      // B10a (0112 § 2) : seule autre arête, l'écran de présentation vers les règles du tri (`src/domain/preferences.ts`).
      const importeurs = application.filter(
        (f) => !estTest(f) && !f.startsWith("src/server/") && voisinsReels(f).some((c) => c.startsWith("src/domain/") && !(c === PREFERENCES_DOMAINE && f.startsWith("src/features/presentation/"))),
      );
      expect(importeurs).toEqual([DOUBLE_RELECTURES]);
    });

    it.each([
      ["admis : double → src/domain/relectures.ts", { [DOUBLE_RELECTURES]: [TYPES_RELECTURES_DOUBLE] }, DOUBLE_RELECTURES, []],
      ["refusé : double → src/domain/calculs.ts", { [DOUBLE_RELECTURES]: ["src/domain/calculs.ts"] }, DOUBLE_RELECTURES, ["src/domain/calculs.ts"]],
      ["refusé : autre mock → src/domain/relectures.ts", { "src/mocks/edimbourg.ts": [TYPES_RELECTURES_DOUBLE] }, "src/mocks/edimbourg.ts", [TYPES_RELECTURES_DOUBLE]],
      ["refusé : src/adapters → src/domain/relectures.ts", { "src/adapters/api.ts": [TYPES_RELECTURES_DOUBLE] }, "src/adapters/api.ts", [TYPES_RELECTURES_DOUBLE]],
      ["refusé : double → src/domain/temps.ts, à côté de l'arête admise", { [DOUBLE_RELECTURES]: [TYPES_RELECTURES_DOUBLE, "src/domain/temps.ts"] }, DOUBLE_RELECTURES, ["src/domain/temps.ts"]],
      [
        "admis : double → src/domain/relectures.ts → src/domain/temps.ts (le parcours ne descend pas au-delà de l'arête)",
        { [DOUBLE_RELECTURES]: [TYPES_RELECTURES_DOUBLE], [TYPES_RELECTURES_DOUBLE]: ["src/domain/temps.ts"] },
        DOUBLE_RELECTURES,
        [],
      ],
      [
        "admis : page → src/adapters → double → src/domain/relectures.ts",
        { "src/app/x/page.tsx": ["src/adapters/y.ts"], "src/adapters/y.ts": [DOUBLE_RELECTURES], [DOUBLE_RELECTURES]: [TYPES_RELECTURES_DOUBLE] },
        "src/app/x/page.tsx",
        [],
      ],
    ] satisfies [string, Record<string, string[]>, string, string[]][])("B6a, arête du double de relectures : %s", (_nom, aretes, depart, attendu) => {
      const graphe: Voisins = (fichier) => Object.entries(aretes).find(([nom]) => nom === fichier)?.[1] ?? [];
      expect(violationsApplication(depart, graphe)).toEqual(attendu);
    });

    it.each([
      ["admis : src/server/generation → src/ai/natures.ts", { "src/server/generation/codes.ts": [NATURES_IA] }, "src/server/generation/codes.ts", []],
      ["admis : src/server/creation → src/ai/natures.ts", { "src/server/creation/y.ts": [NATURES_IA] }, "src/server/creation/y.ts", []],
      [
        "admis : page → action → src/server/creation → src/ai/natures.ts → src/ai/erreurs.ts (terminal, rien au-delà)",
        {
          "src/app/x/page.tsx": ["src/server/actions/creation.ts"],
          "src/server/actions/creation.ts": ["src/server/creation/y.ts"],
          "src/server/creation/y.ts": [NATURES_IA],
          [NATURES_IA]: ["src/ai/couche.ts"],
        },
        "src/app/x/page.tsx",
        [],
      ],
      ["refusé : src/server/x.ts → src/ai/natures.ts", { "src/server/x.ts": [NATURES_IA] }, "src/server/x.ts", [NATURES_IA]],
      ["refusé : src/adapters → src/ai/natures.ts", { "src/adapters/y.ts": [NATURES_IA] }, "src/adapters/y.ts", [NATURES_IA]],
      ["refusé : src/server/creation → @/ai/couche", { "src/server/creation/y.ts": ["src/ai/couche.ts"] }, "src/server/creation/y.ts", ["src/ai/couche.ts"]],
    ] satisfies [string, Record<string, string[]>, string, string[]][])("B9b, terminal de la conversion des codes (0081 B9-TL-1 point 2) : %s", (_nom, aretes, depart, attendu) => {
      const graphe: Voisins = (fichier) => Object.entries(aretes).find(([nom]) => nom === fichier)?.[1] ?? [];
      expect(violationsApplication(depart, graphe)).toEqual(attendu);
    });

    /**
     * B10a (décision 0112 § 2 point 4 ; revue de la PR 621, bloquant 5) : les deux autres arêtes nommées par 0112
     * (`src/server/presentation` → `src/domain/preferences.ts`, `src/features/presentation` →
     * `src/server/actions/presentation.ts`) ne sont pas des lignes d'`ARETES_ADMISES` : elles ne franchissent pas la
     * frontière de 0048 § 1 (src/server atteint src/domain ; hors de src/server, le contrôle de src/domain s'arrête aux
     * modules de src/server), et une ligne les retirerait du graphe, ce qui arrêterait aussi le contrôle de
     * `interditPartout` à l'action. Leurs cas fabriqués sont ici (amendement 2 de 0112) ; le refus d'un import de src/server
     * hors des actions depuis l'écran est la règle ESLint de 0020 § 11 (`tests/unit/lint/presentation-lint.test.ts`).
     */
    it.each([
      [
        "refusé : src/features/presentation → src/server/actions/presentation.ts → src/ai (l'action n'est pas un terminal)",
        { "src/features/presentation/server-actions.ts": ["src/server/actions/presentation.ts"], "src/server/actions/presentation.ts": ["src/ai/couche.ts"] },
        "src/features/presentation/server-actions.ts",
        ["src/ai/couche.ts"],
      ],
      [
        "refusé : src/features/presentation → src/domain/recomposition.ts (seul preferences.ts)",
        { "src/features/presentation/deck.ts": [PREFERENCES_DOMAINE, "src/domain/recomposition.ts"] },
        "src/features/presentation/deck.ts",
        ["src/domain/recomposition.ts"],
      ],
      [
        "refusé : src/adapters → src/domain/preferences.ts (arête réservée à src/features/presentation)",
        { "src/adapters/x.ts": [PREFERENCES_DOMAINE] },
        "src/adapters/x.ts",
        [PREFERENCES_DOMAINE],
      ],
    ] satisfies [string, Record<string, string[]>, string, string[]][])("B10a, arêtes de 0112 § 2 point 4 : %s", (_nom, aretes, depart, attendu) => {
      const graphe: Voisins = (fichier) => Object.entries(aretes).find(([nom]) => nom === fichier)?.[1] ?? [];
      expect(violationsApplication(depart, graphe)).toEqual(attendu);
    });

    /**
     * Cas « admis » discriminants (revue de la PR 621, correction 2) : chaque graphe admis a un témoin qui ne diffère que
     * par le nœud de src/server, remplacé par un nœud hors de src/server ; le témoin est refusé, donc l'admission vient
     * bien de la règle « src/server atteint src/domain » et non d'un graphe sans violation possible.
     */
    it.each([
      [
        "src/server/presentation → src/domain/preferences.ts et src/domain/recomposition.ts",
        "src/server/presentation/etat.ts",
        "src/adapters/presentation-etat.ts",
        (noeud: string): Record<string, string[]> => ({ [noeud]: [PREFERENCES_DOMAINE, "src/domain/recomposition.ts"] }),
        [PREFERENCES_DOMAINE, "src/domain/recomposition.ts"],
      ],
      [
        "écran → src/server/actions/presentation.ts → cas d'usage → src/domain",
        "src/server/actions/presentation.ts",
        "src/adapters/actions-presentation.ts",
        (noeud: string): Record<string, string[]> => ({
          "src/features/presentation/server-actions.ts": [noeud],
          [noeud]: ["src/domain/recomposition.ts"],
        }),
        ["src/domain/recomposition.ts"],
      ],
    ] as const)("B10a, arête admise de 0112 § 2 point 4, et son témoin refusé : %s", (_nom, serveur, temoin, aretes, refuses) => {
      const graphe = (table: Record<string, string[]>): Voisins => (fichier) => Object.entries(table).find(([nom]) => nom === fichier)?.[1] ?? [];
      const depart = (noeud: string) => (noeud.startsWith("src/server/presentation/") || noeud.startsWith("src/adapters/presentation") ? noeud : "src/features/presentation/server-actions.ts");
      expect(violationsApplication(depart(serveur), graphe(aretes(serveur)))).toEqual([]);
      expect(violationsApplication(depart(temoin), graphe(aretes(temoin)))).toEqual([...refuses]);
    });

    it("B10a, arêtes réelles de 0112 § 2 point 4 : l'écran n'importe de src/server que des actions, et l'action du tri seulement depuis server-actions.ts", () => {
      const versServeur = application
        .filter((f) => !estTest(f) && f.startsWith("src/features/presentation/"))
        .flatMap((f) => voisinsReels(f).filter((c) => c.startsWith("src/server/")).map((c) => [f, c] as const));
      expect(versServeur.filter(([, c]) => !c.startsWith("src/server/actions/"))).toEqual([]);
      expect(versServeur.filter(([, c]) => c === "src/server/actions/presentation.ts").map(([f]) => f)).toEqual(["src/features/presentation/server-actions.ts"]);
    });

    /**
     * Critère `présentation: même règle en local et sur le serveur` (décision 0112 § 2 point 5 ; revue de la PR 621,
     * bloquant 4) : `src/features/presentation/deck.ts` et `src/server/presentation/` importent la règle de
     * `@/domain/preferences`, et aucun fichier de `src/features` ne définit `questionApres` ni `paquetDeReprise`.
     */
    it("B10a, règle unique du tri : deck.ts et src/server/presentation importent @/domain/preferences ; src/features ne la redéfinit pas", () => {
      const importeDomaine = (fichier: string) => voisinsReels(fichier).includes(PREFERENCES_DOMAINE);
      expect(importeDomaine("src/features/presentation/deck.ts")).toBe(true);
      const serveur = application.filter((f) => !estTest(f) && f.startsWith("src/server/presentation/"));
      expect(serveur.length).toBeGreaterThan(0);
      expect(serveur.filter((f) => !importeDomaine(f))).toEqual(["src/server/presentation/lecture.ts"]);
      // Les deux modules qui appliquent les règles (cas d'usage et état) les importent nommément.
      for (const [fichier, noms] of [
        ["src/server/presentation/tri.ts", ["questionApres", "paquetDeReprise"]],
        ["src/server/presentation/etat.ts", ["paquetDeReprise"]],
        ["src/features/presentation/actions.ts", ["questionApres"]],
      ] as const) {
        const { imports } = analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8"));
        const depuisDomaine = imports.filter(({ specificateur }) => specificateur === "@/domain/preferences").map(({ forme }) => forme).join("\n");
        for (const nom of noms) expect(depuisDomaine, `${fichier} : ${nom}`).toMatch(new RegExp(`\\b${nom}\\b`));
      }
      // Aucune définition (fonction, constante, méthode, propriété) de ces noms dans src/features.
      const definitions = application
        .filter((f) => f.startsWith("src/features/"))
        .flatMap((f) => {
          const sf = ts.createSourceFile(f, readFileSync(path.join(RACINE, f), "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
          const trouves: string[] = [];
          const visiter = (noeud: ts.Node) => {
            const nom =
              ts.isFunctionDeclaration(noeud) || ts.isVariableDeclaration(noeud) || ts.isMethodDeclaration(noeud) || ts.isPropertyAssignment(noeud) || ts.isPropertyDeclaration(noeud)
                ? noeud.name
                : undefined;
            if (nom !== undefined && ts.isIdentifier(nom) && (nom.text === "questionApres" || nom.text === "paquetDeReprise")) trouves.push(`${f} : ${nom.text}`);
            ts.forEachChild(noeud, visiter);
          };
          visiter(sf);
          return trouves;
        });
      expect(definitions).toEqual([]);
    });

    it.each(ARETES_ADMISES.map((arete) => [arete.nom, arete] as const))("B9c-graphe, arête admise exacte et exercée par ses cas fabriqués (0081 B9-TL-1 point 4) : %s", (_nom, arete) => {
      const graphe = (aretes: Record<string, string[]>): Voisins => (fichier) => aretes[fichier] ?? [];
      expect(arete.de(arete.exemple), arete.exemple).toBe(true);
      for (const cible of arete.vers) {
        // Cible exacte : un fichier réel, jamais un préfixe.
        expect(existsSync(path.join(RACINE, cible)) && statSync(path.join(RACINE, cible)).isFile(), cible).toBe(true);
        // Admis : l'arête, et rien de ce que la cible importe n'est atteint par elle.
        expect(violationsApplication(arete.exemple, graphe({ [arete.exemple]: [cible], [cible]: ["src/ai/couche.ts", "src/domain/temps.ts"] })), cible).toEqual([]);
        // Refusé : un fichier voisin de la cible, depuis la même origine (égalité de chaîne, pas de préfixe).
        const voisin = cible.replace(/\.ts$/, "-autre.ts");
        expect(violationsApplication(arete.exemple, graphe({ [arete.exemple]: [voisin] })), voisin).toEqual([voisin]);
        // Refusé : la même cible depuis une origine hors de l'arête.
        if (arete.horsArete !== undefined) {
          expect(arete.de(arete.horsArete), arete.horsArete).toBe(false);
          expect(violationsApplication(arete.horsArete, graphe({ [arete.horsArete]: [cible] })), arete.horsArete).toEqual([cible]);
        }
      }
    });

    it("B9c-graphe : chaque arête admise est empruntée par un import réel de l'application, en `import type` quand elle l'exige", () => {
      const empruntees = new Set<string>();
      for (const fichier of application.filter((f) => !estTest(f))) {
        const { imports } = analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8"));
        for (const { specificateur, forme } of imports) {
          const cible = resoudre(fichier, specificateur);
          if (cible.type !== "projet") continue;
          for (const arete of ARETES_ADMISES.filter((a) => a.vers.includes(cible.chemin) && a.de(fichier))) {
            empruntees.add(arete.nom);
            if (arete.typeSeulement) expect(forme, `${fichier} → ${cible.chemin}`).toMatch(/^(?:import|export) type \{/);
          }
        }
      }
      // Aucune ligne morte : une arête que rien n'emprunte élargirait la frontière sans raison.
      expect([...empruntees].sort()).toEqual(ARETES_ADMISES.map((a) => a.nom).sort());
    });

    it("le pont p0Run n'est importé que par src/workflows/index.ts, et l'index n'atteint P0 que par lui", () => {
      const importeurs = application.filter((f) => !estTest(f) && voisinsReels(f).includes("src/workflows/p0-run.ts"));
      expect(importeurs).toEqual(["src/workflows/index.ts"]);
      // Sans arrêt aux ponts, l'index atteint bien les modules de P0 : la frontière est exercée sur un cas réel.
      expect([...atteints("src/workflows/index.ts", voisinsReels)].some(interditPartout)).toBe(true);
    });

    it("chaine-inversee: aucun accès au schéma prototype (graphe) : le chemin api et generateProgramme n'atteignent ni les adaptateurs prototype, ni src/server/p0, ni src/server/essai", () => {
      // Spécification M1a, critère 6 (décision 0136 § 2.1) : imports **exécutés** (`import()` compris, imports de type
      // exclus : effacés à la compilation), depuis l'instance de l'adaptateur de création, la fabrique que
      // `src/instrumentation.ts` y branche (`api-creation.ts`) et le workflow de la chaîne inversée ; parcours arrêté au seul
      // pont p0Run (workflow distinct, jamais démarré par ce chemin, contrôlé par le test précédent).
      const voisinsExecutes: Voisins = (fichier) =>
        importsExecutesDe(fichier, readFileSync(path.join(RACINE, fichier), "utf8")).flatMap((specificateur) => {
          const cible = resoudre(fichier, specificateur);
          return cible.type === "projet" ? [cible.chemin] : [];
        });
      const interditApi = (chemin: string) =>
        /^src\/adapters\/prototype[^/]*\.ts$/.test(chemin) || chemin.startsWith("src/server/p0/") || chemin.startsWith("src/server/essai/");
      const arretP0Run = (chemin: string) => chemin === "src/workflows/p0-run.ts";
      for (const depart of ["src/adapters/api-creation-instance.ts", "src/adapters/api-creation.ts", "src/workflows/programme.ts"]) {
        expect([...atteints(depart, voisinsExecutes, arretP0Run)].filter(interditApi), depart).toEqual([]);
      }
      // Le parcours n'est pas vide par construction : le chemin api atteint, par l'`import()` du démarrage, le workflow
      // inversé et ses étapes ; sans l'arrêt à p0Run, il atteindrait src/server/p0 (la frontière est exercée).
      const depuisApi = [...atteints("src/adapters/api-creation.ts", voisinsExecutes, arretP0Run)];
      expect(depuisApi).toEqual(expect.arrayContaining(["src/server/creation/demarrage.ts", "src/workflows/index.ts", "src/workflows/programme.ts", "src/server/generation/etapes-programme.ts"]));
      expect([...atteints("src/adapters/api-creation.ts", voisinsExecutes)].some(interditApi)).toBe(true);
    });

    describe("cas fabriqués", () => {
      const graphe = (aretes: Record<string, string[]>): Voisins => (fichier) => Object.entries(aretes).find(([nom]) => nom === fichier)?.[1] ?? [];
      it.each([
        ["refusé : src/features → @/domain/configuration", { "src/features/x.ts": ["src/domain/configuration.ts"] }, "src/features/x.ts", ["src/domain/configuration.ts"]],
        [
          "refusé : src/lib → src/lib → @/domain/generation",
          { "src/lib/x.ts": ["src/lib/y.ts"], "src/lib/y.ts": ["src/domain/generation.ts"] },
          "src/lib/x.ts",
          ["src/domain/generation.ts"],
        ],
        ["admis : src/server/config/moteur.ts → @/domain/configuration", { "src/server/config/moteur.ts": ["src/domain/configuration.ts"] }, "src/server/config/moteur.ts", []],
        [
          "admis : src/features → @/server/actions → @/domain/generation",
          { "src/features/x.tsx": ["src/server/actions/y.ts"], "src/server/actions/y.ts": ["src/domain/generation.ts"] },
          "src/features/x.tsx",
          [],
        ],
        ["refusé : src/server → @/research/agent", { "src/server/x.ts": ["src/research/agent.ts"] }, "src/server/x.ts", ["src/research/agent.ts"]],
        // P0r3c-5a : arêtes admises de src/server/p0 vers les feuilles de types de src/prototype, et rien d'autre.
        [
          "admis : src/server/p0/assemblage.ts → @/prototype/brief, candidat, ancrage, programme-reduit",
          { "src/server/p0/assemblage.ts": [...TYPES_PROTOTYPE_SERVEUR_P0, "src/prototype/programme-reduit.ts", "src/domain/temps.ts"] },
          "src/server/p0/assemblage.ts",
          [],
        ],
        ["refusé : src/server/p0/vers-moteur.ts → @/prototype/config", { "src/server/p0/vers-moteur.ts": ["src/prototype/config.ts"] }, "src/server/p0/vers-moteur.ts", ["src/prototype/config.ts"]],
        ["refusé : src/server/p0/garde.ts → @/prototype/brief", { "src/server/p0/garde.ts": ["src/prototype/brief.ts"] }, "src/server/p0/garde.ts", ["src/prototype/brief.ts"]],
        ["refusé : src/server/p0/assemblage.ts → scripts/p0", { "src/server/p0/assemblage.ts": ["scripts/p0/pipeline.ts"] }, "src/server/p0/assemblage.ts", ["scripts/p0/pipeline.ts"]],
        [
          "refusé : src/server/p0/assemblage.ts → src/server/x → @/prototype/brief",
          { "src/server/p0/assemblage.ts": ["src/server/x.ts"], "src/server/x.ts": ["src/prototype/brief.ts"] },
          "src/server/p0/assemblage.ts",
          ["src/prototype/brief.ts"],
        ],
        [
          "refusé : src/features → src/server → @/grounding (parcours complet)",
          { "src/features/x.ts": ["src/server/y.ts"], "src/server/y.ts": ["src/grounding/ancrage.ts"] },
          "src/features/x.ts",
          ["src/grounding/ancrage.ts"],
        ],
      ] satisfies [string, Record<string, string[]>, string, string[]][])("%s", (_nom, aretes, depart, attendu) => {
        expect(violationsApplication(depart, graphe(aretes))).toEqual(attendu);
      });
    });
  });
});

// --- Clé côté serveur seulement (spécification de P0r1, « Clients réels » ; mineur 15 de la revue du head `fab6c81`) ---

/**
 * Dossiers que rien de ce qui part vers le navigateur ne doit atteindre : clients réels, lecture des pages, modules de clé,
 * et la composition du mode réel (P0r3c-3 : test de P0r1 « clé côté serveur » étendu à `p0-reel.ts`, 0055 § 3 point 6).
 */
const ZONES_SERVEUR_SEULEMENT = ["src/ai/", "src/grounding/", "src/research/", "src/server/env/", "src/server/composition/"];
/**
 * Paquets des clients réels : jamais atteints depuis le code client non plus. Le fournisseur de modèles n'est admis que
 * dans le client de modèles (exceptions nominatives) : l'atteindre suppose d'atteindre `src/ai`.
 */
const PAQUETS_SERVEUR_SEULEMENT = ["externe:ai", "externe:undici"];

/** Directives du prologue du fichier (`"use client"`, `"use server"`…), lues sur l'arbre syntaxique, pas par recherche de texte. */
function directivesDuPrologue(fichier: string, source: string): string[] {
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, false, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const directives: string[] = [];
  for (const instruction of sf.statements) {
    if (!ts.isExpressionStatement(instruction) || !ts.isStringLiteral(instruction.expression)) break;
    directives.push(instruction.expression.text);
  }
  return directives;
}

/** Directive `"use client"` dans le prologue du fichier (arbre syntaxique, pas une recherche de texte). */
function estFichierClient(fichier: string, source: string): boolean {
  return directivesDuPrologue(fichier, source).includes("use client");
}

/** Import de bord `import "server-only";` au premier niveau du fichier (arbre syntaxique). */
function importeServerOnly(fichier: string, source: string): boolean {
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, false, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return sf.statements.some(
    (instruction) =>
      ts.isImportDeclaration(instruction) &&
      instruction.importClause === undefined &&
      ts.isStringLiteral(instruction.moduleSpecifier) &&
      instruction.moduleSpecifier.text === "server-only",
  );
}

/** Imports d'un fichier, `import()` littéraux compris (`next/dynamic`, chargement paresseux côté client). */
function importsClientDe(fichier: string, source: string): string[] {
  const specificateurs = analyser(fichier, source).imports.map((i) => i.specificateur);
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visiter = (noeud: ts.Node) => {
    if (ts.isCallExpression(noeud) && noeud.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = noeud.arguments[0];
      // Un import() non littéral est refusé dans le code client : la fermeture ne pourrait pas être vérifiée.
      specificateurs.push(argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : "?import-non-litteral");
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(sf);
  return specificateurs;
}

/**
 * Imports **exécutés** d'un fichier (arbre syntaxique) : `import` et `export … from` sauf ceux qui sont entièrement de
 * type (effacés à la compilation), et tout `import()` (non littéral : `?import-non-litteral`).
 */
function importsExecutesDe(fichier: string, source: string): string[] {
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specificateurs: string[] = [];
  const visiter = (noeud: ts.Node) => {
    if (ts.isImportDeclaration(noeud) && ts.isStringLiteral(noeud.moduleSpecifier) && !noeud.importClause?.isTypeOnly) {
      specificateurs.push(noeud.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(noeud) && noeud.moduleSpecifier !== undefined && ts.isStringLiteral(noeud.moduleSpecifier) && !noeud.isTypeOnly) {
      specificateurs.push(noeud.moduleSpecifier.text);
    } else if (ts.isCallExpression(noeud) && noeud.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = noeud.arguments[0];
      specificateurs.push(argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : "?import-non-litteral");
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(sf);
  return specificateurs;
}

/**
 * Seuls imports exécutés admis dans le terminal `src/workflows/index.ts` : `./apercu` (B9c, workflow 1), `./voyage-complet`
 * (B9d, workflow 4), `./recalcul` (B10b, workflow 5, décision 0119 § 1.8) et `./programme` (M1a-2, `generateProgramme`,
 * décision 0136 § 2.1), même forme : un pont de `"use step"` vers `src/server/generation/`, jamais dans un paquet client.
 */
const IMPORTS_TERMINAL_WORKFLOWS: readonly string[] = ["server-only", "workflow/api", "./apercu", "./complet", "./p0-run", "./programme", "./recalcul", "./voyage-complet"];

/**
 * Seuls imports exécutés admis dans le terminal `src/server/composition/villes.ts` (recherche de ville du site d'essai,
 * demande de Samuel du 23 octobre 2026, décision 0129) : motifs des contrats, tables maison, pont des clients Google,
 * barrière d'accès, plafond persistant (pool du prototype, table de prix, `reserverVille`) et port de consommation,
 * jamais un paquet client (`server-only`).
 */
const IMPORTS_TERMINAL_VILLES: readonly string[] = [
  "server-only",
  "../../../prototype/config/prix-google.json",
  "@/lib/fuseaux",
  "@/server/composition/clients-google",
  "@/server/log",
  "@/server/p0/acces",
  "@/server/p0/base",
  "@/server/usage/cout-google",
  "@/server/usage/neon",
  // Décision 0141 § 6.1 point 3 (PR 885) : cœur commun ; `@/contracts/values`, `periodes` et `port` y sont passés.
  "@/server/villes/recherche",
];

/**
 * Seuls imports exécutés admis dans le terminal `src/server/composition/villes-api.ts` (recherche de ville de l'écran 1
 * de `api`, décision 0141 § 6.1 point 4 et § 11 ligne 2) : tables maison, pont des clients Google, plafonds de la
 * génération (barrière), garde des seuils, crochet d'accès et barrière B9-TL-8, journal, limiteur, compteurs du jour et
 * cœur commun ; ni `periodes`, ni `port`, ni la table de prix (au cœur ou dans les compteurs), et rien du chemin d'essai.
 */
const IMPORTS_TERMINAL_VILLES_API: readonly string[] = [
  "server-only",
  "@/lib/fuseaux",
  "@/server/composition/clients-google",
  "@/server/config/usage",
  "@/server/config/villes",
  "@/server/generation/acces-reel",
  "@/server/generation/barriere",
  "@/server/log",
  "@/server/rate-limit",
  "@/server/villes/compteurs",
  "@/server/villes/recherche",
];

/**
 * Seuls imports exécutés admis dans le terminal `src/server/composition/lieux-api.ts` (recherche d'un lieu à soi de
 * `api`, décision 0147 § 3 et § 14 ligne M5d-1, ticket 939), sur le modèle de `IMPORTS_TERMINAL_VILLES_API` : pont des
 * clients Google, garde des seuils des lieux, plafonds de la génération (barrière), crochet d'accès et barrière B9-TL-8,
 * journal, limiteur, compteurs du jour et cœur `src/server/lieux/recherche.ts` ; rien du chemin d'essai.
 */
const IMPORTS_TERMINAL_LIEUX_API: readonly string[] = [
  "server-only",
  "@/server/composition/clients-google",
  "@/server/config/lieux",
  "@/server/config/usage",
  "@/server/generation/acces-reel",
  "@/server/generation/barriere",
  "@/server/log",
  "@/server/rate-limit",
  "@/server/villes/compteurs",
  "@/server/lieux/recherche",
];

/**
 * Exception nominative (P0r3b, ticket 311 ; décision 0055, section 1 point 2 et section 2 point 5). Deux entrées
 * nommées, chacune admise **seulement si** sa propriété est vérifiée sur le fichier réel (arbre syntaxique) :
 * - l'action serveur de la saisie du code (`src/server/actions/p0-acces.ts`), si son prologue porte `"use server"` : vue
 *   du navigateur, ses exports ne sont que des références, et ses imports n'entrent jamais dans un paquet client ;
 * - l'état de la page (`src/server/p0/page-acces.ts`, lu par le composant serveur de la page), si son prologue ne porte
 *   ni `"use client"` ni `"use server"` (jamais un paquet client, jamais une action appelable : mineur 7 du head
 *   6be9299) et s'il importe `server-only` (son entrée dans un paquet client ferait échouer la construction).
 * Une entrée dont la propriété manque est un fichier ordinaire (aucune admission : cas négatifs). Au-delà d'une entrée
 * admise **seulement**, sont admis le module étroit du mode réel (`p0.ts`, qui ne lit aucune clé de service) et les
 * modules de B3a qu'il importe ; tout autre module serveur seulement reste refusé, à travers l'entrée comme ailleurs
 * (clés de service `ai.ts` et `grounding.ts`, `src/ai`, `src/grounding`, `src/research`, paquets). Verdicts Tech Lead et
 * Sécurité demandés dans la PR de P0r3b (bloquant 3 du head 6be9299). Décision 0062 (ticket 341) : `openssl-conf.ts`,
 * importé par `egress.ts` (examen d'`OPENSSL_CONF`, aucune clé ni variable d'environnement lue), est admis avec lui ;
 * verdicts Tech Lead et Sécurité demandés dans la PR du ticket 341.
 *
 * P0r3d (ticket 354 ; 0055 § 8 ; 0063 point 10) : troisième entrée, l'action de lancement
 * (`src/server/actions/p0-lancement.ts`, même propriété que la saisie), et un **terminal** : au-delà d'une entrée admise
 * seulement, l'interface des workflows (`src/workflows/index.ts`), si elle importe `server-only` et ne porte aucune
 * directive, est admise **sans être parcourue** (le pont `p0Run` et ce qu'il atteint ne sont jamais dans un paquet
 * client : `server-only` ferait échouer la construction), et si ses imports exécutés sont `server-only`, `workflow/api`,
 * `./complet` et `./p0-run` seulement (les imports de type sont effacés). Atteinte hors d'une entrée admise, ou sans sa
 * propriété, elle est parcourue comme un fichier ordinaire, et chaque module de P0 au-delà redevient une violation.
 * Tech Lead : validé ; Sécurité : approuvé (revue consolidée du head `193603d`, PR 357).
 *
 * B4a (ticket 531 ; décision 0097 B4-TL-3 point 5 et B4-TL-11) : la frontière, nommée d'après P0r3b, porte aussi une
 * entrée hors de P0, le webhook simulé (`src/server/routes/simulated-webhook.ts`, seul module du route handler
 * `src/app/api/v1/webhooks/simulated/route.ts`). La liste `admis` est **commune à toutes les entrées** : `env/payment.ts`,
 * ajouté pour le webhook, est donc aussi admis derrière les entrées de P0, qui ne l'importent pas aujourd'hui ; il ne lit
 * aucune clé de service ni `process.env` (ses deux importeurs sont fixés par `ligne/server-env-imports`). Sécurité :
 * approuvé, revue du head d50acfa (PR 582).
 *
 * Recherche de ville du site d'essai (demande de Samuel du 23 octobre 2026, décision 0129) : entrée
 * `src/server/actions/villes-essai.ts` (même propriété que la saisie du code : `"use server"`) et terminal
 * `src/server/composition/villes.ts`, admis sans être parcouru au-delà d'une entrée seulement, s'il importe
 * `server-only`, ne porte aucune directive et si ses imports exécutés sont ceux d'`IMPORTS_TERMINAL_VILLES`. Verdicts
 * Tech Lead et Sécurité : décision 0129 (définitive à la fusion, 0093).
 *
 * Recherche de ville de l'écran 1 de `api` (décision 0141 § 6.1 point 4 et § 11 lignes 1 et 2 ; PR 885) : entrée
 * `src/server/actions/villes.ts` (`"use server"`) et terminal `src/server/composition/villes-api.ts` (imports exécutés
 * bornés par `IMPORTS_TERMINAL_VILLES_API`). La page de l'écran 1 (`src/app/(creation)/voyages/nouveau/page.tsx`,
 * composant serveur sans directive) lit `rechercheVilleApiOuverte` dans ce terminal (0141 § 6.4) : elle n'est **pas** une
 * entrée (revue consolidée du head `bcaa346`, bloquant 1 de la Sécurité) ; elle a une seule arête nominative,
 * `ARETE_PAGE_VILLES_API` : vers ce terminal seulement, page sans directive et terminal qui porte sa propriété. Tous ses
 * autres imports restent contrôlés comme ceux d'un fichier ordinaire.
 *
 * Recherche d'un lieu à soi de `api` (décision 0147 § 3 et § 14 ligne M5d-1, ticket 939) : entrée
 * `src/server/actions/lieux.ts` (`"use server"`) et terminal `src/server/composition/lieux-api.ts` (imports exécutés
 * bornés par `IMPORTS_TERMINAL_LIEUX_API`), sur le modèle exact de la recherche de ville de `api`. Entrée au-delà de
 * 0147 § 13 (qui ne nomme que `retouches.ts`) : verdict Sécurité à rendre à la revue de M5d-1.
 */
const FRONTIERE_P0R3B = {
  entrees: [
    { fichier: "src/server/actions/p0-acces.ts", admise: (f: string, source: string) => directivesDuPrologue(f, source).includes("use server") },
    { fichier: "src/server/actions/p0-lancement.ts", admise: (f: string, source: string) => directivesDuPrologue(f, source).includes("use server") },
    // Recherche de ville du site d'essai (demande de Samuel du 23 octobre 2026, décision 0129).
    { fichier: "src/server/actions/villes-essai.ts", admise: (f: string, source: string) => directivesDuPrologue(f, source).includes("use server") },
    // Recherche de ville de api (décision 0141 § 6.1).
    { fichier: "src/server/actions/villes.ts", admise: (f: string, source: string) => directivesDuPrologue(f, source).includes("use server") },
    // Retouches de api (décision 0147 § 13 ligne 1 ; M5a, ticket 919 : `lockStop`, `unlockStop` ; M5c : `reportStop`).
    { fichier: "src/server/actions/retouches.ts", admise: (f: string, source: string) => directivesDuPrologue(f, source).includes("use server") },
    // Recherche d'un lieu à soi de api (décision 0147 § 3 ; M5d-1, ticket 939) : `searchPlaces`, `previewAddPlace`, `applyAddPlace`.
    { fichier: "src/server/actions/lieux.ts", admise: (f: string, source: string) => directivesDuPrologue(f, source).includes("use server") },
    // B4a (ticket 531 ; décision 0097 B4-TL-3 point 5 et B4-TL-11) : webhook simulé, seul module importé par le route
    // handler `src/app/api/v1/webhooks/simulated/route.ts` (`ligne/route-handlers`) ; module `server-only` sans directive,
    // qui lit `serverEnv()` et `@/server/env/payment`. Verdict Sécurité : approuvé, revue du head d50acfa (PR 582).
    {
      fichier: "src/server/routes/simulated-webhook.ts",
      admise: (f: string, source: string) => directivesDuPrologue(f, source).length === 0 && importeServerOnly(f, source),
    },
    // B4c (PR 863 ; décision 0140 § 2.1) : webhook Stripe, sur le modèle exact du simulé : seul module importé par le route
    // handler `src/app/api/v1/webhooks/stripe/route.ts` (`ligne/route-handlers`) ; module `server-only` sans directive, qui
    // lit `serverEnv()` et `@/server/env/payment` (secret lu à l'appel par `secretWebhookStripe`). Entrée au-delà de
    // 0140 § 6, relevée par `pnpm test` : verdict Sécurité à rendre à la revue de B4c.
    {
      fichier: "src/server/routes/stripe-webhook.ts",
      admise: (f: string, source: string) => directivesDuPrologue(f, source).length === 0 && importeServerOnly(f, source),
    },
    {
      fichier: "src/server/p0/page-acces.ts",
      admise: (f: string, source: string) => {
        const directives = directivesDuPrologue(f, source);
        return !directives.includes("use client") && !directives.includes("use server") && importeServerOnly(f, source);
      },
    },
  ],
  // B7a (décision 0077 § 3 point 1) : `src/ai/erreurs.ts` (codes réexportés par `egress.ts`), admis comme **terminal** :
  // jamais parcouru au-delà (il n'importe rien). B4a : `env/payment.ts` pour l'entrée du webhook, admis pour toutes les
  // entrées (liste commune, voir le commentaire de tête).
  admis: ["src/server/env/p0.ts", "src/server/env/index.ts", "src/server/env/payment.ts", "src/server/env/egress.ts", "src/server/env/openssl-conf.ts", "src/server/env/resolve.ts", FICHIER_ERREURS_IA],
  terminaux: [
    {
      fichier: "src/workflows/index.ts",
      admis: (f: string, source: string) => {
        const directives = directivesDuPrologue(f, source);
        // Non parcouru : ses imports exécutés sont bornés par nom (mineur 16 de la revue du head `193603d`).
        const bornes = importsExecutesDe(f, source).every((i) => IMPORTS_TERMINAL_WORKFLOWS.includes(i));
        return directives.length === 0 && importeServerOnly(f, source) && bornes;
      },
    },
    {
      // Recherche de ville du site d'essai : non parcouru, imports exécutés bornés par nom (`IMPORTS_TERMINAL_VILLES`).
      fichier: "src/server/composition/villes.ts",
      admis: (f: string, source: string) => {
        const bornes = importsExecutesDe(f, source).every((i) => IMPORTS_TERMINAL_VILLES.includes(i));
        return directivesDuPrologue(f, source).length === 0 && importeServerOnly(f, source) && bornes;
      },
    },
    {
      // Recherche de ville de api (décision 0141 § 11 ligne 2) : non parcouru, imports exécutés bornés par nom.
      fichier: "src/server/composition/villes-api.ts",
      admis: (f: string, source: string) => {
        const bornes = importsExecutesDe(f, source).every((i) => IMPORTS_TERMINAL_VILLES_API.includes(i));
        return directivesDuPrologue(f, source).length === 0 && importeServerOnly(f, source) && bornes;
      },
    },
    {
      // Recherche d'un lieu à soi de api (décision 0147 § 3, ticket 939) : non parcouru, imports exécutés bornés par nom.
      fichier: "src/server/composition/lieux-api.ts",
      admis: (f: string, source: string) => {
        const bornes = importsExecutesDe(f, source).every((i) => IMPORTS_TERMINAL_LIEUX_API.includes(i));
        return directivesDuPrologue(f, source).length === 0 && importeServerOnly(f, source) && bornes;
      },
    },
  ],
} as const;

/**
 * Arête nominative unique de la page de l'écran 1 (décision 0141 § 6.4 ; revue consolidée du head `bcaa346`, bloquant 1) :
 * `src/app/(creation)/voyages/nouveau/page.tsx` → `src/server/composition/villes-api.ts`, sans régime d'entrée. Admise
 * seulement si la page ne porte aucune directive (ni paquet client, ni action) et si le terminal porte sa propriété
 * (`FRONTIERE_P0R3B.terminaux`) ; le terminal n'est alors pas parcouru. Aucune autre arête de la page n'est admise.
 */
const ARETE_PAGE_VILLES_API = { de: "src/app/(creation)/voyages/nouveau/page.tsx", vers: "src/server/composition/villes-api.ts" } as const;

function aretePageVillesApiAdmise(de: string, vers: string, lire: (fichier: string) => string): boolean {
  return de === ARETE_PAGE_VILLES_API.de && vers === ARETE_PAGE_VILLES_API.vers && directivesDuPrologue(de, lire(de)).length === 0 && terminalFrontiereAdmis(vers, lire);
}

/** Vrai si `fichier` est un terminal de la frontière de P0r3b dont la propriété est vérifiée sur sa source. */
function terminalFrontiereAdmis(fichier: string, lire: (fichier: string) => string): boolean {
  const terminal = FRONTIERE_P0R3B.terminaux.find((t) => t.fichier === fichier);
  return terminal !== undefined && terminal.admis(fichier, lire(fichier));
}

/** Vrai si `fichier` est une entrée de la frontière de P0r3b dont la propriété est vérifiée sur sa source. */
function entreeFrontiereAdmise(fichier: string, lire: (fichier: string) => string): boolean {
  const entree = FRONTIERE_P0R3B.entrees.find((e) => e.fichier === fichier);
  return entree !== undefined && entree.admise(fichier, lire(fichier));
}

/**
 * Fermeture transitive depuis `departs`, `import()` compris ; rend les fichiers et paquets serveur seulement atteints,
 * avec le chemin qui y mène. `lire` est injecté pour jouer les cas négatifs sur un dépôt fictif.
 */
function atteintsServeurSeulement(
  departs: readonly string[],
  lire: (fichier: string) => string,
  resoudreCible: (depuis: string, specificateur: string) => Cible,
): string[] {
  const violations: string[] = [];
  // Un nœud est un fichier ou un paquet, suivi deux fois au plus : hors de la frontière de P0r3b, puis au-delà d'une
  // de ses entrées admises (`|action`). Un module atteint par les deux voies est donc contrôlé sur chacune.
  const noeud = (cle: string, viaAction: boolean) => (viaAction ? `${cle}|action` : cle);
  const fichierDe = (n: string) => n.replace(/\|action$/, "");
  const precedent = new Map<string, string | null>(departs.map((d) => [d, null]));
  const pile = [...departs];
  const chemin = (fin: string) => {
    const etapes = [fin];
    for (let courant = precedent.get(fin); courant !== null && courant !== undefined; courant = precedent.get(courant)) etapes.unshift(courant);
    return etapes.map(fichierDe).join(" → ");
  };
  while (pile.length > 0) {
    const courant = pile.pop() as string;
    const fichierCourant = fichierDe(courant);
    const viaAction = courant.endsWith("|action") || entreeFrontiereAdmise(fichierCourant, lire);
    for (const specificateur of importsClientDe(fichierCourant, lire(fichierCourant))) {
      const cible = specificateur === "?import-non-litteral" ? ({ type: "externe", nom: specificateur } as const) : resoudreCible(fichierCourant, specificateur);
      const cle = cible.type === "projet" ? cible.chemin : `externe:${cible.nom}`;
      const suivant = noeud(cle, viaAction);
      // Arête nominative de la page de l'écran 1 vers le terminal de api : ni violation, ni parcours au-delà. Testée
      // **avant** le marquage du nœud (revue du head `bc43913`, bloquant 1) : l'arête ne marque jamais le terminal comme
      // vu, et un autre fichier qui l'importe directement reste contrôlé, quel que soit l'ordre du parcours.
      if (!viaAction && cible.type === "projet" && aretePageVillesApiAdmise(fichierCourant, cle, lire)) continue;
      if (precedent.has(suivant)) continue;
      precedent.set(suivant, courant);
      // Terminal admis au-delà d'une entrée admise : ni violation, ni parcours au-delà.
      if (viaAction && cible.type === "projet" && terminalFrontiereAdmis(cle, lire)) continue;
      const admis = viaAction && (FRONTIERE_P0R3B.admis as readonly string[]).includes(cle);
      // Terminal de B7a : admis, jamais parcouru au-delà (0077 § 3 point 1), au-delà d'une entrée de la frontière, ou
      // atteint par l'un de ses deux réexportateurs (`egress.ts`, `port.ts` : chaîne `src/features` → `src/adapters` →
      // `src/server/usage/neon.ts` → `port.ts`, non prévue par 0077 ; écart soumis au Tech Lead et à la Sécurité).
      if (cle === FICHIER_ERREURS_IA && (admis || REEXPORTATEURS_ERREURS_IA.includes(fichierCourant))) continue;
      if (!admis && (ZONES_SERVEUR_SEULEMENT.some((zone) => cle.startsWith(zone)) || PAQUETS_SERVEUR_SEULEMENT.includes(cle) || cle === "externe:?import-non-litteral")) {
        violations.push(chemin(suivant));
        continue;
      }
      if (cible.type === "projet") pile.push(suivant);
    }
  }
  return violations;
}

/** Nom de variable publique (exposée au navigateur par Next.js) qui désignerait une clé serveur. */
const MOTIF_PUBLIQUE_SERVEUR = /NEXT_PUBLIC_\w*(?:OPENROUTER|MAPS_SERVER)/i;

describe("p0: clé côté serveur seulement", () => {
  const sourcesSrc = fichiers("src", [".ts", ".tsx", ".js", ".jsx", ".mjs"]).filter((f) => !estTest(f) && !/\.spec\.tsx?$/.test(f));
  const lireDepot = (fichier: string) => readFileSync(path.join(RACINE, fichier), "utf8");
  const clients = sourcesSrc.filter((f) => estFichierClient(f, lireDepot(f)));
  const departs = [
    ...new Set([...sourcesSrc.filter((f) => ["src/app/", "src/features/", "src/components/"].some((d) => f.startsWith(d))), ...clients]),
  ].sort();

  it("les départs couvrent src/app, src/features, src/components et chaque fichier \"use client\" du dépôt", () => {
    for (const dossier of ["src/app/", "src/features/", "src/components/"]) expect(departs.some((f) => f.startsWith(dossier)), dossier).toBe(true);
    // Des fichiers "use client" hors de ces trois dossiers existent (src/lib, src/analytics…) : ils sont des départs.
    expect(clients.some((f) => !["src/app/", "src/features/", "src/components/"].some((d) => f.startsWith(d)))).toBe(true);
    for (const f of clients) expect(departs).toContain(f);
  });

  it("aucun fichier de src/app, src/features, src/components ni aucun fichier \"use client\" n'atteint src/ai, src/grounding, src/research ou src/server/env", () => {
    expect(atteintsServeurSeulement(departs, lireDepot, resoudre)).toEqual([]);
  });

  it("cas négatifs : un composant client qui atteint un client réel ou un module de clé, même par un intermédiaire ou import(), est refusé", () => {
    const depot = new Map<string, string>([
      ["src/components/Direct.tsx", '"use client";\nimport { client } from "@/grounding/client-fictif";\n'],
      ["src/features/x/Barrel.tsx", 'import { y } from "./index";\n'],
      ["src/features/x/index.ts", 'export * from "@/server/env/grounding";\n'],
      ["src/app/page.tsx", 'const C = () => import("@/ai/client-fictif");\n'],
      ["src/lib/client.ts", '"use client";\nimport { generateText } from "ai";\n'],
      ["src/lib/calcule.ts", '"use client";\nconst m = "x";\nvoid import(m);\n'],
      ["src/components/Sain.tsx", '"use client";\nimport { z } from "zod";\nimport type { Trip } from "@/contracts";\n'],
    ]);
    const lireFictif = (fichier: string) => depot.get(fichier) ?? "";
    const resoudreFictif = (depuis: string, specificateur: string): Cible => {
      if (specificateur.startsWith("@/")) return { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` };
      if (specificateur.startsWith(".")) return { type: "projet", chemin: path.posix.normalize(path.posix.join(path.posix.dirname(depuis), `${specificateur}.ts`)) };
      return { type: "externe", nom: specificateur };
    };
    expect(estFichierClient("src/lib/client.ts", depot.get("src/lib/client.ts") ?? "")).toBe(true);
    expect(estFichierClient("x.ts", 'import "a";\n"use client";\n')).toBe(false);
    const un = (depart: string) => atteintsServeurSeulement([depart], lireFictif, resoudreFictif);
    expect(un("src/components/Direct.tsx")).toEqual(["src/components/Direct.tsx → src/grounding/client-fictif.ts"]);
    expect(un("src/features/x/Barrel.tsx")).toEqual(["src/features/x/Barrel.tsx → src/features/x/index.ts → src/server/env/grounding.ts"]);
    expect(un("src/app/page.tsx")).toEqual(["src/app/page.tsx → src/ai/client-fictif.ts"]);
    expect(un("src/lib/client.ts")).toEqual(["src/lib/client.ts → externe:ai"]);
    expect(un("src/lib/calcule.ts")).toEqual(["src/lib/calcule.ts → externe:?import-non-litteral"]);
    expect(un("src/components/Sain.tsx")).toEqual([]);
  });

  it("composition du mode réel (0055 § 3 point 6) : un composant client ou une page qui l'atteint, même par un intermédiaire, est refusé", () => {
    const depot = new Map<string, string>([
      ["src/app/prototype/page.tsx", 'import { x } from "@/server/p0/intermediaire";\n'],
      ["src/server/p0/intermediaire.ts", 'export { composerP0Reel as x } from "@/server/composition/p0-reel";\n'],
      ["src/features/Direct.tsx", '"use client";\nconst c = () => import("@/server/composition/p0-reel");\n'],
    ]);
    const lireFictif = (fichier: string) => depot.get(fichier) ?? "";
    const resoudreFictif = (_depuis: string, specificateur: string): Cible =>
      specificateur.startsWith("@/") ? { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` } : { type: "externe", nom: specificateur };
    expect(atteintsServeurSeulement(["src/app/prototype/page.tsx"], lireFictif, resoudreFictif)).toEqual([
      "src/app/prototype/page.tsx → src/server/p0/intermediaire.ts → src/server/composition/p0-reel.ts",
    ]);
    expect(atteintsServeurSeulement(["src/features/Direct.tsx"], lireFictif, resoudreFictif)).toEqual(["src/features/Direct.tsx → src/server/composition/p0-reel.ts"]);
  });

  it("frontière de P0r3b : au-delà de son action seulement, le module étroit du mode réel et ses modules de B3a ; aucune clé, aucune autre action", () => {
    const depot = new Map<string, string>([
      ["src/app/prototype/page.tsx", 'import { a } from "@/server/actions/p0-acces";\nimport { b } from "@/server/actions/autre";\n'],
      ["src/server/actions/p0-acces.ts", '"use server";\nimport { c } from "@/server/p0/acces";\n'],
      ["src/server/p0/acces.ts", 'import { d } from "@/server/env/p0";\nimport { e } from "@/server/env/ai";\n'],
      ["src/server/env/p0.ts", 'import { f } from "@/server/env/egress";\nimport { g } from "@/server/env/grounding";\n'],
      ["src/server/actions/autre.ts", '"use server";\nimport { h } from "@/server/env/p0";\n'],
      ["src/features/Direct.tsx", '"use client";\nimport { i } from "@/server/env/p0";\n'],
    ]);
    const lireFictif = (fichier: string) => depot.get(fichier) ?? "";
    const resoudreFictif = (_depuis: string, specificateur: string): Cible =>
      specificateur.startsWith("@/") ? { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` } : { type: "externe", nom: specificateur };
    expect(atteintsServeurSeulement(["src/app/prototype/page.tsx"], lireFictif, resoudreFictif).sort()).toEqual(
      [
        "src/app/prototype/page.tsx → src/server/actions/p0-acces.ts → src/server/p0/acces.ts → src/server/env/ai.ts",
        "src/app/prototype/page.tsx → src/server/actions/p0-acces.ts → src/server/p0/acces.ts → src/server/env/p0.ts → src/server/env/grounding.ts",
        "src/app/prototype/page.tsx → src/server/actions/autre.ts → src/server/env/p0.ts",
      ].sort(),
    );
    expect(atteintsServeurSeulement(["src/features/Direct.tsx"], lireFictif, resoudreFictif)).toEqual(["src/features/Direct.tsx → src/server/env/p0.ts"]);
  });

  it("frontière de P0r3b liée au fichier réel : action sans \"use server\", état de page sans server-only ou avec une directive → p0.ts redevient une violation", () => {
    const fichiers = (action: string, etat: string) =>
      new Map<string, string>([
        ["src/app/prototype/page.tsx", 'import { a } from "@/server/actions/p0-acces";\nimport { b } from "@/server/p0/page-acces";\n'],
        ["src/server/actions/p0-acces.ts", `${action}import { c } from "@/server/env/p0";\n`],
        ["src/server/p0/page-acces.ts", `${etat}import { d } from "@/server/env/p0";\n`],
      ]);
    const resoudreFictif = (_depuis: string, specificateur: string): Cible =>
      specificateur.startsWith("@/") ? { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` } : { type: "externe", nom: specificateur };
    const violations = (action: string, etat: string) => {
      const depot = fichiers(action, etat);
      return atteintsServeurSeulement(["src/app/prototype/page.tsx"], (f) => depot.get(f) ?? "", resoudreFictif).sort();
    };
    const VIA_ACTION = "src/app/prototype/page.tsx → src/server/actions/p0-acces.ts → src/server/env/p0.ts";
    const VIA_ETAT = "src/app/prototype/page.tsx → src/server/p0/page-acces.ts → src/server/env/p0.ts";
    const SERVEUR = 'import "server-only";\n';
    // Propriétés vérifiées : les deux entrées sont admises.
    expect(violations('"use server";\n', SERVEUR)).toEqual([]);
    // Action sans directive (ou directive après une instruction, ou "use client") : fichier ordinaire.
    for (const action of ["", 'import "x";\n"use server";\n', '"use client";\n', "// \"use server\"\n"]) {
      expect(violations(action, SERVEUR), JSON.stringify(action)).toEqual([VIA_ACTION]);
    }
    // État de page : sans server-only, ou avec "use server" (action appelable), ou "use client" : fichier ordinaire.
    for (const etat of ["", 'import { x } from "server-only";\n', `"use server";\n${SERVEUR}`, `"use client";\n${SERVEUR}`, 'const m = "server-only";\n']) {
      expect(violations('"use server";\n', etat), JSON.stringify(etat)).toEqual([VIA_ETAT]);
    }
    expect(directivesDuPrologue("x.ts", '"use strict";\n"use server";\nexport {};\n')).toEqual(["use strict", "use server"]);
  });

  it("frontière de P0r3b sur le dépôt : les trois entrées réelles, celles des webhooks simulé (B4a) et Stripe (B4c) et le terminal portent leur propriété", () => {
    expect(FRONTIERE_P0R3B.entrees.map((e) => e.fichier)).toEqual([
      "src/server/actions/p0-acces.ts",
      "src/server/actions/p0-lancement.ts",
      "src/server/actions/villes-essai.ts",
      "src/server/actions/villes.ts",
      "src/server/actions/retouches.ts",
      "src/server/actions/lieux.ts",
      "src/server/routes/simulated-webhook.ts",
      "src/server/routes/stripe-webhook.ts",
      "src/server/p0/page-acces.ts",
    ]);
    for (const entree of FRONTIERE_P0R3B.entrees) expect(entreeFrontiereAdmise(entree.fichier, lireDepot), entree.fichier).toBe(true);
    expect(FRONTIERE_P0R3B.terminaux.map((t) => t.fichier)).toEqual([
      "src/workflows/index.ts",
      "src/server/composition/villes.ts",
      "src/server/composition/villes-api.ts",
      "src/server/composition/lieux-api.ts",
    ]);
    for (const terminal of FRONTIERE_P0R3B.terminaux) expect(terminalFrontiereAdmis(terminal.fichier, lireDepot), terminal.fichier).toBe(true);
    expect(importsExecutesDe("src/workflows/index.ts", lireDepot("src/workflows/index.ts")).sort()).toEqual(["./apercu", "./complet", "./p0-run", "./p0-run", "./programme", "./recalcul", "./voyage-complet", "server-only", "workflow/api"]);
    // Le lancement réel passe bien par le terminal : sans arrêt, il atteindrait les modules de P0.
    const versIndex = (f: string) => importsClientDe(f, lireDepot(f)).includes("@/workflows");
    expect(versIndex("src/server/p0/lancement.ts") && versIndex("src/server/p0/page-acces.ts")).toBe(true);
  });

  it("terminal de P0r3d (src/workflows/index.ts) : admis au-delà d'une entrée seulement, et seulement avec server-only sans directive", () => {
    const resoudreFictif = (depuis: string, specificateur: string): Cible =>
      specificateur.startsWith("@/")
        ? { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` }
        : specificateur.startsWith("./")
          ? { type: "projet", chemin: `${path.posix.dirname(depuis)}/${specificateur.slice(2)}.ts` }
          : { type: "externe", nom: specificateur };
    const SERVEUR = 'import "server-only";\n';
    const depot = (index: string, extra: [string, string][] = [], suite = "") =>
      new Map<string, string>([
        ["src/features/Lancement.tsx", '"use client";\nimport { a } from "@/server/actions/p0-lancement";\n'],
        ["src/server/actions/p0-lancement.ts", '"use server";\nimport { b } from "@/server/p0/lancement";\n'],
        ["src/server/p0/lancement.ts", `${SERVEUR}import { c } from "@/workflows/index";\n`],
        ["src/workflows/index.ts", `${index}import { start } from "workflow/api";\nimport type { G } from "@/server/p0/garde";\nimport { d } from "./p0-run";\nexport { P } from "./complet";\n${suite}`],
        ["src/workflows/complet.ts", SERVEUR],
        ["src/workflows/p0-run.ts", `${SERVEUR}import { e } from "@/ai/client";\nimport { f } from "@/server/composition/p0-reel";\n`],
        ...extra,
      ]);
    const violations = (index: string, depart = "src/features/Lancement.tsx", extra: [string, string][] = [], suite = "") => {
      const d = depot(index, extra, suite);
      return atteintsServeurSeulement([depart], (f) => d.get(f) ?? "", resoudreFictif).sort();
    };
    const AU_DELA = [
      "src/features/Lancement.tsx → src/server/actions/p0-lancement.ts → src/server/p0/lancement.ts → src/workflows/index.ts → src/workflows/p0-run.ts → src/ai/client.ts",
      "src/features/Lancement.tsx → src/server/actions/p0-lancement.ts → src/server/p0/lancement.ts → src/workflows/index.ts → src/workflows/p0-run.ts → src/server/composition/p0-reel.ts",
    ];
    // Propriété vérifiée : arrêt au terminal.
    expect(violations(SERVEUR)).toEqual([]);
    // Sans server-only, avec une directive, ou server-only après "use client" : parcouru, chaque module de P0 refusé.
    for (const index of ["", '"use server";\nimport "server-only";\n', '"use client";\nimport "server-only";\n']) {
      expect(violations(index), JSON.stringify(index)).toEqual(AU_DELA);
    }
    // Import exécuté hors de la liste bornée (module, réexportation, import dynamique) : parcouru, chaque module refusé.
    for (const suite of ['import { g } from "@/ai/client";\n', 'export { h } from "@/ai/client";\n', 'const m = () => import("@/ai/client");\n']) {
      // Chaque module n'est rapporté qu'une fois, par le premier chemin parcouru (ici, l'import direct).
      expect(violations(SERVEUR, "src/features/Lancement.tsx", [], suite), suite).toEqual(
        ["src/features/Lancement.tsx → src/server/actions/p0-lancement.ts → src/server/p0/lancement.ts → src/workflows/index.ts → src/ai/client.ts", AU_DELA[1]].sort(),
      );
    }
    // Import de type seulement : effacé, admis.
    expect(violations(SERVEUR, "src/features/Lancement.tsx", [], 'import type { T } from "@/ai/client";\nexport type { U } from "@/ai/client";\n')).toEqual([]);
    // Atteint hors d'une entrée admise (composant client direct, ou action sans "use server") : parcouru, refusé.
    expect(violations(SERVEUR, "src/features/Direct.tsx", [["src/features/Direct.tsx", '"use client";\nimport { x } from "@/workflows/index";\n']])).toEqual([
      "src/features/Direct.tsx → src/workflows/index.ts → src/workflows/p0-run.ts → src/ai/client.ts",
      "src/features/Direct.tsx → src/workflows/index.ts → src/workflows/p0-run.ts → src/server/composition/p0-reel.ts",
    ]);
    expect(violations(SERVEUR, "src/features/Lancement.tsx", [["src/server/actions/p0-lancement.ts", 'import { b } from "@/server/p0/lancement";\n']])).toEqual(AU_DELA);
    // Le terminal n'admet que lui-même : le pont atteint directement depuis une entrée reste parcouru.
    expect(
      violations(SERVEUR, "src/features/Lancement.tsx", [["src/server/p0/lancement.ts", `${SERVEUR}import { c } from "@/workflows/p0-run";\n`]]),
    ).toEqual([
      "src/features/Lancement.tsx → src/server/actions/p0-lancement.ts → src/server/p0/lancement.ts → src/workflows/p0-run.ts → src/ai/client.ts",
      "src/features/Lancement.tsx → src/server/actions/p0-lancement.ts → src/server/p0/lancement.ts → src/workflows/p0-run.ts → src/server/composition/p0-reel.ts",
    ]);
  });

  it("terminal de la recherche de ville (src/server/composition/villes.ts) : admis au-delà de l'action villes-essai seulement, avec server-only, sans directive, imports bornés", () => {
    const resoudreFictif = (depuis: string, specificateur: string): Cible =>
      specificateur.startsWith("@/") ? { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` } : { type: "externe", nom: specificateur };
    const SERVEUR = 'import "server-only";\n';
    const VILLES = 'import { a } from "@/lib/fuseaux";\nimport { b } from "@/server/composition/clients-google";\n';
    const depot = (villes: string, action = '"use server";\nimport { v } from "@/server/composition/villes";\n', depart = '"use client";\nimport { s } from "@/server/actions/villes-essai";\n') =>
      new Map<string, string>([
        ["src/features/Ville.tsx", depart],
        ["src/server/actions/villes-essai.ts", action],
        ["src/server/composition/villes.ts", villes],
        ["src/server/composition/clients-google.ts", `${SERVEUR}import { c } from "@/grounding/client-fictif";\n`],
        ["src/grounding/client-fictif.ts", `${SERVEUR}import { k } from "@/server/env/grounding";\n`],
      ]);
    const violations = (...args: Parameters<typeof depot>) => {
      const d = depot(...args);
      return atteintsServeurSeulement(["src/features/Ville.tsx"], (f) => d.get(f) ?? "", resoudreFictif).sort();
    };
    const PARCOURU = "src/features/Ville.tsx → src/server/actions/villes-essai.ts → src/server/composition/villes.ts";
    // Propriété vérifiée : arrêt au terminal, rien au-delà.
    expect(violations(`${SERVEUR}${VILLES}`)).toEqual([]);
    // Sans server-only, avec une directive, ou un import exécuté hors de la liste bornée : fichier ordinaire, refusé.
    for (const villes of [VILLES, `"use client";\n${SERVEUR}${VILLES}`, `${SERVEUR}${VILLES}import { g } from "@/grounding/client-fictif";\n`]) {
      expect(violations(villes), JSON.stringify(villes)).toEqual([PARCOURU]);
    }
    // Action sans "use server", ou terminal atteint directement par un composant client : refusé.
    expect(violations(`${SERVEUR}${VILLES}`, 'import { v } from "@/server/composition/villes";\n')).toEqual([PARCOURU]);
    expect(violations(`${SERVEUR}${VILLES}`, undefined, '"use client";\nimport { v } from "@/server/composition/villes";\n')).toEqual([
      "src/features/Ville.tsx → src/server/composition/villes.ts",
    ]);
    // Sur le dépôt : imports exécutés du terminal réel, exactement la liste bornée.
    expect([...new Set(importsExecutesDe("src/server/composition/villes.ts", lireDepot("src/server/composition/villes.ts")))].sort()).toEqual([...IMPORTS_TERMINAL_VILLES].sort());
  });

  // Décision 0147 § 3 (M5d-1, ticket 939) : même forme que le terminal de la recherche de ville de api.
  it("terminal de la recherche d'un lieu à soi (src/server/composition/lieux-api.ts) : admis au-delà de l'action lieux seulement, avec server-only, sans directive, imports bornés", () => {
    const resoudreFictif = (depuis: string, specificateur: string): Cible =>
      specificateur.startsWith("@/") ? { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` } : { type: "externe", nom: specificateur };
    const SERVEUR = 'import "server-only";\n';
    const LIEUX = 'import { b } from "@/server/composition/clients-google";\nimport { c } from "@/server/generation/barriere";\nimport { r } from "@/server/lieux/recherche";\n';
    const depot = (lieux: string, action = '"use server";\nimport { v } from "@/server/composition/lieux-api";\n', depart = '"use client";\nimport { s } from "@/server/actions/lieux";\n') =>
      new Map<string, string>([
        ["src/features/Lieu.tsx", depart],
        ["src/server/actions/lieux.ts", action],
        ["src/server/composition/lieux-api.ts", lieux],
        ["src/server/composition/clients-google.ts", `${SERVEUR}import { c } from "@/grounding/client-fictif";\n`],
        ["src/grounding/client-fictif.ts", `${SERVEUR}import { k } from "@/server/env/grounding";\n`],
      ]);
    const violations = (...args: Parameters<typeof depot>) => {
      const d = depot(...args);
      return atteintsServeurSeulement(["src/features/Lieu.tsx"], (f) => d.get(f) ?? "", resoudreFictif).sort();
    };
    const PARCOURU = "src/features/Lieu.tsx → src/server/actions/lieux.ts → src/server/composition/lieux-api.ts";
    expect(violations(`${SERVEUR}${LIEUX}`)).toEqual([]);
    // Sans server-only, avec une directive, ou un import exécuté hors de la liste bornée (client réel, chemin d'essai, terminal des villes) : refusé.
    for (const lieux of [
      LIEUX,
      `"use client";\n${SERVEUR}${LIEUX}`,
      `${SERVEUR}${LIEUX}import { g } from "@/grounding/client-fictif";\n`,
      `${SERVEUR}${LIEUX}import { p } from "@/server/p0/base";\n`,
      `${SERVEUR}${LIEUX}import { v } from "@/server/config/villes";\n`,
    ]) {
      expect(violations(lieux), JSON.stringify(lieux)).toEqual([PARCOURU]);
    }
    // Action sans "use server", ou terminal atteint directement par un composant client : refusé.
    expect(violations(`${SERVEUR}${LIEUX}`, 'import { v } from "@/server/composition/lieux-api";\n')).toEqual([PARCOURU]);
    expect(violations(`${SERVEUR}${LIEUX}`, undefined, '"use client";\nimport { v } from "@/server/composition/lieux-api";\n')).toEqual([
      "src/features/Lieu.tsx → src/server/composition/lieux-api.ts",
    ]);
  });

  // Décision 0141 § 11 lignes 1 et 2 (PR 885) : même forme que le terminal du site d'essai.
  it("terminal de la recherche de ville de api (src/server/composition/villes-api.ts) : admis au-delà de l'action villes ou par l'arête nominative de la page de l'écran 1 seulement, avec server-only, sans directive, imports bornés", () => {
    const resoudreFictif = (depuis: string, specificateur: string): Cible =>
      specificateur.startsWith("@/") ? { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` } : { type: "externe", nom: specificateur };
    const SERVEUR = 'import "server-only";\n';
    const VILLES = 'import { a } from "@/lib/fuseaux";\nimport { b } from "@/server/composition/clients-google";\nimport { c } from "@/server/generation/barriere";\n';
    const depot = (villes: string, action = '"use server";\nimport { v } from "@/server/composition/villes-api";\n', depart = '"use client";\nimport { s } from "@/server/actions/villes";\n') =>
      new Map<string, string>([
        ["src/features/Ville.tsx", depart],
        ["src/server/actions/villes.ts", action],
        ["src/server/composition/villes-api.ts", villes],
        ["src/server/composition/clients-google.ts", `${SERVEUR}import { c } from "@/grounding/client-fictif";\n`],
        ["src/grounding/client-fictif.ts", `${SERVEUR}import { k } from "@/server/env/grounding";\n`],
      ]);
    const violations = (...args: Parameters<typeof depot>) => {
      const d = depot(...args);
      return atteintsServeurSeulement(["src/features/Ville.tsx"], (f) => d.get(f) ?? "", resoudreFictif).sort();
    };
    const PARCOURU = "src/features/Ville.tsx → src/server/actions/villes.ts → src/server/composition/villes-api.ts";
    expect(violations(`${SERVEUR}${VILLES}`)).toEqual([]);
    // Sans server-only, avec une directive, ou un import exécuté hors de la liste bornée (chemin d'essai, client réel) : refusé.
    for (const villes of [VILLES, `"use client";\n${SERVEUR}${VILLES}`, `${SERVEUR}${VILLES}import { g } from "@/grounding/client-fictif";\n`, `${SERVEUR}${VILLES}import { p } from "@/server/p0/base";\n`]) {
      expect(violations(villes), JSON.stringify(villes)).toEqual([PARCOURU]);
    }
    expect(violations(`${SERVEUR}${VILLES}`, 'import { v } from "@/server/composition/villes-api";\n')).toEqual([PARCOURU]);
    expect(violations(`${SERVEUR}${VILLES}`, undefined, '"use client";\nimport { v } from "@/server/composition/villes-api";\n')).toEqual([
      "src/features/Ville.tsx → src/server/composition/villes-api.ts",
    ]);
    // La page de l'écran 1 : une seule arête admise, vers ce terminal, sans directive ; avec "use client" ou "use server",
    // ou un terminal qui ne porte plus sa propriété, l'arête est refusée.
    const PAGE = "src/app/(creation)/voyages/nouveau/page.tsx";
    const page = (source: string, villes = `${SERVEUR}${VILLES}`) =>
      atteintsServeurSeulement([PAGE], (f) => (f === PAGE ? source : (depot(villes).get(f) ?? "")), resoudreFictif).sort();
    const VERS_TERMINAL = `${PAGE} → src/server/composition/villes-api.ts`;
    expect(page('import { o } from "@/server/composition/villes-api";\n')).toEqual([]);
    expect(page('"use client";\nimport { o } from "@/server/composition/villes-api";\n')).toEqual([VERS_TERMINAL]);
    expect(page('"use server";\nimport { o } from "@/server/composition/villes-api";\n')).toEqual([VERS_TERMINAL]);
    expect(page('import { o } from "@/server/composition/villes-api";\n', `${SERVEUR}${VILLES}import { p } from "@/server/p0/base";\n`)).toEqual([VERS_TERMINAL]);
    // Aucune autre arête : la page n'est pas une entrée (revue du head `bcaa346`, bloquant 1).
    expect(page('import { o } from "@/server/composition/villes-api";\nimport { e } from "@/server/env/index";\n')).toEqual([`${PAGE} → src/server/env/index.ts`]);
    expect(page('import { o } from "@/server/composition/villes";\n')).toEqual([`${PAGE} → src/server/composition/villes.ts`]);
    const refusParRelais = (specificateur: string, relais: string) =>
      atteintsServeurSeulement(
        [PAGE],
        (f) => (f === PAGE ? `import { x } from "${specificateur}";\n` : f === relais ? `${SERVEUR}import { k } from "@/server/env/p0";\n` : ""),
        resoudreFictif,
      );
    expect(refusParRelais("@/server/p0/base", "src/server/p0/base.ts")).toEqual([`${PAGE} → src/server/p0/base.ts → src/server/env/p0.ts`]);
    expect(refusParRelais("@/server/p0/acces", "src/server/p0/acces.ts")).toEqual([`${PAGE} → src/server/p0/acces.ts → src/server/env/p0.ts`]);
    expect(refusParRelais("@/workflows", "src/workflows.ts")).toEqual([`${PAGE} → src/workflows.ts → src/server/env/p0.ts`]);
    // Deux départs, dans les deux ordres (revue du head `bc43913`, bloquant 1) : l'arête de la page ne masque jamais
    // l'import direct du terminal par un autre fichier (composant client ou autre page).
    for (const autre of ["src/features/Ville.tsx", "src/app/(a)/page.tsx"]) {
      const sources = new Map<string, string>([
        [PAGE, 'import { o } from "@/server/composition/villes-api";\n'],
        [autre, `${autre.endsWith("Ville.tsx") ? '"use client";\n' : ""}import { o } from "@/server/composition/villes-api";\n`],
      ]);
      const lireDeux = (f: string) => sources.get(f) ?? depot(`${SERVEUR}${VILLES}`).get(f) ?? "";
      for (const departs of [[PAGE, autre], [autre, PAGE]]) {
        expect(atteintsServeurSeulement(departs, lireDeux, resoudreFictif), departs.join(", ")).toEqual([`${autre} → src/server/composition/villes-api.ts`]);
      }
    }
    // Sur le dépôt : la page n'est pas une entrée, et son arête vers le terminal est admise.
    expect(FRONTIERE_P0R3B.entrees.map((e) => e.fichier)).not.toContain(PAGE);
    expect(aretePageVillesApiAdmise(PAGE, "src/server/composition/villes-api.ts", lireDepot)).toBe(true);
    // Sur le dépôt : imports exécutés du terminal réel, exactement la liste bornée.
    expect([...new Set(importsExecutesDe("src/server/composition/villes-api.ts", lireDepot("src/server/composition/villes-api.ts")))].sort()).toEqual(
      [...IMPORTS_TERMINAL_VILLES_API].sort(),
    );
  });

  /**
   * Fichiers lus pour les noms publics : code (extensions analysées) de `src`, `scripts`, `db`, `eslint-rules` et
   * `tests`, workflows, `.env.example`, configuration de Next.js et configurations racine. Ce fichier (motif et cas
   * négatifs) est exclu ; les données du régime de confinement (JSON qui décrivent des textes admis) ne sont pas du code.
   */
  const CODE = /\.(?:[cm]?[jt]sx?|ya?ml)$/;
  const fichiersNoms = [
    ...["src", "scripts", "db", "eslint-rules", "tests", ".github"].flatMap((d) => tousLesFichiers(d)).filter((f) => CODE.test(f)),
    ...[".env.example", "next.config.ts", "package.json", "playwright.config.ts", "vitest.config.mts", "eslint.config.mjs"],
  ].filter((f) => existsSync(path.join(RACINE, f)) && f !== "tests/unit/p0/imports.test.ts");

  it("aucune variable NEXT_PUBLIC_* au nom de clé serveur (modèles ou Google serveur) dans le code, .env.example ou la configuration de Next.js", () => {
    expect(fichiersNoms).toContain(".env.example");
    expect(fichiersNoms).toContain("next.config.ts");
    const trouves = fichiersNoms.filter((f) => MOTIF_PUBLIQUE_SERVEUR.test(lireDepot(f)));
    expect(trouves).toEqual([]);
    // Cas négatifs du motif (casse comprise) ; la clé publique de la carte (navigateur, F4) reste admise.
    for (const nom of ["NEXT_PUBLIC_OPENROUTER", "next_public_maps_server_cle", "NEXT_PUBLIC_GOOGLE_MAPS_SERVER"]) {
      expect(nom).toMatch(MOTIF_PUBLIQUE_SERVEUR);
    }
    expect("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY").not.toMatch(MOTIF_PUBLIQUE_SERVEUR);
  });

  it("la configuration de Next.js n'expose aucune variable au navigateur par sa clé env", () => {
    const source = lireDepot("next.config.ts");
    const sf = ts.createSourceFile("next.config.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const clesEnv: string[] = [];
    const visiter = (noeud: ts.Node) => {
      if (ts.isPropertyAssignment(noeud) || ts.isShorthandPropertyAssignment(noeud) || ts.isMethodDeclaration(noeud)) {
        const nom = noeud.name;
        if ((ts.isIdentifier(nom) || ts.isStringLiteral(nom)) && nom.text === "env") clesEnv.push(noeud.getText(sf).slice(0, 80));
      }
      ts.forEachChild(noeud, visiter);
    };
    visiter(sf);
    expect(clesEnv).toEqual([]);
  });
});

// --- Fournisseur explicite, sur l'arbre syntaxique (mineur de la revue du head `353bb20` : le test du client de
// modèles compare des motifs du source ; celui-ci ne dépend pas de la mise en forme) ---

describe("p0: fournisseur de modèles explicite (arbre syntaxique)", () => {
  const FICHIER = "src/ai/openrouter-client.ts";
  const APPELS_AI_SDK = new Set(["generateText", "streamText", "generateObject", "streamObject"]);

  /** Appels de l'AI SDK du fichier, avec la forme de leurs propriétés `model`, `maxRetries` et `experimental_telemetry`. */
  function appelsAiSdk(source: string) {
    const sf = ts.createSourceFile(FICHIER, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const appels: { model?: ts.Expression; maxRetries?: ts.Expression; telemetrie?: ts.Expression; objet: boolean }[] = [];
    const visiter = (noeud: ts.Node) => {
      if (ts.isCallExpression(noeud) && ts.isIdentifier(noeud.expression) && APPELS_AI_SDK.has(noeud.expression.text)) {
        const argument = noeud.arguments[0];
        const appel: (typeof appels)[number] = { objet: argument !== undefined && ts.isObjectLiteralExpression(argument) };
        if (argument !== undefined && ts.isObjectLiteralExpression(argument)) {
          for (const propriete of argument.properties) {
            if (!ts.isPropertyAssignment(propriete) || !ts.isIdentifier(propriete.name)) continue;
            if (propriete.name.text === "model") appel.model = propriete.initializer;
            if (propriete.name.text === "maxRetries") appel.maxRetries = propriete.initializer;
            if (propriete.name.text === "experimental_telemetry") appel.telemetrie = propriete.initializer;
          }
        }
        appels.push(appel);
      }
      ts.forEachChild(noeud, visiter);
    };
    visiter(sf);
    return { sf, appels };
  }

  /** `const modele = fournisseur.chat(…)` : l'objet modèle de l'instance explicite. */
  function modeleExplicite(sf: ts.SourceFile, nom: string): boolean {
    let trouve = false;
    const visiter = (noeud: ts.Node) => {
      if (ts.isVariableDeclaration(noeud) && ts.isIdentifier(noeud.name) && noeud.name.text === nom && noeud.initializer !== undefined) {
        const init = noeud.initializer;
        trouve =
          ts.isCallExpression(init) &&
          ts.isPropertyAccessExpression(init.expression) &&
          ts.isIdentifier(init.expression.expression) &&
          init.expression.expression.text === "fournisseur" &&
          init.expression.name.text === "chat";
      }
      ts.forEachChild(noeud, visiter);
    };
    visiter(sf);
    return trouve;
  }

  function verifier(source: string): string[] {
    const { sf, appels } = appelsAiSdk(source);
    const fautes: string[] = [];
    if (appels.length === 0) fautes.push("aucun appel de l'AI SDK");
    for (const appel of appels) {
      if (!appel.objet) fautes.push("argument non littéral");
      const model = appel.model;
      if (model === undefined || !ts.isIdentifier(model) || !modeleExplicite(sf, model.text)) fautes.push("model : pas l'objet modèle de l'instance explicite");
      if (appel.maxRetries === undefined || !ts.isNumericLiteral(appel.maxRetries) || appel.maxRetries.text !== "0") fautes.push("maxRetries : pas le littéral 0");
      const t = appel.telemetrie;
      const desactivee =
        t !== undefined &&
        ts.isObjectLiteralExpression(t) &&
        t.properties.some((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "isEnabled" && p.initializer.kind === ts.SyntaxKind.FalseKeyword);
      if (!desactivee) fautes.push("télémétrie non désactivée");
    }
    return fautes;
  }

  it("chaque appel de l'AI SDK reçoit l'objet modèle de l'instance explicite, maxRetries: 0 et la télémétrie désactivée", () => {
    expect(verifier(readFileSync(path.join(RACINE, FICHIER), "utf8"))).toEqual([]);
  });

  it("cas négatifs : identifiant en chaîne, maxRetries absent ou non nul, télémétrie active, mise en forme quelconque", () => {
    const base = "const modele = fournisseur.chat(id, {});\n";
    expect(verifier(`${base}generateText({\n  model:\n    modele,\n  maxRetries:   0,\n  experimental_telemetry: {\n isEnabled: false },\n});`)).toEqual([]);
    expect(verifier(`${base}generateText({ model: "fournisseur/modele", maxRetries: 0, experimental_telemetry: { isEnabled: false } });`).length).toBeGreaterThan(0);
    expect(verifier(`${base}streamText({ model: \`x/\${y}\`, maxRetries: 0, experimental_telemetry: { isEnabled: false } });`).length).toBeGreaterThan(0);
    expect(verifier(`const autre = "x";\ngenerateObject({ model: autre, maxRetries: 0, experimental_telemetry: { isEnabled: false } });`).length).toBeGreaterThan(0);
    expect(verifier(`${base}generateText({ model: modele, experimental_telemetry: { isEnabled: false } });`).length).toBeGreaterThan(0);
    expect(verifier(`${base}generateText({ model: modele, maxRetries: 2, experimental_telemetry: { isEnabled: false } });`).length).toBeGreaterThan(0);
    expect(verifier(`${base}streamObject({ model: modele, maxRetries: 0, experimental_telemetry: { isEnabled: true } });`).length).toBeGreaterThan(0);
    expect(verifier(`${base}generateText(options);`).length).toBeGreaterThan(0);
  });
});

// --- B7a : exemption exacte de `src/ai/erreurs.ts` (décision 0077 § 3 point 1) ------------------------------------------

describe("p0: exemption exacte de src/ai/erreurs.ts (décision 0077 § 3 point 1)", () => {
  /** Même contrôle que pour un module sans import : aucun `import`, `export … from`, `import()` ni `require`. */
  const sansImport = (fichier: string, source: string) => {
    const { imports, constructions } = analyser(fichier, source);
    return imports.length === 0 && constructions.length === 0;
  };

  it("p0: src/ai/erreurs.ts n'importe rien", () => {
    expect(sansImport(FICHIER_ERREURS_IA, readFileSync(path.join(RACINE, FICHIER_ERREURS_IA), "utf8"))).toBe(true);
    // Le contrôle échoue sur chaque forme d'import (si le fichier en prend un, l'exemption tombe).
    for (const source of [
      'import "server-only";\n',
      'import type { Pace } from "@/contracts";\n',
      'export { a } from "./x";\n',
      'export * from "@/ai/requetes";\n',
      'const m = () => import("@/ai/requetes");\n',
      'const m = require("@/ai/requetes");\n',
      'import x = require("@/ai/requetes");\n',
    ]) {
      expect(sansImport(FICHIER_ERREURS_IA, source), source).toBe(false);
    }
  });

  it("égalité de chaîne seulement : ni préfixe, ni motif, ni autre fichier de src/ai", () => {
    expect(interditPartout(FICHIER_ERREURS_IA)).toBe(false);
    for (const chemin of ["src/ai/erreurs.ts.bak", "src/ai/erreurs/x.ts", "src/ai/erreurs.test.ts", "src/ai/requetes.ts", "src/ai/natures.ts", "src/research/erreurs.ts"]) {
      expect(interditPartout(chemin), chemin).toBe(true);
    }
  });

  const graphe = (aretes: Record<string, string[]>): Voisins => (fichier) => Object.entries(aretes).find(([nom]) => nom === fichier)?.[1] ?? [];

  it.each([
    ["admis : egress.ts → src/ai/erreurs.ts", "src/server/env/egress.ts", ["src/ai/erreurs.ts"], []],
    ["admis : port.ts → src/ai/erreurs.ts", "src/server/usage/port.ts", ["src/ai/erreurs.ts"], []],
    ["refusé : egress.ts → src/ai/requetes.ts", "src/server/env/egress.ts", ["src/ai/requetes.ts"], ["src/ai/requetes.ts"]],
    ["refusé : port.ts → src/ai/requetes.ts", "src/server/usage/port.ts", ["src/ai/requetes.ts"], ["src/ai/requetes.ts"]],
    ["refusé : egress.ts → src/ai/erreurs.ts.bak", "src/server/env/egress.ts", ["src/ai/erreurs.ts.bak"], ["src/ai/erreurs.ts.bak"]],
    ["refusé : port.ts → src/ai/erreurs/x.ts", "src/server/usage/port.ts", ["src/ai/erreurs/x.ts"], ["src/ai/erreurs/x.ts"]],
  ] satisfies [string, string, string[], string[]][])("graphe de l'application (interditPartout) : %s", (_nom, depart, cibles, attendu) => {
    expect(violationsApplication(depart, graphe({ [depart]: cibles }))).toEqual(attendu);
    // Même résultat atteint depuis une page de l'application par le port (chaîne de `src/adapters`, 0077 § 3 point 1).
    const page = graphe({ "src/app/x/page.tsx": ["src/adapters/y.ts"], "src/adapters/y.ts": [depart], [depart]: cibles });
    expect(violationsApplication("src/app/x/page.tsx", page)).toEqual(attendu);
  });

  it("pont p0Run : src/ai/erreurs.ts admis comme toute ouverture du pont (src/ai/), sans exemption propre ; src/domain et scripts/ toujours refusés", () => {
    expect(violationsPont("src/workflows/p0-run.ts", graphe({ "src/workflows/p0-run.ts": ["src/ai/erreurs.ts", "src/domain/temps.ts"] }))).toEqual(["src/domain/temps.ts"]);
    expect(violationsPont("src/workflows/p0-run.ts", graphe({ "src/workflows/p0-run.ts": ["src/lib/x.ts"], "src/lib/x.ts": ["scripts/p0/pipeline.ts"] }))).toEqual([
      "scripts/p0/pipeline.ts",
    ]);
  });

  it("frontière de P0r3b : erreurs.ts admis au-delà d'une entrée, comme terminal ; tout autre fichier de src/ai reste une violation", () => {
    const resoudreFictif = (_depuis: string, specificateur: string): Cible =>
      specificateur.startsWith("@/") ? { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` } : { type: "externe", nom: specificateur };
    const violations = (egress: string, extra: [string, string][] = [], depart = "src/app/prototype/page.tsx") => {
      const depot = new Map<string, string>([
        ["src/app/prototype/page.tsx", 'import { a } from "@/server/actions/p0-acces";\n'],
        ["src/server/actions/p0-acces.ts", '"use server";\nimport { b } from "@/server/env/p0";\n'],
        ["src/server/env/p0.ts", 'import { c } from "@/server/env/egress";\n'],
        ["src/server/env/egress.ts", egress],
        ...extra,
      ]);
      return atteintsServeurSeulement([depart], (f) => depot.get(f) ?? "", resoudreFictif).sort();
    };
    const CHAINE = "src/app/prototype/page.tsx → src/server/actions/p0-acces.ts → src/server/env/p0.ts → src/server/env/egress.ts";
    expect(violations('export { CODE_CLE_ABSENTE } from "@/ai/erreurs";\n')).toEqual([]);
    // Terminal : jamais parcouru au-delà (si erreurs.ts importait un autre module, le test « zéro import » échouerait).
    expect(violations('export { X } from "@/ai/erreurs";\n', [["src/ai/erreurs.ts", 'import { d } from "@/ai/requetes";\n']])).toEqual([]);
    expect(violations('import { e } from "@/ai/requetes";\n')).toEqual([`${CHAINE} → src/ai/requetes.ts`]);
    expect(violations('import { e } from "@/ai/natures";\n')).toEqual([`${CHAINE} → src/ai/natures.ts`]);
    expect(violations('import { e } from "@/ai/erreurs.ts.bak";\n')).toEqual([`${CHAINE} → src/ai/erreurs.ts.bak.ts`]);
    expect(violations('import { e } from "@/ai/erreurs/x";\n')).toEqual([`${CHAINE} → src/ai/erreurs/x.ts`]);
    // Hors d'une entrée admise : erreurs.ts n'est admis qu'atteint par l'un de ses deux réexportateurs (`egress.ts`,
    // `port.ts`) ; atteint directement ou par un autre module, il reste une violation.
    expect(violations("", [["src/features/Direct.tsx", '"use client";\nimport { f } from "@/ai/erreurs";\n']], "src/features/Direct.tsx")).toEqual([
      "src/features/Direct.tsx → src/ai/erreurs.ts",
    ]);
    const parPort: [string, string][] = [
      ["src/features/Port.tsx", '"use client";\nimport { g } from "@/adapters/y";\n'],
      ["src/adapters/y.ts", 'import { h } from "@/server/usage/port";\n'],
      ["src/server/usage/port.ts", 'export { CODES_REFUS_USAGE } from "@/ai/erreurs";\n'],
    ];
    expect(violations("", parPort, "src/features/Port.tsx")).toEqual([]);
    const parAutre: [string, string][] = [
      ["src/features/Autre.tsx", '"use client";\nimport { g } from "@/server/usage/autre";\n'],
      ["src/server/usage/autre.ts", 'export { CODES_REFUS_USAGE } from "@/ai/erreurs";\n'],
    ];
    expect(violations("", parAutre, "src/features/Autre.tsx")).toEqual(["src/features/Autre.tsx → src/server/usage/autre.ts → src/ai/erreurs.ts"]);
    const portVersRequetes: [string, string][] = [...parPort.slice(0, 2), ["src/server/usage/port.ts", 'export { x } from "@/ai/requetes";\n']];
    expect(violations("", portVersRequetes, "src/features/Port.tsx")).toEqual([
      "src/features/Port.tsx → src/adapters/y.ts → src/server/usage/port.ts → src/ai/requetes.ts",
    ]);
  });
});
