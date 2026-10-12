import { expect, test } from "@playwright/test";

import { DATES, openTrips, plate, setClock } from "../e2e/mes-voyages-helpers";

/**
 * Captures 390 × 844 de « Mes voyages » (F11a ; spécification F11, C5 : captures soumises à validation, Q154),
 * aux trois dates de la spécification et avec la plaque au focus. Références de la CI (décision 0004).
 */

test.use({ timezoneId: "Europe/London" });

for (const [name, iso] of Object.entries(DATES)) {
  test(`mes-voyages : ${name} le voyage`, async ({ page }) => {
    await setClock(page, iso);
    await openTrips(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`mes-voyages-${name}.png`, { fullPage: true });
  });
}

test("mes-voyages : plaque au focus", async ({ page }) => {
  await setClock(page, DATES.avant);
  await openTrips(page);
  await page.keyboard.press("Tab");
  await expect(plate(page)).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("mes-voyages-plaque-focus.png");
});
