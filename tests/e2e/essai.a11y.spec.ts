import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { useScope } from "./debloquer-helpers";
import { ESSAI_R11, ESSAI_R6, ESSAI_R9, ESSAI_URL } from "./essai-helpers";

/** Axe (WCAG 2.2 AA) sur le parcours d'un voyage d'essai non débloqué (spécification E2E-essai, lot 1), 390 × 844. */

test.use({ baseURL: ESSAI_URL });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

for (const path of [ESSAI_R6, ESSAI_R11, `${ESSAI_R11}/jour/1`, ESSAI_R9]) {
  test(`essai: aucune violation axe sur ${path}`, async ({ page, context }) => {
    await blockGoogle(page);
    await useScope(context, ESSAI_URL);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
}
