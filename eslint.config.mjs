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

/**
 * B4a (spécification B4, B4a point 7 ; amendement de 0006) : un route handler de `src/app/api/` n'importe de `src/server`
 * que `@/server/routes/*` (ni les actions, ni aucun autre module) ; repris et précisé par `ligne/route-handlers`.
 */
const SERVER_ROUTE_PATTERN = {
  regex: "^(@/server/(?!routes/[^/]+$)|(\\.{1,2}/)+(.*/)?server/(?!routes/[^/]+$))",
  message: "Un route.ts de src/app/api n'importe de src/server que @/server/routes/* (spécification B4, B4a point 7).",
};

/**
 * P0r3b (décision 0055, section 2 ; revue du head 6be9299, mineur 7) : exception nominative à F9a pour la seule page
 * `src/app/prototype/executions/page.tsx` (composant serveur), qui lit l'état de la garde par
 * `@/server/p0/page-acces`, module ordinaire : exporté d'une action (`"use server"`), cet état serait appelable par
 * n'importe quel client. Tout autre module de `src/server` hors actions reste refusé, dans cette page comme ailleurs.
 */
const SERVER_PATTERN_PAGE_P0 = {
  regex: "^(@/server/(?!actions/[^/]+$|p0/page-acces$)|(\\.{1,2}/)+(.*/)?server/(?!actions/[^/]+$))",
  message:
    "Hors de src/server, seul @/server/actions/* s'importe (décision 0020 § 11) ; la page /prototype/executions admet en plus @/server/p0/page-acces (P0r3b).",
};

/**
 * F10c (décision 0039, F10-TL-5) : depuis la feuille « Partager » et la vue partagée, seul le module d'actions du
 * partage s'importe de `src/server` ; ni la configuration, ni parse-input, ni les actions d'un autre écran.
 */
