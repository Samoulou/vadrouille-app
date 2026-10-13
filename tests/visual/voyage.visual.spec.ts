import { expect, test } from "@playwright/test";

import { ED, MOMENTS, openToday, setClock } from "../e2e/aujourdhui-helpers";
import { controlNetwork, expectFallback, waitForActiveWorker } from "../e2e/hors-ligne-helpers";

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

/**
 * Page de repli hors ligne (`R-repli`, F10b ; rendu provisoire UX/UI, F10-Q5, écran non maquetté) : servie par le
 * service worker à une navigation qui échoue faute de réseau (service workers autorisés pour ce bloc, F10-TL-6).
 */
test.describe("page de repli", () => {
  test.use({ serviceWorkers: "allow" });

  test("hors-ligne : page de repli", async ({ page, context, baseURL }) => {
    const setOffline = await controlNetwork(context, baseURL!);
    await setClock(page, MOMENTS.prochaine);
    await openToday(page);
    await waitForActiveWorker(page);
    await setOffline(true);
    await page.goto(`/voyages/${ED}/jour/2`);
    await expectFallback(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("hors-ligne-repli.png", { fullPage: true });
    await setOffline(false);
  });
});
