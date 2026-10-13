/**
 * Liste des paquets déclarés (spécification P0c, section 6). Chaque nom de `dependencies` et de `devDependencies`
 * y figure avec son usage et la revue consolidée qui l'a admis ; un paquet absent de la liste, ou listé mais absent de
 * `package.json`, fait échouer le test. Propriété du Tech Lead ; ajouter un paquet demande, dans la même PR, ses lignes
 * de spécificateurs (ou de capacité) et un verdict Sécurité qui cite le lockfile.
 */

export type LignePaquet = { readonly paquet: string; readonly usage: string; readonly verdict: string };

const EXISTANT = "existant au 2026-10-12 (`40b6738`)";

export const PAQUETS = [
  { paquet: "@googlemaps/js-api-loader", usage: "carte Google du navigateur (F4) ; module à capacité", verdict: EXISTANT },
  { paquet: "@radix-ui/react-dialog", usage: "composants Ligne", verdict: EXISTANT },
  { paquet: "@radix-ui/react-slot", usage: "composants Ligne", verdict: EXISTANT },
  { paquet: "class-variance-authority", usage: "composants Ligne", verdict: EXISTANT },
  { paquet: "clsx", usage: "classes CSS", verdict: EXISTANT },
  { paquet: "next", usage: "application", verdict: EXISTANT },
  { paquet: "parse5", usage: "extraction du texte des pages (P0a1, `src/research/extract-text.ts`)", verdict: "revue consolidée de la PR 180 (P0a1), fusionnée" },
  { paquet: "react", usage: "application", verdict: EXISTANT },
  { paquet: "react-dom", usage: "application", verdict: EXISTANT },
  { paquet: "tailwind-merge", usage: "classes CSS", verdict: EXISTANT },
  { paquet: "zod", usage: "contrats et validation", verdict: EXISTANT },
  { paquet: "@axe-core/playwright", usage: "accessibilité e2e", verdict: EXISTANT },
  { paquet: "@playwright/test", usage: "e2e, visuel, performance", verdict: EXISTANT },
  { paquet: "@tailwindcss/postcss", usage: "chaîne CSS (`postcss.config.mjs`, sans import)", verdict: EXISTANT },
  { paquet: "@testing-library/dom", usage: "dépendance de `@testing-library/react` (sans import)", verdict: EXISTANT },
  { paquet: "@testing-library/jest-dom", usage: "assertions DOM des tests unitaires", verdict: EXISTANT },
  { paquet: "@testing-library/react", usage: "tests de composants", verdict: EXISTANT },
  { paquet: "@types/google.maps", usage: "types (sans import)", verdict: EXISTANT },
  { paquet: "@types/node", usage: "types (sans import)", verdict: EXISTANT },
  { paquet: "@types/react", usage: "types (sans import)", verdict: EXISTANT },
  { paquet: "@types/react-dom", usage: "types (sans import)", verdict: EXISTANT },
  { paquet: "axe-core", usage: "accessibilité des tests unitaires", verdict: EXISTANT },
  { paquet: "eslint", usage: "lint", verdict: EXISTANT },
  { paquet: "eslint-config-next", usage: "lint", verdict: EXISTANT },
  { paquet: "jsdom", usage: "environnement des tests unitaires (sans import)", verdict: EXISTANT },
  { paquet: "lighthouse", usage: "mesure de performance (0022) ; module à capacité", verdict: EXISTANT },
  { paquet: "tailwindcss", usage: "styles", verdict: EXISTANT },
  { paquet: "typescript", usage: "vérification de types ; analyse du régime de confinement", verdict: EXISTANT },
  { paquet: "vitest", usage: "tests unitaires", verdict: EXISTANT },
] as const satisfies readonly LignePaquet[];

/** `pnpm.onlyBuiltDependencies` exact (section 6). */
export const CONSTRUITS = ["sharp", "unrs-resolver"] as const;
