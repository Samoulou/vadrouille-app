import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { PROTOTYPE_TRIP, PROTOTYPE_URL, prototypeSection } from "./prototype-helpers";

/** Axe (WCAG 2.2 AA) sur le parcours prototype (spécification P0, P0b1), build de production en mode prototype. */

test.use({ baseURL: PROTOTYPE_URL });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

for (const path of ["/", `/voyages/${PROTOTYPE_TRIP}/presentation`, `/voyages/${PROTOTYPE_TRIP}`, `/voyages/${PROTOTYPE_TRIP}/jour/1`]) {
  test(`prototype: aucune violation axe sur ${path}`, async ({ page }) => {
    await blockGoogle(page);
    await page.goto(path);
    if (path === "/") await expect(prototypeSection(page)).toBeVisible();
    else await expect(page.locator("[data-part='attribution']").first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
}