const PARTAGE_SERVER_PATTERN = {
  regex: "^(@/server/(?!actions/partage$)|(\\.{1,2}/)+(.*/)?server/(?!actions/partage$))",
  message: "Depuis src/features/partage, seul @/server/actions/partage s'importe (décision 0039, F10-TL-5).",
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

/**
 * B3a (décision 0050, B3-TL-6 point 6 ; 0051 point 4.4) : le type de marque `CanonicalEmail` n'est fabriqué que par
 * `parseEmailAddress` (`src/server/email.ts`) : ni conversion (`as CanonicalEmail`, `as unknown as CanonicalEmail`),
 * ni assertion (`<CanonicalEmail>x`), ni prédicat de type (`x is CanonicalEmail`, `asserts x is CanonicalEmail`)
 * ailleurs. En configuration plate, un bloc plus bas qui règle `no-restricted-syntax` remplace cette liste : chacun de
 * ces blocs la reprend (tests/unit/lint/canonical-email-lint.test.ts).
 */
const CANONICAL_EMAIL_MESSAGE =
  "CanonicalEmail n'est fabriqué que par parseEmailAddress (src/server/email.ts ; décision 0050, B3-TL-6 point 6) : ni conversion, ni assertion, ni prédicat de type.";
const CANONICAL_EMAIL_SYNTAX = [
  { selector: "TSAsExpression > TSTypeReference.typeAnnotation[typeName.name='CanonicalEmail']", message: CANONICAL_EMAIL_MESSAGE },
  { selector: "TSTypeAssertion > TSTypeReference.typeAnnotation[typeName.name='CanonicalEmail']", message: CANONICAL_EMAIL_MESSAGE },
  { selector: "TSTypePredicate TSTypeReference[typeName.name='CanonicalEmail']", message: CANONICAL_EMAIL_MESSAGE },
];

/**
 * P0r3b (décision 0055, section 1 point 2 ; S-1 point 3) : la preuve `GardeOuverte` n'est fabriquée que par
 * `src/server/p0/garde.ts`. Même interdiction que `CanonicalEmail`, ajoutée à la même règle (`no-restricted-syntax`,
 * mêmes blocs) ; seule exemption en plus de `garde.ts` : les fichiers de `tests/` (le test « chaque étape revérifie la
 * garde » fabrique une preuve hors des conditions). Aucune fabrique de test dans `src/`.
 */
const GARDE_OUVERTE_MESSAGE =
  "GardeOuverte n'est fabriquée que par src/server/p0/garde.ts (décision 0055, section 1 point 2) : ni conversion, ni assertion, ni prédicat de type hors des tests de tests/.";
const GARDE_OUVERTE_SYNTAX = [
  { selector: "TSAsExpression > TSTypeReference.typeAnnotation[typeName.name='GardeOuverte']", message: GARDE_OUVERTE_MESSAGE },
  { selector: "TSTypeAssertion > TSTypeReference.typeAnnotation[typeName.name='GardeOuverte']", message: GARDE_OUVERTE_MESSAGE },
  { selector: "TSTypePredicate TSTypeReference[typeName.name='GardeOuverte']", message: GARDE_OUVERTE_MESSAGE },
];
/**
 * P0r4 (ticket 414, décision 0079 ; bloquant 3 de la revue du head `e79fbed`) : la preuve `GardeRelecture` (relecture
 * Routes payante) a la même protection que `GardeOuverte`, mêmes exemptions.
 */
const GARDE_RELECTURE_MESSAGE =
  "GardeRelecture n'est fabriquée que par src/server/p0/garde.ts (décision 0079) : ni conversion, ni assertion, ni prédicat de type hors des tests de tests/.";
const GARDE_RELECTURE_SYNTAX = [
  { selector: "TSAsExpression > TSTypeReference.typeAnnotation[typeName.name='GardeRelecture']", message: GARDE_RELECTURE_MESSAGE },
  { selector: "TSTypeAssertion > TSTypeReference.typeAnnotation[typeName.name='GardeRelecture']", message: GARDE_RELECTURE_MESSAGE },
  { selector: "TSTypePredicate TSTypeReference[typeName.name='GardeRelecture']", message: GARDE_RELECTURE_MESSAGE },
];
/** Preuves de la garde du mode réel (`GardeOuverte`, `GardeRelecture`), fabriquées par `src/server/p0/garde.ts` seul. */
const GARDES_SYNTAX = [...GARDE_OUVERTE_SYNTAX, ...GARDE_RELECTURE_SYNTAX];
/** Types de marque fabriqués par un seul module : liste reprise par chaque bloc qui règle `no-restricted-syntax`. */
const MARQUES_SYNTAX = [...CANONICAL_EMAIL_SYNTAX, ...GARDES_SYNTAX];
/** Fichiers exemptés de l'interdiction de `GardeOuverte` et `GardeRelecture` (et d'elles seules). */
const GARDE_OUVERTE_EXEMPTES = ["src/server/p0/garde.ts", "tests/**"];

/**
 * B5a (décision 0045 § 3, B5-TL-3 ; handover § 3) : `src/domain` sans entrée-sortie. Liste blanche des imports
 * (`import`, `import type`, `export … from`) : `@/contracts` et ses sous-chemins, `zod`, fichiers de `src/domain`
 * (`@/domain/*` ou relatif sans remonter), et `vitest` pour les seuls `*.test.ts`. Constructions refusées : `process`
 * (tout accès), `fetch`, `Date.now`, `new Date()` et `Date()` sans argument, `Math.random`, `crypto`, `performance`,
 * `globalThis`, `require`, `import()`, `eval`, `Function`. `Date.parse`, `Date.UTC` et `new Date(argument)` restent
 * permis. Même liste que la ligne `src/domain` de `tests/unit/p0/imports.test.ts` tant que P0 tourne.
 */
const DOMAIN_IMPORTS = "zod|@/contracts(/.+)?|@/domain/.+|\\./[^/]+";
function domainSansEntreeSortie(avecVitest) {
  const admis = avecVitest ? `${DOMAIN_IMPORTS}|vitest` : DOMAIN_IMPORTS;
  const message = "src/domain sans entrée-sortie (décision 0045 § 3) : seuls @/contracts, zod et src/domain s'importent.";
  const io = "src/domain sans entrée-sortie (décision 0045 § 3) : le moteur reçoit la date, les identifiants et les relectures en entrée.";
  return {
    "no-restricted-imports": ["error", { patterns: [{ regex: `^(?!(${admis})$)`, message }] }],
    "no-restricted-globals": [
      "error",
      ...["process", "fetch", "crypto", "performance", "globalThis", "require", "eval", "Function"].map((name) => ({ name, message: io })),
    ],
    "no-restricted-properties": [
      "error",
      { object: "Date", property: "now", message: io },
      { object: "Math", property: "random", message: io },
    ],
    "no-restricted-syntax": [
      "error",
      { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: io },
      { selector: "CallExpression[callee.name='Date']", message: io },
      { selector: "CallExpression[callee.name='require']", message: io },
      { selector: "ImportExpression", message: io },
      ...MARQUES_SYNTAX,
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
    // Routes générées par le Workflow SDK au build (`withWorkflow`, décision 0063) ; ignorées par git.
    "src/app/.well-known/workflow/**",
  ]),
  {
    plugins: { ligne },
    rules: {
      "ligne/no-hardcoded-colors": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // B3a (décision 0050, B3-TL-6 point 6 ; 0051 point 4.4) : `CanonicalEmail` fabriqué par `src/server/email.ts` seul,
    // tests compris. Repris par les blocs plus bas qui règlent `no-restricted-syntax` (src/domain, adaptateurs simulés).
    // P0r3b (décision 0055, section 1 point 2) : même règle pour `GardeOuverte`, fabriquée par `src/server/p0/garde.ts`
    // seul, tests de `tests/` exceptés (deux blocs suivants).
    files: ["**/*.{ts,tsx,mts,cts}"],
    ignores: ["src/server/email.ts", ...GARDE_OUVERTE_EXEMPTES],
    rules: { "no-restricted-syntax": ["error", ...MARQUES_SYNTAX] },
  },
  {
    files: ["src/server/email.ts"],
    rules: { "no-restricted-syntax": ["error", ...GARDES_SYNTAX] },
  },
  {
    files: GARDE_OUVERTE_EXEMPTES,
    rules: { "no-restricted-syntax": ["error", ...CANONICAL_EMAIL_SYNTAX] },
  },
  {
    // B3a (décision 0050, B3-TL-1 point 6 ; revue Sécurité de #243, 0006 § 3) : directive "use server" refusée dans
    // src/, db/ et scripts/ hors de src/server/actions/, tests compris. Règle propre au plugin, posée par ce seul bloc
    // (tests/unit/lint/use-server-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/use-server-only-in-actions": "error" },
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
    // B4a (spécification B4, B4a point 7) : route handlers de `src/app/api/`, `@/server/routes/*` seulement (F1 tient).
    files: ["src/app/api/**/route.ts"],
    rules: restrictedImports(MOCKS_PATTERN, SERVER_ROUTE_PATTERN),
  },
  {
    // P0r3b : la page de saisie du code d'accès lit l'état de la garde par un module ordinaire (SERVER_PATTERN_PAGE_P0).
    files: ["src/app/prototype/executions/page.tsx"],
    rules: restrictedImports(MOCKS_PATTERN, SERVER_PATTERN_PAGE_P0),
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
    // F10c (F10-TL-5) : aucun journal dans le partage (le jeton n'est jamais journalisé, F10-PO-17).
    files: ["src/server/actions/partage.ts", "src/adapters/mock-share.ts", "src/adapters/share-guard.ts"],
    rules: { "no-console": "error" },
  },
  {
    // F9a : horloge injectée, jamais l'horloge système dans l'adaptateur de paiement simulé (0017 § 10.1, 0020 § 2.2) ;
    // F10c : de même dans l'adaptateur de partage simulé (F10-TL-5) ; F8b : de même dans la connexion simulée
    // et la création simulée (0017 § 10.1).
    files: ["src/adapters/mock-payment.ts", "src/adapters/mock-share.ts", "src/adapters/mock-auth.ts", "src/adapters/mock-creation.ts"],
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
        ...MARQUES_SYNTAX,
      ],
    },
  },
  {
    // F2 : aucun texte en dur dans les composants Ligne, tout vient de src/i18n/fr/ (handover § 10, décision 0047).
    // Les valeurs d'attributs (classes, rôles) restent permises ; les textes affichés passent par src/i18n/fr/.
    files: ["src/components/ligne/**/*.{jsx,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // F4 : aucun texte en dur dans la carte et sa démonstration, tout vient de src/i18n/fr/.
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
      // F7a : aperçu des effets (spécification F7, C3).
      "src/components/ligne/ChangeSet.tsx",
      // F7b : choix du jour de « Déplacer » (spécification F7, C3 ; décision 0019 § 1).
      "src/components/ligne/DayBadge.tsx",
      "src/components/ligne/DayBadgeGroup.tsx",
      "src/components/ligne/useRadioGroup.ts",
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
    // B1 (décision 0006, handover § 3) : `import "server-only"` obligatoire dans db/ et les dossiers serveur.
    // `src/server/actions/` est déjà protégé par "use server" ; les tests et la configuration de drizzle-kit, non.
    files: [
      "db/**/*.{js,mjs,ts,tsx,mts}",
      "src/server/**/*.{js,jsx,ts,tsx}",
      "src/tenancy/**/*.{js,jsx,ts,tsx}",
      "src/ai/**/*.{js,jsx,ts,tsx}",
      "src/research/**/*.{js,jsx,ts,tsx}",
      "src/grounding/**/*.{js,jsx,ts,tsx}",
      "src/workflows/**/*.{js,jsx,ts,tsx}",
    ],
    ignores: [
      "src/server/actions/**",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      // Exception nominative (fusion de main dans B1, #188) : ces modules de phase 0 sont aussi chargés par `pnpm p0`
      // (`node --import ./scripts/p0/enregistrer.mjs`, hors Next.js et sans la condition `react-server`), où
      // `import "server-only"` lèverait une erreur. La règle de 0020 § 11 (= 0017 § 3.3) ne vise que `src/server` :
      // la garde de remplacement est `ligne/no-p0-server-modules` (bloc suivant : aucun chargement de src/ai,
      // src/research, src/grounding hors des dossiers serveur). Liste fermée : tout nouveau fichier de ces dossiers
      // reste soumis à la règle (tests/unit/lint/p0-server-modules-lint.test.ts).
      // Condition de sortie : retirer la liste quand `pnpm p0` ne charge plus ces modules hors Next.js
      // (amendement de la décision 0006 du 2026-10-13).
      "src/ai/client.ts",
      "src/ai/modeles.simule.ts",
      "src/ai/prompts/notation.ts",
      "src/ai/prompts/plan.ts",
      "src/ai/prompts/raisons.ts",
      "src/ai/prompts/recherche.ts",
      "src/ai/requetes.ts",
      "src/ai/sorties.ts",
      "src/grounding/ancrage.ts",
      "src/grounding/interfaces.ts",
      "src/grounding/places.simule.ts",
      "src/grounding/routes.simule.ts",
      "src/research/agent.ts",
      "src/research/extract-text.ts",
      "src/research/fetch-page.ts",
      "src/research/ip-guard.ts",
      "src/research/pages.simule.ts",
      "src/research/recherche-web.simule.ts",
      "src/research/sources.ts",
      // B7a (ticket 423, décision 0077 § 1 points 3 et 4, § 3 point 1 ; spécification B7a, point 6) : modules de
      // `src/ai` et `src/research` que `pnpm p0` charge sous Node nu, ajoutés par leur nom avec la même justification :
      // `recherche-web.ts` déplacé de `src/research` (sa ligne passe de l'un à l'autre) ; copies tenues égales de
      // `src/prototype` (`candidat.ts`, `reglages.ts`, `src/research/candidat.ts`) ; prompts `structuration` et
      // `quartier` (chargés par `requetes.ts`) ; `erreurs.ts`, liste de codes sans aucun import (justification de
      // `src/server/env/resolve.ts` : ne lit ni ne rend aucun secret). Condition de sortie : celle des modules de phase 0.
      "src/ai/candidat.ts",
      "src/ai/erreurs.ts",
      "src/ai/prompts/quartier.ts",
      "src/ai/prompts/structuration.ts",
      "src/ai/recherche-web.ts",
      "src/ai/reglages.ts",
      "src/research/candidat.ts",
      // P0r1 : garde « aucune clé dans l'environnement des tests », chargée par la configuration de Playwright hors de
      // Next.js, où `import "server-only"` lèverait une erreur ; ne rend aucune valeur (src/server/env/garde-cles.ts).
      "src/server/env/garde-cles.ts",
      // B3a (décision 0050, B3-TL-1 point 2) : résolution de l'environnement, fonction pure sans aucun import, chargée
      // sous Node nu par `db/connection.ts` (`pnpm db:migrate`), où `import "server-only"` ne se résout pas sans la
      // condition `react-server` ; elle ne lit ni ne rend aucun secret. Seule exception de B3.
      "src/server/env/resolve.ts",
      // P0r3c-5a (ticket 349, amendement de 0063, réponse 2 du Tech Lead à la revue de #348) : assemblage et adaptateur
      // du moteur de P0, sortis de `scripts/p0` ; toujours chargés par `pnpm p0` sous Node nu, où `import "server-only"`
      // lèverait une erreur. Modules purs (aucune entrée-sortie) ; hors de src/server, F9a interdit de les importer.
      // Condition de sortie : celle des modules de phase 0 ci-dessus.
      "src/server/p0/assemblage.ts",
      "src/server/p0/vers-moteur.ts",
      // B7a (ticket 423, décision 0077 § 1 point 5) : adaptateur de P0 vers la couche IA, même régime que `vers-moteur.ts`.
      "src/server/p0/vers-couche-ia.ts",
    ],
    rules: { "ligne/require-server-only": "error" },
  },
  {
    // B1 (#188, correction 3), amendement de la décision 0006 du 2026-10-13 : garde de remplacement de l'exception
    // ci-dessus. Périmètre inversé : tout fichier sauf les dossiers serveur, `db/`, `scripts/` et les tests. La règle
    // lit import statique, import de type, réexport, `import()` (dont `next/dynamic`) et `require()`. Seul ce bloc la
    // règle : aucun bloc plus bas ne peut la remplacer (tests/unit/lint/p0-server-modules-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: [
      "src/server/**",
      "src/tenancy/**",
      "src/ai/**",
      "src/research/**",
      "src/grounding/**",
      "src/workflows/**",
      "db/**",
      "scripts/**",
      "tests/**",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],
    rules: { "ligne/no-p0-server-modules": "error" },
  },
  {
    // P0r1 (spécification `specs/P0-suite-executions-reelles.md`, décision 0031 § 6) : confinement des imports des
    // modules d'environnement étroits de `src/server/env/`. Règle propre au plugin, posée par ce seul bloc sur tout
    // fichier du dépôt, tests compris (tests/unit/lint/server-env-imports-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/server-env-imports": "error" },
  },
  {
    // B3b (spécification B3, B3b point 4 ; décisions 0008 et 0051 § 5.4) : `better-auth` depuis `src/server/auth` et
    // `src/tenancy` seulement, `@/tenancy/auth` depuis `src/server/auth` seulement, `auth.api` réduit aux appels nommés
    // de la liste blanche ; secret de Better Auth lu dans `process.env` par le seul module d'environnement. Règles
    // propres au plugin, posées par ce seul bloc (tests/unit/lint/better-auth-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/better-auth-confinement": "error", "ligne/no-raw-auth-secret": "error" },
  },
  {
    // B7a (ticket 423 ; spécification B7a point 5, handover § 3 ; décisions 0077 § 1 point 5 et 0080 §§ 4 et 5) :
    // `src/ai` et `src/research` en liste blanche d'imports, tests compris (`vitest` et modules nommés de `tests/support`
    // en plus ; toute source non littérale refusée), et `@/ai/complement-p0` confiné aux appels directs de P0. Règles propres au plugin, posées par ce seul bloc sur tout
    // fichier (eslint-rules/ia-recherche-imports.mjs ; tests/unit/lint/ia-recherche-lint.test.ts). Le test d'imports
    // de P0 (tests/unit/p0/imports.test.ts) reste en place à côté jusqu'à la fin de P0 (0077 § 2 point 6).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/ia-recherche-liste-blanche": "error", "ligne/complement-p0-imports": "error" },
  },
  {
    // B8a (ticket 462 ; spécification B8a point 6, handover § 3 ; décision 0085 § 1.8 à § 1.10) : `src/grounding` en
    // liste blanche d'imports, tests compris (`vitest` et modules nommés de `tests/support` en plus ; exception
    // nominative de `@/prototype/*` pour `ancrage.ts` et les modules de P0r3c, jusqu'à B8-TL-10), et
    // `@/server/relecture/*` importable par la seule composition de génération. Règles propres au plugin, posées par ce
    // seul bloc sur tout fichier (eslint-rules/grounding-imports.mjs ; tests/unit/lint/grounding-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/grounding-liste-blanche": "error", "ligne/relecture-imports": "error" },
  },
  {
    // B6a (ticket 471 ; spécification B6, B6a point 9, B6-TL-1 ; décision 0086 § 1.1 point 2 et § 1.2 point 4) :
    // `@/server/voyages/*` importable hors de `src/server` par `src/adapters/api.ts` seul (tests de
    // `src/server/voyages/` et `tests/db/` permis, `tests/support` refusé) ; dans `src/mocks`, `@/domain/relectures` en
    // `import type` seulement, depuis le seul double `src/mocks/relectures-voyages.ts`. Règle propre au plugin, posée
    // par ce seul bloc sur tout fichier (eslint-rules/voyages-imports.mjs ; tests/unit/lint/voyages-imports-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/voyages-imports": "error" },
  },
  {
    // B9 (ticket 519 ; décisions 0081 B9-TL-1 point 3, 0087 § 1.6 et 0101 § 4) : `@/server/creation/*`,
    // `@/server/generation/*`, `@/server/composition/generation` et `@/server/with-system-org` importables par les seuls
    // fichiers nommés (dont `src/adapters/api-creation.ts`, dérogation de 0101 § 1). Règle propre au plugin, posée par ce
    // seul bloc sur tout fichier (eslint-rules/creation-imports.mjs ; tests/unit/lint/creation-imports-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/creation-imports": "error" },
  },
  {
    // B4a (spécification B4, B4a point 7 ; amendement de 0017 § 3.3 et 0020 § 11 écrit dans 0006) : route handlers et
    // actions du paiement. Règle propre au plugin, posée par ce seul bloc sur tout fichier (eslint-rules/route-handlers.mjs ;
    // tests/unit/lint/route-handlers-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/route-handlers": "error" },
  },
  {
    // P0r3c-4 (décisions 0009, points 1 et 2, et 0063, points 3 et 4) : directives `"use workflow"` et `"use step"` et
    // Workflow SDK dans `src/workflows/` seulement (`workflow/next` admis dans `next.config.ts`) ; `createWebhook`,
    // `createHook`, `defineHook`, `resumeHook`, `resumeWebhook` et `getHookByToken` interdits partout. Règle propre au
    // plugin, posée par ce seul bloc sur tout fichier (tests/unit/lint/workflow-directives-lint.test.ts).
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: { "ligne/workflow-directives": "error" },
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
      // F8b : ni email ni code dans un journal (décision 0017 § 3.5).
      "src/server/actions/compte.ts",
      "src/adapters/mock-auth.ts",
      "src/adapters/auth-guard.ts",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: { "no-console": "error" },
  },
  {
    // B3a (décision 0050, B3-TL-1 point 5) : aucun journal hors du module de journal (`src/server/log.ts`, seul
    // point d'écriture des journaux de B3, à champs en liste blanche).
    files: [
      "src/instrumentation.ts",
      "src/server/env/index.ts",
      "src/server/env/resolve.ts",
      "src/server/email.ts",
      "src/server/ip.ts",
      "src/server/rate-limit.ts",
      "src/server/config/limites.ts",
      // B3b (spécification B3, « Critères communs » ; 0050, B3-TL-1 point 5) : fichiers de B3b sous `src/server` et
      // `src/tenancy`.
      "src/server/auth/**/*.ts",
      "src/server/mail/port.ts",
      "src/server/mail/disabled.ts",
      "src/server/session.ts",
      "src/server/with-org.ts",
      "src/tenancy/**/*.ts",
    ],
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
    // F10c (F10-TL-5) : feuille « Partager » et vue partagée : aucun texte en dur, aucune persistance côté client,
    // ni src/mocks (jetons fixes compris), ni carte simulée, ni portée des simulations ; ni zod, ni valeur de
    // @/contracts ; depuis src/features/partage, seul @/server/actions/partage. Le dernier bloc l'emporte : il
    // reprend tous les motifs des blocs précédents.
    files: ["src/features/partage/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      ...noClientStorage("Partage", "spécification F10, F10c, décision 0039 F10-TL-5", "aucun service worker"),
      ...clientImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, PARTAGE_SERVER_PATTERN, SIMULATION_PATTERN),
    },
  },
  {
    // F10c (F10-TL-5) : routes de la vue partagée : mêmes interdits, src/server par ses actions seulement.
    files: ["src/app/p/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      ...noClientStorage("Vue partagée", "spécification F10, F10c, décision 0039 F10-TL-5", "aucun service worker"),
      ...restrictedImports(MOCKS_PATTERN, SIMULATED_MAP_PATTERN, SERVER_PATTERN, SIMULATION_PATTERN),
    },
  },
  {
    // B5a (décision 0045 § 3) : `src/domain` sans entrée-sortie, tests compris (`vitest` en plus pour eux).
    files: ["src/domain/**/*.ts"],
    ignores: ["src/domain/**/*.test.ts"],
    rules: domainSansEntreeSortie(false),
  },
  {
    files: ["src/domain/**/*.test.ts"],
    rules: domainSansEntreeSortie(true),
  },
  {
    // La règle elle-même et ses tests contiennent des couleurs en dur par construction.
    files: ["eslint-rules/**", "tests/unit/lint/**"],
    rules: { "ligne/no-hardcoded-colors": "off" },
  },
]);
