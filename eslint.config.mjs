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

/** F9a, T4 : pas de Zod complet dans le code chargé par le navigateur (décision 0016 § 3.1 règle 4) ; `zod/mini` passe. */
const ZOD_PATH = {
  name: "zod",
  message: "Pas de zod dans le code chargé par le navigateur (décision 0016 § 3.1) : zod/mini, ou valeurs par @/contracts/values.",
};

/** T4 : types seulement depuis @/contracts, dont l'index charge tous les schémas Zod (décision 0016 § 3.1 règles 2 et 4). */
const CONTRACTS_PATH = {
  name: "@/contracts",
  allowTypeImports: true,
  message: "Types seulement depuis @/contracts (import type) ; valeurs depuis @/contracts/values (décision 0016 § 3.1).",
};

/** T4 : même règle pour les autres modules de @/contracts, qui importent tous zod ; `values` seul passe. */
const CONTRACTS_MODULES_PATTERN = {
  group: ["@/contracts/*", "!@/contracts/values"],
  allowTypeImports: true,
  message: "Types seulement depuis @/contracts (import type) ; valeurs depuis @/contracts/values (décision 0016 § 3.1).",
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

/**
 * T4 : code chargé par le navigateur (décision 0016 § 3.1 règle 4). Une seule règle,
 * `@typescript-eslint/no-restricted-imports` (pour `allowTypeImports`), porte dans le même bloc `zod`, les
 * valeurs de @/contracts et les motifs précédents (src/mocks, carte simulée, src/server, simulations). La
 * règle de base est coupée sur ces fichiers : un import interdit n'est signalé qu'une fois.
 */
function clientImports(...patterns) {
  return {
    "no-restricted-imports": "off",
    "@typescript-eslint/no-restricted-imports": [
      "error",
      { paths: [ZOD_PATH, CONTRACTS_PATH], patterns: [...patterns, CONTRACTS_MODULES_PATTERN] },
    ],
  };
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
    // F10b (F10-TL-5) : seul le module hors ligne désigné enregistre le service worker, et seul le service worker
    // ouvre un cache. Les tests lisent le stockage du navigateur pour le contrôler : ils sont exclus.
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: ["tests/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "ligne/no-service-worker-register": "error",
      "ligne/no-cache-storage-open": "error",
    },
  },
  {
    files: ["src/lib/offline/register.ts"],
    rules: { "ligne/no-service-worker-register": "off" },
  },
  {
    // F10b (F10-TL-5, C26) : seul le service worker ouvre un cache ; son aiguillage (`public/sw-route.js`) reste
    // soumis à la règle.
    files: ["public/sw.js"],
    rules: { "ligne/no-cache-storage-open": "off" },
  },
  {
    // F10b (F10-TL-5) : le service worker et son aiguillage. Script classique, globals du service worker ; Cache
    // Storage permis ; ni IndexedDB, ni Web Storage, ni cookie, ni lecture de l'heure ; aucun script d'une autre
    // origine (seul l'aiguillage de l'application est importé).
    files: ["public/sw.js", "public/sw-route.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        URL: "readonly",
        Promise: "readonly",
        importScripts: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-restricted-globals": [
        "error",
        ...["indexedDB", "localStorage", "sessionStorage", "document", "Date", "performance", "cookieStore"].map((name) => ({
          name,
          message: `Service worker : ni stockage hors Cache Storage, ni cookie, ni heure (${name} ; spécification F10, F10-PO-11).`,
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...["self", "globalThis"].flatMap((object) =>
          ["indexedDB", "localStorage", "sessionStorage", "document", "Date", "performance", "cookieStore"].map((property) => ({
            object,
            property,
            message: `Service worker : ni stockage hors Cache Storage, ni cookie, ni heure (spécification F10, F10-PO-11).`,
          })),
        ),
        { object: "Date", property: "now", message: "Service worker : aucune lecture de l'heure (F10-TL-4)." },
        { object: "performance", property: "now", message: "Service worker : aucune lecture de l'heure (F10-TL-4)." },
        { object: "document", property: "cookie", message: "Service worker : aucun cookie (F10-PO-11)." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='importScripts']:not([arguments.length=1][arguments.0.value='/sw-route.js'])",
          message: "Service worker : seul /sw-route.js est importé ; aucun script d'une autre origine (F10-TL-5).",
        },
        { selector: "ImportExpression", message: "Service worker : aucun import dynamique (F10-TL-5)." },
      ],
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
    // T4 (0016 § 3.1 règle 4) : composants, mesure, bibliothèque et textes : ni zod, ni valeur de @/contracts.
    // F1, F5 et F9a tiennent : ni src/mocks, ni carte simulée, ni src/server hors actions, ni portée des simulations.
    files: [
      "src/components/**/*.{js,jsx,ts,tsx}",
      "src/analytics/**/*.{js,jsx,ts,tsx}",
      "src/lib/**/*.{js,jsx,ts,tsx}",
      "src/i18n/**/*.{js,jsx,ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: clientImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
  },
  {
    // F5 : ni src/mocks ni la carte simulée dans les routes du voyage (décision 0015 § 1) ; F9a : ni src/server hors actions.
    files: ["src/app/voyages/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: restrictedImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, SERVER_PATTERN),
  },
  {
    // F5 : ni src/mocks ni la carte simulée dans les écrans (décision 0015 § 1) ; F9a : ni src/server hors
    // actions, ni la portée des simulations (décisions 0017 § 10.2 et 0020 § 11) ; T4 : ni zod, ni valeur de
    // @/contracts (décision 0016 § 3.1 règle 4).
    files: ["src/features/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: clientImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
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
      "src/components/ligne/ChecklistRow.tsx",
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
    // F11a : aucun texte en dur, aucune persistance côté client dans « Mes voyages » (décision 0021 § 10) ;
    // `src/app/voyages/page.tsx` est déjà couvert par les blocs des routes du voyage.
    files: ["src/features/compte/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      ...noClientStorage("Mes voyages", "décision 0021 § 10, F11-PO-14", "aucun service worker"),
    },
  },
  {
    // F11a : ni src/mocks, ni carte (Google ou simulée), ni src/server hors actions, ni portée des simulations,
    // ni zod, ni valeur de @/contracts dans « Mes voyages » et sa page (décision 0021 § 10). Le dernier bloc
    // l'emporte (décision 0015 § 1) : il reprend tous les motifs précédents.
    files: ["src/features/compte/**/*.{js,jsx,ts,tsx}", "src/app/voyages/page.tsx"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: clientImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, MAP_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
  },
  {
    // F11c : aucun texte en dur, aucune persistance côté client dans les pages d'erreur et d'introuvable et
    // dans le catalogue des états (décision 0021 § 10).
    files: F11C_FILES,
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      ...noClientStorage("États transverses", "décision 0021 § 10", "aucun service worker"),
      // Le dernier bloc l'emporte (décision 0015 § 1) : reprend src/mocks et la carte simulée, ajoute la carte ;
      // reprend aussi les interdits F9a (src/server hors actions, portée des simulations, décisions 0017 § 10.2 et 0020 § 11).
      ...restrictedImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, MAP_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
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
    // F8a : aucun texte en dur dans la création du voyage et le compte (handover § 10, spécification F8).
    files: ["src/features/creation/**/*.{jsx,tsx}", "src/features/compte/**/*.{jsx,tsx}", "src/app/(creation)/**/*.{jsx,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // F8a : brouillon, récit et email en mémoire de l'onglet seulement (F8-PO-1, décision 0017 § 5).
    files: ["src/features/creation/**/*.{js,jsx,ts,tsx}", "src/features/compte/**/*.{js,jsx,ts,tsx}", "src/app/(creation)/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: noClientStorage("Création", "spécification F8, F8-PO-1, décision 0017 § 5", "aucun service worker"),
  },
  {
    // F8a : ni src/mocks, ni carte simulée, ni src/server hors actions, ni portée des simulations dans les routes de
    // la création (spécification F8, « Règles Google et données personnelles » ; décisions 0015 § 1, 0017 § 10.2, 0020 § 11).
    files: ["src/app/(creation)/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: restrictedImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
  },
  {
    // F8a : ni récit, ni destination, ni email dans un journal (spécification F8, « Données personnelles »).
    files: [
      "src/features/creation/**/*.{js,jsx,ts,tsx}",
      "src/features/compte/**/*.{js,jsx,ts,tsx}",
      "src/server/actions/creation.ts",
      "src/adapters/mock-creation.ts",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: { "no-console": "error" },
  },
  {
    // F10b : page de repli hors ligne (F10-TL-5) : aucun texte en dur, aucune persistance côté client, ni
    // src/mocks, ni carte (Google ou simulée), ni src/server hors actions, ni portée des simulations.
    files: ["src/app/hors-ligne/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      ...noClientStorage("Page de repli", "spécification F10, F10-PO-9", "le service worker ne s'enregistre que depuis l'écran 15"),
      ...restrictedImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, MAP_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
    },
  },
  {
    // La règle elle-même et ses tests contiennent des couleurs en dur par construction.
    files: ["eslint-rules/**", "tests/unit/lint/**"],
    rules: { "ligne/no-hardcoded-colors": "off" },
  },
]);
