import { expect, test } from "@playwright/test";

import { MOMENTS, openToday, setClock } from "../e2e/aujourdhui-helpers";

/**
 * Captures 390 × 844 de l'écran 15 « Aujourd'hui » (F10a ; rendus provisoires UX/UI, F10-Q5, écran non
 * maquetté, Q12), aux états du balayage d'accessibilité. Références de la CI (décision 0004).
 */

test.use({ timezoneId: "Europe/London" });

const STATES: [string, string][] = [
  ["prochaine", MOMENTS.prochaine],
  ["en-cours", MOMENTS.enCours],
  ["temps-libre", MOMENTS.tempsLibre],
  ["plus-d-etape", MOMENTS.plusDEtape],
  ["avant", MOMENTS.avant],
  ["veille", MOMENTS.veille],
  ["apres", MOMENTS.apres],
];

for (const [name, iso] of STATES) {
  test(`aujourdhui : ${name}`, async ({ page }) => {
    await setClock(page, iso);
    await openToday(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`aujourdhui-${name}.png`, { fullPage: true });
  });
}

test("aujourdhui : première vue, prochaine étape", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("aujourdhui-premiere-vue.png");
});

test("aujourdhui : hors ligne", async ({ page, context }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await context.setOffline(true);
  await expect(page.locator("#aujourdhui-hors-ligne")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("aujourdhui-hors-ligne.png", { fullPage: true });
  await context.setOffline(false);
});
