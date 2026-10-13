import { readFileSync } from "node:fs";

import ts from "typescript";

import * as capacites from "./listes/capacites";
import * as formesTests from "./listes/formes-tests";
import * as listeProcess from "./listes/process";
import * as specificateurs from "./listes/specificateurs";

// Vues typées des listes (objets en lecture seule, `as const satisfies`).
const LIGNES_CAPACITE: readonly capacites.LigneCapacite[] = [...capacites.LIGNES_CAPACITE, ...capacites.LIGNES_CAPACITE_TEXTES];
const FORMES_NOMINATIVES_TESTS: readonly formesTests.FormeNominativeTest[] = formesTests.FORMES_NOMINATIVES_TESTS;
const PROPRIETES_PROCESS: readonly listeProcess.LigneProcess[] = listeProcess.PROPRIETES_PROCESS;
const LECTURES_ENV: readonly listeProcess.LigneLectureEnv[] = listeProcess.LECTURES_ENV_TOUTES;
const ENV_ENTIER: readonly listeProcess.LigneEnvEntier[] = listeProcess.ENV_ENTIER;
const PARAMETRES_ENV: readonly listeProcess.ParametreEnv[] = listeProcess.PARAMETRES_ENV;
const SPECIFICATEURS: readonly specificateurs.LigneSpecificateur[] = specificateurs.SPECIFICATEURS;
const SPECIFICATEURS_NOMINATIFS: readonly specificateurs.LigneSpecificateurNominative[] = specificateurs.SPECIFICATEURS_NOMINATIFS;

/**
 * Analyseur unique du régime de confinement (spécification P0c, sections 2 à 6 ; décision 0038, P0c-TL-1 point 2).
 * Pour un fichier (chemin réel ou simulé, texte, et le vérificateur de types quand il y en a un), il produit la
 * liste des **constats** : chaque usage d'une capacité, chaque forme refusée, chaque spécificateur. Un constat est
 * `admis` quand une ligne des listes le couvre (`par` nomme la ligne, pour la règle « ligne inutile »), ou quand la
 * spécification l'admet sans ligne (`par` absent) ; sinon il est refusé.
 */

// --- Données du régime (valeurs refusées, lues par node:fs : section 1) -------------------------------------

type Refus = {
  hotes: string[];
  fragments: string[];
  nomsSecrets: string[];
  suffixesSecrets: string[];
  contenusSecrets: string[];
  exceptionsSecrets: string[];
  fragmentsSecrets: string[];
  motifsProc: string[];
  motifFichierEnv: string;
  fichiersEnvAdmis: string[];
  /** Paquets à capacité (section 3) ; `@ai-sdk/*` est traité à part. */
  paquetsCapacite: string[];
};

const REFUS = JSON.parse(readFileSync(new URL("./donnees/refus.json", import.meta.url), "utf8")) as Refus;
const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
const MOTIF_HOTES = new RegExp(`(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*(?:${REFUS.hotes.map(echapper).join("|")})(?![a-z0-9-])`, "g");
const MOTIF_FRAGMENTS = new RegExp(`(?<![a-z0-9])(?:${REFUS.fragments.map(echapper).join("|")})(?![a-z0-9])`, "g");
const MOTIF_FICHIER_ENV = new RegExp(REFUS.motifFichierEnv);

// --- Types ----------------------------------------------------------------------------------------------------

export type Regle =
  | "fichier"
  | "specificateur"
  | "module-capacite"
  | "identifiant"
  | "propriete"
  | "objet-global"
  | "constructeur"
  | "reflexion"
  | "contournement"
  | "hote"
  | "texte-interdit"
  | "acces-calcule"
  | "process"
  | "environnement"
  | "nom-secret"
  | "regime-tests";

/** Règles de la fermeture transitive (section 3, `graphe.ts`) ; un cas de `donnees/cas-fermeture.json` nomme l'une d'elles. */
export type RegleFermeture = "fermeture-import-de-test" | "fermeture-portee" | "fermeture-module-p0r1" | "fermeture-double-original";

export type Constat = {
  readonly fichier: string;
  readonly regle: Regle;
  readonly capacite: string;
  readonly forme: string;
  readonly ligne: number;
  readonly admis: boolean;
  /** Identifiant de la ligne qui admet le constat (règle « ligne inutile ») ; absent pour une forme admise sans ligne. */
  readonly par?: string;
};

export type Import = {
  readonly specificateur: string;
  /** Fichier suivi visé, pour un spécificateur relatif ou `@/…` résolu. */
  readonly cible?: string;
  readonly ligne: number;
};

/** `vi.mock`, `vi.doMock`, `vi.importActual`, `vi.importMock` : `original` vrai si le module réel est chargé. */
export type Double = { readonly specificateur: string; readonly original: boolean; readonly ligne: number };

export type Resultat = {
  readonly fichier: string;
  readonly constats: readonly Constat[];
  readonly imports: readonly Import[];
  readonly doubles: readonly Double[];
  /** Fonctions dont un paramètre reçoit `process.env` entier (section 5, forme 2). */
  readonly fonctionsEnv: readonly string[];
};

export type Contexte = {
  /** Vérificateur de types (P0c-TL-5), seulement pour un fichier jugé par les types. */
  readonly verificateur?: ts.TypeChecker;
  /** Arbre du programme pour ce fichier (obligatoire avec `verificateur`). */
  readonly arbre?: ts.SourceFile;
  /** Racine du programme de `tsconfig.json` (P0c-TL-5 point 2). Défaut : déduit de l'extension. */
  readonly racine?: boolean;
  /** Fichiers suivis (résolution des spécificateurs relatifs et `@/…`). */
  readonly existe: (chemin: string) => boolean;
  /** Contenu d'un autre fichier (constante importée de `process.env[…]`, section 5). */
  readonly lire: (chemin: string) => string | undefined;
};

// --- Classement des fichiers (section 1) --------------------------------------------------------------------

export const ZONES_SENSIBLES = ["src/ai/", "src/research/", "src/grounding/", "src/server/env/", "src/server/composition/"] as const;

export const estFichierTest = (chemin: string) =>
  chemin.startsWith("tests/") || /\.test\.tsx?$/.test(chemin) || /\.spec\.ts$/.test(chemin);
export const estZoneSensible = (chemin: string) => ZONES_SENSIBLES.some((zone) => chemin.startsWith(zone));
export const estDeclaration = (chemin: string) => /\.d\.m?ts$/.test(chemin);
export const estContracts = (chemin: string) => chemin.startsWith("src/contracts/");

/** Racine possible du programme de `tsconfig.json` d'après l'extension (`allowJs` faux). */
const racineParExtension = (chemin: string) => /\.(ts|tsx|mts)$/.test(chemin) && !estDeclaration(chemin);

/**
 * Fichier hors programme (amendement A2 de 0038) : pas racine, ou sous `scripts/p0/**`, ou en zone sensible. Ces
 * fichiers reçoivent la règle fermée de 2.6.
 */
export function horsProgramme(chemin: string, racine: boolean): boolean {
  return !racine || chemin.startsWith("scripts/p0/") || estZoneSensible(chemin);
}

// --- Appariement de motifs (zones) ------------------------------------------------------------------------------

/** Motif POSIX : `*` un segment (sans `/`), `**` zéro ou plusieurs segments. */
export function correspond(motif: string, chemin: string): boolean {
  let expression = "";
  for (let i = 0; i < motif.length; i += 1) {
    const caractere = motif[i] as string;
    if (caractere === "*" && motif[i + 1] === "*") {
      if (motif[i + 2] === "/") {
        expression += "(?:.*/)?";
        i += 2;
      } else {
        expression += ".*";
        i += 1;
      }
    } else if (caractere === "*") expression += "[^/]*";
    else expression += echapper(caractere);
  }
  return new RegExp(`^${expression}$`).test(chemin);
}

/** Zones spéciales des listes : `@test` (fichiers de test), `@src-non-test` (fichiers non-test de `src/`). */
export function dansZone(zone: string, chemin: string): boolean {
  if (zone === "@test") return estFichierTest(chemin);
  if (zone === "@src-non-test") return chemin.startsWith("src/") && !estFichierTest(chemin);
  if (zone === "@sensible") return estZoneSensible(chemin);
  return correspond(zone, chemin);
}

// --- Modules à capacité (section 3) -------------------------------------------------------------------------

const MODULES_NODE_CAPACITE = new Set([
  "http",
  "https",
  "http2",
  "tls",
  "net",
  "dgram",
  "dns",
  "child_process",
  "vm",
  "worker_threads",
  "cluster",
  "inspector",
  "module",
  "process",
]);

/**
 * Spécificateur normalisé (revue du head `ad0b008`, bloquant 1) : en minuscules, et préfixé de `node:` quand son
 * premier segment est un module de Node à capacité écrit sans préfixe (`child_process`, `http`…). `node:HTTP`,
 * `http` et `node:http` désignent donc le même module.
 */
export function normaliserSpecificateur(specificateur: string): string {
  const bas = specificateur.toLowerCase();
  const sansPrefixe = bas.startsWith("node:") ? bas.slice(5) : bas;
  return MODULES_NODE_CAPACITE.has(sansPrefixe.split("/")[0] as string) ? `node:${sansPrefixe}` : bas;
}

/**
 * Nom du module à capacité d'un spécificateur écrit sous sa forme canonique (`node:http`, `undici`), ou `undefined`.
 * Les clés des lignes nominatives en dérivent : une autre graphie n'est couverte par aucune ligne (voir
 * `moduleACapaciteNormalise`).
 */
export function moduleACapacite(specificateur: string): string | undefined {
  if (specificateur.startsWith("node:")) {
    const base = specificateur.slice(5).split("/")[0] as string;
    return MODULES_NODE_CAPACITE.has(base) ? `node:${base}` : undefined;
  }
  if (specificateur === "next/font/google" || specificateur.startsWith("next/font/google/")) return "next/font/google";
  if (specificateur.startsWith("@ai-sdk/")) return paquetDe(specificateur);
  const paquet = paquetDe(specificateur);
  return REFUS.paquetsCapacite.includes(paquet) ? paquet : undefined;
}

/** Nom du paquet d'un spécificateur tiers (`@scope/nom` ou `nom`). */
export function paquetDe(specificateur: string): string {
  const segments = specificateur.split("/");
  return specificateur.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] as string);
}

// --- Noms (sections 2.3, 2.6) -------------------------------------------------------------------------------

