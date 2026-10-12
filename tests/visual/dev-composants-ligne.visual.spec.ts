import { expect, test } from "@playwright/test";

test("section « Ligne » de /dev/composants en 390 × 844 correspond à la capture de référence", async ({ page }) => {
  await page.goto("/dev/composants");
  await page.evaluate(() => document.fonts.ready);
  const ligne = page.getByRole("region", { name: "Ligne", exact: true });
  await expect(ligne).toBeVisible();
  await expect(ligne).toHaveScreenshot("dev-composants-ligne.png");
});
