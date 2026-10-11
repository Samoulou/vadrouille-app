import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { R9, R9_ECHEC, R9_RETOUR, expectPath, main, openOffer, simulate, startPayment, useScope } from "./debloquer-helpers";

/**
 * Axe (WCAG 2.2 AA), cibles de 44 × 44 px, contour de focus et titre de niveau 1 unique sur chaque état de
 * F9a : écran 9 (non débloqué, après un refus, déjà débloqué), paiement simulé, confirmation (attente,
 * attente longue).
 */

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  // Chaque élément interactif mesure au moins 44 × 44 px.
  const controls = main(page).locator("a, button");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const box = await control.boundingBox();
    const label = (await control.getAttribute("aria-label")) ?? (await control.textContent());
    expect(box, label ?? "").not.toBeNull();
    expect(box!.width, label ?? "").toBeGreaterThanOrEqual(44);
    expect(box!.height, label ?? "").toBeGreaterThanOrEqual(44);
  }

  // Contour de focus : 2 px `line`, décalé de 2 px, au clavier, sur chaque élément interactif.
  const line = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim());
  await page.locator("body").focus();
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Tab");
    const style = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const s = getComputedStyle(element);
      const rgb = s.outlineColor.match(/\d+/g)!.slice(0, 3).map(Number);
      return {
        width: s.outlineWidth,
        style: s.outlineStyle,
        offset: s.outlineOffset,
        color: `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
      };
    });
    if (style === null) continue;
    expect(style).toEqual({ width: "2px", style: "solid", offset: "2px", color: line });
  }
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test("debloquer: aucune violation axe, écran 9 non débloqué", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await expectAccessible(page);
});

test("debloquer: aucune violation axe, écran 9 après un refus", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await startPayment(page, "card");
  await simulate(page, "Simuler un refus");
  await expectPath(page, R9_ECHEC);
  await expect(main(page).getByRole("alert")).toBeVisible();
  await expectAccessible(page);
});

test("debloquer: aucune violation axe, voyage déjà débloqué", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await startPayment(page, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, `/voyages/mock_trip_edimbourg`);
  await openOffer(page, R9);
  await expect(page.getByRole("heading", { level: 1, name: "Ton voyage est débloqué" })).toBeVisible();
  await expectAccessible(page);
});

test("debloquer: aucune violation axe, paiement simulé", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await startPayment(page, "twint");
  await expectAccessible(page);
});

test("debloquer: aucune violation axe, confirmation en attente puis attente longue", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await scope.control({ action: "configurePayment", confirmationDelayMs: 600_000 });
  await page.clock.install();
  await openOffer(page);
  await startPayment(page, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R9_RETOUR);
  await expect(page.getByRole("heading", { level: 1, name: "On confirme ton paiement" })).toBeVisible();
  await expect(main(page).getByRole("status")).toHaveText("Confirmation du paiement en cours.");
  // Aucun élément interactif pendant l'attente : axe et titre seulement.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  await page.clock.fastForward(31_000);
  await expect(page.getByRole("link", { name: "Voir mes premières propositions" })).toBeVisible();
  await expectAccessible(page);
});