const NOMS_CAPACITE = [
  "fetch",
  "WebSocket",
  "XMLHttpRequest",
  "EventSource",
  "Worker",
  "SharedWorker",
  "importScripts",
  "eval",
  "Function",
  "require",
];
const IDENTIFIANTS_CAPACITE = new Set([...NOMS_CAPACITE, "module"]);
const PROPRIETES_REFUSEES = new Set([
  "sendBeacon",
  "getBuiltinModule",
  "binding",
  "_linkedBinding",
  "dlopen",
  "mainModule",
  ...NOMS_CAPACITE,
  "process",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);
const NOMS_GLOBAUX = new Set(["globalThis", "global", "self", "window"]);
export const NOMS_INTERDITS = new Set([
  "constructor",
  "prototype",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "caller",
  "callee",
  "arguments",
  "call",
  "apply",
  "bind",
  "process",
  "env",
  "fetch",
  "require",
  "eval",
  "Function",
  "globalThis",
  "getBuiltinModule",
  "binding",
  "_linkedBinding",
  "dlopen",
  "mainModule",
  "sendBeacon",
  "WebSocket",
  "XMLHttpRequest",
  "EventSource",
  "Worker",
  "SharedWorker",
  "importScripts",
  "Reflect",
  "Proxy",
]);
/** Réflexion de 2.3, refusée aussi comme propriété de tout objet (revue du head `ad0b008`, bloquant 2). */
const NOMS_REFLEXION = new Set(["Reflect", "Proxy"]);
const REFLEXION_OBJECT_REFUSEE = new Set([
  "getPrototypeOf",
  "setPrototypeOf",
  "getOwnPropertyDescriptor",
  "getOwnPropertyDescriptors",
  "getOwnPropertyNames",
  "getOwnPropertySymbols",
  "defineProperties",
]);
const SYMBOLES_BIEN_CONNUS = new Set(["iterator", "asyncIterator", "toStringTag", "hasInstance"]);
const REMPLACEMENTS = new Set(["mockImplementation", "mockResolvedValue", "mockRejectedValue", "mockReturnValue"]);

// --- Outils sur l'arbre ---------------------------------------------------------------------------------------

/** Conversions de type transparentes (2.1). */
const estConversion = (
  n: ts.Node,
): n is ts.ParenthesizedExpression | ts.AsExpression | ts.TypeAssertion | ts.NonNullExpression | ts.SatisfiesExpression =>
  ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression(n);

export function sansConversion(expression: ts.Expression): ts.Expression {
  let courante = expression;
  while (estConversion(courante)) courante = courante.expression;
  return courante;
}

/** Parent d'un nœud, en remontant les conversions qui l'enveloppent. */
function parentEffectif(noeud: ts.Node): { parent: ts.Node; enfant: ts.Node } {
  let enfant = noeud;
  let parent = noeud.parent;
  while (estConversion(parent)) {
    enfant = parent;
    parent = parent.parent;
  }
  return { parent, enfant };
}

/** Texte littéral (2.1) : chaîne, gabarit sans substitution, ou expression constante repliée. */
export function texteLitteral(expression: ts.Expression): string | undefined {
  const e = sansConversion(expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isNumericLiteral(e)) return String(Number(e.text));
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const gauche = texteLitteral(e.left);
    const droite = texteLitteral(e.right);
    if (gauche !== undefined && droite !== undefined) {
      const gaucheNombre = ts.isNumericLiteral(sansConversion(e.left));
      const droiteNombre = ts.isNumericLiteral(sansConversion(e.right));
      if (gaucheNombre && droiteNombre) return String(Number(gauche) + Number(droite));
      return gauche + droite;
    }
    return undefined;
  }
  if (ts.isTemplateExpression(e)) {
    let resultat = e.head.text;
    for (const span of e.templateSpans) {
      const valeur = texteLitteral(span.expression);
      if (valeur === undefined) return undefined;
      resultat += valeur + span.literal.text;
    }
    return resultat;
  }
  return undefined;
}

const estAffectation = (kind: ts.SyntaxKind) => kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

/** Le nœud est la cible d'une écriture (affectation, `delete`, `++`, `--`). */
function estEcrit(noeud: ts.Node): boolean {
  const { parent, enfant } = parentEffectif(noeud);
  if (ts.isBinaryExpression(parent) && parent.left === enfant && estAffectation(parent.operatorToken.kind)) return true;
  if (ts.isDeleteExpression(parent)) return true;
  if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
    (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  return false;
}

/** Nom d'une fonction (déclaration, expression affectée à une variable ou à une propriété, méthode). */
function nomDeFonction(fonction: ts.SignatureDeclaration): string | undefined {
  if ((ts.isFunctionDeclaration(fonction) || ts.isFunctionExpression(fonction) || ts.isMethodDeclaration(fonction)) && fonction.name && ts.isIdentifier(fonction.name)) {
    return fonction.name.text;
  }
  const { parent } = parentEffectif(fonction);
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return undefined;
}

/** Nom de la fonction appelée (`f(…)` ou `x.f(…)`). */
function nomAppele(appel: ts.CallExpression | ts.NewExpression): string | undefined {
  const cible = sansConversion(appel.expression);
  if (ts.isIdentifier(cible)) return cible.text;
  if (ts.isPropertyAccessExpression(cible)) return cible.name.text;
  return undefined;
}

/** Exports de `vitest` qui donnent l'objet `vi` (section 4) : `vi` et son alias `vitest`. */
export const EXPORTS_VI = new Set(["vi", "vitest"]);

/**
 * `<objet vi>.<nom>(…)` : `nomsVi` contient les noms liés à l'objet `vi` dans le fichier (`vi`, `vitest`, et tout alias
 * d'import `import { vi as v } from "vitest"`). Toute autre forme d'usage de ces noms est refusée par l'analyseur
 * (section 4 : les formes admises sont des appels de membre, rien d'autre).
 */
function appelVi(noeud: ts.Node, nomsVi: ReadonlySet<string>, ...noms: string[]): noeud is ts.CallExpression {
  if (!ts.isCallExpression(noeud)) return false;
  const cible = sansConversion(noeud.expression);
  if (!ts.isPropertyAccessExpression(cible)) return false;
  const objet = sansConversion(cible.expression);
  return ts.isIdentifier(objet) && nomsVi.has(objet.text) && noms.includes(cible.name.text);
}

/** Positions de type et déclarations ambiantes (2.1) : ne comptent pas comme usage d'une capacité. */
function estPositionDeType(noeud: ts.Node): boolean {
  if (ts.isExpressionWithTypeArguments(noeud)) {
    const clause = noeud.parent;
    return !(ts.isHeritageClause(clause) && clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent));
  }
  if (ts.isTypeNode(noeud)) return true;
  if (ts.isInterfaceDeclaration(noeud) || ts.isTypeAliasDeclaration(noeud) || ts.isTypeParameterDeclaration(noeud)) return true;
  if (ts.canHaveModifiers(noeud) && ts.getModifiers(noeud)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) return true;
  return false;
}

/** Spécificateur de module (exclu des textes, 2.5). */
function estSpecificateur(noeud: ts.Node): boolean {
  const parent = noeud.parent;
  if (!parent) return false;
  if ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === noeud) return true;
  if (ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) return true;
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (ts.isImportAttribute(parent)) return true;
  return false;
}

/** Texte en position de clé d'objet (exclu du contrôle des noms secrets, section 5). */
function estCle(noeud: ts.Node): boolean {
  const parent = noeud.parent;
  if (!parent) return false;
  return (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isBindingElement(parent)) &&
    (parent as { name?: ts.Node; propertyName?: ts.Node }).name === noeud ||
    (ts.isBindingElement(parent) && parent.propertyName === noeud)
  );
}

/** Nom d'une propriété de déstructuration ou de membre, s'il est littéral. */
function nomDePropriete(nom: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(nom) || ts.isPrivateIdentifier(nom)) return nom.text;
  if (ts.isStringLiteral(nom) || ts.isNumericLiteral(nom) || ts.isNoSubstitutionTemplateLiteral(nom)) return nom.text;
  if (ts.isComputedPropertyName(nom)) return texteLitteral(nom.expression);
  return undefined;
}

/** Littéral objet cible d'une affectation par déstructuration. */
function estCibleDeDestructuration(noeud: ts.Node): boolean {
  const { parent, enfant } = parentEffectif(noeud);
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.left === enfant) return true;
  if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === enfant) return true;
  if (ts.isPropertyAssignment(parent) && parent.initializer === enfant) return estCibleDeDestructuration(parent.parent);
  if (ts.isShorthandPropertyAssignment(parent) || ts.isSpreadAssignment(parent)) return estCibleDeDestructuration(parent.parent);
  if (ts.isArrayLiteralExpression(parent) || ts.isSpreadElement(parent)) return estCibleDeDestructuration(parent);
  return false;
}

// --- Normalisation des textes (2.5) ------------------------------------------------------------------------

export function normaliser(texte: string, expressionReguliere: boolean): string {
  let resultat = texte.normalize("NFKC").toLowerCase().replace(/%2e/g, ".");
  if (expressionReguliere) resultat = resultat.replace(/\[\.\]/g, ".").replace(/\\(.)/g, "$1");
  return resultat;
}

/** Hôtes et fragments surveillés d'un texte (2.5). Une ligne d'hôte couvre les fragments du même texte. */
export function hotesDe(texte: string, expressionReguliere: boolean): { hotes: string[]; fragments: string[] } {
  const normal = normaliser(texte, expressionReguliere);
  const hotes = [...normal.matchAll(MOTIF_HOTES)].map((m) => m[0]);
  const fragments = hotes.length > 0 ? [] : [...normal.matchAll(MOTIF_FRAGMENTS)].map((m) => m[0]);
  return { hotes, fragments };
}

/** Noms secrets et fragments d'un texte (section 5), comparés sans tenir compte de la casse. */
export function secretsDe(texte: string): string[] {
  const trouves: string[] = [];
  const exceptions = new Set(REFUS.exceptionsSecrets.map((n) => n.toUpperCase()));
  for (const m of texte.matchAll(/[A-Za-z0-9_]+/g)) {
    const nom = m[0].toUpperCase();
    if (exceptions.has(nom)) continue;
    if (
      REFUS.nomsSecrets.includes(nom) ||
      REFUS.suffixesSecrets.some((suffixe) => nom.endsWith(suffixe)) ||
      REFUS.contenusSecrets.some((contenu) => nom.includes(contenu))
    ) {
      trouves.push(nom);
    }
  }
  const majuscules = texte.toUpperCase();
  for (const fragment of REFUS.fragmentsSecrets) if (majuscules.includes(fragment)) trouves.push(fragment);
  return trouves;
}

/** Nom secret (section 5), pour `vi.stubEnv` et les lignes de `process.env`. */
export const estNomSecret = (nom: string) => secretsDe(nom).length > 0;

/**
 * Fichiers où une lecture de `process.env` peut porter un nom secret (section 5, « Noms secrets ») : modules non-test
 * de `src/server/env/`, le module de connexion de B1 (`db/connection.ts`) et son outil de migration (`db/migrate.ts`,
 * seul lecteur de la variable de `vadrouille_migrator`, section 9), ajoutés par la PR du ticket 242 (B1, PR 188, fusionnée
 * après P0c1) ; verdict Sécurité : approuvé sur le head a89d9a5 (PR 244). Les noms lus restent fixés fichier par fichier par `LECTURES_ENV`.
 */
const MODULES_DE_CONNEXION_B1 = ["db/connection.ts", "db/migrate.ts"];
export const lectureSecreteAdmise = (fichier: string) =>
  (fichier.startsWith("src/server/env/") && !estFichierTest(fichier)) || MODULES_DE_CONNEXION_B1.includes(fichier);

/**
 * Noms secrets des listes de `process.env` et de `vi.stubEnv` (section 5 ; bloquant 3 de la revue du head `eb7e3bf`) :
 * une lecture hors des modules admis, ou tout nom de `vi.stubEnv` (section 4, forme 3), est une violation.
 */
export function nomsSecretsDesListes(
  lectures: readonly { readonly fichier: string; readonly noms: readonly string[] }[],
  tablesStubEnv: readonly { readonly fichier: string; readonly valeur: string }[],
): string[] {
  const violations: string[] = [];
  for (const l of lectures) for (const nom of l.noms) if (estNomSecret(nom) && !lectureSecreteAdmise(l.fichier)) violations.push(`${l.fichier} : lecture de ${nom}`);
  for (const t of tablesStubEnv) for (const nom of t.valeur.split(",")) if (estNomSecret(nom)) violations.push(`${t.fichier} : vi.stubEnv de ${nom}`);
  return violations;
}

// --- Résolution des spécificateurs (2.2) -----------------------------------------------------------------------

const SUFFIXES_RESOLUTION = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", ".d.mts", ".d.ts", "/index.ts", "/index.tsx", "/index.mts", "/index.mjs", "/index.js", "/index.d.mts", "/index.d.ts"];

function normaliserChemin(chemin: string): string | undefined {
  const segments: string[] = [];
  for (const segment of chemin.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else segments.push(segment);
  }
  return segments.join("/");
}

/** Spécificateur relatif ou `@/…` résolu vers un fichier suivi ; `undefined` s'il ne résout vers aucun. */
export function resoudre(depuis: string, specificateur: string, existe: (chemin: string) => boolean): string | undefined {
  let base: string | undefined;
  if (specificateur.startsWith("@/")) base = normaliserChemin(`src/${specificateur.slice(2)}`);
  else {
    const dossier = depuis.includes("/") ? depuis.slice(0, depuis.lastIndexOf("/")) : "";
    base = normaliserChemin(`${dossier}/${specificateur}`);
  }
  if (base === undefined) return undefined;
  for (const suffixe of SUFFIXES_RESOLUTION) if (existe(base + suffixe)) return base + suffixe;
  return undefined;
}

