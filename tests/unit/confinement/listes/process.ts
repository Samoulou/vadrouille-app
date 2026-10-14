/**
 * Lignes de `process` et de `process.env` (spécification P0c, section 5). Propriété du Tech Lead, verdict Sécurité
 * exigé pour toute modification. `NODE_ENV` est admis dans tout fichier sans ligne ; `process.cwd()` dans tout fichier
 * de test (section 4, forme 5). Chaque couple (fichier, propriété), (fichier, nom) et (fichier, forme) est une ligne
 * au sens de « ligne inutile ».
 */

import { readFileSync } from "node:fs";

export type LigneProcess = { readonly fichier: string; readonly propriete: string };
/** `constante` : lecture `process.env[X]` à clé constante importée (section 5, forme 4). */
/** `motif` : justification et verdict, pour les lignes de noms secrets lues dans les données du régime. */
export type LigneLectureEnv = { readonly fichier: string; readonly noms: readonly string[]; readonly constante?: boolean; readonly motif?: string };
/** Formes : `defaut:<fonction>`, `argument:<fonction>`, `propriete-env:<fonction>`, `etalement`. */
export type LigneEnvEntier = { readonly fichier: string; readonly formes: readonly string[] };
/** Paramètre qui reçoit `process.env` entier sans valeur par défaut, suivi comme un paramètre à défaut `process.env`. */
export type ParametreEnv = { readonly fichier: string; readonly fonction: string; readonly parametre: string };

export const PROPRIETES_PROCESS = [
  { fichier: "scripts/ci/release-note.mjs", propriete: "argv" },
  { fichier: "scripts/ci/release-note.mjs", propriete: "stdout" },
  { fichier: "scripts/ci/release-note.mjs", propriete: "stderr" },
  { fichier: "scripts/ci/release-note.mjs", propriete: "exitCode" },
  { fichier: "scripts/ci/techlead-gate.mjs", propriete: "argv" },
  { fichier: "scripts/ci/techlead-gate.mjs", propriete: "stdout" },
  // Relevé de `f57153c` (T18) : `workflowsTreeId` reçoit `process.cwd()`.
  { fichier: "scripts/ci/techlead-gate.mjs", propriete: "cwd" },
  // Relevé de la base de P0c1 : `scripts/ci/post-merge-cleanup.mjs` (après `40b6738`).
  { fichier: "scripts/ci/post-merge-cleanup.mjs", propriete: "argv" },
  { fichier: "scripts/ci/post-merge-cleanup.mjs", propriete: "stdout" },
  { fichier: "scripts/ci/post-merge-cleanup.mjs", propriete: "stderr" },
  { fichier: "scripts/ci/post-merge-cleanup.mjs", propriete: "exitCode" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "cwd" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "stdout" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "stderr" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "exit" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "execPath" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "on" },
  { fichier: "src/server/actions/creation.test.ts", propriete: "stdout" },
  { fichier: "src/server/actions/creation.test.ts", propriete: "stderr" },
  // F8b (spécification F8, « Données personnelles ») : espion du test « ni adresse ni code journalisés ». Verdict Sécurité : à venir (PR F8b, ticket 259).
  { fichier: "src/server/actions/compte.test.ts", propriete: "stdout" },
  { fichier: "src/server/actions/compte.test.ts", propriete: "stderr" },
  // F10c (décision 0039, F10-TL-7) : espion du test « jeton jamais journalisé » (C35). Verdict Sécurité : approuvé (PR #236, a1463f6).
  { fichier: "src/server/actions/partage.test.ts", propriete: "stdout" },
  { fichier: "src/server/actions/partage.test.ts", propriete: "stderr" },
  // Section 9 (P0a1) : `scripts/p0/main.ts`.
  { fichier: "scripts/p0/main.ts", propriete: "argv" },
  { fichier: "scripts/p0/main.ts", propriete: "exitCode" },
  { fichier: "scripts/p0/main.ts", propriete: "stdout" },
  { fichier: "scripts/p0/main.ts", propriete: "stderr" },
  // B1 (PR 188, après P0c1 ; spécification P0c, section 9) : `pnpm db:migrate` et `pnpm test:db`. Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  { fichier: "db/migrate.ts", propriete: "argv" },
  { fichier: "db/migrate.ts", propriete: "exitCode" },
  { fichier: "scripts/test-db.mjs", propriete: "argv" },
  { fichier: "scripts/test-db.mjs", propriete: "exit" },
] as const satisfies readonly LigneProcess[];

