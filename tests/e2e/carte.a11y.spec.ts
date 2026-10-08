import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle, list, mapRegion, openSimulated } from "./carte-helpers";

/** Axe (WCAG 2.2 AA) sur /dev/carte dans chaque état : carte simulée, sélection, remplacements, vue d'ensemble. */

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test("carte: aucune violation axe, carte simulée du jour 2", async ({ page }) => {
  await openSimulated(page);
  await expectNoViolations(page);
  expect(googleRequests).toEqual([]);
});

test("carte: aucune violation axe, étape sélectionnée", async ({ page }) => {
  await openSimulated(page);
  await list(page).locator("a[data-part='arret']").nth(2).click();
  await expect(mapRegion(page).locator("[aria-current='true']")).toHaveCount(1);
  await expectNoViolations(page);
});

test("carte: aucune violation axe, hors ligne", async ({ page, context }) => {
  await openSimulated(page);
  await context.setOffline(true);
  await expect(mapRegion(page).locator("[data-fallback]")).toBeVisible();
  await expectNoViolations(page);
  await context.setOffline(false);
});

test("carte: aucune violation axe, configuration absente", async ({ page }) => {
  await page.goto("/dev/carte?rendu=google&config=absente");
  await expect(mapRegion(page).locator("[data-fallback]")).toBeVisible();
  await expectNoViolations(page);
  expect(googleRequests).toEqual([]);
});

test("carte: aucune violation axe, erreur de chargement", async ({ page }) => {
  await page.goto("/dev/carte?rendu=google&config=factice");
  await expect(mapRegion(page).getByRole("button", { name: "Réessayer" })).toBeVisible({ timeout: 10_000 });
  await expectNoViolations(page);
});

test("carte: aucune violation axe, vue d'ensemble", async ({ page }) => {
  await page.goto("/dev/carte?vue=ensemble");
  await expect(page.getByRole("region", { name: "Carte du séjour" })).toBeVisible();
  await expectNoViolations(page);
  expect(googleRequests).toEqual([]);
});
