import { cibleDe, importateurDe, visiteurs } from "./ia-recherche-imports.mjs";

/**
 * Règle ESLint locale de B6a (ticket 471 ; spécification `specs/B6-api-lecture.md`, B6a point 9, B6-TL-1 ; décision
 * 0086 § 1.1 point 2 et § 1.2 point 4). Posée sur tout fichier du dépôt par un seul bloc d'`eslint.config.mjs`.
 *
 * `ligne/voyages-imports` :
 * - `@/server/voyages/*` n'est importable, hors de `src/server`, que par `src/adapters/api.ts`, les tests du dossier
 *   `src/server/voyages/` et les fichiers de `tests/db/`. Refusé ailleurs : tout autre fichier de `src/` (dont
 *   `src/features`, `src/components`, `src/app`, `src/lib`, `src/mocks`, `src/domain` et les autres fichiers de
 *   `src/adapters`), `tests/support` et les autres dossiers de tests ;
 * - dans `src/mocks`, `@/domain/*` n'est importable que par `src/mocks/relectures-voyages.ts`, de
 *   `@/domain/relectures` seulement et **en `import type` seulement** (arête admise de 0086 § 1.2 point 4 ; le
 *   littéral `"inconnu"` suffit pour la valeur). Un import de valeur, un `export … from`, un `import()` ou un autre
 *   module de `src/domain` sont refusés.
 *
 * Toutes les formes de chargement sont lues (celles de `ligne/ia-recherche-liste-blanche`).
 */

const VOYAGES = "src/server/voyages";
const DOUBLE = "src/mocks/relectures-voyages.ts";
const RELECTURES = "src/domain/relectures";

/** Importateurs admis de `@/server/voyages/*` hors de `src/server` (B6a point 9). */
export const IMPORTATEURS_VOYAGES = ["src/adapters/api.ts"];

const estTest = (fichier) => /\.(test|spec)\.(ts|tsx|mts)$/.test(fichier);
const dans = (chemin, dossier) => chemin === dossier || chemin.startsWith(`${dossier}/`);

/** Vrai si `importateur` peut charger `source` au regard de `@/server/voyages/*`. */
export function importVoyagesAdmis(source, importateur) {
  const cible = cibleDe(source, importateur);
  if (cible.chemin === undefined || !dans(cible.chemin, VOYAGES)) return true;
  if (importateur.startsWith("src/server/")) return true;
  if (importateur.startsWith("tests/db/")) return true;
  if (importateur.startsWith(`${VOYAGES}/`) && estTest(importateur)) return true;
  return IMPORTATEURS_VOYAGES.includes(importateur);
}

/** Vrai si une déclaration ne charge que des types (`import type { … }`, ou chaque nom marqué `type`). */
function typeSeulement(node) {
  if (node.type !== "ImportDeclaration") return false;
  if (node.importKind === "type") return true;
  return node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type");
}

/** Vrai si `importateur` (sous `src/mocks`) peut charger `source` au regard de `@/domain/*`. */
export function importDomaineMocksAdmis(source, importateur, enTypeSeulement) {
  if (!importateur.startsWith("src/mocks/")) return true;
  const cible = cibleDe(source, importateur);
  if (cible.chemin === undefined || !dans(cible.chemin, "src/domain")) return true;
  return importateur === DOUBLE && cible.chemin === RELECTURES && enTypeSeulement;
}

export const voyagesImports = {
  meta: {
    type: "problem",
    docs: { description: "@/server/voyages importable hors de src/server par src/adapters/api.ts seul ; double de relectures en import type (B6a ; décision 0086)." },
    schema: [],
    messages: {
      forbidden:
        "@/server/voyages n'est importable hors de src/server que depuis src/adapters/api.ts, les tests de src/server/voyages et tests/db (spécification B6, B6a point 9 ; décision 0086 § 1.1) ({{source}}).",
      domaine:
        "src/mocks n'importe de src/domain que les types de @/domain/relectures, depuis src/mocks/relectures-voyages.ts, en import type (décision 0086 § 1.2 point 4) ({{source}}).",
    },
  },
  create(context) {
    const importateur = importateurDe(context);
    return visiteurs((node, source) => {
      if (source === null) return;
      if (!importVoyagesAdmis(source, importateur)) {
        context.report({ node, messageId: "forbidden", data: { source } });
        return;
      }
      const enType = typeSeulement(node) || node.type === "TSImportType";
      if (!importDomaineMocksAdmis(source, importateur, enType)) context.report({ node, messageId: "domaine", data: { source } });
    });
  },
};
