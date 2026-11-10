import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { FICHE_JARDIN_DEBLOQUE, openReportSheet, reportSheet } from "./signalement-helpers";

/**
 * Axe (WCAG 2.2 AA) et cibles tactiles de la feuille « Signaler une erreur » (tâche M5c, ticket 904 ; spécification M5,
 * critère 33) : feuille ouverte, puis erreur « sans motif ».
 */

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Chaque bouton et radio visible de la feuille mesure au moins 44 × 44 px. */
async function expectSheetTargets(page: Page) {
  const small = await reportSheet(page).evaluate((root) =>
    Array.from(root.querySelectorAll<HTMLElement>("a[href], button, [role='radio']"))
      .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ name, box }) => `${name} (${box.width} × ${box.height})`),
  );
  expect(small).toEqual([]);
}

test("signalement: aucune violation axe, feuille « Signaler une erreur » ouverte", async ({ page }) => {
  await openReportSheet(page, FICHE_JARDIN_DEBLOQUE);
  await expectNoViolations(page);
  await expectSheetTargets(page);
});

test("signalement: aucune violation axe, feuille avec l'erreur « sans motif »", async ({ page }) => {
  await openReportSheet(page, FICHE_JARDIN_DEBLOQUE);
  await reportSheet(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(reportSheet(page).getByRole("alert")).toHaveText("Choisis ce qui ne va pas.");
  await expectNoViolations(page);
  await expectSheetTargets(page);
});
