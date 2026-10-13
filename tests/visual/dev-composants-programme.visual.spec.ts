import { expect, test } from "@playwright/test";

import * as messages from "../../src/i18n/messages";

/**
 * Capture 390 × 844 des démonstrations de F5c dans la section « Programme » de /dev/composants : les quatre
 * plaques de destination, puis `ChecklistRow` à faire, faite, sans lien et rémunérée (revue de la PR 128,
 * bloquant 2). Référence produite par la CI (décision 0004).
 */
test("section « Programme » de /dev/composants : plaques et lignes à réserver, en 390 × 844", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/composants");
  await page.evaluate(() => document.fonts.ready);
  const plaques = page.getByText(messages.dev.composants.etats.plaque, { exact: true });
  await expect(plaques).toBeVisible();
  await plaques.evaluate((label) => label.parentElement?.scrollIntoView({ block: "start" }));
  await expect(page.getByText(messages.dev.composants.etats.checklist, { exact: true })).toBeInViewport();
  await expect(page).toHaveScreenshot("dev-composants-programme.png");
});
