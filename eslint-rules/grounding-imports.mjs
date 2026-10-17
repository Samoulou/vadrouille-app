import { cibleDe, importateurDe, visiteurs } from "./ia-recherche-imports.mjs";

/**
 * Règles ESLint locales de B8a (ticket 462 ; spécification `specs/B8-ancrage.md`, B8a point 6 ; handover § 3, ligne
 * `src/grounding` de la « Liste blanche » ; décision 0085 § 1.8 et § 1.10). Posées sur tout fichier du dépôt par un
 * seul bloc d'`eslint.config.mjs` ; chaque règle choisit elle-même les importateurs qu'elle vise.
 *
 * `ligne/grounding-liste-blanche` : un fichier de `src/grounding`, tests compris, n'importe que :
 * - partout : `server-only`, `zod`, `@/contracts` et ses sous-chemins, les fichiers de `src/grounding`,
 *   `@/server/env/egress` (code `missing_key` seul, 0077 § 3 point 1) ;
 * - dans les seuls modules de capacité `places-client.ts` et `routes-client.ts` : `@/server/env/grounding` et
 *   `@/server/usage/port` (0031 § 5) ;
 * - `@/prototype/*` : dans `ancrage.ts` (0032 A3.2) et les modules de P0r3c qui l'importent (`ancrage-zone.ts`,
 *   `fiches-finales.ts`, `budget-routes.ts`), et le test `ancrage-zone.test.ts` (`@/prototype/brief`) : liste
 *   fermée, retirée par B8-TL-10 ;
 * - pour les `*.test.ts` : `vitest`, les modules nommés de `tests/support` (`MODULES_SUPPORT_GROUNDING`) et les
 *   exceptions nominatives des tests qui relisent la table de prix (`EXCEPTIONS_TESTS_GROUNDING`).
 * Tout autre import est refusé : `@/ai`, `@/research`, `@/domain`, `db/`, `@/server/env`, une implémentation de
 * `@/server/usage`, `drizzle-orm`, etc. Un module de production (tout fichier non-test hors de la liste de P0
 * ci-dessus) n'importe de `@/grounding/ancrage` que `RAYON_BIAIS_METRES`, `BLOC_MATRICE`, `cleTrajet` et
 * `minutesDeTrajets` (0085 § 1.9), par des noms explicites (ni `*`, ni défaut, ni réexport global, ni `import()`).
 *
 * `ligne/relecture-imports` (0085 § 1.8, frontière de 0081) : `@/server/relecture/*` n'est importable que depuis
 * `src/server/composition/generation.ts`, les fichiers de `src/server/relecture/` et les tests ; ni `p0-reel.ts` ni
 * un autre module de `src/server/composition/`.
 *
 * Toutes les formes de chargement sont lues (celles de `ligne/ia-recherche-liste-blanche`) ; sous `src/grounding`,
 * une source non littérale est refusée.
 */

const DOSSIER = "src/grounding/";

/** Modules de phase 0 qui importent `@/prototype/*` (0085 § 1.10) : liste fermée, retirée par B8-TL-10. */
export const MODULES_P0_GROUNDING = ["src/grounding/ancrage.ts", "src/grounding/ancrage-zone.ts", "src/grounding/fiches-finales.ts", "src/grounding/budget-routes.ts"];

/** Tests de phase 0 de `src/grounding` qui importent `@/prototype/*`, avec leurs seuls modules. */
export const EXCEPTIONS_PROTOTYPE_TESTS = new Map([["src/grounding/ancrage-zone.test.ts", ["src/prototype/brief"]]]);

/** Modules de capacité et leurs imports de `src/server` en plus (0031 § 5). */
const CAPACITES = new Map([
  ["src/grounding/places-client.ts", ["src/server/env/grounding", "src/server/usage/port"]],
  ["src/grounding/routes-client.ts", ["src/server/env/grounding", "src/server/usage/port"]],
]);

/** Modules de `tests/support` importables par les tests de `src/grounding` (nommés un par un). */
export const MODULES_SUPPORT_GROUNDING = ["tests/support/doubles-grounding", "tests/support/horloge-manuelle", "tests/support/port-consommation-memoire"];

/** Tests qui relisent la table de prix commitée ou une fixture : modules de Node cités seulement. */
export const EXCEPTIONS_TESTS_GROUNDING = new Map([
  ["src/grounding/ancrage-zone.test.ts", ["node:fs", "node:path"]],
  ["src/grounding/places-client.test.ts", ["node:fs", "node:path"]],
  ["src/grounding/routes-client.test.ts", ["node:fs", "node:path"]],
]);

/** Noms de `@/grounding/ancrage` permis à un module de production (0085 § 1.9). */
export const NOMS_ANCRAGE_P0 = ["RAYON_BIAIS_METRES", "BLOC_MATRICE", "cleTrajet", "minutesDeTrajets"];

const ANCRAGE = "src/grounding/ancrage";
const estTest = (fichier) => /\.(test|spec)\.(ts|tsx|mts)$/.test(fichier);
const dans = (chemin, dossier) => chemin === dossier || chemin.startsWith(`${dossier}/`);

