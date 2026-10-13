/**
 * Règle ESLint locale : `import "server-only";` obligatoire (décision 0006, handover § 3, spécification B1).
 *
 * Appliquée par `eslint.config.mjs` à `db/` et aux dossiers serveur du handover § 3 (`src/server` hors `actions/`,
 * `src/tenancy`, `src/ai`, `src/research`, `src/grounding`, `src/workflows`) : un module de ces dossiers importé
 * par erreur dans le code du navigateur fait échouer le build de Next.js au lieu d'y embarquer un secret.
 * Seul l'import nu compte (`import "server-only";`), pas une simple mention du nom.
 */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Exige import \"server-only\" dans les modules serveur." },
    schema: [],
    messages: {
      missing:
        'Module serveur : ajoute `import "server-only";` (décision 0006, handover § 3) pour qu\'il ne puisse jamais être chargé par le navigateur.',
    },
  },
  create(context) {
    return {
      Program(node) {
        const found = node.body.some(
          (statement) =>
            statement.type === "ImportDeclaration" &&
            statement.source.value === "server-only" &&
            statement.specifiers.length === 0 &&
            statement.importKind !== "type",
        );
        if (!found) context.report({ node, loc: { line: 1, column: 0 }, messageId: "missing" });
      },
    };
  },
};

export default rule;
