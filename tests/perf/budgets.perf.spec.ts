import { expect, test, type Browser } from "@playwright/test";

import { ROUTE_PREPARATIONS } from "../e2e/route-states";
import { ROUTES, type RouteEntry } from "../e2e/routes";
import {
  ACCESSIBILITY_REQUIRED,
  PERFORMANCE_THRESHOLD,
  THRESHOLD_RUNS,
  formatRun,
  launchForLighthouse,
  median,
  resetReports,
  runLighthouse,
  type LighthouseTarget,
} from "./lighthouse-helpers";

/**
 * Mesure Lighthouse de l'inventaire (F12-PO-1 à F12-PO-3, critères C5, C6 et C9, décision 0022 § 1 et § 2),
 * profil mobile, build de production, jeu simulé, domaines Google bloqués. Lancée par `pnpm test:perf`
 * (projet `perf`, un seul worker, sans nouvelle tentative), hors de `pnpm verify` ; étape du job `verify` en CI.
 * Rapports HTML et JSON dans `lighthouse-report/` (artefact `lighthouse` de la CI, jamais publié ailleurs).
 *
 * - `perf: budgets du § 14` : entrées `lighthouse: "seuil"` (R11, R12), 3 passages, médiane de la performance
 *   ≥ 90, accessibilité = 100 à chaque passage.
 * - `perf: inventaire` : les autres entrées, 1 passage, accessibilité = 100 ; le reste journalisé.
 * Sur chaque passage : aucune requête vers un autre hôte que l'application (Google bloqué compris).
 */

test.describe.configure({ mode: "serial" });

let browser: Browser;
let port: number;

test.beforeAll(async () => {
  resetReports();
  ({ browser, port } = await launchForLighthouse());
});

test.afterAll(async () => {
  await browser?.close();
});

async function targetOf(route: RouteEntry, baseURL: string): Promise<LighthouseTarget> {
  const target: LighthouseTarget = { id: route.id, url: new URL(route.path, baseURL).href, status: route.status ?? 200 };
  if (!route.prepare) return target;
  const context = await browser.newContext({ baseURL });
  const prepared = await ROUTE_PREPARATIONS[route.prepare](await context.newPage(), baseURL);
  await context.close();
  return { ...target, url: new URL(prepared.path, baseURL).href, scope: prepared.scope };
}

async function measure(route: RouteEntry, baseURL: string, runs: number) {
  const target = await targetOf(route, baseURL);
  const results = [];
  for (let run = 1; run <= runs; run++) {
    const result = await runLighthouse(port, target, run);
    console.log(formatRun(result));
    expect(result.runtimeError, `${route.id} passage ${run}`).toBeNull();
    expect(result.foreignRequests, `${route.id} passage ${run} : requêtes hors de l'application`).toEqual([]);
    expect(result.scores.accessibility, `${route.id} passage ${run} : accessibilité`).toBe(ACCESSIBILITY_REQUIRED);
    results.push(result);
  }
  return results;
}

test.describe("perf: budgets du § 14", () => {
  for (const route of ROUTES.filter((entry) => entry.budgets.lighthouse === "seuil")) {
    test(`${route.id} ${route.path}`, async ({ baseURL }) => {
      test.setTimeout(THRESHOLD_RUNS * 120_000);
      const results = await measure(route, baseURL!, THRESHOLD_RUNS);
      const performance = results.map((result) => result.scores.performance ?? 0);
      const spread = Math.max(...performance) - Math.min(...performance);
      console.log(`${route.id} performance : ${performance.join(", ")} ; médiane ${median(performance)} ; écart ${spread}`);
      expect(median(performance), `${route.id} : médiane de la performance`).toBeGreaterThanOrEqual(PERFORMANCE_THRESHOLD);
    });
  }
});

test.describe("perf: inventaire", () => {
  for (const route of ROUTES.filter((entry) => entry.budgets.lighthouse === "journal")) {
    test(`${route.id} ${route.path}`, async ({ baseURL }) => {
      test.setTimeout(180_000);
      await measure(route, baseURL!, 1);
    });
  }
});
