import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { LIBELLE_AVEC_ESPACES } from "../../src/mocks/chevauchement";
import { VILLE_LONGUE } from "../../src/mocks/rome-florence";

import { blockGoogle } from "./carte-helpers";
import { aideChangement, bandeau, CHEVAUCHEMENT, remplirAvecBillet } from "./chevauchement-helpers";
import { installClock, R1 } from "./creation-helpers";

/**
 * Spécification M4-suite, critère 17 : axe (WCAG 2.2 AA) sans violation sur la Journée d'un changement de ville avec le
 * bandeau de chevauchement (départ estimé et billet), et sur l'écran 1 avec l'aide du billet de changement de ville.
 */

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

for (const n of [2, 4]) {
  test(`chevauchement: Journée J${n} avec le bandeau de chevauchement`, async ({ page }) => {
    await page.goto(`${CHEVAUCHEMENT}/jour/${n}`);
    await expect(bandeau(page)).toBeVisible();
    await expectAxeClean(page);
  });
}

test("chevauchement: écran 1 avec l'aide du billet de changement de ville", async ({ page }) => {
  await installClock(page);
  await page.goto(R1);
  await remplirAvecBillet(page, VILLE_LONGUE, LIBELLE_AVEC_ESPACES);
  await expect(page.getByText(/^Ce jour-là, tu changes de ville/)).toHaveText(aideChangement(VILLE_LONGUE));
  await expectAxeClean(page);
});
