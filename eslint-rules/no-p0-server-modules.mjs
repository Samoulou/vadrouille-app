/**
 * Règle ESLint locale : ni `src/ai`, ni `src/research`, ni `src/grounding` hors des dossiers serveur (décision 0006,
 * amendement du 2026-10-13 ; B1, #188, correction 3).
 *
 * Garde de remplacement de l'exception nominative de `ligne/require-server-only` : les 20 modules de phase 0 de ces
 * dossiers n'importent pas `server-only` (`pnpm p0` les charge hors Next.js), c'est donc cette règle qui les tient
 * hors du navigateur. Elle lit toutes les formes de chargement d'un module :
 * - `import … from`, `import type … from`, `import "…"`, `export … from`, `export * from` ;
 * - `import("…")` (y compris dans `next/dynamic`) et `import(\`…\`)` (partie fixe du début du gabarit) ;
 * - `require("…")`, `import x = require("…")`, `typeof import("…")`.
 *
 * Règle propre au plugin `ligne`, posée par un seul bloc d'`eslint.config.mjs` sur tout fichier hors des dossiers
 * serveur : aucun autre bloc ne la règle, si bien qu'en configuration plate elle ne peut pas être remplacée en bloc
 * comme `no-restricted-imports` ou `no-restricted-syntax`.
 */

/** Alias `@/ai`, `@/research`, `@/grounding` ; chemin relatif (éventuellement précédé de `@/`) qui y mène. */
export const P0_SERVER_MODULES_REGEX = /^(@\/(ai|research|grounding)(\/|$)|(@\/)?(\.{1,2}\/)+(.*\/)?(ai|research|grounding)(\/|$))/;

/** Valeur fixe d'une source : chaîne littérale, ou début d'un gabarit (`\`@/ai/${x}\`` → `@/ai/`). */
function sourceText(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral") return node.quasis[0]?.value.cooked ?? null;
  return null;
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Interdit src/ai, src/research et src/grounding hors des dossiers serveur." },
    schema: [],
    messages: {
      forbidden:
        "src/ai, src/research et src/grounding restent côté serveur (décision 0006, amendement du 2026-10-13) : passe par une action ou une page serveur ({{source}}).",
    },
  },
  create(context) {
    function check(node, sourceNode) {
      const source = sourceText(sourceNode);
      if (source !== null && P0_SERVER_MODULES_REGEX.test(source)) {
        context.report({ node, messageId: "forbidden", data: { source } });
      }
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
        // typescript-eslint 8 : `argument` est un TSLiteralType ; versions antérieures : `parameter`.
        const argument = node.argument ?? node.parameter;
        check(node, argument?.type === "TSLiteralType" ? argument.literal : argument);
      },
    };
  },
};

export default rule;
