import { expect, test } from "@playwright/test";

test("/dev/composants en 390 × 844 correspond à la capture de référence", async ({ page }) => {
  await page.goto("/dev/composants");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("region", { name: "StatusBanner" })).toBeVisible();
  await expect(page).toHaveScreenshot("dev-composants.png", { fullPage: true });
});
