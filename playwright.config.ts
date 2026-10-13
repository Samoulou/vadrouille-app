import { tmpdir } from "node:os";

import { defineConfig } from "@playwright/test";

import { e2ePort } from "./scripts/e2e-port.mjs";
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
    // Mesure Lighthouse (décision 0022 § 1 et § 2) : `pnpm test:perf`, hors de `pnpm verify`, un seul worker,
    // sans nouvelle tentative (elle cacherait un score instable).
    { name: "perf", testDir: "tests/perf", testMatch: /.*\.perf\.spec\.ts$/, retries: 0 },
  ],
  webServer: {
    command,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    // Sortie du serveur transmise à Playwright et recopiée dans `serverLogPath` (scripts/serve-standalone.mjs),
    // relue par les tests (spécification F8, « Aucune persistance locale »).
    stdout: "pipe",
    stderr: "pipe",
    // VADROUILLE_DEMO_PAYMENT : paiement simulé ouvert pour les tests seulement (décision 0020 § 2.3) ; seul
    // fichier versionné qui le pose (tests/unit/dev-pages-env.test.ts).
    env: {
      VADROUILLE_DEV_PAGES: "1",
      VADROUILLE_DEMO_PAYMENT: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      [SERVER_LOG_ENV]: serverLogPath({ port: PORT, tmpDir: tmpdir() }),
    },
  },
});