export const estRelatif = (s: string) => s.startsWith("./") || s.startsWith("../") || s.startsWith("@/") || s === "." || s === "..";

/** Module à capacité d'un spécificateur dans toute graphie (préfixe `node:` absent, casse) : doubles et graphe. */
export const moduleACapaciteNormalise = (specificateur: string) => moduleACapacite(normaliserSpecificateur(specificateur));

/** Spécificateurs tiers admis sans ligne en zone sensible et dans les non-test de `src/contracts/` (section 6). */
function tiersDeZone(chemin: string): readonly string[] | undefined {
  if (estZoneSensible(chemin)) return estFichierTest(chemin) ? ["vitest", "zod", "node:fs", "node:path"] : ["zod"];
  if (estContracts(chemin) && !estFichierTest(chemin)) return ["zod"];
  return undefined;
}

/** Ligne générale de `SPECIFICATEURS` qui admet ce spécificateur tiers dans ce fichier. */
function ligneTiers(chemin: string, texte: string): specificateurs.LigneSpecificateur | undefined {
  return SPECIFICATEURS.find(
    (l) =>
      (l.sousChemins === "exacts" ? texte === l.specificateur : texte === l.specificateur || texte.startsWith(`${l.specificateur}/`)) &&
      l.zones.some((zone) => dansZone(zone, chemin)) &&
      !(l.sauf ?? []).some((zone) => dansZone(zone, chemin)),
  );
}

/**
 * Double « original » (section 4, forme 2 : `vi.importActual`, `vi.importMock`, fabrique absente, non littérale ou à
 * paramètre, options `{ spy: true }`) admis sans ligne : spécificateur relatif ou `@/…` (sa fermeture est jugée par
 * le graphe), ou spécificateur tiers qu'une ligne de la section 6 admet dans ce fichier et qui n'est pas un module à
 * capacité. Tout autre spécificateur (nom nu, module de Node sans préfixe ou en autre casse, paquet non listé) est
 * refusé (revue du head `ad0b008`, bloquant 1) ; la comparaison se fait sur le spécificateur normalisé.
 */
export function doubleOriginalAdmis(chemin: string, specificateur: string): boolean {
  if (estRelatif(specificateur)) return true;
  const normal = normaliserSpecificateur(specificateur);
  if (moduleACapaciteNormalise(normal)) return false;
  const zone = tiersDeZone(chemin);
  if (zone) return zone.some((a) => normal === a || normal.startsWith(`${a}/`));
  return ligneTiers(chemin, normal) !== undefined;
}

// --- Analyse ----------------------------------------------------------------------------------------------------

type Collecteur = {
  ajouter: (regle: Regle, capacite: string, forme: string, noeud: ts.Node | number, admis?: boolean, par?: string) => void;
  /** Refus qu'aucune ligne ne peut couvrir (nom secret hors des modules admis, section 5). */
  refuser: (regle: Regle, capacite: string, forme: string, noeud: ts.Node | number) => void;
};

/**
 * Clé d'un constat dans les lignes de capacité : la capacité elle-même quand elle porte déjà son préfixe de section 3
 * (`module:`, `identifiant:`, `global:`, `hote:`, `fragment:`, `secret:`), sinon `<règle>:<capacité>`.
 */
export function cleDeCapacite(regle: Regle, capacite: string): string {
  return /^(module|identifiant|global|hote|fragment|secret):/.test(capacite) ? capacite : `${regle}:${capacite}`;
}

/**
 * Ligne de capacité qui couvre exactement (fichier, capacité, forme) : son identifiant et, s'il est borné, le nombre
 * d'occurrences admises de la forme dans le fichier (décision 0040 D1 : une occurrence de plus est refusée).
 */
function ligneDeCapacite(fichier: string, regle: Regle, capacite: string, forme: string): { id: string; nombre?: number } | undefined {
  const cle = cleDeCapacite(regle, capacite);
  for (const ligne of LIGNES_CAPACITE) {
    if (ligne.fichier !== fichier) continue;
    for (const entree of ligne.capacites) {
      if (entree.capacite === cle && entree.formes.includes(forme)) {
        return { id: idLigneCapacite(fichier, cle, forme), ...(entree.nombre !== undefined ? { nombre: entree.nombre } : {}) };
      }
    }
  }
  return undefined;
}

export const idLigneCapacite = (fichier: string, cle: string, forme: string) => `capacite:${fichier}:${cle}:${forme}`;

