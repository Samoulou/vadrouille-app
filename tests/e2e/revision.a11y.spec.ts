import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import {
  DEV_FICHE_JARDIN,
  DEV_REPLACE_DEAN,
  FICHE_JARDIN,
  REPLACE_DEAN,
  applyButton,
  askButton,
  askProposal,
  moveSheet,
  openMoveSheet,
  previewMoveToJ4,
  reasons,
  replaceTitle,
} from "./revision-helpers";
import { TRIP, expectSheetAt, openTrip, sheet } from "./sejour-helpers";

/**
 * Axe (WCAG 2.2 AA) et cibles tactiles sur les états livrés par F7a (spécification F7, C6) : écran 14 vide, erreur de
 * raison, proposition affichée, aucune option, hors ligne, étape verrouillée ; Journée surlignée avec le toast.
 */

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Chaque lien et bouton visible de `main` mesure au moins 44 × 44 px ; un seul titre de niveau 1. */
async function expectTargetsAndSingleH1(page: Page) {
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button, main [role='radio'], main textarea"))
      .filter((el) => !el.closest(".sr-only") && !el.classList.contains("sr-only"))
      .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ name, box }) => `${name} (${box.width} × ${box.height})`),
  );
  expect(small).toEqual([]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test("revision: aucune violation axe, écran 14 vide puis erreur de raison", async ({ page }) => {
  await openTrip(page, REPLACE_DEAN);
  await expect(replaceTitle(page)).toBeFocused();
  await expectNoViolations(page);
  await askButton(page).click();
  await expect(reasons(page)).toBeFocused();
  await expectNoViolations(page);
  await expectTargetsAndSingleH1(page);
});

test("revision: aucune violation axe, proposition affichée (carte simulée, panneau à 92 %)", async ({ page }) => {
  await openTrip(page, DEV_REPLACE_DEAN);
  await askProposal(page, "Pas mon style", "une dégustation");
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Agrandir le panneau" }).click();
  await expectSheetAt(page, 0.92);
  await expectNoViolations(page);
  await expectTargetsAndSingleH1(page);
});

test("revision: aucune violation axe, aucune option", async ({ page }) => {
  await openTrip(page, `/voyages/${TRIP}/jour/2/remplacer/j2-royal-mile`);
  await reasons(page).getByRole("radio", { name: "Trop chargé" }).click();
  await askButton(page).click();
  await expect(sheet(page).locator("[data-part='bandeau-aucune-option']")).toBeFocused();
  await expectNoViolations(page);
});

test("revision: aucune violation axe, hors ligne", async ({ page, context }) => {
  await openTrip(page, REPLACE_DEAN);
  await askProposal(page, "Trop cher");
  await context.setOffline(true);
  await expect(applyButton(page)).toHaveAttribute("aria-disabled", "true");
  await expectNoViolations(page);
  await context.setOffline(false);
});

test("revision: aucune violation axe, étape verrouillée", async ({ page }) => {
  await openTrip(page, `/voyages/${TRIP}/jour/1/remplacer/j1-tattoo`);
  await expect(sheet(page).locator("[data-part='verrouillee']")).toBeVisible();
  await expectNoViolations(page);
  await expectTargetsAndSingleH1(page);
});

test("revision: aucune violation axe, Journée après « Appliquer » (surlignage et toast)", async ({ page }) => {
  await openTrip(page, DEV_REPLACE_DEAN);
  await askProposal(page, "Pas mon style");
  await applyButton(page).click();
  await expect(page.locator("[data-undo-toast]")).toContainText("Modifié.");
  await expect(page.locator("#liste-etapes [data-highlighted='true']")).toHaveCount(1);
  await expectNoViolations(page);
  await expectTargetsAndSingleH1(page);
});

/** Feuille « Déplacer » (portail hors de `main`) : chaque bouton et radio visible mesure au moins 44 × 44 px. */
/** Ouvre une fiche (`?etape=`) : le panneau est alors la région « Fiche étape » ; sur /dev, attend la carte simulée. */
async function openFiche(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("region", { name: "Fiche étape", exact: true }).getByRole("heading", { level: 1 })).toBeVisible();
  if (path.startsWith("/dev/")) await expect(page.locator("[data-renderer='simulated']")).toHaveAttribute("data-zoom", /\d+/);
}

async function expectSheetTargets(page: Page) {
  const small = await moveSheet(page).evaluate((root) =>
    Array.from(root.querySelectorAll<HTMLElement>("a[href], button, [role='radio']"))
      .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ name, box }) => `${name} (${box.width} × ${box.height})`),
  );
  expect(small).toEqual([]);
}

test("revision: aucune violation axe, feuille « Déplacer » ouverte avec des jours complets", async ({ page }) => {
  await openFiche(page, FICHE_JARDIN);
  await openMoveSheet(page);
  await expectNoViolations(page);
  await expectSheetTargets(page);
  // Le reste de la page est masqué aux technologies d'assistance pendant la feuille modale : un seul `h1` dans le DOM.
  await expect(page.locator("h1")).toHaveCount(1);
});

test("revision: aucune violation axe, feuille « Déplacer » avec points et aperçu (carte simulée)", async ({ page }) => {
  await openFiche(page, DEV_FICHE_JARDIN);
  await openMoveSheet(page);
  await previewMoveToJ4(page);
  await expectNoViolations(page);
  await expectSheetTargets(page);
});

test("revision: aucune violation axe, Journée après un déplacement (surlignage et toast)", async ({ page }) => {
  await openFiche(page, DEV_FICHE_JARDIN);
  await openMoveSheet(page);
  await previewMoveToJ4(page);
  await moveSheet(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(page.locator("[data-undo-toast]")).toContainText("Étape déplacée.");
  await expect(page.locator("#liste-etapes [data-highlighted='true']")).toHaveCount(1);
  await expectNoViolations(page);
  await expectTargetsAndSingleH1(page);
});
