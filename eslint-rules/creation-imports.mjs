import { cibleDe, importateurDe, visiteurs } from "./ia-recherche-imports.mjs";

/**
 * Règle ESLint locale de B9 (ticket 519 ; décision 0101 § 4, qui fixe les importateurs ; décision 0081 B9-TL-1 point
 * 3, amendée par 0101 et 0087 § 1.6). Posée sur tout fichier du dépôt par un seul bloc d'`eslint.config.mjs`.
 *
 * `ligne/creation-imports` : quatre modules de `src/server` ne sont importables que par les fichiers nommés ci-dessous
 * (un préfixe finissant par `/` désigne un dossier ; un chemin sans `/` final, un fichier). Les tests (`*.test.*` et
 * `tests/`) sont admis partout, comme pour `ligne/relecture-imports`.
 * - `@/server/composition/generation` : `src/server/creation/`, `src/server/generation/` ;
 * - `@/server/generation/*` : `src/server/generation/`, `src/server/creation/`, `src/server/payment/` (suite de B4a),
 *   `src/workflows/apercu.ts`, `src/workflows/voyage-complet.ts`, `src/workflows/index.ts` ; `@/server/generation/reprise`
 *   seul : aussi `scripts/reprise-studio.ts` (commande de reprise du studio, 0087 § 1.6 point 3) ;
 * - `@/server/creation/*` : `src/server/creation/`, `src/server/actions/creation.ts` et, par dérogation (0101 § 1), le seul
 *   `src/adapters/api-creation.ts` ;
 * - `@/server/with-system-org` : `src/server/payment/`, `src/server/generation/`, `scripts/reprise-studio.ts` (0087 § 1.6).
 * Les noms de `src/server/payment/`, de la commande et des modules `reprise` et `with-system-org` sont ceux de 0087
 * (« nom libre ») : la tâche qui en choisit un autre amende cette liste (0101 § 4).
 *
 * Toutes les formes de chargement sont lues (celles de `ligne/ia-recherche-liste-blanche`). Une source non littérale
 * n'est pas jugée. La frontière du graphe vers `src/ai`, `src/research` et `src/grounding` (0081 B9-TL-1 point 2) reste
 * portée par `tests/unit/p0/imports.test.ts`.
 */

const COMPOSITION_GENERATION = "src/server/composition/generation";
const GENERATION = "src/server/generation";
const REPRISE = "src/server/generation/reprise";
const CREATION = "src/server/creation";
const CONTEXTE_SYSTEME = "src/server/with-system-org";

const COMMANDE_REPRISE = "scripts/reprise-studio.ts";

/** Importateurs admis de chaque module (préfixe finissant par `/`, ou fichier) — décision 0101 § 4. */
export const IMPORTATEURS_COMPOSITION_GENERATION = ["src/server/creation/", "src/server/generation/"];
export const IMPORTATEURS_GENERATION = [
  "src/server/generation/",
  "src/server/creation/",
  "src/server/payment/",
  "src/workflows/apercu.ts",
  "src/workflows/voyage-complet.ts",
  "src/workflows/index.ts",
];
export const IMPORTATEURS_REPRISE = [COMMANDE_REPRISE];
export const IMPORTATEURS_CREATION = ["src/server/creation/", "src/server/actions/creation.ts", "src/adapters/api-creation.ts"];
export const IMPORTATEURS_CONTEXTE_SYSTEME = ["src/server/payment/", "src/server/generation/", COMMANDE_REPRISE];

const estTest = (fichier) => /\.(test|spec)\.(ts|tsx|mts)$/.test(fichier) || fichier.startsWith("tests/");
const dans = (chemin, dossier) => chemin === dossier || chemin.startsWith(`${dossier}/`);
const parmi = (importateur, liste) => liste.some((entree) => (entree.endsWith("/") ? importateur.startsWith(entree) : importateur === entree));

/** Vrai si `importateur` peut charger `source` au regard des quatre modules confinés. */
export function importCreationAdmis(source, importateur) {
  const { chemin } = cibleDe(source, importateur);
  if (chemin === undefined || estTest(importateur)) return true;
  if (chemin === COMPOSITION_GENERATION) return parmi(importateur, IMPORTATEURS_COMPOSITION_GENERATION);
  if (chemin === REPRISE) return parmi(importateur, [...IMPORTATEURS_GENERATION, ...IMPORTATEURS_REPRISE]);
  if (dans(chemin, GENERATION)) return parmi(importateur, IMPORTATEURS_GENERATION);
  if (dans(chemin, CREATION)) return parmi(importateur, IMPORTATEURS_CREATION);
  if (chemin === CONTEXTE_SYSTEME) return parmi(importateur, IMPORTATEURS_CONTEXTE_SYSTEME);
  return true;
}

export const creationImports = {
  meta: {
    type: "problem",
    docs: { description: "@/server/creation, @/server/generation, la composition de génération et le contexte système : importateurs nommés (décisions 0081 B9-TL-1 point 3 et 0101 § 4)." },
    schema: [],
    messages: {
      forbidden:
        "Importateurs nommés (décisions 0081 B9-TL-1 point 3 et 0101 § 4) : @/server/creation/* depuis src/server/actions/creation.ts, src/adapters/api-creation.ts ou src/server/creation ; @/server/generation/* depuis src/workflows/{apercu,voyage-complet,index}.ts, src/server/{creation,generation,payment} ; @/server/composition/generation depuis src/server/{creation,generation} ({{source}}).",
    },
  },
  create(context) {
    const importateur = importateurDe(context);
    return visiteurs((node, source) => {
      if (source !== null && !importCreationAdmis(source, importateur)) context.report({ node, messageId: "forbidden", data: { source } });
    });
  },
};
