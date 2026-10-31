import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { AJOUTER_DEBLOQUE, AJOUTER_NON_DEBLOQUE, previewAdd, results, search } from "./ajouter-helpers";
import { sheet } from "./sejour-helpers";

/**
 * Axe (WCAG 2.2 AA) et cibles tactiles de « Ajouter un lieu » (tâche M5d-2 ; spécification M5, critère 33) : ouverture,
 * résultats, nom et moment, aperçu, voyage non débloqué.
 */

async function expectNoViolations(page: Page) {
  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(resultats.violations).toEqual([]);
}

/** Chaque bouton, lien, champ et radio visible du panneau mesure au moins 44 px de haut et de large. */
async function expectTargets(page: Page) {
  const small = await sheet(page)
    .locator("[data-part='ajouter']")
    .evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>("a[href], button, input, [role='radio']"))
        .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.id, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
        .map(({ name, box }) => `${name} (${box.width} × ${box.height})`),
    );
  expect(small).toEqual([]);
}

test("ajouter: aucune violation axe, écran ouvert puis résultats", async ({ page }) => {
  await page.goto(AJOUTER_DEBLOQUE);
  await expectNoViolations(page);
  await search(page, "librairie");
  await results(page).getByRole("radio").first().click();
  await expectNoViolations(page);
  await expectTargets(page);
});

test("ajouter: aucune violation axe, aperçu affiché", async ({ page }) => {
  await page.goto(AJOUTER_DEBLOQUE);
  await previewAdd(page, "Ma librairie");
  await expectNoViolations(page);
  await expectTargets(page);
});

test("ajouter: aucune violation axe, voyage non débloqué", async ({ page }) => {
  await page.goto(AJOUTER_NON_DEBLOQUE);
  await expect(sheet(page).getByText("Tu pourras ajouter tes propres lieux une fois ton voyage débloqué.")).toBeVisible();
  await expectNoViolations(page);
});