export const LECTURES_ENV = [
  { fichier: "playwright.config.ts", noms: ["CI", "E2E_SKIP_BUILD"] },
  { fichier: "scripts/e2e-port.mjs", noms: ["E2E_PORT", "CI"] },
  { fichier: "scripts/serve-standalone.mjs", noms: ["E2E_SERVER_LOG"], constante: true },
  { fichier: "src/adapters/context.ts", noms: ["DATA_ADAPTER"] },
  { fichier: "src/adapters/index.ts", noms: ["DATA_ADAPTER", "PAYMENT_ADAPTER"] },
  { fichier: "src/adapters/payment-guard.ts", noms: ["VADROUILLE_DEMO_PAYMENT", "PAYMENT_ADAPTER", "DATA_ADAPTER"] },
  // F10c (décision 0039, F10-TL-7) : garde du partage simulé, alignée sur `payment-guard.ts`. Verdict Sécurité : approuvé (PR #236, a1463f6).
  { fichier: "src/adapters/share-guard.ts", noms: ["VADROUILLE_DEMO_SHARE", "DATA_ADAPTER"] },
  // F8b (décision 0017 § 11.2, F8-TL-10) : garde de la connexion simulée, même forme que `share-guard.ts`. Verdict Sécurité : à venir (PR F8b, ticket 259).
  { fichier: "src/adapters/auth-guard.ts", noms: ["AUTH_ADAPTER", "VADROUILLE_DEMO_AUTH"] },
  // Relevé de la base de P0c1 (P0b1) : `VADROUILLE_PROTOTYPE`, `CI` dans `flags.ts`, `prototype-instance.ts`.
  { fichier: "src/dev/flags.ts", noms: ["VADROUILLE_DEV_PAGES", "VADROUILLE_ENV", "VERCEL_ENV", "VADROUILLE_PROTOTYPE", "CI"] },
  { fichier: "src/adapters/prototype-instance.ts", noms: ["VADROUILLE_PROTOTYPE_DIR"] },
  // B1 (PR 188, après P0c1 ; spécification P0c, sections 5 et 9 ; décision 0036). Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  // Noms secrets de la base : `LECTURES_ENV_SECRETES` ci-dessous (module de connexion et outil de migration seulement).
  { fichier: "db/connection.ts", noms: ["VERCEL_ENV", "VADROUILLE_ENV"] },
  { fichier: "scripts/test-db.mjs", noms: ["SKIP_DB_TESTS", "CI", "GITHUB_ACTIONS"] },
  { fichier: "tests/db/env.ts", noms: ["VADROUILLE_DB_ADMIN_URL", "VADROUILLE_DB_BOOTSTRAP_ROLE"] },
  { fichier: "tests/unit/db/test-db-sans-base.test.ts", noms: ["PATH", "HOME"] },
  { fichier: "src/components/carte/config.tsx", noms: ["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID"] },
  // Relevé de la base de P0c1 (P0a1, PR 180) : environnement minimal du sous-processus `pnpm p0`, six lectures par
  // propriété littérale (décision 0042, P0cS-TL-5 ; ticket 221).
  { fichier: "tests/unit/p0/cli.test.ts", noms: ["PATH", "HOME", "SystemRoot", "TMPDIR", "TEMP", "TMP"] },
  // Relevé de `f57153c` (T18) : `PATH` d'un sous-processus de test.
  { fichier: "tests/unit/ci/techlead-gate-workflow.test.ts", noms: ["PATH"] },
  // 0040 D2, A8 : environnement de `git` construit (P0c-suite-release, #222).
  { fichier: "scripts/ci/techlead-gate.mjs", noms: ["PATH", "HOME"] },
] as const satisfies readonly LigneLectureEnv[];

