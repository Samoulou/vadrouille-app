import { expect, test } from "@playwright/test";

import { demoLinks } from "../e2e/accueil-helpers";

/** Capture de la page d'accueil en 390 × 844 (spécification D1 ; références de la CI, décision 0004). */

test("accueil : haut de la page d'accueil (décision 0132), section « Démonstration » plus bas", async ({ page }) => {
  await page.goto("/");
  await expect(demoLinks(page)).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("accueil.png");
});
