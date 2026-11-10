import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { exporter, HORS_LIGNE, openCompte } from "./compte-helpers";
import { blockExternal, expectFocusOutlines, expectPageBasics, expectTouchTargets } from "./etats-helpers";

/**
 * Axe (WCAG 2.2 AA) sur « Ton compte » avec l'adaptateur `mock` (M9c, ticket 1122 ; spécification M9 § 6.4, critère 8) :
 * état initial, après un export, hors ligne ; cibles de 44 px, contour de focus de Ligne, un seul titre de niveau 1,
 * `lang="fr"`. Les étapes du code et de la suppression (focus sur le titre, nom accessible du bouton de suppression)
 * n'existent que sur `api` : axe dans les tests unitaires de `AccountScreen` et de `ReauthStep`.
 */

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

let external: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  external = await blockExternal(page, baseURL!);
});
test.afterEach(() => {
  expect(external).toEqual([]);
});

test("compte: aucune violation axe, état initial puis après un export", async ({ page }) => {
  await openCompte(page);
  await expectPageBasics(page);
  await expectNoViolations(page);
  const attente = page.waitForEvent("download");
  await exporter(page).click();
  await attente;
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Ton fichier est prêt.");
  await expectNoViolations(page);
});

test("compte: aucune violation axe hors ligne", async ({ page, context }) => {
  await openCompte(page);
  await context.setOffline(true);
  await expect(page.getByText(HORS_LIGNE)).toBeVisible();
  await expectPageBasics(page);
  await expectNoViolations(page);
  await context.setOffline(false);
});

test("compte: cibles de 44 px et contour de focus de Ligne", async ({ page }) => {
  await openCompte(page);
  await expectTouchTargets(page);
  await expectFocusOutlines(page);
});