export const ENV_ENTIER = [
  { fichier: "playwright.config.ts", formes: ["propriete-env:e2ePort"] },
  {
    fichier: "src/adapters/payment-guard.ts",
    formes: ["defaut:paymentDemoAllowed", "defaut:paymentAvailable", "argument:isProductionDeployment", "argument:paymentDemoAllowed"],
  },
  // F10c (décision 0039, F10-TL-7) : même forme que `payment-guard.ts`. Verdict Sécurité : approuvé (PR #236, a1463f6).
  {
    fichier: "src/adapters/share-guard.ts",
    formes: ["defaut:shareDemoAvailable", "defaut:shareAvailable", "argument:isProductionDeployment", "argument:shareDemoAvailable"],
  },
  // F8b (décision 0017 § 11.2, F8-TL-10) : même forme que `share-guard.ts`. Verdict Sécurité : à venir (PR F8b, ticket 259).
  {
    fichier: "src/adapters/auth-guard.ts",
    formes: [
      "defaut:authAdapterChoice",
      "defaut:mockAuthAllowed",
      "defaut:assertAuthAdapter",
      "argument:isProductionDeployment",
      "argument:authAdapterChoice",
      "argument:mockAuthAllowed",
    ],
  },
  { fichier: "src/adapters/simulation.ts", formes: ["defaut:simulationEnabled", "argument:devPagesEnabled", "argument:isProductionDeployment"] },
  { fichier: "src/dev/flags.ts", formes: ["defaut:devPagesEnabled", "defaut:isProductionDeployment", "defaut:prototypeAdapterAllowed", "argument:isProductionDeployment"] },
  { fichier: "tests/unit/ci/visual-update.test.ts", formes: ["etalement"] },
  // Relevé de la base de P0c1 (P0b1, après `40b6738`).
  { fichier: "src/adapters/context.ts", formes: ["defaut:getRequestContext", "argument:assertPrototypeAllowed"] },
  { fichier: "src/adapters/index.ts", formes: ["defaut:getTripAdapter", "argument:prototypeTripAdapter"] },
  {
    fichier: "src/adapters/prototype-instance.ts",
    formes: ["defaut:prototypeTripAdapter", "defaut:prototypeRelectures", "argument:assertPrototypeAllowed", "argument:prototypeAdapterAllowed"],
  },
  { fichier: "tests/e2e/prototype-helpers.ts", formes: ["propriete-env:e2ePort"] },
  // Relevé de `f57153c` (T18) : environnement des sous-processus de test.
  { fichier: "tests/unit/ci/techlead-gate-workflow.test.ts", formes: ["etalement"] },
  // B1 (PR 188, après P0c1 ; spécification P0c, section 9). Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  { fichier: "db/index.ts", formes: ["defaut:createDatabase", "argument:createGuardedPool"] },
  { fichier: "db/connection.ts", formes: ["argument:connectionStringFor", "argument:assertDatabaseAllowed", "argument:isProductionForDatabase"] },
  { fichier: "db/migrate.ts", formes: ["argument:runMigrations", "argument:migratorConnectionString", "argument:assertDatabaseAllowed"] },
  // `argument:isProductionForDatabase` : ajoutée par la correction 1 de la PR 244 (mineur 5 de la revue du head
  // a89d9a5 : garde de production distinguée des variables absentes) ; verdict Sécurité à renouveler sur ce head.
  { fichier: "tests/db/env.ts", formes: ["argument:connectionStringFor", "argument:migratorConnectionString", "argument:isProductionForDatabase"] },
] as const satisfies readonly LigneEnvEntier[];

export const PARAMETRES_ENV = [
  { fichier: "scripts/e2e-port.mjs", fonction: "e2ePort", parametre: "env" },
  // Relevé de la base de P0c1 (P0b1) : reçoit `process.env` de `getRequestContext` et de `prototypeTripAdapter`.
  { fichier: "src/adapters/prototype-instance.ts", fonction: "assertPrototypeAllowed", parametre: "env" },
  // B1 (PR 188, après P0c1) : chaîne de la garde de connexion et des migrations, lue par propriété littérale. Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  { fichier: "db/connection.ts", fonction: "createGuardedPool", parametre: "env" },
  { fichier: "db/connection.ts", fonction: "connectionStringFor", parametre: "env" },
  { fichier: "db/connection.ts", fonction: "assertDatabaseAllowed", parametre: "env" },
  { fichier: "db/connection.ts", fonction: "isProductionForDatabase", parametre: "env" },
  { fichier: "db/migrate.ts", fonction: "runMigrations", parametre: "env" },
  { fichier: "db/migrate.ts", fonction: "migratorConnectionString", parametre: "env" },
] as const satisfies readonly ParametreEnv[];

/**
 * Lectures littérales de **noms secrets** (section 5, « Noms secrets » : seulement pour un module de `src/server/env/`
 * ou le module de connexion de B1, avec verdict Sécurité). Même forme que `LECTURES_ENV`, mais lues dans
 * `donnees/lectures-env-secretes.json`, extension non analysée : les fichiers `.ts` du régime ne contiennent aucun nom
 * secret (section 1, « Données du régime »). Chaque nom est une ligne au sens de « ligne inutile » ; un fichier qui
 * n'est pas admis par `lectureSecreteAdmise` fait échouer le test des noms secrets des listes.
 */
export const LECTURES_ENV_SECRETES: readonly LigneLectureEnv[] = (
  JSON.parse(readFileSync(new URL("../donnees/lectures-env-secretes.json", import.meta.url), "utf8")) as { lignes: readonly LigneLectureEnv[] }
).lignes;

/**
 * Toutes les lectures littérales de `process.env` admises : lignes `.ts` et lignes de noms secrets des données du
 * régime. Liste unique pour l'analyse et le test du dépôt (revue du head `a89d9a5`, PR 244, mineur 3).
 */
export const LECTURES_ENV_TOUTES: readonly LigneLectureEnv[] = [...LECTURES_ENV, ...LECTURES_ENV_SECRETES];
