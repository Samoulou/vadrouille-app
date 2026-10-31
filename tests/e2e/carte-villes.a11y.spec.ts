import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { VILLES, choix, ouvrir } from "./carte-villes-helpers";

/**
 * M4-suite-carte, critère 10 de la décision 0150 : axe (WCAG 2.2 AA) sans violation sur le Séjour à deux et à trois villes
 * (« Toutes les villes » et une ville) et sur la Journée J3 (chaque moitié), carte simulée.
 */

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(results.violations).toEqual([]);
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

for (const [jeu, ville] of [
  ["rome-florence", "Florence"],
  ["rome-florence-venise", "Venise"],
] as const) {
  test(`M4-suite-carte: accessibilité, Séjour ${jeu} (toutes les villes, puis ${ville})`, async ({ page }) => {
    await ouvrir(page, VILLES(jeu));
    await expectAxeClean(page);
    await choix(page).getByRole("radio", { name: ville }).click();
    await expect(choix(page).getByRole("radio", { name: ville })).toHaveAttribute("aria-checked", "true");
    await expectAxeClean(page);
  });
}

test("M4-suite-carte: accessibilité, Journée J3 (chaque moitié)", async ({ page }) => {
  await ouvrir(page, VILLES("rome-florence", "/jour/3"));
  await expectAxeClean(page);
  await choix(page).getByRole("radio", { name: "Florence" }).click();
  await expect(choix(page).getByRole("radio", { name: "Florence" })).toHaveAttribute("aria-checked", "true");
  await expectAxeClean(page);
});
