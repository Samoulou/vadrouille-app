/**
 * Règle ESLint locale : confinement du Workflow SDK (décision 0009, points 1 et 2 ; décision 0063, points 3 et 4 ;
 * revue consolidée de la PR 326, réponse 4 de la Sécurité). Posée sur tout fichier du dépôt par un seul bloc
 * d'`eslint.config.mjs`, comme `ligne/server-env-imports` (en configuration plate, `no-restricted-syntax` serait
 * remplacé en bloc par un bloc plus bas) :
 * - les directives `"use workflow"` et `"use step"` n'apparaissent que dans `src/workflows/` (tests exclus) ;
 * - le paquet `workflow` et ses sous-chemins, et tout paquet `@workflow/*`, ne s'importent que depuis `src/workflows/`
 *   (le reste du code ne connaît que `src/workflows/index.ts`, 0009 point 2) ; seule exception : `workflow/next`
 *   depuis `next.config.ts` (`withWorkflow`) ;
 * - `createWebhook`, `createHook`, `defineHook`, `resumeHook`, `resumeWebhook` et `getHookByToken` ne s'importent
 *   **nulle part** : `p0Run` ne crée aucun jeton de webhook, et la route `/.well-known/workflow/v1/webhook/[token]`
 *   rend 404 (relevé 1 de la PR 326) ; un import `* as` du paquet est refusé pour la même raison.
 * Toutes les formes de chargement sont lues : `import`, `export … from`, `import()`, `require()`, `import x = require()`.
 */

const DOSSIER = "src/workflows/";

/** Noms du SDK interdits partout : jetons de reprise exposés par une route publique (webhook, hook). */
export const NOMS_INTERDITS = new Set(["createWebhook", "createHook", "defineHook", "resumeHook", "resumeWebhook", "getHookByToken"]);

/** Vrai si la source est le paquet `workflow` (ou un sous-chemin) ou un paquet `@workflow/*`. */
export function estSdkWorkflow(source) {
  return source === "workflow" || source.startsWith("workflow/") || source.startsWith("@workflow/");
}

const estTest = (fichier) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(fichier) || fichier.startsWith("tests/");

/** Vrai si `fichier` (chemin relatif au dépôt, séparateurs `/`) peut importer `source` du SDK. */
export function importSdkAdmis(source, fichier) {
  if (fichier.startsWith(DOSSIER) || estTest(fichier)) return true;
  return fichier === "next.config.ts" && source === "workflow/next";
}

/** Vrai si une directive du SDK est admise dans ce fichier. */
export function directiveAdmise(fichier) {
  return fichier.startsWith(DOSSIER) && !estTest(fichier);
}

const DIRECTIVES = new Set(["use workflow", "use step"]);

function relatif(context) {
  const cwd = context.cwd.replace(/\\/g, "/");
  const nom = context.filename.replace(/\\/g, "/");
  return nom.startsWith(`${cwd}/`) ? nom.slice(cwd.length + 1) : nom;
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Confine le Workflow SDK à src/workflows et interdit webhooks et hooks." },
    schema: [],
    messages: {
      directive: "Directive « {{directive}} » hors de src/workflows/ (décision 0009, point 1).",
      import: "Le Workflow SDK ({{source}}) ne s'importe que depuis src/workflows/ (décision 0009, point 2).",
      nom: "« {{nom}} » est interdit : p0Run ne crée ni webhook ni hook (décision 0063, point 4).",
      espace: "Import global du Workflow SDK interdit : nommer les fonctions importées (décision 0063, point 4).",
    },
  },
  create(context) {
    const fichier = relatif(context);
    function source(node, sourceNode) {
      if (!sourceNode || sourceNode.type !== "Literal" || typeof sourceNode.value !== "string") return;
      const valeur = sourceNode.value;
      if (!estSdkWorkflow(valeur)) return;
      if (!importSdkAdmis(valeur, fichier)) context.report({ node, messageId: "import", data: { source: valeur } });
    }
    function noms(node) {
      if (!node.source || typeof node.source.value !== "string" || !estSdkWorkflow(node.source.value)) return;
      for (const specifier of node.specifiers ?? []) {
        if (specifier.type === "ImportNamespaceSpecifier") context.report({ node: specifier, messageId: "espace" });
        const importe = specifier.type === "ImportSpecifier" ? specifier.imported : specifier.type === "ExportSpecifier" ? specifier.local : null;
        const nom = importe ? (importe.type === "Identifier" ? importe.name : importe.value) : null;
        if (nom !== null && NOMS_INTERDITS.has(nom)) context.report({ node: specifier, messageId: "nom", data: { nom } });
      }
    }
    return {
      ExpressionStatement(node) {
        if (typeof node.directive === "string" && DIRECTIVES.has(node.directive) && !directiveAdmise(fichier)) {
          context.report({ node, messageId: "directive", data: { directive: node.directive } });
        }
      },
      ImportDeclaration(node) {
        source(node, node.source);
        noms(node);
      },
      ExportNamedDeclaration(node) {
        source(node, node.source);
        noms(node);
      },
      ExportAllDeclaration(node) {
        source(node, node.source);
        if (node.source && typeof node.source.value === "string" && estSdkWorkflow(node.source.value)) {
          context.report({ node, messageId: "espace" });
        }
      },
      ImportExpression(node) {
        source(node, node.source);
        if (node.source?.type === "Literal" && typeof node.source.value === "string" && estSdkWorkflow(node.source.value)) {
          context.report({ node, messageId: "espace" });
        }
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          const argument = node.arguments[0];
          source(node, argument);
          if (argument?.type === "Literal" && typeof argument.value === "string" && estSdkWorkflow(argument.value)) {
            context.report({ node, messageId: "espace" });
          }
        }
      },
      TSExternalModuleReference(node) {
        source(node, node.expression);
        if (node.expression?.type === "Literal" && typeof node.expression.value === "string" && estSdkWorkflow(node.expression.value)) {
          context.report({ node, messageId: "espace" });
        }
      },
    };
  },
};

export default rule;
