import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

import { PROTOTYPE_PORT_OFFSET, e2ePort } from "./scripts/e2e-port.mjs";
import { SERVER_LOG_ENV, serverLogPath } from "./scripts/e2e-server-log.mjs";
import { clesDeServicePosees } from "./src/server/env/garde-cles";

// P0r1 (`p0: aucune clé dans l'environnement des tests`) : Playwright ne démarre pas si une clé de service est posée.
const clesPosees = clesDeServicePosees();
if (clesPosees.length > 0) {
  throw new Error(`Clé de service posée dans l'environnement de Playwright (${clesPosees.join(", ")}) : retire-la avant de lancer les tests.`);
}

// F10b (F10-TL-6) : requêtes réseau des service workers exposées à Playwright (Chromium) : `context.route` les
// intercepte (blocage des domaines Google) et `context.setOffline` les coupe. Sans ce drapeau, le service worker
// garde le réseau quand la page est hors ligne. Posé ici pour le processus principal et ses workers.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

// Un port par worktree (décision 0017 § 14, Q107) : `E2E_PORT` s'il est fourni, sinon 3100 en CI, sinon un port
// stable entre 3100 et 3899 tiré du chemin absolu du dépôt. Jamais de serveur réutilisé : un port occupé fait
// échouer Playwright au lieu de tester le build d'un autre worktree, ou un ancien build resté en mémoire.
const PORT = e2ePort({ env: process.env, repoPath: __dirname });
const baseURL = `http://127.0.0.1:${PORT}`;

// Second serveur sur le même build, en mode prototype (spécification P0, P0b1 ; décision 0032 § A6.3) : port
// décalé de 1 000, programme de test fabriqué à la main (valeurs sentinelles), relecteur simulé. `CI=true` est
// posé pour ce serveur seulement : le drapeau `VADROUILLE_PROTOTYPE=1` n'est pris en compte qu'avec lui.
const PROTOTYPE_PORT = PORT + PROTOTYPE_PORT_OFFSET;
const prototypeURL = `http://127.0.0.1:${PROTOTYPE_PORT}`;
const PROTOTYPE_DIR = realpathSync(join(__dirname, "prototype", "programmes-test"));

// Troisième serveur sur le même build (décision 0074) : adaptateur `prototype` **sans** dossier de programmes, donc
// source des programmes réels branchée par `instrumentation.ts`, garde du mode réel fermée (`CI=true`, aucune base) :
// « Mes voyages » vide, aucune connexion, aucun échec de branchement au journal. Port décalé de 2 000.
const LECTURE_REELLE_PORT = PORT + 2 * PROTOTYPE_PORT_OFFSET;

// Spécification E2E-essai, lot 1 (ticket 691) : sixième serveur sur le même build, adaptateur `prototype` sur un
// programme d'essai fabriqué à la main **sans propositions enregistrées** (forme écrite par `p0Run`), relecteur simulé :
// parcours de l'app (premières propositions, tri, déblocage simulé, journées). Port décalé de 5 000.
const ESSAI_PORT = PORT + 5 * PROTOTYPE_PORT_OFFSET;
const ESSAI_DIR = realpathSync(join(__dirname, "prototype", "programmes-essai"));

// B3c (spécification B3, B3c point 7 ; B3-TL-8 ; décision 0077 § 5.4) : quatrième serveur sur le même build, connexion
// réelle (`AUTH_ADAPTER=better-auth`) sur la base du job `db`. Démarré, avec le projet `auth`, seulement quand le job
// `db` pose la variable d'outillage `E2E_AUTH_SERVER=1` (après les migrations) : sans base, `register()` le refuserait.
// Port décalé de 3 000. Les URL de connexion de la base (`vadrouille_app`, `vadrouille_auth`) viennent de
// l'environnement du job (`scripts/ci/db-setup.sh`) ; les deux secrets sont tirés ici, comme pour le serveur principal.
const AUTH_SERVER = process.env.E2E_AUTH_SERVER === "1";
const AUTH_PORT = PORT + 3 * PROTOTYPE_PORT_OFFSET;
const authURL = `http://127.0.0.1:${AUTH_PORT}`;