export function analyser(chemin: string, source: string, contexte: Contexte): Resultat {
  const constats: Constat[] = [];
  const imports: Import[] = [];
  const doubles: Double[] = [];
  const typesActifs = contexte.verificateur !== undefined && contexte.arbre !== undefined;
  const racine = contexte.racine ?? racineParExtension(chemin);
  const regleFermee = horsProgramme(chemin, racine) || !typesActifs;
  const formeConstructeurAdmise = !horsProgramme(chemin, racine);
  const test = estFichierTest(chemin);
  const sensible = estZoneSensible(chemin);
  const verificateur = contexte.verificateur;

  const scriptKind = /\.(tsx|jsx)$/.test(chemin)
    ? ts.ScriptKind.TSX
    : /\.(mjs|cjs|js)$/.test(chemin)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const arbre = contexte.arbre ?? ts.createSourceFile(chemin, source, ts.ScriptTarget.Latest, true, scriptKind);
  const texteNormalise = (n: ts.Node) => n.getText(arbre).replace(/\s+/g, " ");
  const numero = (noeud: ts.Node | number) =>
    arbre.getLineAndCharacterOfPosition(typeof noeud === "number" ? noeud : noeud.getStart(arbre)).line + 1;

  const occurrences = new Map<string, number>();
  const c: Collecteur = {
    ajouter(regle, capacite, forme, noeud, admis = false, par) {
      // Tout constat refusé peut être couvert par une ligne nominative exacte (fichier, capacité, forme) : section 3,
      // ou écart écrit dans la ligne (champ `ecart`), contrôlé par `depot.test.ts`.
      if (admis) {
        constats.push({ fichier: chemin, regle, capacite, forme, ligne: numero(noeud), admis: true, ...(par ? { par } : {}) });
        return;
      }
      const ligne = ligneDeCapacite(chemin, regle, capacite, forme);
      if (ligne) {
        const vu = (occurrences.get(ligne.id) ?? 0) + 1;
        occurrences.set(ligne.id, vu);
        if (ligne.nombre !== undefined && vu > ligne.nombre) {
          constats.push({ fichier: chemin, regle, capacite, forme: `${forme} (occurrence ${vu}, ${ligne.nombre} admise(s))`, ligne: numero(noeud), admis: false });
          return;
        }
      }
      constats.push({ fichier: chemin, regle, capacite, forme, ligne: numero(noeud), admis: ligne !== undefined, ...(ligne ? { par: ligne.id } : {}) });
    },
    refuser(regle, capacite, forme, noeud) {
      constats.push({ fichier: chemin, regle, capacite, forme, ligne: numero(noeud), admis: false });
    },
  };
  const capacite = (regle: Regle, nom: string, forme: string, noeud: ts.Node) => c.ajouter(regle, nom, forme, noeud);

  // Fichiers (section 1).
  if (/\.(js|cjs|jsx|cts)$/.test(chemin)) c.ajouter("fichier", "mode-non-strict", chemin.slice(chemin.lastIndexOf(".")), 0);

  // Liaisons de `Symbol` dans le fichier (2.6) et alias des noms de l'objet global (2.3).
  let symboleLie = false;
  const alias = new Map<string, string>();
  const parametresEnv: { fonction: ts.Node; nom: string }[] = [];
  const fonctionsEnv = new Set<string>();
  const lignesParametres = PARAMETRES_ENV.filter((p) => p.fichier === chemin);
  // Noms liés à l'objet `vi` (section 4) : `vi` et `vitest` (globaux de Vitest ou importés), plus les alias d'import.
  const nomsVi = new Set<string>(EXPORTS_VI);
  const reperer = (noeud: ts.Node) => {
    if (ts.isImportDeclaration(noeud) && ts.isStringLiteral(noeud.moduleSpecifier) && noeud.moduleSpecifier.text === "vitest") {
      const liaisons = noeud.importClause?.namedBindings;
      if (liaisons && ts.isNamedImports(liaisons)) {
        for (const e of liaisons.elements) if (EXPORTS_VI.has((e.propertyName ?? e.name).text)) nomsVi.add(e.name.text);
      }
    }
    const nom = (noeud as { name?: ts.Node }).name;
    if (
      nom &&
      ts.isIdentifier(nom) &&
      nom.text === "Symbol" &&
      (ts.isVariableDeclaration(noeud) ||
        ts.isParameter(noeud) ||
        ts.isBindingElement(noeud) ||
        ts.isFunctionDeclaration(noeud) ||
        ts.isFunctionExpression(noeud) ||
        ts.isClassDeclaration(noeud) ||
        ts.isClassExpression(noeud) ||
        ts.isImportSpecifier(noeud) ||
        ts.isImportClause(noeud) ||
        ts.isNamespaceImport(noeud) ||
        ts.isImportEqualsDeclaration(noeud) ||
        ts.isEnumDeclaration(noeud) ||
        ts.isModuleDeclaration(noeud))
    ) {
      symboleLie = true;
    }
    if (ts.isVariableDeclaration(noeud) && ts.isIdentifier(noeud.name) && noeud.initializer) {
      const valeur = sansConversion(noeud.initializer);
      if (ts.isIdentifier(valeur) && NOMS_GLOBAUX.has(valeur.text)) alias.set(noeud.name.text, valeur.text);
    }
    if (ts.isFunctionLike(noeud)) {
      const nomFonction = nomDeFonction(noeud);
      for (const parametre of noeud.parameters) {
        if (ts.isIdentifier(parametre.name) && parametre.initializer && estProcessEnv(sansConversion(parametre.initializer))) {
          parametresEnv.push({ fonction: noeud, nom: parametre.name.text });
          if (nomFonction) fonctionsEnv.add(nomFonction);
        } else if (ts.isIdentifier(parametre.name) && nomFonction && lignesParametres.some((l) => l.fonction === nomFonction && l.parametre === (parametre.name as ts.Identifier).text)) {
          parametresEnv.push({ fonction: noeud, nom: parametre.name.text });
          fonctionsEnv.add(nomFonction);
        }
        if (ts.isObjectBindingPattern(parametre.name) && nomFonction) {
          for (const element of parametre.name.elements) {
            if (ts.isIdentifier(element.name) && lignesParametres.some((l) => l.fonction === nomFonction && l.parametre === (element.name as ts.Identifier).text)) {
              parametresEnv.push({ fonction: noeud, nom: element.name.text });
              fonctionsEnv.add(nomFonction);
            }
          }
        }
      }
    }
    ts.forEachChild(noeud, reperer);
  };
  reperer(arbre);

  /** Paramètre `env` suivi (section 5, forme 2) qui contient ce nœud. */
  const parametreEnvDe = (identifiant: ts.Identifier) =>
    parametresEnv.find(
      (p) => p.nom === identifiant.text && identifiant.pos >= p.fonction.pos && identifiant.end <= p.fonction.end,
    );

  // --- Spécificateurs (2.2, section 6) ---------------------------------------------------------------------
  const specificateur = (texte: string, forme: string[], noeud: ts.Node) => {
    const ligne = numero(noeud);
    if (estRelatif(texte)) {
      const cible = resoudre(chemin, texte, contexte.existe);
      imports.push({ specificateur: texte, ...(cible ? { cible } : {}), ligne });
      if (!cible) {
        c.ajouter("specificateur", "non-resolu", texte, noeud);
        return;
      }
      if (sensible || (estContracts(chemin) && !test)) {
        const autorise = sensible
          ? estZoneSensible(cible) || (estContracts(cible) && !estFichierTest(cible)) || (test && cible.startsWith("tests/support/"))
          : estContracts(cible) && !estFichierTest(cible);
        if (autorise) c.ajouter("specificateur", "projet", texte, noeud, true);
        else {
          c.ajouter("specificateur", "zone", texte, noeud, ...nominatif(texte, forme));
        }
      }
      return;
    }
    imports.push({ specificateur: texte, ligne });
    // Graphie non canonique d'un module à capacité (`https`, `node:HTTP`) : refus qu'aucune ligne ne couvre.
    if (!moduleACapacite(texte) && moduleACapaciteNormalise(texte)) {
      c.refuser("specificateur", "non-canonique", texte, noeud);
      return;
    }
    const moduleCapacite = moduleACapacite(texte);
    if (moduleCapacite) {
      for (const f of forme) capacite("module-capacite", `module:${moduleCapacite}`, f, noeud);
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(texte) && !texte.startsWith("node:")) {
      c.ajouter("specificateur", "schema", texte, noeud);
      return;
    }
    const admis = tiersDeZone(chemin);
    if (admis) {
      if (admis.some((a) => texte === a || texte.startsWith(`${a}/`))) {
        c.ajouter("specificateur", "tiers", texte, noeud, true);
        return;
      }
      c.ajouter("specificateur", "zone", texte, noeud, ...nominatif(texte, forme));
      return;
    }
    const ligneGenerale = ligneTiers(chemin, texte);
    if (ligneGenerale) c.ajouter("specificateur", "tiers", texte, noeud, true, `spec:${ligneGenerale.specificateur}`);
    else c.ajouter("specificateur", "non-liste", texte, noeud, ...nominatif(texte, forme));
  };
  /** Ligne nominative de spécificateur (fichier, spécificateur, noms), écart écrit dans la liste : tous les noms importés y figurent. */
  const nominatif = (texte: string, formes: readonly string[]): [boolean, string | undefined] => {
    const ligne = SPECIFICATEURS_NOMINATIFS.find((l) => l.fichier === chemin && l.specificateur === texte);
    if (!ligne || !formes.every((f) => ligne.noms.includes(f))) return [false, undefined];
    // Chaque nom de la ligne est soumis à « ligne inutile ».
    for (const f of formes) constats.push({ fichier: chemin, regle: "specificateur", capacite: "nom", forme: `${texte}:${f}`, ligne: 0, admis: true, par: `spec-nom:${chemin}:${texte}:${f}` });
    return [true, `spec-nominatif:${chemin}:${texte}`];
  };

  const formesImport = (clause: ts.ImportClause | undefined, typeSeul: boolean): string[] => {
    if (!clause) return ["effet"];
    const formes: string[] = [];
    const prefixe = (t: boolean) => (typeSeul || t ? "type:" : "");
    if (clause.name) formes.push(`${prefixe(false)}default`);
    const liaisons = clause.namedBindings;
    if (liaisons && ts.isNamespaceImport(liaisons)) formes.push(`${prefixe(false)}*`);
    if (liaisons && ts.isNamedImports(liaisons)) {
      for (const element of liaisons.elements) formes.push(`${prefixe(element.isTypeOnly)}${(element.propertyName ?? element.name).text}`);
    }
    return formes.length > 0 ? formes : ["effet"];
  };

  // --- Textes (2.4, 2.5, section 5) -----------------------------------------------------------------------
  const texte = (valeur: string, noeud: ts.Node, expressionReguliere: boolean, cle: boolean) => {
    const { hotes, fragments } = hotesDe(valeur, expressionReguliere);
    for (const hote of hotes) capacite("hote", `hote:${hote}`, valeur, noeud);
    for (const fragment of fragments) capacite("hote", `fragment:${fragment}`, valeur, noeud);
    const normal = normaliser(valeur, expressionReguliere);
    for (const motif of REFUS.motifsProc) if (normal.includes(motif)) c.ajouter("texte-interdit", "proc", valeur, noeud);
    const env = normal.match(MOTIF_FICHIER_ENV);
    if (env && !REFUS.fichiersEnvAdmis.includes(env[0].replace(/^\//, ""))) c.ajouter("texte-interdit", "fichier-env", valeur, noeud);
    if (!cle) for (const nom of secretsDe(valeur)) c.ajouter("nom-secret", `secret:${nom}`, valeur, noeud);
  };
  const estArgumentRegExp = (noeud: ts.Node) => {
    const { parent } = parentEffectif(noeud);
    return (ts.isNewExpression(parent) || ts.isCallExpression(parent)) && nomAppele(parent) === "RegExp" && ts.isIdentifier(sansConversion(parent.expression));
  };
  const estPlusReplie = (noeud: ts.Node) => {
    const { parent } = parentEffectif(noeud);
    return (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken && texteLitteral(parent) !== undefined) ||
      (ts.isTemplateSpan(parent) && texteLitteral(parent.parent) !== undefined);
  };

  // --- process et process.env (section 5) ----------------------------------------------------------------
  function estProcessEnv(e: ts.Expression): boolean {
    return ts.isPropertyAccessExpression(e) && e.name.text === "env" && ts.isIdentifier(sansConversion(e.expression)) && (sansConversion(e.expression) as ts.Identifier).text === "process";
  }
  const lectureEnv = (nom: string, noeud: ts.Node, via: string) => {
    // Nom secret hors des modules admis : refus qu'aucune ligne ne couvre (section 5).
    if (estNomSecret(nom) && !lectureSecreteAdmise(chemin)) c.refuser("nom-secret", `lecture:${nom}`, nom, noeud);
    if (nom === "NODE_ENV") {
      c.ajouter("environnement", "lecture", nom, noeud, true);
      return;
    }
    const ligne = LECTURES_ENV.find((l) => l.fichier === chemin && l.noms.includes(nom) && (l.constante ?? false) === (via === "constante"));
    const par = ligne ? `env:${chemin}:${nom}` : undefined;
    c.ajouter("environnement", via === "constante" ? "lecture-constante" : "lecture", nom, noeud, par !== undefined, par);
  };
  const envEntier = (forme: string, noeud: ts.Node) => {
    const ligne = ENV_ENTIER.find((l) => l.fichier === chemin && l.formes.includes(forme));
    const par = ligne ? `env-entier:${chemin}:${forme}` : undefined;
    c.ajouter("environnement", "entier", forme, noeud, par !== undefined, par);
  };
  /** Usage de `process.env` (ou d'un paramètre `env` suivi) : `noeud` est l'expression de l'objet `env`. */
  const usageEnv = (noeud: ts.Expression, parametre: boolean) => {
    const { parent, enfant } = parentEffectif(noeud);
    if (ts.isPropertyAccessExpression(parent) && parent.expression === enfant) {
      if (estEcrit(parent)) c.ajouter("environnement", "ecriture", parent.name.text, parent);
      else lectureEnv(parent.name.text, parent, "propriete");
      return;
    }
    if (ts.isElementAccessExpression(parent) && parent.expression === enfant) {
      const cle = texteLitteral(parent.argumentExpression);
      if (cle !== undefined) {
        if (estEcrit(parent)) c.ajouter("environnement", "ecriture", cle, parent);
        else lectureEnv(cle, parent, "propriete");
        return;
      }
      const constante = parametre ? undefined : constanteImportee(sansConversion(parent.argumentExpression));
      if (constante !== undefined && !estEcrit(parent)) lectureEnv(constante, parent, "constante");
      else {
        // Décision 0040 D1 : `process.env[nom]` en lecture, `nom` variable d'un `for (const nom of [<textes>])` ; le
        // tableau fait partie de la forme. Tout nom secret du tableau est refusé sans ligne (section 5).
        const cle = sansConversion(parent.argumentExpression);
        let forme = texteNormalise(parent);
        const tableau = ts.isIdentifier(cle) && !estEcrit(parent) ? boucleDe(cle) : undefined;
        if (tableau && ts.isArrayLiteralExpression(tableau) && tableau.elements.every((x) => ts.isStringLiteral(x))) {
          const noms = tableau.elements.map((x) => (x as ts.StringLiteral).text);
          for (const nom of noms) if (estNomSecret(nom) && !lectureSecreteAdmise(chemin)) c.refuser("nom-secret", `lecture:${nom}`, nom, parent);
          forme += ` (for…of ${JSON.stringify(noms)})`;
        }
        c.ajouter("environnement", "acces-calcule", forme, parent);
      }
      return;
    }
    if (ts.isParameter(parent) && parent.initializer === enfant) {
      const fonction = parent.parent;
      envEntier(`defaut:${(ts.isFunctionLike(fonction) && nomDeFonction(fonction)) || "?"}`, noeud);
      return;
    }
    if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(enfant as ts.Expression) && parent.expression !== enfant) {
      envEntier(`argument:${nomAppele(parent) ?? "?"}`, noeud);
      return;
    }
    if (!parametre && ts.isPropertyAssignment(parent) && parent.initializer === enfant && nomDePropriete(parent.name) === "env") {
      const objet = parentEffectif(parent.parent);
      if (ts.isObjectLiteralExpression(parent.parent) && ts.isCallExpression(objet.parent) && objet.parent.arguments.includes(objet.enfant as ts.Expression)) {
        envEntier(`propriete-env:${nomAppele(objet.parent) ?? "?"}`, noeud);
        return;
      }
    }
    if (!parametre && ts.isSpreadAssignment(parent)) {
      envEntier("etalement", noeud);
      return;
    }
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.InKeyword) {
      c.ajouter("environnement", "in", "in", noeud);
      return;
    }
    if (!parametre && ts.isBinaryExpression(parent) && parent.left === enfant && estAffectation(parent.operatorToken.kind)) {
      // Forme exacte : écriture simple (`=`) d'un identifiant ou d'un `new X(<cible>, …)` ; tout le reste est `autre`.
      // Décision 0040 D1 : `process.env = original` n'est une forme que dans un bloc `finally` (restauration).
      const droite = sansConversion(parent.right);
      let valeur = "<autre>";
      if (ts.isIdentifier(droite)) valeur = dansFinally(parent) ? `${droite.text} (finally)` : droite.text;
      else if (ts.isNewExpression(droite) && ts.isIdentifier(droite.expression) && droite.expression.text === "Proxy") valeur = formeNewProxy(droite) ?? "<autre>";
      const operateur = parent.operatorToken.kind === ts.SyntaxKind.EqualsToken ? "=" : parent.operatorToken.getText(arbre);
      c.ajouter("environnement", "ecriture", `process.env ${operateur} ${valeur}`, noeud);
      return;
    }
    if (!parametre && ts.isVariableDeclaration(parent) && parent.initializer === enfant && ts.isIdentifier(parent.name)) {
      // Décision 0040 D1 : l'alias n'est une forme que si ses seules références sont la cible d'un `new Proxy` et le
      // membre droit d'une restauration `process.env = <alias>` ; la fonction englobante fait partie de la forme.
      const genre = ts.getCombinedNodeFlags(parent) & ts.NodeFlags.Const ? "const" : "let";
      const nomAlias = parent.name.text;
      let reutilise = false;
      const portee = parent.parent.parent.parent ?? arbre;
      const chercher = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text === nomAlias && n !== parent.name) {
          const { parent: p, enfant: e } = parentEffectif(n);
          const cibleProxy = ts.isNewExpression(p) && p.arguments?.[0] === e && ts.isIdentifier(p.expression) && p.expression.text === "Proxy";
          const restauration = ts.isBinaryExpression(p) && p.right === e && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && estProcessEnv(sansConversion(p.left));
          if (!cibleProxy && !restauration) reutilise = true;
        }
        ts.forEachChild(n, chercher);
      };
      chercher(portee);
      const contexte = reutilise ? "alias réutilisé" : `dans ${fonctionDe(parent) ?? "le module"}`;
      c.ajouter("environnement", "usage", `${genre} ${nomAlias} = process.env (${contexte})`, noeud);
      return;
    }
    c.ajouter("environnement", parametre ? "parametre" : "usage", `${noeud.getText(arbre)} (${ts.SyntaxKind[parent.kind]})`, noeud);
  };

  /** Constante importée d'un module relatif, déclarée `export const X = "<littéral>"` (section 5, forme 4). */
  function constanteImportee(cle: ts.Expression): string | undefined {
    if (!ts.isIdentifier(cle)) return undefined;
    for (const instruction of arbre.statements) {
      if (!ts.isImportDeclaration(instruction) || !ts.isStringLiteral(instruction.moduleSpecifier)) continue;
      const liaisons = instruction.importClause?.namedBindings;
      if (!liaisons || !ts.isNamedImports(liaisons)) continue;
      const element = liaisons.elements.find((e) => e.name.text === cle.text && !e.propertyName);
      if (!element) continue;
      const cible = resoudre(chemin, instruction.moduleSpecifier.text, contexte.existe);
      const contenu = cible ? contexte.lire(cible) : undefined;
      if (contenu === undefined) return undefined;
      const moduleLu = ts.createSourceFile(cible as string, contenu, ts.ScriptTarget.Latest, true);
      for (const declaration of moduleLu.statements) {
        if (!ts.isVariableStatement(declaration)) continue;
        if (!declaration.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
        if (!(declaration.declarationList.flags & ts.NodeFlags.Const)) continue;
        for (const d of declaration.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.name.text === cle.text && d.initializer && ts.isStringLiteral(d.initializer)) return d.initializer.text;
        }
      }
      return undefined;
    }
    return undefined;
  }

  const proprieteProcess = (propriete: string, noeud: ts.Node) => {
    const { parent: appel, enfant: appelant } = parentEffectif(noeud);
    if (propriete === "cwd" && test && ts.isCallExpression(appel) && appel.expression === appelant) {
      c.ajouter("process", "propriete", propriete, noeud, true);
      return;
    }
    const ligne = PROPRIETES_PROCESS.find((l) => l.fichier === chemin && l.propriete === propriete);
    const par = ligne ? `process:${chemin}:${propriete}` : undefined;
    c.ajouter("process", "propriete", propriete, noeud, par !== undefined, par);
  };

  // --- Accès calculés (2.6) -------------------------------------------------------------------------------
  const symboleBienConnu = (e: ts.Expression) =>
    ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "Symbol" && SYMBOLES_BIEN_CONNUS.has(e.name.text) && !symboleLie;

  const mentionneSymbol = (n: ts.Node): boolean => (ts.isIdentifier(n) && n.text === "Symbol") || (ts.forEachChild(n, mentionneSymbol) ?? false);

  /** Jugement par le type (P0c-TL-5 point 6) ; renvoie le motif du refus, ou `undefined` si admis. */
  const jugerParType = (objet: ts.Node, cle: ts.Expression | undefined): string | undefined => {
    const v = verificateur as ts.TypeChecker;
    const typeObjet = v.getTypeAtLocation(ts.isExpression(objet) ? sansConversion(objet) : objet);
    const membres = (t: ts.Type): ts.Type[] => (t.isUnion() || t.isIntersection() ? [t, ...t.types.flatMap(membres)] : [t]);
    for (const t of membres(typeObjet)) {
      if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return "objet any/unknown";
      if (v.getSignaturesOfType(t, ts.SignatureKind.Call).length > 0 || v.getSignaturesOfType(t, ts.SignatureKind.Construct).length > 0) return "objet appelable";
      const symbole = t.getSymbol() ?? t.aliasSymbol;
      if (symbole) {
        const nom = v.getFullyQualifiedName(symbole);
        if (["globalThis", "Window", "NodeJS.Process"].some((n) => nom === n || nom.endsWith(`.${n}`)) || symbole.escapedName === "globalThis") return "objet global";
      }
    }
    if (cle === undefined) return undefined;
    if (symboleBienConnu(cle)) return undefined;
    if (symboleLie && mentionneSymbol(cle)) return "clé qui passe par un `Symbol` lié dans le fichier";
    let typeCle = v.getTypeAtLocation(cle);
    if (typeCle.flags & (ts.TypeFlags.TypeParameter | ts.TypeFlags.Conditional | ts.TypeFlags.IndexedAccess | ts.TypeFlags.Substitution)) {
      const contrainte = v.getBaseConstraintOfType(typeCle);
      if (!contrainte || contrainte === typeCle) return "clé générique sans contrainte";
      typeCle = contrainte;
    }
    if (typeCle.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return "clé any/unknown";
    if (typeCle.flags & ts.TypeFlags.NumberLike) return undefined;
    const membresCle = typeCle.isUnion() ? typeCle.types : [typeCle];
    if (membresCle.every((t) => t.flags & ts.TypeFlags.NumberLike || (t.isStringLiteral() && !NOMS_INTERDITS.has(t.value)))) return undefined;
    if (typeCle.flags & ts.TypeFlags.String) {
      const avecIndex = membres(typeObjet).filter((t) => !t.isUnion() && !t.isIntersection());
      const indexe = (t: ts.Type) => v.getIndexInfosOfType(t).some((info) => info.keyType.flags & ts.TypeFlags.String);
      if (indexe(typeObjet) || (typeObjet.isUnion() && typeObjet.types.every(indexe)) || avecIndex.some(indexe)) return undefined;
      return "clé string sans signature d'index";
    }
    if (typeCle.flags & ts.TypeFlags.UniqueESSymbol && !symboleLie) {
      const declaration = typeCle.getSymbol()?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.getSourceFile() === arbre && declaration.initializer) {
        const init = declaration.initializer;
        const flags = ts.getCombinedNodeFlags(declaration);
        if (
          flags & ts.NodeFlags.Const &&
          ts.isCallExpression(init) &&
          init.arguments.length === 1 &&
          ts.isStringLiteral(init.arguments[0] as ts.Expression) &&
          ((ts.isIdentifier(init.expression) && init.expression.text === "Symbol") ||
            (ts.isPropertyAccessExpression(init.expression) && ts.isIdentifier(init.expression.expression) && init.expression.expression.text === "Symbol" && init.expression.name.text === "for"))
        ) {
          return undefined;
        }
      }
      return "symbole non admis";
    }
    return "type de clé non admis";
  };

  /** Accès calculé à clé non littérale (`objet[cle]`), nom calculé ou reste d'une déstructuration d'objet. */
  const accesCalcule = (forme: string, noeud: ts.Node, objet: ts.Node | undefined, cle: ts.Expression | undefined, reste: boolean) => {
    if (regleFermee || objet === undefined) {
      if (!reste && cle && symboleBienConnu(sansConversion(cle))) {
        c.ajouter("acces-calcule", "symbole-bien-connu", forme, noeud, true);
        return;
      }
      c.ajouter("acces-calcule", reste ? "reste" : "cle-non-litterale", forme, noeud);
      return;
    }
    if (reste) {
      c.ajouter("acces-calcule", "reste", forme, noeud, true);
      return;
    }
    const motif = jugerParType(objet, cle && sansConversion(cle));
    if (motif === undefined) c.ajouter("acces-calcule", "type", forme, noeud, true);
    else c.ajouter("acces-calcule", "type", `${forme} (${motif})`, noeud);
  };

  // --- Objet global et `Object` qualifiés (2.3 ; revue du head `ad0b008`, bloquant 2) ------------------
  /** Nom lu par un accès pointé ou par crochets à clé littérale. */
  const nomAccede = (e: ts.Expression): string | undefined =>
    ts.isPropertyAccessExpression(e) ? e.name.text : ts.isElementAccessExpression(e) ? texteLitteral(e.argumentExpression) : undefined;
  /** `globalThis`, `global`, `self`, `window`, un alias, ou un nom global lu sur l'un d'eux (`globalThis.window`). */
  const estGlobalQualifie = (expression: ts.Expression): boolean => {
    const e = sansConversion(expression);
    if (ts.isIdentifier(e)) return NOMS_GLOBAUX.has(e.text) || alias.has(e.text);
    const nom = nomAccede(e);
    return nom !== undefined && NOMS_GLOBAUX.has(nom) && estGlobalQualifie((e as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression);
  };
  /** `Object`, ou `Object` lu sur un objet global (`globalThis.Object`, `window["Object"]`). */
  const estObjectQualifie = (expression: ts.Expression): boolean => {
    const e = sansConversion(expression);
    if (ts.isIdentifier(e)) return e.text === "Object";
    return nomAccede(e) === "Object" && estGlobalQualifie((e as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression);
  };
  /** L'accès est lui-même l'objet d'un accès pointé ou par crochets à clé littérale (`<accès>.keys`). */
  const estObjetDUnAcces = (acces: ts.Node): boolean => {
    const { parent, enfant } = parentEffectif(acces);
    return (
      (ts.isPropertyAccessExpression(parent) && parent.expression === enfant) ||
      (ts.isElementAccessExpression(parent) && parent.expression === enfant && texteLitteral(parent.argumentExpression) !== undefined)
    );
  };

  // --- Lecture d'une propriété nommée (accès pointé, crochets littéraux, déstructuration) ----------------
  const lecturePropriete = (nom: string, noeud: ts.Node, objet: ts.Expression | undefined, acces: ts.Node | undefined) => {
    if (PROPRIETES_REFUSEES.has(nom)) c.ajouter("propriete", `propriete:${nom}`, nom, noeud);
    // `Reflect` et `Proxy` comme propriété de tout objet (`globalThis.Reflect`, `self["Proxy"]`, `const { Reflect } = x`) :
    // refus qu'aucune ligne ne couvre ; la seule exception de 0040 D1 porte sur les identifiants nus, sous ses formes.
    if (NOMS_REFLEXION.has(nom)) c.refuser("reflexion", nom, `propriété ${nom} (${texteNormalise(acces ?? noeud).slice(0, 120)})`, noeud);
    // `Object` lu sur un objet global hors d'un accès pointé (`const O = globalThis.Object`, `const { Object } = self`) :
    // même règle que l'identifiant nu.
    if (nom === "Object" && objet && estGlobalQualifie(objet) && !(acces && estObjetDUnAcces(acces))) {
      c.ajouter("reflexion", "Object", "hors accès pointé", noeud);
    }
    // `vi` ou `vitest` lu sur un objet global (`globalThis.vi.importActual(…)`) : l'objet `vi` échapperait au régime des
    // tests, qui ne suit que les noms liés dans le fichier (revue du head `ad0b008`, mineur 4).
    if (EXPORTS_VI.has(nom) && objet && estGlobalQualifie(objet)) c.ajouter("regime-tests", "vi-hors-appel", `${nom} lu sur un objet global`, noeud);
    if (nom === "constructor") {
      const exterieur = acces ? parentEffectif(acces) : undefined;
      const formeName =
        acces !== undefined &&
        ts.isPropertyAccessExpression(acces) &&
        exterieur !== undefined &&
        ts.isPropertyAccessExpression(exterieur.parent) &&
        exterieur.parent.expression === exterieur.enfant &&
        exterieur.parent.name.text === "name" &&
        !estEcrit(exterieur.parent);
      if (formeName && formeConstructeurAdmise) c.ajouter("constructeur", "constructor.name", "constructor.name", noeud, true);
      else c.ajouter("constructeur", "constructor", formeName ? "constructor.name (zone fermée)" : "constructor", noeud);
    }
    if (objet) {
      const o = sansConversion(objet);
      if (estObjectQualifie(o)) {
        if (REFLEXION_OBJECT_REFUSEE.has(nom)) c.ajouter("reflexion", `Object.${nom}`, nom, noeud);
        else if (nom === "defineProperty") {
          if (acces && ts.isIdentifier(o)) definePropertyAdmis(acces);
          else c.ajouter("reflexion", "Object.defineProperty", "defineProperty", noeud);
        }
      }
      if (ts.isMetaProperty(o) && (nom === "resolve" || nom === "env")) c.ajouter("contournement", `import.meta.${nom}`, nom, noeud);
    }
  };

  const definePropertyAdmis = (acces: ts.Node) => {
    const { parent, enfant } = parentEffectif(acces);
    const appel = ts.isCallExpression(parent) && parent.expression === enfant ? parent : undefined;
    const premier = appel?.arguments[0] && sansConversion(appel.arguments[0]);
    const cle = appel?.arguments[1] && texteLitteral(appel.arguments[1]);
    const admis =
      test &&
      !sensible &&
      appel !== undefined &&
      premier !== undefined &&
      !(ts.isIdentifier(premier) && (NOMS_GLOBAUX.has(premier.text) || premier.text === "process")) &&
      cle !== undefined &&
      !NOMS_INTERDITS.has(cle);
    if (admis) c.ajouter("reflexion", "Object.defineProperty", "defineProperty", acces, true);
    else c.ajouter("reflexion", "Object.defineProperty", "defineProperty", acces);
  };

  // --- Position de valeur d'un identifiant ---------------------------------------------------------------
  const estPositionValeur = (id: ts.Identifier): boolean => {
    const p = id.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p)) && p.name === id) return false;
    if (ts.isBindingElement(p) && p.propertyName === id) return false;
    if ((ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) && p.propertyName === id) return false;
    if (ts.isJsxAttribute(p) && p.name === id) return false;
    if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
    if (ts.isMetaProperty(p)) return false;
    if (ts.isQualifiedName(p)) return false;
    if (ts.isNamespaceExportDeclaration(p)) return false;
    return true;
  };

  // --- Parcours -------------------------------------------------------------------------------------------
  const parcourirTypes = (noeud: ts.Node) => {
    // Positions de type : seuls les spécificateurs comptent (2.1).
    if (ts.isImportTypeNode(noeud) && ts.isLiteralTypeNode(noeud.argument) && ts.isStringLiteral(noeud.argument.literal)) {
      specificateur(noeud.argument.literal.text, ["type-import()"], noeud);
    }
    if (ts.isImportDeclaration(noeud) && ts.isStringLiteral(noeud.moduleSpecifier)) {
      specificateur(noeud.moduleSpecifier.text, formesImport(noeud.importClause, true), noeud);
    }
    if (ts.isExportDeclaration(noeud) && noeud.moduleSpecifier && ts.isStringLiteral(noeud.moduleSpecifier)) {
      specificateur(noeud.moduleSpecifier.text, ["reexport"], noeud);
    }
    ts.forEachChild(noeud, parcourirTypes);
  };

  const visiter = (noeud: ts.Node): void => {
    if (estPositionDeType(noeud) || (noeud === arbre && arbre.isDeclarationFile)) {
      parcourirTypes(noeud);
      return;
    }

    // Spécificateurs (2.2).
    if (ts.isImportDeclaration(noeud)) {
      if (ts.isStringLiteral(noeud.moduleSpecifier)) {
        specificateur(noeud.moduleSpecifier.text, formesImport(noeud.importClause, noeud.importClause?.isTypeOnly ?? false), noeud);
        // `vitest` : imports nommés seulement, pour que l'objet `vi` reste lié à un nom connu (section 4).
        const clause = noeud.importClause;
        if (noeud.moduleSpecifier.text === "vitest" && clause && !clause.isTypeOnly && (clause.name || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)))) {
          c.ajouter("regime-tests", "vitest-hors-import-nomme", clause.getText(arbre), noeud);
        }
      }
      if (noeud.importClause) ts.forEachChild(noeud.importClause, visiter);
      return;
    }
    if (ts.isExportDeclaration(noeud)) {
      if (noeud.moduleSpecifier && ts.isStringLiteral(noeud.moduleSpecifier)) {
        specificateur(noeud.moduleSpecifier.text, ["reexport"], noeud);
        if (noeud.moduleSpecifier.text === "vitest" && !noeud.isTypeOnly) c.ajouter("regime-tests", "vitest-hors-import-nomme", "reexport", noeud);
      } else if (noeud.exportClause && ts.isNamedExports(noeud.exportClause)) {
        // `export { vi as v }` : l'objet `vi` sortirait du fichier sous un autre nom.
        for (const e of noeud.exportClause.elements) {
          if (nomsVi.has((e.propertyName ?? e.name).text)) c.ajouter("regime-tests", "vi-hors-appel", e.getText(arbre), e);
        }
      }
      return;
    }
    if (ts.isImportEqualsDeclaration(noeud)) {
      if (ts.isExternalModuleReference(noeud.moduleReference) && ts.isStringLiteral(noeud.moduleReference.expression)) {
        specificateur(noeud.moduleReference.expression.text, ["require"], noeud);
        if (noeud.moduleReference.expression.text === "vitest") c.ajouter("regime-tests", "vitest-hors-import-nomme", "require", noeud);
      }
      return;
    }
    if (ts.isCallExpression(noeud) && noeud.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = noeud.arguments[0];
      if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
        specificateur(argument.text, ["import()"], noeud);
        if (argument.text === "vitest") c.ajouter("regime-tests", "vitest-hors-import-nomme", "import()", noeud);
      } else c.ajouter("contournement", "import-non-litteral", noeud.getText(arbre), noeud);
    }

    // Instruction `with` (2.4).
    if (ts.isWithStatement(noeud)) c.ajouter("contournement", "with", "with", noeud);

    // `setTimeout` et `setInterval` (2.4).
    if (ts.isCallExpression(noeud)) {
      const appele = sansConversion(noeud.expression);
      const nom = ts.isIdentifier(appele)
        ? appele.text
        : ts.isPropertyAccessExpression(appele) && ts.isIdentifier(sansConversion(appele.expression)) &&
            (NOMS_GLOBAUX.has((sansConversion(appele.expression) as ts.Identifier).text) || alias.has((sansConversion(appele.expression) as ts.Identifier).text))
          ? appele.name.text
          : undefined;
      if (nom === "setTimeout" || nom === "setInterval") {
        const premier = noeud.arguments[0];
        let fonction = false;
        if (premier) {
          const p = sansConversion(premier);
          if (typesActifs && !regleFermee) fonction = (verificateur as ts.TypeChecker).getTypeAtLocation(p).getCallSignatures().length > 0;
          else fonction = ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isIdentifier(p);
        }
        if (!fonction) c.ajouter("contournement", "minuterie-texte", nom, noeud);
      }
    }

    // Régime des tests (section 4).
    if (appelVi(noeud, nomsVi, "spyOn")) {
      const nom = noeud.arguments[1] && texteLitteral(noeud.arguments[1]);
      if (nom === undefined) {
        // Nom non littéral : admis seulement si son type est une union de littéraux sans nom de capacité (2.6).
        const argument = noeud.arguments[1];
        let admis = false;
        if (argument && typesActifs && !regleFermee) {
          const type = (verificateur as ts.TypeChecker).getTypeAtLocation(sansConversion(argument));
          const membresNom = type.isUnion() ? type.types : [type];
          admis = membresNom.every((t) => t.isStringLiteral() && !NOMS_CAPACITE.includes(t.value) && t.value !== "process" && !NOMS_INTERDITS.has(t.value));
        }
        c.ajouter("regime-tests", "espion-non-litteral", noeud.getText(arbre), noeud, admis);
      } else if (NOMS_CAPACITE.includes(nom) || nom === "process") {
        const { parent, enfant } = parentEffectif(noeud);
        const remplace =
          ts.isPropertyAccessExpression(parent) && parent.expression === enfant && REMPLACEMENTS.has(parent.name.text) && ts.isCallExpression(parent.parent);
        if (!remplace) {
          const forme = FORMES_NOMINATIVES_TESTS.find((f) => f.fichier === chemin && f.forme === "espion-sans-remplacement" && f.valeur === nom);
          const par = forme ? `forme-test:${chemin}:${forme.forme}` : undefined;
          c.ajouter("regime-tests", "espion-sans-remplacement", nom, noeud, par !== undefined, par);
        }
      }
    }
    if (appelVi(noeud, nomsVi, "stubGlobal") && (noeud.arguments[0] === undefined || texteLitteral(noeud.arguments[0]) === undefined)) {
      c.ajouter("regime-tests", "stubGlobal-non-litteral", noeud.getText(arbre), noeud);
    }
    if (appelVi(noeud, nomsVi, "stubEnv")) {
      const nom = noeud.arguments[0] && texteLitteral(noeud.arguments[0]);
      // Nom secret : refus qu'aucune ligne (pas même une ligne de texte `secret:`) ne couvre (section 4, forme 3).
      if (nom !== undefined && estNomSecret(nom)) c.refuser("nom-secret", `stubEnv:${nom}`, nom, noeud);
      if (nom === undefined) {
        const table = tableEach(noeud.arguments[0]);
        const forme = FORMES_NOMINATIVES_TESTS.find((f) => f.fichier === chemin && f.forme === "stubEnv-table" && f.valeur === table);
        const par = forme ? `forme-test:${chemin}:${forme.forme}` : undefined;
        // Décision 0040 D1 : `vi.stubEnv(nom, …)` dans un `for (const nom of <identifiant>)` ; la boucle fait partie de la forme.
        const premier = noeud.arguments[0] && sansConversion(noeud.arguments[0]);
        const boucle = premier && ts.isIdentifier(premier) ? boucleDe(premier) : undefined;
        const texteAppel = texteNormalise(noeud) + (boucle && ts.isIdentifier(boucle) ? ` (for…of ${boucle.text})` : "");
        c.ajouter("regime-tests", "stubEnv-non-litteral", table ?? texteAppel, noeud, par !== undefined, par);
      }
    }
    if (appelVi(noeud, nomsVi, "mock", "doMock", "importActual", "importMock")) {
      const spec = noeud.arguments[0] && texteLitteral(noeud.arguments[0]);
      const methode = (sansConversion(noeud.expression) as ts.PropertyAccessExpression).name.text;
      if (spec === undefined) c.ajouter("regime-tests", "double-non-litteral", noeud.getText(arbre), noeud);
      else {
        // Section 4, forme 2 : seule une fabrique littérale sans paramètre (flèche ou `function` en ligne, seul second
        // argument) ne charge pas le module réel. Sans fabrique, avec des options (`{ spy: true }`) ou une fabrique
        // passée par identifiant, Vitest charge (ou peut charger) le module réel.
        const fabrique = noeud.arguments[1] && sansConversion(noeud.arguments[1]);
        const litterale =
          noeud.arguments.length === 2 &&
          fabrique !== undefined &&
          (ts.isArrowFunction(fabrique) || ts.isFunctionExpression(fabrique)) &&
          fabrique.parameters.length === 0;
        const reel = methode === "importActual" || methode === "importMock";
        const original = reel || !litterale || chargeOriginal(fabrique);
        doubles.push({ specificateur: spec, original, ligne: numero(noeud) });
        if (original && !doubleOriginalAdmis(chemin, spec)) {
          c.ajouter("regime-tests", reel || litterale ? "double-original" : "double-sans-fabrique-litterale", `${methode}(${spec})`, noeud);
        }
      }
    }

    // Identifiants (2.3, section 5).
    if (ts.isIdentifier(noeud) && estPositionValeur(noeud)) identifiant(noeud);

    // Accès pointé (2.3).
    if (ts.isPropertyAccessExpression(noeud)) lecturePropriete(noeud.name.text, noeud.name, noeud.expression, noeud);

    // Accès par crochets (2.3, 2.6).
    if (ts.isElementAccessExpression(noeud)) {
      const cle = texteLitteral(noeud.argumentExpression);
      const objet = sansConversion(noeud.expression);
      if (cle !== undefined) {
        if (NOMS_INTERDITS.has(cle)) c.ajouter("acces-calcule", "nom-interdit", cle, noeud);
        lecturePropriete(cle, noeud.argumentExpression, noeud.expression, noeud);
      } else if (ts.isIdentifier(objet) && (alias.has(objet.text) || NOMS_GLOBAUX.has(objet.text) || objet.text === "process" || objet.text === "Object")) {
        // Jugé par la règle de l'objet global, de `process` ou de la réflexion.
      } else if (estProcessEnv(objet) || (ts.isIdentifier(objet) && parametreEnvDe(objet))) {
        // Jugé par la section 5.
      } else accesCalcule(noeud.getText(arbre), noeud, noeud.expression, noeud.argumentExpression, false);
    }

    // Déstructuration (2.3, 2.6).
    if (ts.isObjectBindingPattern(noeud)) {
      const source = sourceDeMotif(noeud);
      for (const element of noeud.elements) {
        if (element.dotDotDotToken) {
          accesCalcule(`...${element.name.getText(arbre)}`, element, source, undefined, true);
          continue;
        }
        const nomBrut = element.propertyName ?? element.name;
        if (ts.isComputedPropertyName(nomBrut) && texteLitteral(nomBrut.expression) === undefined) {
          accesCalcule(nomBrut.getText(arbre), element, source, nomBrut.expression, false);
          continue;
        }
        const nom = ts.isIdentifier(nomBrut) || ts.isStringLiteral(nomBrut) || ts.isNumericLiteral(nomBrut) || ts.isComputedPropertyName(nomBrut) ? nomDePropriete(nomBrut as ts.PropertyName) : undefined;
        if (nom !== undefined) {
          if (ts.isComputedPropertyName(nomBrut) && NOMS_INTERDITS.has(nom)) c.ajouter("acces-calcule", "nom-interdit", nom, element);
          // Objet source s'il est une expression (`const { getPrototypeOf } = globalThis.Object`) : bloquant 2.
          lecturePropriete(nom, element, source && ts.isExpression(source) ? source : undefined, undefined);
        }
      }
    }
    if (ts.isObjectLiteralExpression(noeud) && estCibleDeDestructuration(noeud)) {
      const sourceAffectee = sourceDAffectation(noeud);
      for (const propriete of noeud.properties) {
        if (ts.isSpreadAssignment(propriete)) {
          accesCalcule(propriete.getText(arbre), propriete, undefined, undefined, true);
          continue;
        }
        if (ts.isShorthandPropertyAssignment(propriete)) {
          lecturePropriete(propriete.name.text, propriete, sourceAffectee, undefined);
          continue;
        }
        if (ts.isPropertyAssignment(propriete)) {
          if (ts.isComputedPropertyName(propriete.name) && texteLitteral(propriete.name.expression) === undefined) {
            accesCalcule(propriete.name.getText(arbre), propriete, undefined, propriete.name.expression, false);
            continue;
          }
          const nom = nomDePropriete(propriete.name);
          if (nom !== undefined) {
            if (ts.isComputedPropertyName(propriete.name) && NOMS_INTERDITS.has(nom)) c.ajouter("acces-calcule", "nom-interdit", nom, propriete);
            lecturePropriete(nom, propriete, sourceAffectee, undefined);
          }
        }
      }
    }

    // Classe qui étend `x.constructor` : couvert par l'accès pointé (forme autre que `.constructor.name`).

    // Textes (2.4, 2.5, section 5).
    if ((ts.isStringLiteral(noeud) || ts.isNoSubstitutionTemplateLiteral(noeud)) && !estSpecificateur(noeud)) {
      texte(noeud.text, noeud, estArgumentRegExp(noeud), estCle(noeud));
    }
    if (ts.isTemplateHead(noeud) || ts.isTemplateMiddle(noeud) || ts.isTemplateTail(noeud)) texte(noeud.text, noeud, false, false);
    if (ts.isJsxText(noeud)) texte(noeud.text, noeud, false, false);
    if (ts.isRegularExpressionLiteral(noeud)) {
      const corps = noeud.text.slice(1, noeud.text.lastIndexOf("/"));
      texte(corps, noeud, true, false);
    }
    if ((ts.isBinaryExpression(noeud) && noeud.operatorToken.kind === ts.SyntaxKind.PlusToken) || ts.isTemplateExpression(noeud)) {
      const replie = texteLitteral(noeud);
      if (replie !== undefined && !estPlusReplie(noeud)) texte(replie, noeud, estArgumentRegExp(noeud), false);
    }

    ts.forEachChild(noeud, visiter);
  };

  /** Membre droit d'une affectation par déstructuration `({ … } = <source>)`, s'il y en a une directe. */
  function sourceDAffectation(motif: ts.ObjectLiteralExpression): ts.Expression | undefined {
    const { parent, enfant } = parentEffectif(motif);
    return ts.isBinaryExpression(parent) && parent.left === enfant && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken ? parent.right : undefined;
  }

  /** Objet source d'un motif de déstructuration (initialiseur d'une déclaration), pour le vérificateur. */
  function sourceDeMotif(motif: ts.ObjectBindingPattern): ts.Node | undefined {
    const parent = motif.parent;
    if (ts.isVariableDeclaration(parent) && parent.initializer) return parent.initializer;
    if (ts.isParameter(parent)) return parent;
    if (ts.isBindingElement(parent)) return parent;
    return undefined;
  }

  /**
   * La fabrique d'un `vi.mock` charge le module réel : paramètre (`importOriginal`), `arguments` (le même paramètre
   * sans le nommer), `importOriginal`, `vi.importActual`, `vi.importMock`.
   */
  function chargeOriginal(fabrique: ts.Expression): boolean {
    let trouve = false;
    const f = sansConversion(fabrique);
    if ((ts.isArrowFunction(f) || ts.isFunctionExpression(f)) && f.parameters.length > 0) trouve = true;
    const chercher = (n: ts.Node) => {
      if (appelVi(n, nomsVi, "importActual", "importMock")) trouve = true;
      if (ts.isIdentifier(n) && (n.text === "importOriginal" || n.text === "arguments")) trouve = true;
      ts.forEachChild(n, chercher);
    };
    chercher(f);
    return trouve;
  }

  /** Table de `it.each([["A"], ["B"]])(titre, (nom) => …)` dont `nom` est le paramètre passé ; sinon `undefined`. */
  function tableEach(argument: ts.Expression | undefined): string | undefined {
    if (!argument || !ts.isIdentifier(argument)) return undefined;
    let n: ts.Node | undefined = argument.parent;
    while (n && !(ts.isArrowFunction(n) || ts.isFunctionExpression(n))) n = n.parent;
    if (!n) return undefined;
    const fonction = n as ts.ArrowFunction | ts.FunctionExpression;
    if (fonction.parameters.length !== 1 || !ts.isIdentifier(fonction.parameters[0]!.name) || fonction.parameters[0]!.name.text !== argument.text) return undefined;
    const appel = fonction.parent;
    if (!ts.isCallExpression(appel) || appel.arguments[1] !== fonction) return undefined;
    const each = appel.expression;
    if (!ts.isCallExpression(each) || !ts.isPropertyAccessExpression(each.expression) || each.expression.name.text !== "each") return undefined;
    const table = each.arguments[0];
    if (each.arguments.length !== 1 || !table || !ts.isArrayLiteralExpression(table)) return undefined;
    const noms: string[] = [];
    for (const ligne of table.elements) {
      if (!ts.isArrayLiteralExpression(ligne) || ligne.elements.length !== 1 || !ts.isStringLiteral(ligne.elements[0]!)) return undefined;
      noms.push((ligne.elements[0] as ts.StringLiteral).text);
    }
    return noms.join(",");
  }

  /**
   * Forme exacte d'un usage de `Reflect` ou de `Proxy` (2.3, 2.4 ; décision 0040 D1), contexte compris :
   * - `process.env = new Proxy(<cible>, { <pièges> })` : `new Proxy` membre droit d'une écriture simple de
   *   `process.env`, pièges tous méthodes nommées ; `new Proxy(<cible>, { <pièges> })` ailleurs ;
   * - `Reflect.<m>(<paramètres>) (piège <m>)` : expression du `return` de la méthode `<m>` des pièges d'un
   *   `new Proxy`, avec pour arguments les paramètres de cette méthode dans leur ordre ; `Reflect.<m>(<arguments>)`
   *   ailleurs ;
   * - `autre` pour tout le reste (alias, argument, accès calculé, `Proxy` sans `new`…).
   * Une ligne nominative ne couvre donc que les appels écrits, dans leur contexte.
   */
  function formeReflexion(nom: string, parent: ts.Node, enfant: ts.Node): string {
    if (nom === "Reflect" && ts.isPropertyAccessExpression(parent) && parent.expression === enfant) {
      const appel = parentEffectif(parent);
      if (ts.isCallExpression(appel.parent) && appel.parent.expression === appel.enfant) {
        const membre = parent.name.text;
        const forme = `Reflect.${membre}(${appel.parent.arguments.map(texteNormalise).join(", ")})`;
        return dansPiege(appel.parent, membre) ? `${forme} (piège ${membre})` : forme;
      }
    }
    if (nom === "Proxy" && ts.isNewExpression(parent) && parent.expression === enfant) {
      const forme = formeNewProxy(parent);
      if (forme === undefined) return "autre";
      return ecritureDeProcessEnv(parent) ? `process.env = ${forme}` : forme;
    }
    return "autre";
  }

  /** `new Proxy(<cible>, { <pièges> })` si les pièges sont un littéral de méthodes nommées ; sinon `undefined`. */
  function formeNewProxy(n: ts.NewExpression): string | undefined {
    if (n.arguments?.length !== 2) return undefined;
    const [cible, pieges] = n.arguments as unknown as [ts.Expression, ts.Expression];
    const p = sansConversion(pieges);
    if (!ts.isObjectLiteralExpression(p)) return undefined;
    const noms = p.properties.map((m) => (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) ? m.name.text : "?"));
    return noms.includes("?") ? undefined : `new Proxy(${texteNormalise(cible)}, { ${noms.join(", ")} })`;
  }

  /** Le nœud est le membre droit d'une écriture simple `process.env = <nœud>`. */
  function ecritureDeProcessEnv(n: ts.Node): boolean {
    const { parent, enfant } = parentEffectif(n);
    return ts.isBinaryExpression(parent) && parent.right === enfant && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && estProcessEnv(sansConversion(parent.left));
  }

  /**
   * L'appel est l'expression d'un `return` de la méthode `<membre>` d'un littéral de pièges passé à `new Proxy`, et ses
   * arguments sont exactement les paramètres de cette méthode, dans leur ordre.
   */
  function dansPiege(appel: ts.CallExpression, membre: string): boolean {
    const retour = parentEffectif(appel);
    if (!ts.isReturnStatement(retour.parent) || retour.parent.expression !== retour.enfant) return false;
    let n: ts.Node = retour.parent;
    while (!ts.isFunctionLike(n)) n = n.parent;
    if (!ts.isMethodDeclaration(n) || !ts.isIdentifier(n.name) || n.name.text !== membre) return false;
    const objet = n.parent;
    const proxy = parentEffectif(objet);
    if (!ts.isObjectLiteralExpression(objet) || !ts.isNewExpression(proxy.parent) || proxy.parent.arguments?.[1] !== proxy.enfant) return false;
    const appele = sansConversion(proxy.parent.expression);
    if (!ts.isIdentifier(appele) || appele.text !== "Proxy") return false;
    const parametres = n.parameters.map((x) => (ts.isIdentifier(x.name) ? x.name.text : "?"));
    const args = appel.arguments.map((a) => (ts.isIdentifier(a) ? a.text : "!"));
    return parametres.length === args.length && parametres.every((x, i) => x === args[i]);
  }

  /** Variable d'un `for (const <id> of <expr>)` qui lie cet identifiant, et cette expression. */
  function boucleDe(id: ts.Identifier): ts.Expression | undefined {
    for (let n: ts.Node | undefined = id.parent; n; n = n.parent) {
      if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer) && ts.getCombinedNodeFlags(n.initializer) & ts.NodeFlags.Const) {
        const d = n.initializer.declarations[0];
        if (n.initializer.declarations.length === 1 && d && ts.isIdentifier(d.name) && d.name.text === id.text) return n.expression;
      }
    }
    return undefined;
  }

  /** Nom de la fonction déclarée qui contient le nœud. */
  function fonctionDe(n: ts.Node): string | undefined {
    for (let x: ts.Node | undefined = n.parent; x; x = x.parent) if (ts.isFunctionLike(x)) return nomDeFonction(x) ?? "?";
    return undefined;
  }

  /** Le nœud est dans le bloc `finally` d'un `try`. */
  function dansFinally(n: ts.Node): boolean {
    for (let x: ts.Node = n; x.parent; x = x.parent) if (ts.isTryStatement(x.parent) && x.parent.finallyBlock === x) return true;
    return false;
  }

  function identifiant(id: ts.Identifier) {
    const nom = id.text;
    const { parent, enfant } = parentEffectif(id);

    // Objet `vi` (section 4) : seul `<vi>.<membre>(…)` en position d'appel est admis. Alias (`const w = vi`),
    // crochets (`vi["importActual"]`), déstructuration (`const { importActual } = vi`), argument, `.call`/`.bind`…
    // sont refusés : sinon `vi.importActual`, `vi.stubEnv`, `vi.stubGlobal` ou `vi.spyOn` échapperaient au régime.
    if (nomsVi.has(nom)) {
      if (ts.isImportSpecifier(parent)) return; // liaison de l'import
      const membre = ts.isPropertyAccessExpression(parent) && parent.expression === enfant ? parent : undefined;
      const appel = membre ? parentEffectif(membre) : undefined;
      if (!(appel && ts.isCallExpression(appel.parent) && appel.parent.expression === appel.enfant)) {
        c.ajouter("regime-tests", "vi-hors-appel", (membre ?? parent).getText(arbre).replace(/\s+/g, " ").slice(0, 120), id);
      }
      return;
    }

    if (IDENTIFIANTS_CAPACITE.has(nom)) {
      const declaration =
        (ts.isParameter(parent) || ts.isVariableDeclaration(parent) || ts.isBindingElement(parent) || ts.isFunctionDeclaration(parent)) &&
        parent.name === id;
      let forme = declaration ? "declaration" : "reference";
      if (nom === "require") {
        if (ts.isVariableDeclaration(parent) && parent.name === id && parent.initializer) {
          const init = sansConversion(parent.initializer);
          if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "createRequire" && init.arguments.length === 1 && init.arguments[0]!.getText(arbre) === "import.meta.url") {
            forme = "const require = createRequire(import.meta.url)";
          }
        } else if (ts.isPropertyAccessExpression(parent) && parent.expression === enfant && parent.name.text === "resolve") {
          const appel = parentEffectif(parent);
          if (ts.isCallExpression(appel.parent) && appel.parent.expression === appel.enfant && appel.parent.arguments.length === 1 && ts.isStringLiteral(appel.parent.arguments[0]!)) {
            forme = "require.resolve(<littéral>)";
          }
        }
      }
      if (nom === "eval" || nom === "Function") c.ajouter("contournement", nom, forme, id);
      else capacite("identifiant", `identifiant:${nom}`, forme, id);
      return;
    }

    if (nom === "Reflect" || nom === "Proxy") {
      capacite("reflexion", nom, formeReflexion(nom, parent, enfant), id);
      return;
    }

    if (nom === "Object") {
      const pointe = ts.isPropertyAccessExpression(parent) && parent.expression === enfant;
      const crochetLitteral = ts.isElementAccessExpression(parent) && parent.expression === enfant && texteLitteral(parent.argumentExpression) !== undefined;
      if (!pointe && !crochetLitteral) c.ajouter("reflexion", "Object", "hors accès pointé", id);
      return;
    }

    if (NOMS_GLOBAUX.has(nom) || alias.has(nom)) {
      const nomGlobal = NOMS_GLOBAUX.has(nom) ? nom : (alias.get(nom) as string);
      const estAlias = !NOMS_GLOBAUX.has(nom);
      if (estAlias && ts.isVariableDeclaration(parent) && parent.name === id) return; // déclaration de l'alias
      if (ts.isPropertyAccessExpression(parent) && parent.expression === enfant) {
        if (estAlias) capacite("objet-global", `global:${nomGlobal}`, `${nom}.${parent.name.text}`, id);
        return;
      }
      if (ts.isElementAccessExpression(parent) && parent.expression === enfant) {
        const cle = texteLitteral(parent.argumentExpression);
        if (estAlias) capacite("objet-global", `global:${nomGlobal}`, `${nom}[${cle !== undefined ? JSON.stringify(cle) : parent.argumentExpression.getText(arbre)}]`, id);
        else if (cle === undefined) c.ajouter("objet-global", `global:${nomGlobal}`, `${nom}[${parent.argumentExpression.getText(arbre)}]`, id);
        return;
      }
      if (!estAlias && ts.isTypeOfExpression(parent)) return;
      if (!estAlias && test && (ts.isCallExpression(parent)) && parent.arguments[0] === enfant) {
        if (appelVi(parent, nomsVi, "spyOn") && (nom === "globalThis" || nom === "window") && parent.arguments[1] && texteLitteral(parent.arguments[1]) !== undefined) {
          c.ajouter("objet-global", `global:${nomGlobal}`, "vi.spyOn", id, true);
          return;
        }
        const cible = parent.expression;
        if (nom === "window" && ts.isPropertyAccessExpression(cible) && ts.isIdentifier(cible.expression) && cible.expression.text === "fireEvent") {
          c.ajouter("objet-global", `global:${nomGlobal}`, "fireEvent", id, true);
          return;
        }
      }
      if (!estAlias && ts.isVariableDeclaration(parent) && parent.initializer === enfant && ts.isIdentifier(parent.name)) {
        capacite("objet-global", `global:${nomGlobal}`, `alias:${parent.name.text}`, id);
        return;
      }
      capacite("objet-global", `global:${nomGlobal}`, estAlias ? `${nom}:autre` : "autre", id);
      return;
    }

    if (nom === "process") {
      if (ts.isPropertyAccessExpression(parent) && parent.expression === enfant) {
        if (parent.name.text === "env") usageEnv(parent, false);
        else proprieteProcess(parent.name.text, parent);
        return;
      }
      c.ajouter("process", "usage", ts.isElementAccessExpression(parent) ? parent.getText(arbre) : "autre", id);
      return;
    }

    const parametreEnv = parametreEnvDe(id);
    if (parametreEnv) {
      if (ts.isParameter(parent) || ts.isBindingElement(parent)) return; // déclaration
      usageEnv(id, true);
    }
  }

  visiter(arbre);
  return { fichier: chemin, constats, imports, doubles, fonctionsEnv: [...fonctionsEnv] };
}

