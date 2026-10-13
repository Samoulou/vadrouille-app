import { expect, test } from "@playwright/test";

import { ED, MOMENTS, openToday, setClock } from "../e2e/aujourdhui-helpers";
import {
  controlNetwork,
  expectFallback,
  waitForActiveWorker,
} from "../e2e/hors-ligne-helpers";
import {
  createLink,
  createShareScope,
  openShareSheet,
  R11,
  RP,
  RPJ,
  SHARE_TOKEN_DESACTIVE,
  SHARE_TOKEN_VALIDE,
  shareSheet,
  sheetButton,
} from "../e2e/partage-helpers";

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
    await expect(page).toHaveScreenshot(`aujourdhui-${name}.png`, {
      fullPage: true,
    });
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
  await expect(page).toHaveScreenshot("aujourdhui-hors-ligne.png", {
    fullPage: true,
  });
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
    await expect(page).toHaveScreenshot("hors-ligne-repli.png", {
      fullPage: true,
    });
    await setOffline(false);
  });
});

/**
 * Feuille « Partager », `RP`, `RPJ` et 404 de la vue partagée (F10c ; rendus provisoires UX/UI, F10-Q5, écrans non
 * maquettés, Q12). Portée de simulation au 2026-08-30 par test. Le champ du lien créé contient un jeton aléatoire :
 * il est masqué dans la capture. Références `partage-*.png` générées par la CI (décision 0004) ; captures de revue
 * correspondantes dans `docs/ux/captures/F10c/`.
 */
test.describe("partage", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await createShareScope(context, baseURL!);
  });

  test("partage : feuille, lien actif", async ({ page }) => {
    await page.goto(R11());
    await openShareSheet(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("partage-feuille-actif.png");
  });

  test("partage : feuille, confirmation de désactivation", async ({ page }) => {
    await page.goto(R11());
    await openShareSheet(page);
    await sheetButton(page, "Désactiver le lien").click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("partage-feuille-confirmation.png");
  });

  test("partage : feuille, lien créé", async ({ page }) => {
    await page.goto(R11());
    await openShareSheet(page);
    await sheetButton(page, "Désactiver le lien").click();
    await sheetButton(page, "Désactiver").click();
    await createLink(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("partage-feuille-lien-cree.png", {
      mask: [shareSheet(page).getByRole("textbox")],
    });
  });

  for (const [name, path] of [
    ["sejour", RP(SHARE_TOKEN_VALIDE)],
    ["jour-2", RPJ(SHARE_TOKEN_VALIDE, 2)],
    ["jour-6", RPJ(SHARE_TOKEN_VALIDE, 6)],
    ["invalide", RP(SHARE_TOKEN_DESACTIVE)],
  ] as const) {
    test(`partage : vue partagée, ${name}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`partage-vue-${name}.png`);
    });
  }
});