// B6b (spécification B6, B6b point 5 ; décision 0086 § 2.3, B6-TL-10) : cinquième serveur sur le même build, connexion
// réelle **et** lecture réelle (`DATA_ADAPTER=api`, double de relectures en `ci`), sur la base du job `db`. Démarré par
// la même variable d'outillage que le serveur `auth` (`E2E_AUTH_SERVER=1`), avec son propre projet (`api`, fichiers
// `*.api.spec.ts`). Port décalé de 4 000. Le serveur et les tests de B3c ne changent pas : le projet `auth` déclare
// seulement `api` comme dépendance, pour que `--project=auth` du job `db` l'exécute aussi sans modifier le workflow.
const API_PORT = PORT + 4 * PROTOTYPE_PORT_OFFSET;
const apiURL = `http://127.0.0.1:${API_PORT}`;

// B3a (spécification B3, B3a point 3 ; décisions 0050, P2, et 0051, points 2.3 et 6.4) : les serveurs des e2e
// tournent en `VADROUILLE_ENV=ci`. Le secret du limiteur est tiré au hasard à chaque exécution et posé dans le seul
// `env` du serveur principal : ni écrit sur disque, ni journalisé, ni posé dans `process.env` de Playwright (aucun
// rapport, trace ni artefact ne le reçoit). `TRUSTED_IP_HEADER` n'est posé que sur ce serveur autonome, lié à
// `127.0.0.1` (garde de `assertServerProcessEnv`, test `tests/unit/server-env-config.test.ts`).
const secretJetable = () => randomBytes(32).toString("base64url");

// B4b (spécification B4, B4b point 4 ; décision 0097 B4-TL-8 point 4) : variables du paiement simulé en base, posées sur
// le seul serveur `api`, qui choisit `PAYMENT_ADAPTER=simulated` : le drapeau du webhook simulé et le secret de signature
// (tiré au hasard à chaque chargement, jamais écrit sur disque ni posé dans `process.env` de Playwright) n'existent que
// pour ce choix. Aucun workflow ne les pose (0020 § 2.3, critère A26).
const PAIEMENT_SIMULE_API = {
  PAYMENT_ADAPTER: "simulated",
  VADROUILLE_DEMO_PAYMENT: "1",
  SIMULATED_WEBHOOK_ENABLED: "true",
  SIMULATED_WEBHOOK_SECRET: secretJetable(),
} as const;

// Tests sur le build de production, servi comme dans l'image Docker. `pnpm verify` construit une seule fois
// puis passe E2E_SKIP_BUILD=1 ; un lancement isolé reconstruit l'application.
const serve = "node scripts/serve-standalone.mjs";
const command = process.env.E2E_SKIP_BUILD ? serve : `pnpm build && ${serve}`;

