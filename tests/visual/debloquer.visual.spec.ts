import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "../e2e/carte-helpers";
import { R11, R9, R9_ECHEC, R9_RETOUR, expectPath, main, openOffer, simulate, startPayment, useScope } from "../e2e/debloquer-helpers";

/**
 * Captures de F9a en 390 × 844 (références de la CI, décision 0004) : écran 9 (non débloqué, page entière,
 * après un refus, déjà débloqué), paiement simulé, confirmation (attente, attente longue).
 */

async function capture(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name, { fullPage });
}

test.beforeEach(async ({ page }) => {
  await blockGoogle(page);
});

test("débloquer : écran 9", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await capture(page, "debloquer-offre.png");
  await capture(page, "debloquer-offre-page.png", true);
});

test("débloquer : écran 9 après un refus", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await startPayment(page, "card");
  await simulate(page, "Simuler un refus");
  await expectPath(page, R9_ECHEC);
  await expect(main(page).getByRole("alert")).toBeVisible();
  await capture(page, "debloquer-refus.png");
});

test("débloquer : voyage déjà débloqué", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await startPayment(page, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R11);
  await openOffer(page, R9);
  await expect(page.getByRole("heading", { level: 1, name: "Ton voyage est débloqué" })).toBeVisible();
  await capture(page, "debloquer-deja-debloque.png");
});

test("débloquer : paiement simulé", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await startPayment(page, "twint");
  await capture(page, "debloquer-paiement-simule.png");
});

test("débloquer : confirmation en attente, puis attente longue", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await scope.control({ action: "configurePayment", confirmationDelayMs: 600_000 });
  await page.clock.install();
  await openOffer(page);
  await startPayment(page, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R9_RETOUR);
  await expect(page.getByRole("heading", { level: 1, name: "On confirme ton paiement" })).toBeVisible();
  await capture(page, "debloquer-confirmation-attente.png");
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("link", { name: "Voir mes premières propositions" })).toBeVisible();
  await capture(page, "debloquer-confirmation-attente-longue.png");
});
