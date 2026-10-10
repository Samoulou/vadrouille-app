import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { CATALOGUE_PATH, NOT_FOUND_PATHS, blockExternal, expectPageBasics, openErrorPage } from "./etats-helpers";

/** Axe (WCAG 2.2 AA) sur la page introuvable, la page d'erreur et le catalogue des états (F11c, critère C3). */

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

for (const path of NOT_FOUND_PATHS) {
  test(`etats: aucune violation axe, page introuvable (${path})`, async ({ page }) => {
    await page.goto(path);
    await expectPageBasics(page);
    await expectNoViolations(page);
  });
}

test("etats: aucune violation axe, page d'erreur", async ({ page }) => {
  await openErrorPage(page);
  await expectPageBasics(page);
  await expectNoViolations(page);
});

test("etats: aucune violation axe, catalogue des états", async ({ page }) => {
  await page.goto(CATALOGUE_PATH);
  await expectPageBasics(page);
  await expectNoViolations(page);
});