export default defineConfig<{ urlMock: string }>({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // Captures de référence partagées entre machines (pas de suffixe de plateforme).
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "fr-CH",
    timezoneId: "Europe/Zurich",
    trace: "retain-on-failure",
    // F10b (F10-TL-6) : service workers bloqués par défaut ; seuls les tests du hors-ligne (et le contrôle de
    // persistance de la carte) posent `test.use({ serviceWorkers: "allow" })`.
    serviceWorkers: "block",
  },
  projects: [
    { name: "e2e", testDir: "tests/e2e", testMatch: /.*\.e2e\.spec\.ts$/ },
    { name: "a11y", testDir: "tests/e2e", testMatch: /.*\.a11y\.spec\.ts$/ },
    { name: "visual", testDir: "tests/visual", testMatch: /.*\.visual\.spec\.ts$/ },
    // « Prototype sans cache » (décision 0032 § A6.6, revue de la PR #208) : compteur du relecteur simulé lu sans
    // bruit, donc sans parallélisme et après les projets qui chargent des pages du serveur prototype. Dans
    // `pnpm verify`, invocation à part (`pnpm test:prototype-cache`, `--no-deps`) : serveurs neufs, aucun autre test.
    {
      name: "prototype-cache",
      testDir: "tests/e2e",
      testMatch: /.*\.prototype-cache\.spec\.ts$/,
      fullyParallel: false,
      dependencies: ["e2e", "a11y"],
    },
    // Mesure Lighthouse (décision 0022 § 1 et § 2) : `pnpm test:perf`, hors de `pnpm verify`, un seul worker,
    // sans nouvelle tentative (elle cacherait un score instable).
    { name: "perf", testDir: "tests/perf", testMatch: /.*\.perf\.spec\.ts$/, retries: 0 },
    // B3c (critère C7, partie « pages ») : serveur à connexion réelle ; aucune trace (cookies de session), en-tête de
    // confiance posé par fixture dans chaque test (`tests/e2e/sans-session.auth.spec.ts`).
    // B6b (B6-TL-10) : serveur à connexion et lecture réelles ; `urlMock` désigne le serveur principal (adaptateur
    // `mock`, même build), auquel les scénarios comparent le rendu des écrans 11, 12 et 17. Aucune trace (cookies).
    ...(AUTH_SERVER
      ? [
          {
            name: "api",
            testDir: "tests/e2e",
            testMatch: /.*\.api\.spec\.ts$/,
            use: { baseURL: apiURL, urlMock: baseURL, trace: "off" as const },
          },
          { name: "auth", testDir: "tests/e2e", testMatch: /.*\.auth\.spec\.ts$/, use: { baseURL: authURL, trace: "off" as const }, dependencies: ["api"] },
        ]
      : []),
  ],
  webServer: [
    {
      command,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
      // Sortie du serveur transmise à Playwright et recopiée dans `serverLogPath` (scripts/serve-standalone.mjs),
      // relue par les tests (spécification F8, « Aucune persistance locale »).
      stdout: "pipe",
      stderr: "pipe",
      // VADROUILLE_DEMO_PAYMENT : paiement simulé ouvert pour les tests seulement (décision 0020 § 2.3) ;
      // VADROUILLE_DEMO_SHARE : partage simulé, idem (décision 0039, F10-TL-7) ; VADROUILLE_DEMO_AUTH : connexion
      // simulée, idem (décision 0017 § 11.3, F8b). Seul fichier versionné qui les pose
      // (tests/unit/debloquer-regles.test.ts, tests/unit/dev-pages-env.test.ts).
      env: {
        VADROUILLE_DEV_PAGES: "1",
        VADROUILLE_DEMO_PAYMENT: "1",
        VADROUILLE_DEMO_SHARE: "1",
        VADROUILLE_DEMO_AUTH: "1",
        VADROUILLE_ENV: "ci",
        TRUSTED_IP_HEADER: "x-vercel-forwarded-for",
        RATE_LIMIT_HMAC_SECRET: secretJetable(),
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        [SERVER_LOG_ENV]: serverLogPath({ port: PORT, tmpDir: tmpdir() }),
      },
    },
    {
      // Même build : la commande du premier serveur l'a construit si besoin ; celui-ci ne fait que le servir.
      command: serve,
      url: prototypeURL,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATA_ADAPTER: "prototype",
        VADROUILLE_PROTOTYPE: "1",
        CI: "true",
        VADROUILLE_ENV: "ci",
        VADROUILLE_PROTOTYPE_DIR: PROTOTYPE_DIR,
        // Compteur du relecteur simulé (`/dev/api/prototype/relectures`, décision 0032 § A6.6).
        VADROUILLE_DEV_PAGES: "1",
        PORT: String(PROTOTYPE_PORT),
        HOSTNAME: "127.0.0.1",
      },
    },
    {
      // Même build, servi sans dossier de programmes (décision 0074, `tests/e2e/lecture-reelle.e2e.spec.ts`).
      command: serve,
      url: `http://127.0.0.1:${LECTURE_REELLE_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATA_ADAPTER: "prototype",
        VADROUILLE_PROTOTYPE: "1",
        CI: "true",
        VADROUILLE_ENV: "ci",
        PORT: String(LECTURE_REELLE_PORT),
        HOSTNAME: "127.0.0.1",
        [SERVER_LOG_ENV]: serverLogPath({ port: LECTURE_REELLE_PORT, tmpDir: tmpdir() }),
      },
    },
    {
      // Même build, programme d'essai sans propositions (spécification E2E-essai, lot 1, `tests/e2e/essai.e2e.spec.ts`).
      // Paiement simulé ouvert par la liste blanche de `prototype` (`CI=true`, `VADROUILLE_PROTOTYPE=1`), sans drapeau de
      // démonstration ; pages de développement pour la portée de simulation de chaque test (`R-sim`).
      command: serve,
      url: `http://127.0.0.1:${ESSAI_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATA_ADAPTER: "prototype",
        VADROUILLE_PROTOTYPE: "1",
        CI: "true",
        VADROUILLE_ENV: "ci",
        VADROUILLE_PROTOTYPE_DIR: ESSAI_DIR,
        VADROUILLE_DEV_PAGES: "1",
        PORT: String(ESSAI_PORT),
        HOSTNAME: "127.0.0.1",
      },
    },
    ...(AUTH_SERVER
      ? [
          {
            // Même build, connexion réelle (B3c point 7) ; envoi du code par SMTP vers le Mailpit du job `db` (B3b-envoi,
            // décision 0098 § 5.6) : `EMAIL_TRANSPORT` et `SMTP_URL` posées **en clair** ici (valeurs de la boucle locale,
            // sans valeur secrète), jamais dans `$GITHUB_ENV` ni dans un secret du dépôt.
            command: serve,
            url: authURL,
            reuseExistingServer: false,
            timeout: 180_000,
            stdout: "pipe" as const,
            stderr: "pipe" as const,
            env: {
              AUTH_ADAPTER: "better-auth",
              VADROUILLE_ENV: "ci",
              TRUSTED_IP_HEADER: "x-vercel-forwarded-for",
              EMAIL_TRANSPORT: "smtp",
              SMTP_URL: "smtp://127.0.0.1:1025",
              BETTER_AUTH_URL: authURL,
              APP_URL: authURL,
              BETTER_AUTH_SECRET: secretJetable(),
              RATE_LIMIT_HMAC_SECRET: secretJetable(),
              PORT: String(AUTH_PORT),
              HOSTNAME: "127.0.0.1",
              [SERVER_LOG_ENV]: serverLogPath({ port: AUTH_PORT, tmpDir: tmpdir() }),
            },
          },
          {
            // Même build, connexion réelle et adaptateur `api` (B6b) : mêmes variables que le serveur `auth`, plus
            // `DATA_ADAPTER=api`. `RELECTURES_SOURCE` n'est pas posée : la garde de 0100 § 5.3 garde le double en `ci`.
            // B4b (spécification B4, B4b point 4 ; décision 0097 B4-TL-8 point 4) : paiement simulé en base
            // (`PAYMENT_ADAPTER=simulated`, choix d'adaptateur posé ici comme `DATA_ADAPTER` et `AUTH_ADAPTER`) ; ce serveur
            // seul pose alors le drapeau du webhook simulé et un secret de signature tiré au hasard à chaque exécution
            // (jamais dans un workflow, 0020 § 2.3) ; l'application construite (`NODE_ENV=production`) ouvre la garde par
            // `VADROUILLE_DEMO_PAYMENT=1`, comme le serveur principal.
            command: serve,
            url: apiURL,
            reuseExistingServer: false,
            timeout: 180_000,
            stdout: "pipe" as const,
            stderr: "pipe" as const,
            env: {
              AUTH_ADAPTER: "better-auth",
              DATA_ADAPTER: "api",
              ...PAIEMENT_SIMULE_API,
              // M6c (revue de la PR 1024, bloquant 2 du Tech Lead) : durées des rappels accélérées pour le test sur le monde
              // local du Workflow SDK (`tests/e2e/rappels-api.api.spec.ts`) ; une seconde réelle vaut une demi-heure.
              // Refusée hors de `local` et `ci` par `src/server/env/index.ts`.
              RAPPELS_ACCELERATION: "1800",
              VADROUILLE_ENV: "ci",
              TRUSTED_IP_HEADER: "x-vercel-forwarded-for",
              EMAIL_TRANSPORT: "smtp",
              SMTP_URL: "smtp://127.0.0.1:1025",
              BETTER_AUTH_URL: apiURL,
              APP_URL: apiURL,
              BETTER_AUTH_SECRET: secretJetable(),
              RATE_LIMIT_HMAC_SECRET: secretJetable(),
              PORT: String(API_PORT),
              HOSTNAME: "127.0.0.1",
              [SERVER_LOG_ENV]: serverLogPath({ port: API_PORT, tmpDir: tmpdir() }),
            },
          },
        ]
      : []),
  ],
});