// --- package.json (section 6) ---------------------------------------------------------------------------------

export const CLES_PACKAGE = ["name", "version", "private", "packageManager", "engines", "scripts", "pnpm", "dependencies", "devDependencies"];
const SCRIPTS_CYCLE_DE_VIE = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "preprepare",
  "postprepare",
  "prepublish",
  "prepublishOnly",
  "prepack",
  "postpack",
  "publish",
  "postpublish",
  "preuninstall",
  "uninstall",
  "postuninstall",
  "dependencies",
  "pnpm:devPreinstall",
]);
const VERSION_EXACTE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Contrôles de section 6 sur `package.json` : clés, `pnpm`, versions exactes, scripts de cycle de vie, et liste des
 * paquets déclarés. La liste exacte des scripts relève de P0c2 (section 7).
 */
export function analyserPackageJson(
  source: string,
  paquets: readonly { readonly paquet: string }[],
  onlyBuiltDependencies: readonly string[],
): Constat[] {
  const constats: Constat[] = [];
  const refus = (capacite: string, forme: string) =>
    constats.push({ fichier: "package.json", regle: "specificateur", capacite, forme, ligne: 0, admis: false });
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(source) as Record<string, unknown>;
  } catch {
    refus("package-illisible", "JSON");
    return constats;
  }
  for (const cle of Object.keys(json)) if (!CLES_PACKAGE.includes(cle)) refus("cle-package", cle);
  if (json.packageManager !== "pnpm@10.28.0") refus("packageManager", String(json.packageManager));
  const pnpm = (json.pnpm ?? {}) as Record<string, unknown>;
  for (const cle of Object.keys(pnpm)) if (cle !== "onlyBuiltDependencies") refus("cle-pnpm", cle);
  const construits = pnpm.onlyBuiltDependencies;
  if (!Array.isArray(construits) || JSON.stringify(construits) !== JSON.stringify(onlyBuiltDependencies)) refus("onlyBuiltDependencies", JSON.stringify(construits));
  const scripts = (json.scripts ?? {}) as Record<string, unknown>;
  for (const nom of Object.keys(scripts)) {
    // `pre<x>` et `post<x>` ne sont lancés que pour un script `<x>` existant ou un nom de cycle de vie (mineur 9).
    const base = /^(pre|post)(.+)$/.exec(nom)?.[2];
    const encadre = base !== undefined && (Object.hasOwn(scripts, base) || SCRIPTS_CYCLE_DE_VIE.has(base));
    if (SCRIPTS_CYCLE_DE_VIE.has(nom) || encadre) refus("script-cycle-de-vie", nom);
  }
  const declares = new Map<string, unknown>();
  for (const section of ["dependencies", "devDependencies"]) {
    const table = (json[section] ?? {}) as Record<string, unknown>;
    for (const [paquet, version] of Object.entries(table)) {
      declares.set(paquet, version);
      if (typeof version !== "string" || !VERSION_EXACTE.test(version)) refus("version-non-exacte", `${paquet}@${String(version)}`);
    }
  }
  const listes = new Set(paquets.map((p) => p.paquet));
  for (const paquet of declares.keys()) {
    if (listes.has(paquet)) constats.push({ fichier: "package.json", regle: "specificateur", capacite: "paquet", forme: paquet, ligne: 0, admis: true, par: `paquet:${paquet}` });
    else refus("paquet-non-liste", paquet);
  }
  for (const paquet of listes) if (!declares.has(paquet)) refus("paquet-absent", paquet);
  return constats;
}

