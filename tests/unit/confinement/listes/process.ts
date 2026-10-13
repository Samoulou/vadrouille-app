/**
 * Lignes de `process` et de `process.env` (spécification P0c, section 5). Propriété du Tech Lead, verdict Sécurité
 * exigé pour toute modification. `NODE_ENV` est admis dans tout fichier sans ligne ; `process.cwd()` dans tout fichier
 * de test (section 4, forme 5). Chaque couple (fichier, propriété), (fichier, nom) et (fichier, forme) est une ligne
 * au sens de « ligne inutile ».
 */

export type LigneProcess = { readonly fichier: string; readonly propriete: string };
/** `constante` : lecture `process.env[X]` à clé constante importée (section 5, forme 4). */
export type LigneLectureEnv = { readonly fichier: string; readonly noms: readonly string[]; readonly constante?: boolean };
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
  // Section 9 (P0a1) : `scripts/p0/main.ts`.
  { fichier: "scripts/p0/main.ts", propriete: "argv" },
  { fichier: "scripts/p0/main.ts", propriete: "exitCode" },
  { fichier: "scripts/p0/main.ts", propriete: "stdout" },
  { fichier: "scripts/p0/main.ts", propriete: "stderr" },
] as const satisfies readonly LigneProcess[];

export const LECTURES_ENV = [
  { fichier: "playwright.config.ts", noms: ["CI", "E2E_SKIP_BUILD"] },
  { fichier: "scripts/e2e-port.mjs", noms: ["E2E_PORT", "CI"] },
  { fichier: "scripts/serve-standalone.mjs", noms: ["E2E_SERVER_LOG"], constante: true },
  { fichier: "src/adapters/context.ts", noms: ["DATA_ADAPTER"] },
  { fichier: "src/adapters/index.ts", noms: ["DATA_ADAPTER", "PAYMENT_ADAPTER"] },
  { fichier: "src/adapters/payment-guard.ts", noms: ["VADROUILLE_DEMO_PAYMENT", "PAYMENT_ADAPTER", "DATA_ADAPTER"] },
  // Relevé de la base de P0c1 (P0b1) : `VADROUILLE_PROTOTYPE`, `CI` dans `flags.ts`, `prototype-instance.ts`.
  { fichier: "src/dev/flags.ts", noms: ["VADROUILLE_DEV_PAGES", "VADROUILLE_ENV", "VERCEL_ENV", "VADROUILLE_PROTOTYPE", "CI"] },
  { fichier: "src/adapters/prototype-instance.ts", noms: ["VADROUILLE_PROTOTYPE_DIR"] },
  { fichier: "src/components/carte/config.tsx", noms: ["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID"] },
  // Relevé de la base de P0c1 (P0a1, PR 180) : environnement minimal du sous-processus `pnpm p0`.
  { fichier: "tests/unit/p0/cli.test.ts", noms: ["PATH", "HOME"] },
  // Relevé de `f57153c` (T18) : `PATH` d'un sous-processus de test.
  { fichier: "tests/unit/ci/techlead-gate-workflow.test.ts", noms: ["PATH"] },
] as const satisfies readonly LigneLectureEnv[];

export const ENV_ENTIER = [
  { fichier: "playwright.config.ts", formes: ["propriete-env:e2ePort"] },
  {
    fichier: "src/adapters/payment-guard.ts",
    formes: ["defaut:paymentDemoAllowed", "defaut:paymentAvailable", "argument:isProductionDeployment", "argument:paymentDemoAllowed"],
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
] as const satisfies readonly LigneEnvEntier[];

export const PARAMETRES_ENV = [
  { fichier: "scripts/e2e-port.mjs", fonction: "e2ePort", parametre: "env" },
  // Relevé de la base de P0c1 (P0b1) : reçoit `process.env` de `getRequestContext` et de `prototypeTripAdapter`.
  { fichier: "src/adapters/prototype-instance.ts", fonction: "assertPrototypeAllowed", parametre: "env" },
] as const satisfies readonly ParametreEnv[];
