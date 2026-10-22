import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { continueButton, field, fillTrip, installClock, R1, R2, R3, R_LANCER, storyField } from "./creation-helpers";
import { expectPath } from "./debloquer-helpers";
import { PROTOTYPE_URL } from "./prototype-helpers";

/**
 * Spécification E2E-essai, lot 2 : la saisie sans détour sur le site d'essai, sur le build de production servi en
 * mode prototype (390 × 844). Garde du mode réel fermée sur ce serveur de test (aucun réglage `p0-reel`) : `R-lancer`
 * annonce que le lancement n'est pas ouvert, sans erreur ; la saisie du code et le lancement (lot 3) sont couverts par
 * les tests unitaires (`LaunchEssai.test.tsx`). Aucune requête vers Google, aucun appel de modèle.
 */

test.use({ baseURL: PROTOTYPE_URL });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const ROME = { destination: "Rome", start: "2026-08-29", end: "2026-09-03", lodging: "Pas encore" as const };
const RECIT = "On part à deux. On aime les ruines antiques, les trattorias de quartier et marcher le soir.";

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
  await installClock(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

async function sansViolation(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("site d'essai : de l'accueil au lancement, écrans 1 à 3 sans message d'erreur ni détour", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Créer un voyage" }).click();
  // Écran 1 prérendu (décision 0032 § A6.2) : le site d'essai lui est dit par l'adresse.
  await expect(page).toHaveURL(`${R1}?site=essai`);
  await expect(page.getByRole("button", { name: "Ajouter une ville" })).toHaveCount(0);

  // Écran 1 : une ville hors table est refusée au champ ; Rome est admise.
  await fillTrip(page, { ...ROME, destination: "Atlantide" });
  await continueButton(page).click();
  await expect(field(page, "Destination")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Cette ville n'est pas encore disponible sur le site d'essai.", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(`${R1}?site=essai`);
  await field(page, "Destination").fill(ROME.destination);
  await continueButton(page).click();
  await expectPath(page, R2);

  // Écran 2 : le bouton principal mène à la vérification, récit gardé, sans bandeau.
  await storyField(page).fill(RECIT);
  await page.getByRole("button", { name: "Vérifier mon brief" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vérifie ton brief" })).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: /.+/ })).toHaveCount(0);
  await page.getByRole("radio", { name: "Équilibré" }).click();
  await page.getByRole("group", { name: "Envies" }).getByRole("button", { name: "Musées", exact: true }).click();
  await continueButton(page).click();

  // Écran 3 : « Pas encore » propose « Continuer sans logement », sans bandeau ni carte.
  await expectPath(page, R3);
  await expect(page.getByText("Pas de suggestion de logement sur le site d'essai.", { exact: false })).toBeVisible();
  await expect(page.locator("[data-area-map]")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: /.+/ })).toHaveCount(0);
  await sansViolation(page);
  await page.getByRole("button", { name: "Continuer sans logement" }).click();

  // `R-lancer` atteint sans l'écran 4 ; garde fermée sur ce serveur : annonce, jamais une erreur.
  await expectPath(page, R_LANCER);
  await expect(page.getByRole("heading", { level: 1, name: "Ton brouillon est prêt" })).toBeVisible();
  await expect(page.getByText("Le lancement n'est pas ouvert sur ce site.", { exact: false })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert").filter({ hasText: /.+/ })).toHaveCount(0);
  await sansViolation(page);

  // « Retour » : brouillon gardé.
  await page.getByRole("button", { name: "Retour" }).click();
  await expectPath(page, R3);
});

test("site d'essai : écran 1 ouvert sans site=essai, un écran 1 hors règles est renvoyé par l'écran 2, saisie gardée", async ({ page }) => {
  await page.goto(R1);
  await fillTrip(page, { ...ROME, destination: "Atlantide" });
  await continueButton(page).click();
  await expect(page).toHaveURL(`${R1}?site=essai`);
  await expect(field(page, "Destination")).toHaveValue("Atlantide");
  await continueButton(page).click();
  await expect(field(page, "Destination")).toHaveAttribute("aria-invalid", "true");
  await sansViolation(page);
});