// --- Cas de test (données du régime, section 1) ------------------------------------------------------------------

/**
 * Cas de test (décision 0038, P0c-TL-1 point 4) : `{ id, chemin, source, attendu, regle }`, plus, au besoin, `fichiers`
 * (autres fichiers virtuels, pour la résolution et les constantes importées), `typage` (jugé par le programme de cas)
 * et `fusion` (source fusionnée dans le `package.json` réel). Un cas `refus` doit être refusé par la règle nommée.
 */
export type Cas = {
  readonly id: string;
  readonly chemin: string;
  readonly source: string;
  readonly attendu: "refus" | "admis";
  /** Obligatoire pour un cas `refus` (vérifié par `lireCas`). */
  readonly regle?: Regle | RegleFermeture;
  readonly fichiers?: Readonly<Record<string, string>>;
  readonly typage?: boolean;
  readonly fusion?: boolean;
};

/** Cas d'un fichier de `donnees/`, forme contrôlée à l'exécution : un cas mal formé fait échouer le test (échec fermé). */
export function lireCas(nom: string): readonly Cas[] {
  const lus: unknown = JSON.parse(readFileSync(new URL(`./donnees/${nom}`, import.meta.url), "utf8"));
  const liste = (lus as { cas?: unknown }).cas;
  if (!Array.isArray(liste) || liste.length === 0) throw new Error(`confinement: ${nom} : liste de cas absente`);
  const ids = new Set<string>();
  for (const brut of liste as Record<string, unknown>[]) {
    const id = String(brut.id);
    const ok =
      typeof brut.id === "string" &&
      typeof brut.chemin === "string" &&
      typeof brut.source === "string" &&
      (brut.attendu === "refus" || brut.attendu === "admis") &&
      (brut.attendu === "admis" || typeof brut.regle === "string") &&
      !ids.has(id);
    if (!ok) throw new Error(`confinement: ${nom} : cas mal formé ou en double (${id}) ; un cas « refus » nomme sa règle`);
    ids.add(id);
  }
  return liste as Cas[];
}

