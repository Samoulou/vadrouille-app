import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { EDIMBOURG, R1, continueButton, fillTrip, installClock } from "./creation-helpers";
import { COMPOSTELLE_FLORENCE, ROME_FLORENCE, expectNoHorizontalOverflow, sheet } from "./plusieurs-villes-helpers";

/**
 * M4c, critère 22 de la spécification M4 : axe (WCAG 2.2 AA) sans violation sur l'écran 1 avec 3 villes et une erreur
 * de ville, Séjour à 2 villes, la journée du changement de ville, l'écran 5 d'un voyage avec un changement de ville et
 * l'écran 6 d'un voyage à 2 villes ; cibles de 44 × 44 px de l'écran 1 ; titres de ville de niveau 3 non focalisables.
 */

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

async function expectTarget(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test("plusieurs-villes: écran 1 avec 3 villes et une erreur de ville", async ({ page }) => {
  await installClock(page);
  await page.goto(R1);
  await fillTrip(page, { ...EDIMBOURG, destination: "Rome" });
  const ajouter = page.getByRole("button", { name: "Ajouter une ville" });
  await ajouter.click();
  await expect(page.getByLabel("Nom de la ville", { exact: true }).first()).toBeFocused();
  await expect(page.locator("[data-part='annonce-villes']")).toHaveText("Ville 2 ajoutée.");
  await page.getByLabel("Nom de la ville", { exact: true }).first().fill("Florence");
  await page.getByLabel("Arrivée dans cette ville", { exact: true }).first().fill("2026-08-31");
  await ajouter.click();
  await page.getByLabel("Nom de la ville", { exact: true }).nth(1).fill("Rome");
  // Arrivée de la troisième ville laissée vide : erreur de ville, reliée à son champ.
  for (const groupe of await page.getByRole("radiogroup", { name: "As-tu déjà un logement ?" }).all()) {
    await groupe.getByRole("radio", { name: "Pas encore" }).click();
  }
  await continueButton(page).click();
  const arrivee = page.getByLabel("Arrivée dans cette ville", { exact: true }).nth(1);
  await expect(arrivee).toHaveAttribute("aria-invalid", "true");
  await expect(arrivee).toHaveAccessibleDescription(/.+/);
  await expect(page.getByText("Pour changer de ville, ajoute ton billet", { exact: false })).toBeVisible();
  await expect(ajouter).toHaveAttribute("aria-disabled", "true");

  await expectAxeClean(page);
  await expectTarget(page, ajouter);
  for (const retirer of await page.getByRole("main").getByRole("button", { name: /^Retirer/ }).all()) await expectTarget(page, retirer);
  for (const champ of await page.getByLabel(/^(Nom de la ville|Arrivée dans cette ville)$/).all()) await expectTarget(page, champ);
  await expectNoHorizontalOverflow(page);
});

test("plusieurs-villes: Séjour à 2 villes", async ({ page }) => {
  await page.goto(ROME_FLORENCE);
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  for (const titre of await page.getByRole("heading", { level: 3 }).all()) {
    await expect(titre).not.toHaveAttribute("tabindex");
  }
  await expectAxeClean(page);
});

test("plusieurs-villes: journée du changement de ville", async ({ page }) => {
  await page.goto(`${ROME_FLORENCE}/jour/3`);
  await expect(page.locator("li[data-type='transfer']")).toBeAttached();
  await expectAxeClean(page);
});

test("plusieurs-villes: écran 5 d'un voyage avec un changement de ville", async ({ page }) => {
  await page.goto(`${COMPOSTELLE_FLORENCE}/preparation`);
  await expect(page.locator("[data-part='legende-ville']").first()).toBeVisible();
  await expectAxeClean(page);
});

test("plusieurs-villes: écran 6 d'un voyage à 2 villes", async ({ page }) => {
  await page.goto(`${ROME_FLORENCE}/presentation`);
  await expect(page.locator("[data-part='carte'] [data-part='ville']")).toBeVisible();
  await expectAxeClean(page);
});
