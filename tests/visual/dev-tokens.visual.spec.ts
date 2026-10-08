import { expect, test } from "@playwright/test";

test("/dev/tokens en 390 × 844 correspond à la capture de référence", async ({ page }) => {
  await page.goto("/dev/tokens");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-color-token="page"] [data-token-value]')).not.toBeEmpty();
  await expect(page).toHaveScreenshot("dev-tokens.png", { fullPage: true });
});
