import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "../e2e/carte-helpers";
import { AUTH_CONFIG, MOCK_WRONG_CODE, codeAlert, connexionRoute, emailField, pasteCode, requestCodeFor } from "../e2e/connexion-helpers";
import { EDIMBOURG, R1, R3_DEV, STORY, continueButton, fillTrip, installClock, reachAfterBrief, reachBrief, reachReview } from "../e2e/creation-helpers";
import { useScope } from "../e2e/debloquer-helpers";

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

// F8b : écrans 3 et 4 (rendus provisoires, F8-Q1 ; 0018 § 17 et § 18). Adresse fixe dans une portée propre au test.
const EMAIL = "camille@exemple.ch";

test("logement: quartier et logements, configuration absente", async ({ page }) => {
  await reachAfterBrief(page);
  await expect(page.getByRole("button", { name: "Partir du quartier, choisir plus tard" })).toBeVisible();
  await capture(page, "logement-quartier.png");
});

test("logement: carte simulée (R3-dev)", async ({ page }) => {
  await page.goto(R3_DEV);
  await expect(page.locator("[data-part='zone']")).toBeVisible();
  await capture(page, "logement-carte-simulee.png");
});

test("logement: aucun quartier", async ({ page }) => {
  await reachAfterBrief(page, { ...EDIMBOURG, destination: "Glasgow" });
  await expect(page.getByText("Aucun quartier à te proposer pour l'instant.")).toBeVisible();
  await capture(page, "logement-aucun-quartier.png");
});

test("connexion: étape email", async ({ page }) => {
  await page.goto(connexionRoute("/voyages/nouveau/lancer"));
  await expect(emailField(page)).toBeVisible();
  await capture(page, "connexion-email.png");
});

test("connexion: email invalide", async ({ page }) => {
  await page.goto(connexionRoute("/voyages/nouveau/lancer"));
  await emailField(page).fill("camille@");
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");
  await capture(page, "connexion-email-erreur.png");
});

test("connexion: étape code", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await page.goto(connexionRoute("/voyages/nouveau/lancer"));
  await requestCodeFor(page, EMAIL);
  await capture(page, "connexion-code.png");
});

test("connexion: code faux", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await page.goto(connexionRoute("/voyages/nouveau/lancer"));
  await requestCodeFor(page, EMAIL);
  await pasteCode(page, MOCK_WRONG_CODE);
  await expect(codeAlert(page)).not.toHaveText("");
  await capture(page, "connexion-code-faux.png");
});

test("connexion: trop d'essais", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await page.goto(connexionRoute("/voyages/nouveau/lancer"));
  await requestCodeFor(page, EMAIL);
  for (let attempt = 1; attempt <= AUTH_CONFIG.maxAttempts; attempt += 1) {
    await expect(page.getByRole("textbox", { name: "Chiffre 1 sur 6" })).toBeEnabled();
    await pasteCode(page, MOCK_WRONG_CODE);
    await expect(codeAlert(page)).not.toHaveText("");
  }
  await expect(codeAlert(page)).toHaveText(/^Trop d'essais/);
  await capture(page, "connexion-trop-d-essais.png");
});
