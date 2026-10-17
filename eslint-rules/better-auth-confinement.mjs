import path from "node:path";

/**
 * Règles ESLint locales de B3b (spécification B3, B3b point 4 ; décisions 0008 et 0051 § 5.4).
 *
 * `ligne/better-auth-confinement`, posée sur tout fichier du dépôt, tests compris :
 * - `better-auth` (et ses sous-chemins, et les paquets `@better-auth/*`) : importable depuis `src/server/auth/` et
 *   `src/tenancy/` seulement ;
 * - `@/tenancy/auth` : importable depuis `src/server/auth/` seulement ;
 * - dans ces deux dossiers, `.api` ne s'emploie que dans un appel nommé de la liste blanche
 *   (`<objet>.api.sendVerificationOTP(…)`, `signInEmailOTP`, `getSession`, `signOut`) ; tout autre emploi est refusé :
 *   opération hors liste, accès calculé (`auth["api"]`, `auth.api[nom]`), déstructuration (`const { api } = auth`),
 *   valeur passée ou rendue (`f(auth.api)`, `return auth.api`). `handler` et `$context` y sont refusés de même.
 *
 * `ligne/no-raw-auth-secret`, posée sur `src/` : lecture de `BETTER_AUTH_SECRET`, `AUTH_SECRET` ou
 * `BETTER_AUTH_SECRETS` dans `process.env` (propriété, accès calculé littéral ou déstructuration) refusée hors du module
 * d'environnement `src/server/env/index.ts` (décision 0051 § 5.4) ; tout accès calculé non littéral à `process.env`
 * reste refusé par le régime de confinement (P0c).
 */

export const OPERATIONS_PERMISES = ["sendVerificationOTP", "signInEmailOTP", "getSession", "signOut"];
const DOSSIERS_BIBLIOTHEQUE = ["src/server/auth/", "src/tenancy/"];
const DOSSIER_OPERATIONS = "src/server/auth/";
const PROPRIETES_INTERDITES = new Set(["handler", "$context"]);

const relatif = (context) => path.relative(context.cwd, context.filename).split(path.sep).join("/");

function sourceText(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral") return node.quasis[0]?.value.cooked ?? null;
  return null;
}

/** Vrai si `source` désigne la bibliothèque. */
export function estBibliotheque(source) {
  return source === "better-auth" || source.startsWith("better-auth/") || source.startsWith("@better-auth/");
}

/** Vrai si `source`, importée depuis `importateur`, désigne `src/tenancy/auth`. */
export function estConfiguration(source, importateur) {
  let cible;
  if (source.startsWith("@/")) cible = path.posix.normalize(`src/${source.slice(2)}`);
  else if (source.startsWith("./") || source.startsWith("../")) cible = path.posix.normalize(path.posix.join(path.posix.dirname(importateur), source));
  else return false;
  return /^src\/tenancy\/auth(\.(ts|tsx|mts|js|mjs))?$/.test(cible) || cible === "src/tenancy/auth/index" || cible === "src/tenancy/auth/index.ts";
}

/** Nom d'une propriété non calculée, ou d'une propriété calculée littérale. */
function nomPropriete(membre) {
  if (!membre.computed && membre.property.type === "Identifier") return membre.property.name;
  if (membre.computed) return sourceText(membre.property);
  return null;
}

