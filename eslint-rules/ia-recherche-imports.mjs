import path from "node:path";

/**
 * Règles ESLint locales de B7a (ticket 423 ; spécification `specs/B7-couche-ia-recherche.md`, B7a point 5 ; handover
 * § 3, tableaux « Liste blanche » et « Liste noire » ; décision 0077 § 1 point 5). Posées sur tout fichier du dépôt par
 * un seul bloc d'`eslint.config.mjs` ; chaque règle choisit elle-même les importateurs qu'elle vise.
 *
 * `ligne/ia-recherche-liste-blanche` : un fichier de `src/ai` ou de `src/research`, tests compris, n'importe que :
 * - partout : `server-only`, `zod`, `@/contracts` et ses sous-chemins ;
 * - sous `src/ai` : les fichiers de `src/ai`, `@/server/env/ai`, `@/server/usage/port` (le port seul) ; le SDK de
 *   modèles (`ai`, `@openrouter/ai-sdk-provider`) et `@/server/env/egress` dans le seul `src/ai/openrouter-client.ts` ;
 * - sous `src/research` : les fichiers de `src/ai` et de `src/research` ; `node:net` dans le seul `ip-guard.ts` ;
 *   `node:dns/promises`, `undici` et `@/server/env/egress` dans le seul `undici-transport.ts` ; `parse5` dans le seul
 *   `extract-text.ts` (analyseur HTML du lecteur de pages, P0a1 ; absent du tableau du handover, question au Tech Lead
 *   dans la PR de B7a) ;
 * - pour les `*.test.ts` : `vitest` et les modules nommés de `tests/support` (`MODULES_SUPPORT`) ; exceptions
 *   nominatives des tests qui relisent leur module (`EXCEPTIONS_TESTS`).
 * Tout autre import est refusé : `@/grounding`, `db/`, `@/prototype/*`, `@/server/env`, une implémentation de
 * `@/server/usage`, `drizzle-orm`, `@/research` depuis `src/ai`, etc.
 *
 * `ligne/complement-p0-imports` : `@/ai/complement-p0` (récit et logements de P0, jamais dans la couche IA de
 * production) n'est importable que depuis `src/ai/requetes.ts`, `src/server/p0/**`, `scripts/p0/**`,
 * `src/workflows/p0-run.ts`, `src/server/composition/p0-reel.ts` et les tests (décision 0077 § 1 point 5).
 *
 * Toutes les formes de chargement sont lues (import statique ou de type, réexport, `import()`, `require()`, `import
 * x = require()`, `import("…")` de type, `vi.importActual`, `vi.importMock`, `vi.mock` sans fabrique) ; sous
 * `src/ai` et `src/research`, une source non littérale est refusée. La source est résolue (alias `@/`, chemin
 * relatif, segments `.` et `..` normalisés, extension retirée) avant la comparaison.
 */

/**
 * Modules de `tests/support` importables par les tests de `src/ai` et `src/research` (nommés un par un ; ceux qu'ils
 * utilisent aujourd'hui seulement : revue du head `5a955f8`, mineur 2 — `sentinelles-google` importe un type de
 * `@/grounding` et reste réservé aux tests de `tests/`).
 */
export const MODULES_SUPPORT = ["tests/support/horloge-manuelle", "tests/support/port-consommation-memoire"];

/** Paquets admis dans un seul fichier (module de capacité). */
const CAPACITES = new Map([
  ["src/ai/openrouter-client.ts", ["ai", "@openrouter/ai-sdk-provider"]],
  ["src/research/ip-guard.ts", ["node:net"]],
  ["src/research/undici-transport.ts", ["node:dns/promises", "undici", "src/server/env/egress"]],
  ["src/research/extract-text.ts", ["parse5"]],
]);

/**
 * Tests existants qui relisent la source de leur module ou compressent une réponse simulée (P0a1, P0r1) : exceptions
 * nominatives, limitées aux modules de Node cités.
 */
export const EXCEPTIONS_TESTS = new Map([
  ["src/ai/openrouter-client.test.ts", ["node:fs"]],
  ["src/research/fetch-page.test.ts", ["node:fs", "node:path", "node:zlib"]],
]);

const COMPLEMENT_P0 = "src/ai/complement-p0";
/** Importateurs admis de `@/ai/complement-p0` (préfixe finissant par `/`, ou fichier). */
export const IMPORTATEURS_COMPLEMENT = ["src/ai/requetes.ts", "src/server/p0/", "scripts/p0/", "src/workflows/p0-run.ts", "src/server/composition/p0-reel.ts", "tests/"];

const estTest = (fichier) => /\.(test|spec)\.(ts|tsx|mts)$/.test(fichier);

/** Cible d'une source : chemin du dépôt sans extension (`src/…`, `tests/…`), ou le nom du paquet tel quel. */
export function cibleDe(source, importateur) {
  let cible;
  if (source.startsWith("@/")) cible = path.posix.normalize(`src/${source.slice(2).replace(/^\/+/, "")}`);
  else if (source.startsWith("./") || source.startsWith("../") || source === "." || source === "..")
    cible = path.posix.normalize(path.posix.join(path.posix.dirname(importateur), source));
  else return { paquet: source };
  return { chemin: cible.replace(/\/$/, "").replace(/\.(ts|tsx|mts|js|mjs)$/, "").replace(/\/index$/, "") };
}

const dans = (chemin, dossier) => chemin === dossier || chemin.startsWith(`${dossier}/`);

