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

/** F11 : ni la carte Google ni la carte simulée dans les pages d'erreur et le catalogue (décision 0021 § 10). */
const MAP_PATTERN = {
  group: ["@/components/carte", "@/components/carte/**", "**/components/carte", "**/components/carte/**"],
  message: "Aucune carte dans ces fichiers (décision 0021 § 10) : ni la carte Google, ni la carte simulée.",
};

/** F11c : pages d'erreur et d'introuvable, rendu partagé, catalogue des états (décision 0021 § 10). */
const F11C_FILES = [
  "src/app/not-found.tsx",
  "src/app/error.tsx",
  "src/app/global-error.tsx",
  "src/app/dev/etats/**/*.{js,jsx,ts,tsx}",
  "src/dev/EtatsShowcase.tsx",
  "src/features/etats/**/*.{js,jsx,ts,tsx}",
];

/** Imports interdits : en configuration plate, le dernier bloc remplace les précédents, d'où une seule fonction. */
function restrictedImports(...patterns) {
  return { "no-restricted-imports": ["error", { patterns }] };
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
    // F5 : ni src/mocks ni la carte simulée dans les routes du voyage et les écrans (décision 0015 § 1).
    files: ["src/app/voyages/**/*.{js,jsx,ts,tsx}", "src/features/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: restrictedImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN),
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
    // D1 : aucun texte en dur sur la page d'accueil et sa section « Démonstration » (handover § 10).
    files: ["src/app/page.tsx", "src/features/accueil/**/*.{jsx,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // F11c : aucun texte en dur, aucune persistance côté client dans les pages d'erreur et d'introuvable et
    // dans le catalogue des états (décision 0021 § 10).
    files: F11C_FILES,
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      ...noClientStorage("États transverses", "décision 0021 § 10", "aucun service worker"),
      // Le dernier bloc l'emporte (décision 0015 § 1) : reprend src/mocks et la carte simulée, ajoute la carte.
      ...restrictedImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, MAP_PATTERN),
      // Décision 0016 § 3.1 règle 4, appliquée à ces fichiers par 0021 § 10 : ni `zod`, ni valeur de @/contracts.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "zod", message: "Pas de zod dans ces fichiers (décision 0016 § 3.1 règle 4) : zod/mini ou @/contracts/values." },
            {
              name: "@/contracts",
              allowTypeImports: true,
              message: "Types seulement depuis @/contracts (import type) ; valeurs depuis @/contracts/values (décision 0016 § 3.1).",
            },
          ],
        },
      ],
    },
  },
  {
    // La règle elle-même et ses tests contiennent des couleurs en dur par construction.
    files: ["eslint-rules/**", "tests/unit/lint/**"],
    rules: { "ligne/no-hardcoded-colors": "off" },
  },
]);
