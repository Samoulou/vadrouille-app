import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

import ligne from "./eslint-rules/index.mjs";

const STORAGES = ["localStorage", "sessionStorage", "indexedDB", "caches"];

/** Interdit tout stockage côté client (Web Storage, IndexedDB, Cache Storage, cookies, service worker). */
function noClientStorage(scope, reference, serviceWorkerText) {
  const message = `${scope} : aucune donnée persistée côté client (${reference}).`;
  return {
    "no-restricted-globals": ["error", ...STORAGES.map((name) => ({ name, message }))],
    "no-restricted-properties": [
      "error",
      ...["window", "globalThis", "self"].flatMap((object) => STORAGES.map((property) => ({ object, property, message }))),
      { object: "document", property: "cookie", message: `${scope} : aucun cookie (${reference}).` },
      { object: "navigator", property: "serviceWorker", message: `${scope} : ${serviceWorkerText} (${reference}).` },
    ],
  };
}

/** F1 : les jeux simulés ne passent que par les adaptateurs (handover § 9). */
const MOCKS_PATTERN = {
  group: ["@/mocks", "@/mocks/**", "**/mocks", "**/mocks/**"],
  message: "src/mocks ne s'importe que depuis src/adapters et les tests : passe par getTripAdapter() de @/adapters.",
};

/** F5 : la carte simulée ne s'importe que depuis src/app/dev et les tests (décisions 0013 § 1.4 et 0015 § 1). */
const SIMULATED_MAP_PATTERN = {
  group: [
    "@/components/carte/SimulatedMapRenderer",
    "@/components/carte/simulated-model",
    "**/carte/SimulatedMapRenderer",
    "**/carte/simulated-model",
  ],
  message:
    "La carte simulée ne s'importe que depuis src/app/dev et les tests (décisions 0013 § 1.4 et 0015 § 1) : aucune route produit ne l'embarque.",
};

/**
 * F9a : hors de `src/server`, un import de `@/server/*` n'est permis que vers `@/server/actions/*`
 * (modules « use server » : Next.js n'envoie au navigateur que des références d'appel). Tout autre module
 * de `src/server` (`parse-input.ts`, `config/offer.ts`) est refusé (décision 0020 § 11, amende 0016 § 3.1).
 */
const SERVER_PATTERN = {
  regex: "^(@/server/(?!actions/[^/]+$)|(\\.{1,2}/)+(.*/)?server/(?!actions/[^/]+$))",
  message:
    "Hors de src/server, seul @/server/actions/* s'importe (décision 0020 § 11) : la configuration et parse-input restent côté serveur.",
};

/** F9a : la portée des simulations lit les en-têtes de la requête ; jamais dans un écran (décision 0017 § 10.2). */
const SIMULATION_PATTERN = {
  group: ["@/adapters/simulation", "**/adapters/simulation"],
  message: "La portée des simulations ne s'importe pas dans un écran (décision 0017 § 10.2) : passe par une page serveur.",
};

/** F9a : pas de Zod complet dans un écran (décision 0016 § 3.1 règle 4, test exigé par 0020 § 11). */
const ZOD_PATH = {
  name: "zod",
  message: "Pas de zod dans le code chargé par le navigateur (décision 0016 § 3.1) : valeurs par @/contracts/values.",
};

/** Imports interdits : en configuration plate, le dernier bloc remplace les précédents, d'où une seule fonction. */
function restrictedImports(...patterns) {
  return { "no-restricted-imports": ["error", { patterns }] };
}