/** Constats refusés d'un cas, analysé sous son chemin simulé. */
export function refusDuCas(
  cas: Cas,
  depot: Pick<Contexte, "existe" | "lire">,
  typage?: { readonly verificateur: ts.TypeChecker; readonly arbre: ts.SourceFile },
): Constat[] {
  const virtuels = cas.fichiers ?? {};
  const contexte: Contexte = {
    existe: (c) => Object.hasOwn(virtuels, c) || depot.existe(c),
    lire: (c) => (Object.hasOwn(virtuels, c) ? virtuels[c] : depot.lire(c)),
    ...(typage ?? {}),
  };
  return analyser(cas.chemin, cas.source, contexte).constats.filter((c) => !c.admis);
}

/** Écart entre l'attendu d'un cas et ses refus ; `undefined` si le cas passe. */
export function ecartDuCas(cas: Cas, refus: readonly Constat[]): string | undefined {
  const decrits = refus.map((c) => `[${c.regle}] ${c.capacite} — ${c.forme}`);
  if (cas.attendu === "admis") return refus.length === 0 ? undefined : `admis attendu, refusé : ${decrits.join(" ; ")}`;
  if (cas.regle !== undefined && refus.some((c) => c.regle === cas.regle)) return undefined;
  return `refus par la règle ${cas.regle ?? "?"} attendu, obtenu : ${decrits.join(" ; ") || "aucun refus"}`;
}
