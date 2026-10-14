import path from "node:path";

/**
 * Règle ESLint locale `ligne/use-server-only-in-actions` (spécification B3, B3a point 4 ; décision 0050, B3-TL-1
 * point 6 ; décision 0006 § 3) : la directive `"use server"`, en tête de fichier ou en tête du corps d'une fonction,
 * est refusée dans tout fichier de `src/`, `db/` et `scripts/` hors de `src/server/actions/**`. Une fonction marquée
 * `"use server"` devient une action appelable depuis le navigateur : seules les actions de `src/server/actions/` le
 * sont. Les tests (`*.test.ts(x)`) ne sont pas exemptés.
 *
 * Posée par un seul bloc d'`eslint.config.mjs` sur tout fichier ; le périmètre est lu ici, sur le chemin du fichier
 * relatif au dépôt, pour qu'aucun bloc plus bas ne puisse la remplacer.
 */

const DOSSIERS = ["src/", "db/", "scripts/"];
const ACTIONS = "src/server/actions/";

/** Vrai si la règle s'applique au fichier (chemin relatif au dépôt, séparateurs `/`). */
export function dansLePerimetre(fichier) {
  return DOSSIERS.some((dossier) => fichier.startsWith(dossier)) && !fichier.startsWith(ACTIONS);
}

/** Directives d'un corps (programme ou fonction) : instructions d'expression de tête qui portent `directive`. */
function directives(corps) {
  const trouvees = [];
  for (const instruction of corps) {
    if (instruction.type !== "ExpressionStatement" || typeof instruction.directive !== "string") break;
    trouvees.push(instruction);
  }
  return trouvees;
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Refuse la directive \"use server\" hors de src/server/actions/." },
    schema: [],
    messages: {
      forbidden:
        "Directive \"use server\" refusée hors de src/server/actions/ (décision 0050, B3-TL-1 point 6) : un module serveur n'est jamais une action appelable depuis le navigateur.",
    },
  },
  create(context) {
    const fichier = path.relative(context.cwd, context.filename).split(path.sep).join("/");
    if (!dansLePerimetre(fichier)) return {};
    function verifier(corps) {
      for (const instruction of directives(corps)) {
        if (instruction.directive === "use server") context.report({ node: instruction, messageId: "forbidden" });
      }
    }
    const fonction = (node) => {
      if (node.body?.type === "BlockStatement") verifier(node.body.body);
    };
    return {
      Program: (node) => verifier(node.body),
      FunctionDeclaration: fonction,
      FunctionExpression: fonction,
      ArrowFunctionExpression: fonction,
    };
  },
};

export default rule;
