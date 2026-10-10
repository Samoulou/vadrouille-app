import { expect, test } from "@playwright/test";

import { CATALOGUE_PATH, NOT_FOUND_PATHS, NOT_FOUND_TITLE, openErrorPage } from "../e2e/etats-helpers";

/** Captures 390 × 844 de F11c (spécification F11, C5 ; références de la CI, décision 0004). */

test("etats : page introuvable", async ({ page }) => {
  await page.goto(NOT_FOUND_PATHS[0]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOT_FOUND_TITLE);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("etats-introuvable.png");
});

test("etats : page d'erreur", async ({ page }) => {
  await openErrorPage(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("etats-erreur.png");
});

test("etats : catalogue des états", async ({ page }) => {
  await page.goto(CATALOGUE_PATH);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("États transverses");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("etats-catalogue.png", { fullPage: true });
});
