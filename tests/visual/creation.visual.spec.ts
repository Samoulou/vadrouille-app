import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "../e2e/carte-helpers";
import { EDIMBOURG, R1, STORY, continueButton, fillTrip, installClock, reachBrief, reachReview } from "../e2e/creation-helpers";

/**
 * Captures des écrans 1 et 2 de la création en 390 × 844 (références de la CI, décision 0004), mêmes états que
 * `creation.a11y.spec.ts`. Rendus provisoires (F8-Q1, décision 0018 § 15 et § 16).
 */

async function capture(page: Page, name: string, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name, { fullPage });
}

test.beforeEach(async ({ page }) => {
  await blockGoogle(page);
  await installClock(page);
});

test("creation: écran 1 vide", async ({ page }) => {
  await page.goto(R1);
  await capture(page, "creation-ecran1.png");
});

test("creation: écran 1 avec erreurs", async ({ page }) => {
  await page.goto(R1);
  await continueButton(page).click();
  await expect(page.getByText("Indique ta destination.")).toBeVisible();
  await capture(page, "creation-ecran1-erreurs.png");
});

test("creation: écran 1 avec une ville et un engagement", async ({ page }) => {
  await page.goto(R1);
  await fillTrip(page, EDIMBOURG);
  await page.getByRole("button", { name: "Ajouter une ville" }).click();
  await page.getByLabel("Nom de la ville").fill("Glasgow");
  await page.getByLabel("Arrivée dans cette ville").fill("2026-09-01");
  await page.getByRole("button", { name: "Ajouter un engagement" }).click();
  const block = page.getByRole("region", { name: "Engagements déjà pris" }).getByRole("region").first();
  await block.getByRole("radio", { name: "Billet" }).click();
  await block.getByLabel("Libellé").fill("[Tattoo]");
  await block.getByLabel("Date", { exact: true }).fill("2026-08-29");
  await block.getByLabel("Heure de début").fill("21:30");
  await capture(page, "creation-ecran1-ville-engagement.png");
});

test("creation: écran 1 après un brouillon perdu", async ({ page }) => {
  await reachBrief(page);
  await page.reload();
  await expect(page.getByText("Ton brouillon n'a pas été conservé.", { exact: false })).toBeVisible();
  await capture(page, "creation-ecran1-brouillon-perdu.png");
});

test("brief: récit", async ({ page }) => {
  await reachBrief(page);
  await capture(page, "brief-recit.png");
});

test("brief: récit avec erreur", async ({ page }) => {
  await reachBrief(page);
  await page.getByRole("button", { name: "Préparer mon brief" }).click();
  await expect(page.getByText("Écris au moins une phrase, ou remplis le brief toi-même.")).toBeVisible();
  await capture(page, "brief-recit-erreur.png");
});

test("brief: récit, bandeau d'erreur de la préparation", async ({ page }) => {
  await reachBrief(page);
  // Appel de l'action serveur interrompu (même bandeau qu'une erreur de structuration).
  await page.route("**/voyages/nouveau/brief", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await page.getByRole("textbox", { name: "Raconte ton voyage en quelques phrases" }).fill(STORY);
  await page.getByRole("button", { name: "Préparer mon brief" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Impossible de préparer ton brief pour le moment.");
  await capture(page, "brief-recit-bandeau-erreur.png");
});

test("brief: vérification avec champs déduits", async ({ page }) => {
  await reachBrief(page);
  await reachReview(page);
  await capture(page, "brief-verification-deduite.png");
});

test("brief: vérification remplie soi-même, sections ouvertes", async ({ page }) => {
  await reachBrief(page);
  await page.getByRole("button", { name: "Remplir moi-même" }).click();
  for (const name of [/^Déplacements/, /^À limiter/, /^Budget par repas/]) await page.getByRole("button", { name }).click();
  await page.getByRole("radio", { name: "Tranquille" }).click();
  await page.getByRole("group", { name: "Envies" }).getByRole("button", { name: "Musées" }).click();
  await capture(page, "brief-verification-ouverte.png");
});
