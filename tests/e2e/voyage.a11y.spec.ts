import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ED, MOMENTS, openToday, region, setClock } from "./aujourdhui-helpers";
import { blockExternal, expectFocusOutlines, expectPageBasics, expectTouchTargets } from "./etats-helpers";
import { controlNetwork, expectFallback, FALLBACK_TITLE, R_REPLI, waitForActiveWorker } from "./hors-ligne-helpers";

/**
 * Axe (WCAG 2.2 AA) sur l'écran 15 « Aujourd'hui » (`R15`, F10a, C2) : en cours, temps libre, plus d'étape,
 * avant et après le voyage, rappels, hors ligne ; cibles de 44 px, contour de focus de Ligne, un seul titre de
 * niveau 1, `lang="fr"`. F10b et F10c ajoutent ici `R-repli`, la feuille « Partager », `RP` et `RPJ`.
 */

test.use({ timezoneId: "Europe/London" });

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

let external: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  external = await blockExternal(page, baseURL!);
});
test.afterEach(() => {
  expect(external).toEqual([]);
});

const STATES: [string, string][] = [
  ["rappels et prochaine étape", MOMENTS.prochaine],
  ["en cours", MOMENTS.enCours],
  ["temps libre", MOMENTS.tempsLibre],
  ["plus d'étape", MOMENTS.plusDEtape],
  ["avant le voyage", MOMENTS.avant],
  ["après le voyage", MOMENTS.apres],
];

for (const [name, iso] of STATES) {
  test(`aujourdhui: aucune violation axe, ${name}`, async ({ page }) => {
    await setClock(page, iso);
    await openToday(page);
    await expectPageBasics(page);
    await expectNoViolations(page);
  });
}

test("aujourdhui: aucune violation axe, hors ligne", async ({ page, context }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await context.setOffline(true);
  await expect(page.locator("#aujourdhui-hors-ligne")).toBeVisible();
  await expectNoViolations(page);
  await context.setOffline(false);
});

test("aujourdhui: cibles de 44 px et contour de focus de Ligne", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await expect(region(page, "Prochaine étape")).toBeVisible();
  await expectTouchTargets(page);
  await expectFocusOutlines(page);
});

/**
 * Page de repli hors ligne (`R-repli`, F10b) : ouverte directement, et servie par le service worker à une
 * navigation qui échoue faute de réseau (service workers autorisés pour ce bloc, F10-TL-6).
 */
test.describe("page de repli", () => {
  test.use({ serviceWorkers: "allow" });

  test("hors-ligne: aucune violation axe, page de repli ouverte directement", async ({ page }) => {
    await page.goto(R_REPLI);
    await expect(page.getByRole("heading", { level: 1, name: FALLBACK_TITLE })).toBeVisible();
    await expectPageBasics(page);
    await expectNoViolations(page);
    await expectTouchTargets(page);
    await expectFocusOutlines(page);
  });

  test("hors-ligne: aucune violation axe, page de repli servie hors ligne", async ({ page, context, baseURL }) => {
    const setOffline = await controlNetwork(context, baseURL!);
    await setClock(page, MOMENTS.prochaine);
    await openToday(page);
    await waitForActiveWorker(page);
    await setOffline(true);
    await page.goto(`/voyages/${ED}/jour/2`);
    await expectFallback(page);
    await expectPageBasics(page);
    await expectNoViolations(page);
    await setOffline(false);
  });
});
