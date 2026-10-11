import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "../e2e/carte-helpers";
import { SUITE, card, dialog, openDeck, press, toast } from "../e2e/presentation-helpers";

/** Captures de la présentation en 390 × 844 (références de la CI, décision 0004). */

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name);
}

test.beforeEach(async ({ page }) => {
  await blockGoogle(page);
  // Le toast reste affiché le temps de la capture.
  await page.clock.install();
});

test("présentation : première carte", async ({ page }) => {
  await openDeck(page);
  await capture(page, "presentation-premiere-carte.png");
});

test("présentation : carte repas et toast", async ({ page }) => {
  await openDeck(page);
  await press(page, "J'aime");
  await expect(card(page)).toContainText("option 1 sur 2");
  await expect(toast(page)).toBeVisible();
  // Le focus reste sur le bouton : on le retire pour une capture stable.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await capture(page, "presentation-carte-repas-toast.png");
});

test("présentation : carte à plus de 20 min", async ({ page }) => {
  await openDeck(page);
  for (const day of [1, 2, 4]) await press(page, `Tout garder pour le jour ${day}`);
  await press(page, "J'aime");
  await expect(card(page).locator("[data-part='trajet']")).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await capture(page, "presentation-carte-trajet.png");
});

test("présentation : feuille de question", async ({ page }) => {
  await openDeck(page);
  await press(page, "Pas pour moi");
  await press(page, "Je choisis");
  await press(page, "J'aime");
  await press(page, "J'aime");
  await press(page, "J'aime");
  await press(page, "Pas pour moi");
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Trop cher" }).click();
  await dialog(page).getByRole("heading").focus();
  await capture(page, "presentation-question.png");
});

test("présentation : fin de l'aperçu", async ({ page }) => {
  await openDeck(page);
  for (const day of [1, 2, 4, 5]) await press(page, `Tout garder pour le jour ${day}`);
  await expect(page.getByRole("heading", { name: "Tu as vu tes premières propositions" })).toBeVisible();
  await capture(page, "presentation-fin-apercu.png");
});

test("présentation : suite du tri (6b)", async ({ page }) => {
  await openDeck(page, SUITE);
  await capture(page, "presentation-suite-du-tri.png");
});
