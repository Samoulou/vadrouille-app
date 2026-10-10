import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { demoLinks } from "./accueil-helpers";

/** Axe (WCAG 2.2 AA) sur la page d'accueil et sa section « Démonstration » (spécification D1). */

test("accueil: aucune violation axe", async ({ page }) => {
  await page.goto("/");
  await expect(demoLinks(page)).toHaveCount(5);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
});
