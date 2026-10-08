import { defineConfig } from "@playwright/test";

const PORT = 3100;
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
  },
  projects: [
    { name: "e2e", testDir: "tests/e2e", testMatch: /.*\.e2e\.spec\.ts$/ },
    { name: "a11y", testDir: "tests/e2e", testMatch: /.*\.a11y\.spec\.ts$/ },
    { name: "visual", testDir: "tests/visual", testMatch: /.*\.visual\.spec\.ts$/ },
  ],
  webServer: {
    command,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VADROUILLE_DEV_PAGES: "1", PORT: String(PORT), HOSTNAME: "127.0.0.1" },
  },
});
