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
 * - `@/server/env` (`index.ts`, B3a) : depuis `src/instrumentation.ts`, le limiteur, les opérations de connexion
 *   (`src/server/auth/index.ts`, B3b) et son test unitaire seulement ;
 * - `@/server/env/resolve` (B3a) : depuis `db/connection.ts` et le même test seulement ;
 * - `@/server/env/payment` (B4) : depuis `src/server/routes/` et `src/server/payment/` seulement ;
 * - `@/server/env/p0` (P0r3b) : depuis la garde, l'accès et le lancement du mode réel (`src/server/p0/garde.ts`,
 *   `src/server/p0/acces.ts`, `src/server/p0/lancement.ts`) seulement ;
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
  // B3a (décision 0050, B3-TL-1 point 1) : module d'environnement du serveur (`@/server/env`), nommé fichier par
  // fichier ; résolution de l'environnement, importée par la garde de connexion (`../src/server/env/resolve.ts`) ;
  // module du paiement (B4), depuis les routes et le paiement serveur seulement (handover § 3).
  // B3b (décision 0077 § 5.1) : opérations de connexion, configuration par défaut tirée de `serverEnv()`.
  ["index", ["src/instrumentation.ts", "src/server/rate-limit.ts", "src/server/auth/index.ts", "tests/unit/server/env.test.ts"]],
  ["resolve", ["db/connection.ts", "tests/unit/server/env.test.ts"]],
  ["payment", ["src/server/routes/", "src/server/payment/"]],
  // P0r3b (décision 0055, section 1 point 2) : module étroit du mode réel, depuis la garde et l'accès seulement ; ses
  // tests sont dans `src/server/env/` (`p0.test.ts`).
  // P0r3d (ticket 354 ; 0046, D24) : commit du déploiement (`commitDuDeploiement`), lu par le lancement seulement, garde
  // déjà ouverte. Verdict Sécurité : approuvé (revue consolidée du head `193603d`, PR 357).
  ["p0", ["src/server/p0/garde.ts", "src/server/p0/acces.ts", "src/server/p0/lancement.ts"]],
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
