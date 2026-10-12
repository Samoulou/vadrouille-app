import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "../e2e/carte-helpers";
import { LARGE_SCREEN, SIZES, rectOf, tripSheet } from "../e2e/grand-ecran-helpers";
import { TRIP, dayList, ficheTitle, openTrip } from "../e2e/sejour-helpers";

/**
 * Captures de F12b à 1280 × 800 (références de la CI, décision 0004 ; noms suffixés par la taille, décision 0022
 * § 7) : Journée J2, fiche ouverte, Séjour, et Journée à 1024 × 768. Carte simulée (/dev/voyages) : aucune donnée
 * Google. Mise en page grand écran non maquettée : rendu provisoire (UX/UI, Q7, Q173).
 */

test.use(LARGE_SCREEN);

async function capture(page: Page, name: string) {
  await expect.poll(async () => (await rectOf(tripSheet(page))).width).toBe(420);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(name);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blockGoogle(page);
});

test("Grand écran, Journée J2", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await capture(page, "grand-ecran-voyage-jour-2-1280x800.png");
});

test("Grand écran, fiche de Dean Village", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await dayList(page).getByRole("link", { name: /\[Dean Village\]/ }).click();
  await expect(ficheTitle(page)).toBeFocused();
  // Capture sans le contour de focus du titre (état de repos).
  await ficheTitle(page).evaluate((el) => (el as HTMLElement).blur());
  await capture(page, "grand-ecran-voyage-fiche-dean-1280x800.png");
});

test("Grand écran, Séjour", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}`);
  await capture(page, "grand-ecran-voyage-sejour-1280x800.png");
});

test("Grand écran au seuil, Journée J2", async ({ page }) => {
  await page.setViewportSize(SIZES.threshold);
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await capture(page, "grand-ecran-voyage-jour-2-1024x768.png");
});