export const betterAuthConfinement = {
  meta: {
    type: "problem",
    docs: { description: "Confine better-auth à src/server/auth et src/tenancy, et auth.api à la liste blanche (B3b)." },
    schema: [],
    messages: {
      bibliotheque: "better-auth ne s'importe que depuis src/server/auth et src/tenancy (spécification B3, B3b point 4) ({{source}}).",
      configuration: "@/tenancy/auth ne s'importe que depuis src/server/auth (spécification B3, B3b point 4) ({{source}}).",
      operation:
        "auth.api : seul un appel nommé de la liste blanche est permis (sendVerificationOTP, signInEmailOTP, getSession, signOut) ; accès calculé, déstructuration et valeur refusés (décision 0008).",
      propriete: "{{nom}} de Better Auth refusé (aucune route ni contexte interne exposé ; décision 0008).",
    },
  },
  create(context) {
    const importateur = relatif(context);
    const dansBibliotheque = DOSSIERS_BIBLIOTHEQUE.some((dossier) => importateur.startsWith(dossier));
    const dansOperations = importateur.startsWith(DOSSIER_OPERATIONS);
    function controlerImport(node, sourceNode) {
      const source = sourceText(sourceNode);
      if (source === null) return;
      if (estBibliotheque(source) && !dansBibliotheque) context.report({ node, messageId: "bibliotheque", data: { source } });
      if (estConfiguration(source, importateur) && !dansOperations) context.report({ node, messageId: "configuration", data: { source } });
    }
    const visiteurs = {
      ImportDeclaration: (node) => controlerImport(node, node.source),
      ExportNamedDeclaration: (node) => controlerImport(node, node.source),
      ExportAllDeclaration: (node) => controlerImport(node, node.source),
      ImportExpression: (node) => controlerImport(node, node.source),
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") controlerImport(node, node.arguments[0]);
      },
      TSExternalModuleReference: (node) => controlerImport(node, node.expression),
      TSImportType(node) {
        const argument = node.source ?? node.argument ?? node.parameter;
        controlerImport(node, argument?.type === "TSLiteralType" ? argument.literal : argument);
      },
    };
    if (!dansBibliotheque) return visiteurs;
    return {
      ...visiteurs,
      MemberExpression(node) {
        const nom = nomPropriete(node);
        if (nom !== null && PROPRIETES_INTERDITES.has(nom)) {
          context.report({ node, messageId: "propriete", data: { nom } });
          return;
        }
        if (node.computed && nom === null) return;
        if (nom !== "api") return;
        if (node.computed) {
          context.report({ node, messageId: "operation" });
          return;
        }
        const parent = node.parent;
        const permis =
          parent?.type === "MemberExpression" &&
          parent.object === node &&
          !parent.computed &&
          parent.property.type === "Identifier" &&
          OPERATIONS_PERMISES.includes(parent.property.name) &&
          parent.parent?.type === "CallExpression" &&
          parent.parent.callee === parent;
        if (!permis) context.report({ node, messageId: "operation" });
      },
      Property(node) {
        if (node.parent?.type !== "ObjectPattern") return;
        const cle = node.computed ? sourceText(node.key) : node.key.type === "Identifier" ? node.key.name : sourceText(node.key);
        if (cle === "api" || PROPRIETES_INTERDITES.has(cle)) context.report({ node, messageId: "operation" });
      },
    };
  },
};

const SECRETS_BRUTS = /^(?:BETTER_)?AUTH_SECRETS?$/;
const MODULE_ENVIRONNEMENT = "src/server/env/index.ts";

/** Vrai si `node` est `process.env` (propriété non calculée, ou calculée littérale). */
function estProcessEnv(node) {
  return (
    node?.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    node.object.name === "process" &&
    nomPropriete(node) === "env"
  );
}

export const noRawAuthSecret = {
  meta: {
    type: "problem",
    docs: { description: "Secret de Better Auth lu seulement par src/server/env/index.ts (décision 0051 § 5.4)." },
    schema: [],
    messages: {
      lecture: "Secret de Better Auth lu dans process.env hors de src/server/env/index.ts (décision 0051 § 5.4).",
    },
  },
  create(context) {
    if (relatif(context) === MODULE_ENVIRONNEMENT) return {};
    return {
      MemberExpression(node) {
        if (!estProcessEnv(node.object)) return;
        const nom = nomPropriete(node);
        if (nom !== null && SECRETS_BRUTS.test(nom)) context.report({ node, messageId: "lecture" });
      },
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || !estProcessEnv(node.init)) return;
        for (const propriete of node.id.properties) {
          if (propriete.type !== "Property") continue;
          const cle = propriete.computed ? sourceText(propriete.key) : propriete.key.type === "Identifier" ? propriete.key.name : sourceText(propriete.key);
          if (cle !== null && SECRETS_BRUTS.test(cle)) context.report({ node: propriete, messageId: "lecture" });
        }
      },
    };
  },
};
