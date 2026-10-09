import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "../e2e/carte-helpers";
import { TRIP, expectSheetAt, fiche } from "../e2e/sejour-helpers";

/**
 * Captures de F5b en 390 × 844 (références de la CI, décision 0004) : fiche de Dean Village (marqueur
 * sélectionné, recentré au-dessus du panneau), fiche du Tattoo (verrouillé), fiche de la distillerie à
 * 92 % (ReasonBlock). Carte simulée (/dev/voyages) : aucune donnée Google.
 */

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  // Pas de contour de focus dans la capture : le focus initial est sur le titre de la fiche.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page).toHaveScreenshot(name);
}

async function openFiche(page: Page, n: number, stopId: string) {
  await page.goto(`/dev/voyages/${TRIP}/jour/${n}?etape=${stopId}`);
  await expect(fiche(page).getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.locator("[data-renderer='simulated']")).toHaveAttribute("data-zoom", /\d+/);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blockGoogle(page);
});

test("Fiche de Dean Village, panneau à 55 %", async ({ page }) => {
  await openFiche(page, 2, "j2-dean-village");
  await capture(page, "sejour-fiche-dean-village.png");
});

test("Fiche du Tattoo, étape verrouillée", async ({ page }) => {
  await openFiche(page, 1, "j1-tattoo");
  await expect(fiche(page).locator("[data-part='verrou']")).toBeVisible();
  await capture(page, "sejour-fiche-tattoo.png");
});

test("Fiche de la distillerie, panneau à 92 %, ReasonBlock", async ({ page }) => {
  await openFiche(page, 5, "j5-distillerie");
  await fiche(page).getByRole("button", { name: "Agrandir le panneau" }).click();
  await expectSheetAt(page, 0.92, "Fiche étape");
  await capture(page, "sejour-fiche-distillerie-92.png");
});
