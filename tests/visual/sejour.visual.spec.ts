import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "../e2e/carte-helpers";
import { TRIP, expectSheetAt, openTrip, sheet } from "../e2e/sejour-helpers";

/**
 * Captures de F5a en 390 × 844 (références de la CI, décision 0004) : Journée J2 et J5, panneau à 25 % et
 * 92 %, « Surprends-moi », Séjour. Carte simulée (/dev/voyages) : aucune donnée Google.
 */

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(name);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blockGoogle(page);
});

test("Journée J2, panneau à 55 %", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await capture(page, "sejour-journee-j2.png");
});

test("Journée J5, bandeau de trajet", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/5`);
  await expect(sheet(page).locator("[data-kind='travel']")).toBeVisible();
  await capture(page, "sejour-journee-j5.png");
});

test("Journée J2, panneau à 92 % et « Surprends-moi » ouvert", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await page.getByRole("button", { name: "Agrandir le panneau" }).click();
  await expectSheetAt(page, 0.92);
  const button = sheet(page).getByRole("button", { name: "Surprends-moi" });
  await button.click();
  await button.evaluate((el) => (el as HTMLElement).blur());
  await expect(sheet(page).getByRole("heading", { level: 3 })).toBeVisible();
  await sheet(page)
    .locator("[data-part='contenu']")
    .evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await capture(page, "sejour-journee-j2-92.png");
});

test("Journée J2, panneau à 25 %", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await page.getByRole("button", { name: "Agrandir le panneau" }).click();
  await page.getByRole("button", { name: "Réduire le panneau" }).click();
  await expectSheetAt(page, 0.25);
  await page.getByRole("button", { name: "Agrandir le panneau" }).blur();
  await capture(page, "sejour-journee-j2-25.png");
});

test("Séjour, vue d'ensemble (contenu du panneau livré par F5c)", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}`);
  await capture(page, "sejour-sejour.png");
});