/** Vrai si `importateur` (sous `src/ai` ou `src/research`) peut importer `source`. */
export function importListeBlanche(source, importateur) {
  const cible = cibleDe(source, importateur);
  const recherche = importateur.startsWith("src/research/");
  const capacites = CAPACITES.get(importateur) ?? [];
  const test = estTest(importateur);
  if (cible.paquet !== undefined) {
    const paquet = cible.paquet;
    if (paquet === "server-only" || paquet === "zod") return true;
    if (capacites.includes(paquet)) return true;
    if (test && paquet === "vitest") return true;
    if (test && (EXCEPTIONS_TESTS.get(importateur) ?? []).includes(paquet)) return true;
    return false;
  }
  const chemin = cible.chemin;
  if (dans(chemin, "src/contracts")) return true;
  if (dans(chemin, "src/ai")) return true;
  if (recherche && dans(chemin, "src/research")) return true;
  if (!recherche && (chemin === "src/server/env/ai" || chemin === "src/server/usage/port")) return true;
  if (capacites.includes(chemin)) return true;
  if (test && MODULES_SUPPORT.includes(chemin)) return true;
  return false;
}

/** Vrai si `importateur` peut importer `source` au regard de `@/ai/complement-p0`. */
export function importComplementAdmis(source, importateur) {
  const cible = cibleDe(source, importateur);
  if (cible.chemin !== COMPLEMENT_P0) return true;
  if (estTest(importateur)) return true;
  return IMPORTATEURS_COMPLEMENT.some((entree) => (entree.endsWith("/") ? importateur.startsWith(entree) : importateur === entree));
}

/** Texte d'une source littérale (chaîne, ou gabarit **sans** expression) ; `null` pour toute autre source. */
function sourceText(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null;
  return null;
}

/**
 * Visiteurs communs : `verifier(node, source)` pour chaque forme de chargement ; `source` vaut `null` quand elle n'est
 * pas littérale (`import(v)`, `require(v)`, ``import(`${v}`)``, `require()` sans argument) : la liste blanche la refuse
 * (revue du head `5a955f8`, bloquant 2), la règle de `complement-p0` ne peut pas la juger.
 */
function visiteurs(verifier) {
  const check = (node, sourceNode) => verifier(node, sourceText(sourceNode));
  return {
    ImportDeclaration: (node) => check(node, node.source),
    // Une déclaration exportée sans `from` (`export const x = …`) ne charge rien.
    ExportNamedDeclaration: (node) => node.source && check(node, node.source),
    ExportAllDeclaration: (node) => check(node, node.source),
    ImportExpression: (node) => check(node, node.source),
    CallExpression(node) {
      if (node.callee.type === "Identifier" && node.callee.name === "require") check(node, node.arguments[0]);
      // Chargements de Vitest : `vi.importActual`, `vi.importMock`, et `vi.mock` / `vi.doMock` sans fabrique (simulation
      // automatique, qui charge le module réel). Une fabrique remplace le module sans le charger : non lue.
      const appel = node.callee;
      if (appel.type === "MemberExpression" && appel.object.type === "Identifier" && appel.object.name === "vi" && appel.property.type === "Identifier") {
        const nom = appel.property.name;
        if (nom === "importActual" || nom === "importMock" || ((nom === "mock" || nom === "doMock") && node.arguments.length < 2)) check(node, node.arguments[0]);
      }
    },
    TSExternalModuleReference: (node) => check(node, node.expression),
    TSImportType(node) {
      const argument = node.source ?? node.argument ?? node.parameter;
      check(node, argument?.type === "TSLiteralType" ? argument.literal : argument);
    },
  };
}

const importateurDe = (context) => path.relative(context.cwd, context.filename).split(path.sep).join("/");

export const listeBlanche = {
  meta: {
    type: "problem",
    docs: { description: "src/ai et src/research en liste blanche d'imports (B7a ; handover § 3)." },
    schema: [],
    messages: {
      forbidden: "src/{{dossier}} en liste blanche (handover § 3, spécification B7a) : import refusé ({{source}}).",
      nonLitteral: "src/{{dossier}} en liste blanche (handover § 3, spécification B7a) : source de chargement non littérale refusée.",
    },
  },
  create(context) {
    const importateur = importateurDe(context);
    const dossier = importateur.startsWith("src/ai/") ? "ai" : importateur.startsWith("src/research/") ? "research" : null;
    if (dossier === null) return {};
    return visiteurs((node, source) => {
      if (source === null) context.report({ node, messageId: "nonLitteral", data: { dossier } });
      else if (!importListeBlanche(source, importateur)) context.report({ node, messageId: "forbidden", data: { dossier, source } });
    });
  },
};

export const complementP0 = {
  meta: {
    type: "problem",
    docs: { description: "@/ai/complement-p0 confiné aux appels directs de P0 (décision 0077 § 1 point 5)." },
    schema: [],
    messages: {
      forbidden:
        "@/ai/complement-p0 (récit et logements de P0) n'est importable que depuis src/ai/requetes.ts, src/server/p0, scripts/p0, src/workflows/p0-run.ts, src/server/composition/p0-reel.ts et les tests (décision 0077 § 1 point 5) ({{source}}).",
    },
  },
  create(context) {
    const importateur = importateurDe(context);
    return visiteurs((node, source) => {
      if (source !== null && !importComplementAdmis(source, importateur)) context.report({ node, messageId: "forbidden", data: { source } });
    });
  },
};
