import { expect, test, type Page } from "@playwright/test";

import { blockGoogle, list, mapRegion, openSimulated } from "../e2e/carte-helpers";

/** Captures de /dev/carte en 390 × 844 : carte simulée et états de remplacement (références de la CI, décision 0004). */

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name);
}

test.beforeEach(async ({ page }) => {
  await blockGoogle(page);
});

test("carte simulée, jour 2, étape 3 sélectionnée", async ({ page }) => {
  await openSimulated(page);
  await list(page).locator("a[data-part='arret']").nth(2).click();
  await expect(mapRegion(page).locator("[aria-current='true']")).toHaveCount(1);
  await capture(page, "carte-jour-2-selection.png");
});

test("carte simulée, vue d'ensemble", async ({ page }) => {
  await page.goto("/dev/carte?vue=ensemble");
  await expect(page.locator("[data-renderer='simulated']")).toHaveAttribute("data-zoom", /\d+/);
  await capture(page, "carte-vue-ensemble.png");
});

test("état de remplacement : hors ligne", async ({ page, context }) => {
  await openSimulated(page);
  await context.setOffline(true);
  await expect(mapRegion(page).locator("[data-fallback]")).toBeVisible();
  await capture(page, "carte-hors-ligne.png");
  await context.setOffline(false);
});

test("état de remplacement : configuration absente", async ({ page }) => {
  await page.goto("/dev/carte?rendu=google&config=absente");
  await expect(mapRegion(page).locator("[data-fallback]")).toBeVisible();
  await capture(page, "carte-configuration-absente.png");
});

test("état de remplacement : erreur de chargement", async ({ page }) => {
  await page.goto("/dev/carte?rendu=google&config=factice");
  await expect(mapRegion(page).getByRole("button", { name: "Réessayer" })).toBeVisible({ timeout: 10_000 });
  await capture(page, "carte-erreur-chargement.png");
});
