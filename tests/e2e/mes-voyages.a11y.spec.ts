import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockExternal, expectFocusOutlines, expectPageBasics, expectTouchTargets } from "./etats-helpers";
import { DATES, openTrips, plate, setClock } from "./mes-voyages-helpers";

/**
 * Axe (WCAG 2.2 AA) sur « Mes voyages » aux trois dates de la spécification et à l'état vide (catalogue des
 * états), cibles de 44 px, contour de focus de Ligne, un seul titre de niveau 1, `lang="fr"` (F11a, C3).
 */

test.use({ timezoneId: "Europe/London" });

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

let external: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  external = await blockExternal(page, baseURL!);
});
test.afterEach(() => {
  expect(external).toEqual([]);
});

for (const [name, iso] of Object.entries(DATES)) {
  test(`mes-voyages: aucune violation axe, ${name} le voyage (${iso.slice(0, 10)})`, async ({ page }) => {
    await setClock(page, iso);
    await openTrips(page);
    await expectPageBasics(page);
    await expectNoViolations(page);
  });
}

test("mes-voyages: cibles de 44 px et contour de focus de Ligne, plaque comprise", async ({ page }) => {
  await setClock(page, DATES.avant);
  await openTrips(page);
  await expectTouchTargets(page);
  // La plaque est le premier élément atteint au clavier ; son contour est hors de l'aplat (décalé de 2 px).
  await page.keyboard.press("Tab");
  await expect(plate(page)).toBeFocused();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expectFocusOutlines(page);
});

test("mes-voyages: aucune violation axe, état vide (catalogue des états)", async ({ page }) => {
  await page.goto("/dev/etats");
  await expect(page.getByRole("region", { name: "Aucun voyage", exact: true })).toBeVisible();
  await expectPageBasics(page);
  await expectNoViolations(page);
});
