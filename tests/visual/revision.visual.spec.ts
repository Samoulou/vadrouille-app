import { expect, test, type Page } from "@playwright/test";

import { messages } from "../../src/i18n";
import { blockGoogle } from "../e2e/carte-helpers";
import {
  DEV_FICHE_JARDIN,
  DEV_REPLACE_DEAN,
  applyButton,
  askProposal,
  moveDays,
  moveSheet,
  openMoveSheet,
  placeHere,
  previewMoveToJ4,
  replaceTitle,
} from "../e2e/revision-helpers";
import { TRIP, expectSheetAt, openTrip, sheet } from "../e2e/sejour-helpers";

/**
 * Captures de F7a en 390 × 844 (références de la CI, décision 0004) : écran 14 vide, proposition affichée (panneau
 * à 55 % puis à 92 % pour « Ce qui change » et « Ce qui ne bouge pas »), étape verrouillée, Journée après
 * « Appliquer » (surlignage et toast), section « Révision » de /dev/composants. Carte simulée : aucune donnée Google.
 */

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  // Pas de contour de focus dans la capture.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page).toHaveScreenshot(name);
}

/** Fait défiler le contenu du panneau (pas la page) jusqu'à `selector`, en haut de la zone visible. */
async function scrollSheetTo(page: Page, selector: string) {
  await sheet(page)
    .locator("[data-part='contenu']")
    .evaluate((body, target) => {
      const element = body.querySelector(target);
      if (element) body.scrollTop += element.getBoundingClientRect().top - body.getBoundingClientRect().top;
    }, selector);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blockGoogle(page);
});

test("Écran 14, Remplacer [Dean Village], vide", async ({ page }) => {
  await openTrip(page, DEV_REPLACE_DEAN);
  await expect(replaceTitle(page)).toBeFocused();
  await capture(page, "revision-remplacer-vide.png");
});

test("Écran 14, proposition affichée, panneau à 55 % puis à 92 %", async ({ page }) => {
  await openTrip(page, DEV_REPLACE_DEAN);
  await askProposal(page, "Pas mon style", "une dégustation");
  await capture(page, "revision-remplacer-proposition.png");
  await page.getByRole("button", { name: "Agrandir le panneau" }).click();
  await expectSheetAt(page, 0.92);
  await scrollSheetTo(page, "[data-part='ce-qui-change']");
  await capture(page, "revision-remplacer-ce-qui-change.png");
});

test("Écran 14, étape verrouillée", async ({ page }) => {
  await openTrip(page, `/dev/voyages/${TRIP}/jour/1/remplacer/j1-tattoo`);
  await expect(sheet(page).locator("[data-part='verrouillee']")).toBeVisible();
  await capture(page, "revision-remplacer-verrouillee.png");
});

test("Journée après « Appliquer » : surlignage et toast", async ({ page }) => {
  await page.clock.install();
  await openTrip(page, DEV_REPLACE_DEAN);
  await askProposal(page, "Pas mon style");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
  await applyButton(page).click();
  await expect(page.locator("[data-undo-toast]")).toContainText("Modifié.");
  await expect(page.locator("#liste-etapes [data-highlighted='true']")).toHaveCount(1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page).toHaveScreenshot("revision-journee-appliquee.png");
});

test("section « Révision » de /dev/composants", async ({ page }) => {
  await page.goto("/dev/composants");
  await page.evaluate(() => document.fonts.ready);
  const section = page.getByRole("region", { name: messages.dev.composants.exemples.revision.titre, exact: true });
  await expect(section).toBeVisible();
  await expect(section).toHaveScreenshot("dev-composants-revision.png");
});

/** Ouvre la fiche de « [Jardin botanique royal] » sur la carte simulée (panneau « Fiche étape »). */
async function openFicheJardin(page: Page) {
  await page.goto(DEV_FICHE_JARDIN);
  await expect(page.getByRole("region", { name: "Fiche étape", exact: true }).getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-renderer='simulated']")).toHaveAttribute("data-zoom", /\d+/);
}

test("Feuille « Déplacer » : jours, J4 cochée avec ses points", async ({ page }) => {
  await openFicheJardin(page);
  await openMoveSheet(page);
  await capture(page, "revision-deplacer-jours.png");
  await moveDays(page).getByRole("radio", { name: "Jour 4", exact: true }).click();
  await expect(placeHere(page, "15:45")).toBeVisible();
  await capture(page, "revision-deplacer-points.png");
});

test("Feuille « Déplacer » : aperçu du déplacement vers J4", async ({ page }) => {
  await openFicheJardin(page);
  await openMoveSheet(page);
  await previewMoveToJ4(page);
  await moveSheet(page).locator("[data-part='apercu']").scrollIntoViewIfNeeded();
  await capture(page, "revision-deplacer-apercu.png");
});

test("groupe radio « Vers quel jour ? » de /dev/composants : focus sur un jour complet", async ({ page }) => {
  await page.goto("/dev/composants");
  await page.evaluate(() => document.fonts.ready);
  const group = page.getByRole("radiogroup", { name: "Vers quel jour ?" }).first();
  await group.getByRole("radio", { name: "Jour 2", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Jour 3, complet" })).toBeFocused();
  await expect(group).toHaveScreenshot("dev-composants-jours-focus-complet.png");
});
