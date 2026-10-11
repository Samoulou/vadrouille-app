import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { TRIP, expectSheetAt, fiche, openTrip, sheet } from "./sejour-helpers";

/** Axe (WCAG 2.2 AA) sur les écrans livrés par F5a et F5b : Journée (J2, J5, J6 en préparation), panneau à chaque hauteur, Séjour, Fiche étape. */

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test("sejour: aucune violation axe, Journée J2 (carte simulée, panneau à 55 %)", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await expectNoViolations(page);
});

test("sejour: aucune violation axe, Journée J2, « Surprends-moi » ouvert", async ({ page }) => {
  await openTrip(page, `/voyages/${TRIP}/jour/2`);
  await sheet(page).getByRole("button", { name: "Surprends-moi" }).click();
  await expect(sheet(page).getByRole("heading", { level: 3 })).toBeVisible();
  await expectNoViolations(page);
});

test("sejour: aucune violation axe, Journée J5 avec le bandeau de trajet", async ({ page }) => {
  await openTrip(page, `/voyages/${TRIP}/jour/5`);
  await expect(sheet(page).locator("[data-kind='travel']")).toBeVisible();
  await expectNoViolations(page);
});

test("sejour: aucune violation axe, jour en préparation", async ({ page }) => {
  await openTrip(page, "/voyages/mock_trip_edimbourg_debloque/jour/6");
  await expectNoViolations(page);
});

test("sejour: aucune violation axe, panneau à 92 % puis à 25 %", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/2`);
  await page.getByRole("button", { name: "Agrandir le panneau" }).click();
  await expectSheetAt(page, 0.92);
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Réduire le panneau" }).click();
  await expectSheetAt(page, 0.25);
  await expectNoViolations(page);
});

test("sejour: aucune violation axe, Séjour (vue d'ensemble)", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}`);
  await expectNoViolations(page);
});

// F5b : Fiche étape (étape, étape verrouillée, événement), toast d'annulation affiché.
test("fiche: aucune violation axe, fiche de Dean Village (carte simulée, marqueur sélectionné)", async ({ page }) => {
  await page.goto(`/dev/voyages/${TRIP}/jour/2?etape=j2-dean-village`);
  await expect(fiche(page).getByRole("heading", { level: 1 })).toHaveText("[Dean Village]");
  await expect(page.locator("[data-renderer='simulated'] [aria-current='true']")).toHaveCount(1);
  await expectNoViolations(page);
});

test("fiche: aucune violation axe, étape verrouillée (Tattoo) et toast « Verrou retiré. »", async ({ page }) => {
  await page.goto(`/voyages/${TRIP}/jour/1?etape=j1-tattoo`);
  await expect(fiche(page).locator("[data-part='verrou']")).toBeVisible();
  await expectNoViolations(page);
  await fiche(page).getByRole("button", { name: "Verrouiller" }).click();
  await expect(page.locator("[data-undo-toast]")).toContainText("Verrou retiré.");
  await expectNoViolations(page);
});

test("fiche: aucune violation axe, fiche d'un événement (concert du J2)", async ({ page }) => {
  await page.goto(`/voyages/${TRIP}/jour/2?etape=j2-concert-orgue`);
  await expect(fiche(page)).toContainText("Proposé pendant ton séjour, pas dans ton programme.");
  await expectNoViolations(page);
});

test("fiche: aucune violation axe, fiche à 92 % et à 25 %", async ({ page }) => {
  await page.goto(`/dev/voyages/${TRIP}/jour/2?etape=j2-dean-village`);
  await expect(fiche(page).getByRole("heading", { level: 1 })).toBeVisible();
  await fiche(page).getByRole("button", { name: "Agrandir le panneau" }).click();
  await expectSheetAt(page, 0.92, "Fiche étape");
  await expectNoViolations(page);
  await fiche(page).getByRole("button", { name: "Réduire le panneau" }).click();
  await expectSheetAt(page, 0.25, "Fiche étape");
  await expectNoViolations(page);
});
