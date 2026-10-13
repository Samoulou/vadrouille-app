import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

import { PROTOTYPE_PORT_OFFSET, e2ePort } from "./scripts/e2e-port.mjs";
import { SERVER_LOG_ENV, serverLogPath } from "./scripts/e2e-server-log.mjs";

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

// Tests sur le build de production, servi comme dans l'image Docker. `pnpm verify` construit une seule fois
// puis passe E2E_SKIP_BUILD=1 ; un lancement isolé reconstruit l'application.
const serve = "node scripts/serve-standalone.mjs";
const command = process.env.E2E_SKIP_BUILD ? serve : `pnpm build && ${serve}`;

export default defineConfig({
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
      // VADROUILLE_DEMO_SHARE : partage simulé, idem (décision 0039, F10-TL-7). Seul fichier versionné qui les
      // pose (tests/unit/debloquer-regles.test.ts).
      env: {
        VADROUILLE_DEV_PAGES: "1",
        VADROUILLE_DEMO_PAYMENT: "1",
        VADROUILLE_DEMO_SHARE: "1",
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
        VADROUILLE_PROTOTYPE_DIR: PROTOTYPE_DIR,
        // Compteur du relecteur simulé (`/dev/api/prototype/relectures`, décision 0032 § A6.6).
        VADROUILLE_DEV_PAGES: "1",
        PORT: String(PROTOTYPE_PORT),
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
});