/** Variante avec des chemins interdits (`paths`), dans la même règle. */
function restrictedImportsWithPaths(paths, ...patterns) {
  return { "no-restricted-imports": ["error", { paths, patterns }] };
}

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
  {
    plugins: { ligne },
    rules: {
      "ligne/no-hardcoded-colors": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // F1 : les jeux simulés ne passent que par les adaptateurs (handover § 9).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: [
      "src/adapters/**",
      "src/mocks/**",
      "tests/**",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],
    rules: restrictedImports(MOCKS_PATTERN),
  },
  {
    // F9a : src/server ne s'importe que par ses actions dans les routes (décision 0020 § 11) ; F1 tient toujours.
    files: ["src/app/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: restrictedImports(MOCKS_PATTERN, SERVER_PATTERN),
  },
  {
    // F9a : composants et bibliothèque : ni src/server hors actions, ni la portée des simulations, ni zod.
    files: ["src/components/**/*.{js,jsx,ts,tsx}", "src/lib/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: restrictedImportsWithPaths([ZOD_PATH], MOCKS_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
  },
  {
    // F5 : ni src/mocks ni la carte simulée dans les routes du voyage (décision 0015 § 1) ; F9a : ni src/server hors actions.
    files: ["src/app/voyages/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: restrictedImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, SERVER_PATTERN),
  },
  {
    // F5 : ni src/mocks ni la carte simulée dans les écrans (décision 0015 § 1) ; F9a : ni src/server hors
    // actions, ni la portée des simulations, ni zod (décisions 0017 § 10.2 et 0020 § 11).
    files: ["src/features/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: restrictedImportsWithPaths([ZOD_PATH], MOCKS_PATTERN, SIMULATED_MAP_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
  },
  {
    // F9a : aucun journal dans le paiement simulé (ni montant ni identifiant de paiement, décision 0020 § 11).
    files: ["src/server/actions/paiement.ts", "src/adapters/mock-payment.ts", "src/adapters/mock-unlock.ts"],
    rules: { "no-console": "error" },
  },
  {
    // F9a : horloge injectée, jamais l'horloge système dans l'adaptateur de paiement simulé (0017 § 10.1, 0020 § 2.2).
    files: ["src/adapters/mock-payment.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "Horloge de la portée seulement (option now) : pas de Date.now (décision 0020 § 2.2).",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Horloge de la portée seulement (option now) : pas de new Date() (décision 0020 § 2.2).",
        },
      ],
    },
  },
  {
    // F2 : aucun texte en dur dans les composants Ligne, tout vient de src/i18n/fr.json (handover § 10).
    // Les valeurs d'attributs (classes, rôles) restent permises ; les textes affichés passent par fr.json.
    files: ["src/components/ligne/**/*.{jsx,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // F4 : aucun texte en dur dans la carte et sa démonstration, tout vient de src/i18n/fr.json.
    files: ["src/components/carte/**/*.{jsx,tsx}", "src/app/dev/carte/**/*.{jsx,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // F4 : aucune persistance côté client dans la carte (handover § 8 ; données Google, même simulées).
    files: ["src/components/carte/**/*.{js,jsx,ts,tsx}", "src/app/dev/carte/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: noClientStorage("Carte", "handover § 8, spécification F4", "aucun service worker ni cache de tuiles"),
  },
  {
    // F6 : aucun texte en dur dans la présentation, sa route, la feuille modale et la mesure (handover § 10).
    files: [
      "src/features/presentation/**/*.{jsx,tsx}",
      "src/app/voyages/**/*.{jsx,tsx}",
      "src/components/ui/**/*.{jsx,tsx}",
      "src/analytics/**/*.{jsx,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // F6 : aucune persistance côté client dans la présentation (F6-PO-15 ; règles Google de la spécification F6).
    files: [
      "src/features/presentation/**/*.{js,jsx,ts,tsx}",
      "src/app/voyages/**/*.{js,jsx,ts,tsx}",
      "src/analytics/**/*.{js,jsx,ts,tsx}",
      "src/components/ui/dialog.tsx",
      "src/components/ligne/DeckCard.tsx",
      "src/components/ligne/DeckProgress.tsx",
      "src/components/ligne/UndoToast.tsx",
    ],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: noClientStorage("Présentation", "spécification F6, F6-PO-15", "aucun service worker"),
  },
  {
    // F5 : aucun texte en dur dans le Séjour, la Journée et leurs pages de développement (handover § 10).
    files: ["src/features/sejour/**/*.{jsx,tsx}", "src/app/dev/voyages/**/*.{jsx,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // F5 : aucune persistance côté client dans le programme (F5-PO-16 ; règles Google de la spécification F5).
    files: [
      "src/features/sejour/**/*.{js,jsx,ts,tsx}",
      "src/app/voyages/**/*.{js,jsx,ts,tsx}",
      "src/app/dev/voyages/**/*.{js,jsx,ts,tsx}",
      "src/components/ligne/Sheet.tsx",
      "src/components/ligne/sheet-model.ts",
      "src/components/ligne/ReasonBlock.tsx",
      "src/lib/pointer.ts",
    ],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: noClientStorage("Programme", "spécification F5, F5-PO-16", "aucun service worker"),
  },
  {
    // F9a : aucun texte en dur dans le fournisseur de l'onglet et les écrans partagés du voyage (handover § 10).
    files: ["src/features/voyage/**/*.{jsx,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // F9a : aucune persistance côté client dans le fournisseur de l'onglet ni le parcours « Débloquer » (décision 0020 § 8).
    files: ["src/features/voyage/**/*.{js,jsx,ts,tsx}", "src/components/ligne/DestinationPlate.tsx"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: noClientStorage("Voyage", "spécification F9, F9-PO-14, décision 0020 § 8", "aucun service worker"),
  },
  {
    // D1 : aucun texte en dur sur la page d'accueil et sa section « Démonstration » (handover § 10).
    files: ["src/app/page.tsx", "src/features/accueil/**/*.{jsx,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // La règle elle-même et ses tests contiennent des couleurs en dur par construction.
    files: ["eslint-rules/**", "tests/unit/lint/**"],
    rules: { "ligne/no-hardcoded-colors": "off" },
  },
]);
