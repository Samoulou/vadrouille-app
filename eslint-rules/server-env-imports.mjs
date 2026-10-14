import path from "node:path";

/**
 * Règle ESLint locale : confinement des imports des modules d'environnement étroits de P0r1 (spécification
 * `specs/P0-suite-executions-reelles.md`, « Modules d'environnement étroits » ; décision 0031 § 6, amendement de 0017
 * § 3.3). Posée sur tout fichier du dépôt par un seul bloc d'`eslint.config.mjs` :
 * - `@/server/env/ai` : depuis `src/ai` seulement ;
 * - `@/server/env/grounding` : depuis `src/grounding` seulement ;
 * - `@/server/env/egress` : depuis `src/server/env/`, `src/ai`, `src/grounding` et `src/research/undici-transport.ts`
 *   seulement ;
 * - `@/server/env/garde-cles` : depuis la mise en place de Vitest (`tests/unit/setup.ts`) et la configuration de
 *   Playwright seulement ;
 * - tout autre module de `src/server/env/` : depuis `src/server/env/` seulement.
 * Les fichiers de `src/server/env/` (tests compris) importent les modules de leur dossier. La source est résolue
 * (alias `@/` ou chemin relatif, segments `.` et `..` normalisés) avant la comparaison ; toutes les formes de
 * chargement sont lues, comme `ligne/no-p0-server-modules`.
 */

const DOSSIER = "src/server/env/";

/** Fichiers ou dossiers (préfixe finissant par `/`) admis pour chaque module, en plus de `src/server/env/`. */
export const IMPORTATEURS_ADMIS = new Map([
  ["ai", ["src/ai/"]],
  ["grounding", ["src/grounding/"]],
  ["egress", ["src/ai/", "src/grounding/", "src/research/undici-transport.ts"]],
  ["garde-cles", ["tests/unit/setup.ts", "playwright.config.ts"]],
]);

/** Module de `src/server/env/` visé par une source, ou `null` (chemin relatif au dépôt de l'importateur). */
export function moduleEnvVise(source, importateur) {
  let cible;
  if (source.startsWith("@/")) cible = path.posix.normalize(`src/${source.slice(2).replace(/^\/+/, "")}`);
  else if (source.startsWith("./") || source.startsWith("../")) cible = path.posix.normalize(path.posix.join(path.posix.dirname(importateur), source));
  else return null;
  if (cible === DOSSIER.slice(0, -1) || cible === `${DOSSIER}index` || cible === `${DOSSIER}index.ts`) return "index";
  if (!cible.startsWith(DOSSIER)) return null;
  return cible.slice(DOSSIER.length).replace(/\.(ts|tsx|mts|js|mjs)$/, "");
}

/** Vrai si `importateur` (chemin relatif au dépôt, séparateurs `/`) peut importer ce module. */
export function importAdmis(cible, importateur) {
  if (importateur.startsWith(DOSSIER)) return true;
  const admis = IMPORTATEURS_ADMIS.get(cible) ?? [];
  return admis.some((entree) => (entree.endsWith("/") ? importateur.startsWith(entree) : importateur === entree));
}

function sourceText(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral") return node.quasis[0]?.value.cooked ?? null;
  return null;
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Confine les imports des modules d'environnement étroits de P0r1 (src/server/env/)." },
    schema: [],
    messages: {
      forbidden: "Module d'environnement étroit {{module}} : import refusé ici (décision 0031 § 6 ; spécification P0r1) ({{source}}).",
    },
  },
  create(context) {
    const importateur = path.relative(context.cwd, context.filename).split(path.sep).join("/");
    function check(node, sourceNode) {
      const source = sourceText(sourceNode);
      if (source === null) return;
      const cible = moduleEnvVise(source, importateur);
      if (cible !== null && !importAdmis(cible, importateur)) context.report({ node, messageId: "forbidden", data: { module: cible, source } });
    }
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") check(node, node.arguments[0]);
      },
      TSExternalModuleReference: (node) => check(node, node.expression),
      TSImportType(node) {
        const argument = node.source ?? node.argument ?? node.parameter;
        check(node, argument?.type === "TSLiteralType" ? argument.literal : argument);
      },
    };
  },
};

export default rule;
