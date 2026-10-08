import { expect, test } from "@playwright/test";

import { COLOR_TOKENS, RADIUS_TOKENS, TEXT_STYLES } from "../../src/styles/tokens";

test.describe("/dev/tokens", () => {
  test("affiche toutes les couleurs, styles de texte et rayons du handover § 4.1", async ({ page }) => {
    await page.goto("/dev/tokens");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    for (const name of COLOR_TOKENS) {
      const row = page.locator(`[data-color-token="${name}"]`);
      await expect(row).toBeVisible();
      // La valeur affichée vient de la feuille de style compilée.
      await expect(row.locator("[data-token-value]")).toHaveText(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/);
    }
    for (const { name } of TEXT_STYLES) {
      await expect(page.locator(`[data-text-style="${name}"]`)).toBeVisible();
    }
    for (const name of RADIUS_TOKENS) {
      await expect(page.locator(`[data-radius-token="${name}"] [data-token-value]`)).toHaveText(/^\d+px$/);
    }
  });

  test("applique Hanken Grotesk et les tailles des tokens", async ({ page }) => {
    await page.goto("/dev/tokens");
    const sample = page.locator('[data-text-style="destination"] span').nth(1);
    await expect(sample).toHaveCSS("font-size", "36px");
    await expect(sample).toHaveCSS("line-height", "40px");
    await expect(sample).toHaveCSS("font-weight", "800");
    const family = await sample.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toMatch(/Hanken/);
  });

  test("tient dans 390 px sans défilement horizontal", async ({ page }) => {
    await page.goto("/dev/tokens");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
