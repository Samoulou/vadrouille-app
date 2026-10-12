import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { LARGE_SCREEN, SIZES, rectOf, tripSheet } from "./grand-ecran-helpers";
import { TRIP, dayList, ficheTitle, openTrip } from "./sejour-helpers";

/**
 * Critère C16 de F12b : axe sans violation à 1280 × 800 (souris, sans toucher) sur le Séjour, la Journée et la fiche
 * ouverte ; contour de focus de Ligne ; cibles d'au moins 44 × 44 px ; un seul titre de niveau 1 par état.
 * Les pages de F7 (Remplacer, Ajouter un lieu, Déplacer) ne sont pas dans `main` au démarrage de F12b.
 */

test.use(LARGE_SCREEN);

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Disposition latérale posée (panneau de 420 px), avant toute mesure. */
async function expectSide(page: Page) {
  await expect.poll(async () => (await rectOf(tripSheet(page))).width).toBe(420);
}

/** Cibles visibles d'au moins 44 × 44 px (mêmes règles que la spec mobile de F5 : liens d'évitement exclus au repos). */
async function expectTargets(page: Page) {
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button"))
      .filter((el) => !el.closest(".sr-only") && !el.classList.contains("sr-only"))
      .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ name, box }) => `${name} (${box.width} × ${box.height})`),
  );
  expect(small).toEqual([]);
}

/** Les `steps` premières tabulations : chaque élément focalisé a le contour de Ligne (2 px `line`, décalé de 2 px). */
async function expectFocusOutlines(page: Page, steps: number) {
  await page.locator("body").focus();
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.color = "var(--color-line)";
      document.body.append(probe);
      const line = getComputedStyle(probe).color;
      probe.remove();
      const box = el.getBoundingClientRect();
      return {
        html: el.outerHTML.slice(0, 120),
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`,
        same: style.outlineColor === line,
        visible: box.width > 0 && box.height > 0,
      };
    });
    if (!focus) break;
    expect(focus.outline, focus.html).toBe("solid 2px 2px");
    expect(focus.same, focus.html).toBe(true);
    expect(focus.visible, focus.html).toBe(true);
  }
}

test("grand-ecran-voyage: Journée J2 (carte de remplacement), axe, cibles, contour, un seul h1", async ({ page }) => {
  await openTrip(page, `/voyages/${TRIP}/jour/2`);
  await expectSide(page);
  await expectNoViolations(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expectTargets(page);
  await expectFocusOutlines(page, 20);
});

test("grand-ecran-voyage: Journée J2 (carte simulée), axe", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await expectSide(page);
  await expectNoViolations(page);
  await expectTargets(page);
});

test("grand-ecran-voyage: Séjour, axe, cibles, contour, un seul h1", async ({ page }) => {
  await openTrip(page, `/voyages/${TRIP}`);
  await expectSide(page);
  await expectNoViolations(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expectTargets(page);
  await expectFocusOutlines(page, 20);
});

test("grand-ecran-voyage: fiche ouverte (carte simulée, marqueur sélectionné), axe, cibles, un seul h1", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await dayList(page).getByRole("link", { name: /\[Dean Village\]/ }).click();
  await expect(ficheTitle(page)).toBeFocused();
  await expectSide(page);
  await expectNoViolations(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expectTargets(page);
  await expectFocusOutlines(page, 20);
});

test("grand-ecran-voyage: à 1024 × 768, Journée J2, axe", async ({ page }) => {
  await page.setViewportSize(SIZES.threshold);
  await openTrip(page, `/voyages/${TRIP}/jour/2`);
  await expectSide(page);
  await expectNoViolations(page);
});