/** Vrai si `importateur` (sous `src/grounding`) peut importer `source`. */
export function importGroundingAdmis(source, importateur) {
  const cible = cibleDe(source, importateur);
  const test = estTest(importateur);
  if (cible.paquet !== undefined) {
    const paquet = cible.paquet;
    if (paquet === "server-only" || paquet === "zod") return true;
    if (test && paquet === "vitest") return true;
    if (test && (EXCEPTIONS_TESTS_GROUNDING.get(importateur) ?? []).includes(paquet)) return true;
    return false;
  }
  const chemin = cible.chemin;
  if (dans(chemin, "src/contracts") || dans(chemin, "src/grounding")) return true;
  if (chemin === "src/server/env/egress") return true;
  if ((CAPACITES.get(importateur) ?? []).includes(chemin)) return true;
  if (dans(chemin, "src/prototype")) {
    if (MODULES_P0_GROUNDING.includes(importateur)) return true;
    return (EXCEPTIONS_PROTOTYPE_TESTS.get(importateur) ?? []).includes(chemin);
  }
  if (test && MODULES_SUPPORT_GROUNDING.includes(chemin)) return true;
  return false;
}

/** Vrai si l'importateur est un module de production de `src/grounding` (soumis à la règle des quatre noms). */
export const estModuleProduction = (importateur) => importateur.startsWith(DOSSIER) && !estTest(importateur) && !MODULES_P0_GROUNDING.includes(importateur);

/** Noms importés ou réexportés d'une déclaration ; `null` si la forme ne nomme pas ses imports (`*`, défaut, `import()`). */
function nomsDe(node) {
  if (node.type === "ImportDeclaration") {
    if (node.specifiers.length === 0) return null;
    const noms = [];
    for (const specifier of node.specifiers) {
      if (specifier.type !== "ImportSpecifier") return null;
      noms.push(specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value));
    }
    return noms;
  }
  if (node.type === "ExportNamedDeclaration") return node.specifiers.map((specifier) => (specifier.local.type === "Identifier" ? specifier.local.name : String(specifier.local.value)));
  return null;
}

export const listeBlancheGrounding = {
  meta: {
    type: "problem",
    docs: { description: "src/grounding en liste blanche d'imports (B8a ; handover § 3 ; décision 0085 § 1.10)." },
    schema: [],
    messages: {
      forbidden: "src/grounding en liste blanche (handover § 3, spécification B8a, décision 0085 § 1.10) : import refusé ({{source}}).",
      nonLitteral: "src/grounding en liste blanche (handover § 3, spécification B8a) : source de chargement non littérale refusée.",
      nomsAncrage:
        "Un module de production de src/grounding n'importe de @/grounding/ancrage que RAYON_BIAIS_METRES, BLOC_MATRICE, cleTrajet et minutesDeTrajets, par leur nom (décision 0085 § 1.9) ({{source}}).",
    },
  },
  create(context) {
    const importateur = importateurDe(context);
    if (!importateur.startsWith(DOSSIER)) return {};
    const production = estModuleProduction(importateur);
    return visiteurs((node, source) => {
      if (source === null) {
        context.report({ node, messageId: "nonLitteral" });
        return;
      }
      if (!importGroundingAdmis(source, importateur)) {
        context.report({ node, messageId: "forbidden", data: { source } });
        return;
      }
      if (production && cibleDe(source, importateur).chemin === ANCRAGE) {
        const noms = nomsDe(node);
        if (noms === null || noms.some((nom) => !NOMS_ANCRAGE_P0.includes(nom))) context.report({ node, messageId: "nomsAncrage", data: { source } });
      }
    });
  },
};

const RELECTURE = "src/server/relecture";
/** Importateurs admis de `@/server/relecture/*` hors des tests et de son dossier (0085 § 1.8). */
export const IMPORTATEURS_RELECTURE = ["src/server/composition/generation.ts"];

export function importRelectureAdmis(source, importateur) {
  const cible = cibleDe(source, importateur);
  if (cible.chemin === undefined || !dans(cible.chemin, RELECTURE)) return true;
  if (estTest(importateur) || importateur.startsWith("tests/") || importateur.startsWith(`${RELECTURE}/`)) return true;
  return IMPORTATEURS_RELECTURE.includes(importateur);
}

export const relectureImports = {
  meta: {
    type: "problem",
    docs: { description: "@/server/relecture importable par la seule composition de génération (décision 0085 § 1.8)." },
    schema: [],
    messages: {
      forbidden:
        "@/server/relecture n'est importable que depuis src/server/composition/generation.ts, src/server/relecture et les tests (décision 0085 § 1.8, frontière de 0081) ({{source}}).",
    },
  },
  create(context) {
    const importateur = importateurDe(context);
    return visiteurs((node, source) => {
      if (source !== null && !importRelectureAdmis(source, importateur)) context.report({ node, messageId: "forbidden", data: { source } });
    });
  },
};
