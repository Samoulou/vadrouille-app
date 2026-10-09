import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import {
  TRIP,
  VIEWPORT_HEIGHT,
  body,
  dayList,
  dayMarkers,
  expectSheetAt,
  fiche,
  ficheTitle,
  fullyInside,
  listStops,
  openTrip,
  sheet,
} from "./sejour-helpers";

/**
 * Critères F5b (spécification F5, critères [b] et transverses) : Fiche étape, verrou, `ReasonBlock`,
 * ajouts à `DayLine`, en 390 × 844 sur le build de production. Les critères qui touchent la carte
 * s'exécutent sur /dev/voyages (carte simulée, F5-TL-1) ; les autres sur /voyages.
 */

const JOUR2 = `/voyages/${TRIP}/jour/2`;
const DEV_JOUR2 = `/dev/voyages/${TRIP}/jour/2`;
const DEAN = "j2-dean-village";
const CONCERT = "j2-concert-orgue";

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  // Aucune requête vers un domaine Google pendant les specs de F5.
  expect(googleRequests).toEqual([]);
});

const deanLink = (page: Page) => dayList(page).getByRole("link", { name: /\[Dean Village\]/ });
const selectedMarkers = (page: Page) => page.locator("[data-renderer='simulated'] [aria-current='true']");

/** Ouvre la fiche de Dean Village depuis la ligne du jour de J2. */
async function openDeanFromList(page: Page, base: string) {
  await deanLink(page).click();
  await expect(page).toHaveURL(`${base}?etape=${DEAN}`);
  await expect(ficheTitle(page)).toHaveText("[Dean Village]");
}

test.describe("Fiche étape", () => {
  test("fiche: ouverture, focus et carte", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    await openDeanFromList(page, DEV_JOUR2);
    await expect(fiche(page)).toBeVisible();
    await expect(ficheTitle(page)).toBeFocused();
    const marker = dayMarkers(page).nth(1);
    await expect(marker).toHaveAccessibleName(/^Étape 2 : \[Dean Village\]/);
    await expect(marker).toHaveAttribute("aria-current", "true");
    await expect(selectedMarkers(page)).toHaveCount(1);
    // Centre du marqueur au milieu de la zone de carte au-dessus du panneau, à 1 px près (décision 0016 § 2).
    await expectSheetAt(page, 0.55, "Fiche étape");
    const box = (await marker.boundingBox())!;
    const sheetTop = (await fiche(page).boundingBox())!.y;
    expect(box.y + box.height / 2).toBeLessThan(sheetTop);
    expect(Math.abs(box.y + box.height / 2 - (VIEWPORT_HEIGHT - 0.55 * VIEWPORT_HEIGHT) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.x + box.width / 2 - 390 / 2)).toBeLessThanOrEqual(1);
  });

  test("fiche: ouverture panneau à 25 % : le panneau passe à 55 %", async ({ page }) => {
    await openTrip(page, JOUR2);
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await page.getByRole("button", { name: "Réduire le panneau" }).click();
    await expectSheetAt(page, 0.25);
    await deanLink(page).click();
    await expect(ficheTitle(page)).toBeFocused();
    await expectSheetAt(page, 0.55, "Fiche étape");
  });

  test("fiche: contenu", async ({ page }) => {
    await openTrip(page, JOUR2);
    await openDeanFromList(page, JOUR2);
    const panel = fiche(page);
    await expect(panel.locator("[data-part='moment']")).toHaveText("J2 · Dimanche 30 août · 10:50 – 11:50");
    await expect(panel.locator("[data-part='meta']")).toHaveText("[Water of Leith, 1 h, gratuit]");
    await expect(panel.getByRole("region", { name: "Pour y aller" })).toContainText("À pied, 20 min depuis [Royal Mile]");
    await expect(panel.locator("[data-part='raison-simple']")).toHaveText(
      "[Tu as choisi les balades : un village au bord de l'eau en pleine ville]",
    );
    await expect(panel.locator("[data-part='raison']")).toHaveCount(0);
    await expect(page).toHaveTitle("[Dean Village] · Jour 2");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("[Dean Village]");
    const axe = await new AxeBuilder({ page }).withRules(["page-has-heading-one"]).analyze();
    expect(axe.violations).toEqual([]);

    await openTrip(page, `/voyages/${TRIP}/jour/5`);
    await listStops(page).filter({ hasText: "[Distillerie accessible en bus]" }).click();
    await expect(ficheTitle(page)).toHaveText("[Distillerie accessible en bus]");
    const reason = fiche(page).locator("[data-part='raison']");
    await expect(reason).toContainText("Pourquoi pour toi");
    await expect(reason.getByRole("link", { name: "Source : [Site de la distillerie]" })).toHaveAttribute(
      "href",
      "https://example.org/mock/distillerie",
    );
    await expect(reason).toContainText("Source consultée le 15 août 2026");
    await expect(fiche(page).getByRole("region", { name: "Pour y aller" })).toContainText(
      "Bus, environ 50 min (estimation) depuis [Petite adresse de Chambers Street]",
    );
  });

  for (const how of ["Fermer", "Échap", "retour du navigateur"] as const) {
    test(`fiche: fermeture et retour du focus (${how})`, async ({ page }) => {
      await openTrip(page, `/dev/voyages/${TRIP}`);
      await sheet(page).getByRole("link", { name: "Jour 2, dim." }).click();
      await expect(page).toHaveURL(DEV_JOUR2);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
      await openDeanFromList(page, DEV_JOUR2);
      if (how === "Fermer") await fiche(page).getByRole("button", { name: "Fermer" }).click();
      else if (how === "Échap") await page.keyboard.press("Escape");
      else await page.goBack();
      await expect(page).toHaveURL(DEV_JOUR2);
      await expect(fiche(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
      await expect(listStops(page)).toHaveCount(5);
      await expect(deanLink(page)).toBeFocused();
      await expect(selectedMarkers(page)).toHaveCount(0);
      await expect(page).toHaveTitle("Édimbourg · Jour 2");
      if (how !== "retour du navigateur") {
        // La fiche était une entrée d'historique : le retour suivant mène au Séjour, sans rouvrir la fiche.
        await page.goBack();
        await expect(page).toHaveURL(`/dev/voyages/${TRIP}`);
        await expect(fiche(page)).toHaveCount(0);
      }
    });
  }

  test("fiche: ouverture directe", async ({ page }) => {
    await page.goto(`${JOUR2}?etape=${DEAN}`);
    await expect(ficheTitle(page)).toHaveText("[Dean Village]");
    await expect(ficheTitle(page)).toBeFocused();
    await expect(page).toHaveTitle("[Dean Village] · Jour 2");
    const length = await page.evaluate(() => history.length);
    await fiche(page).getByRole("button", { name: "Fermer" }).click();
    await expect(page).toHaveURL(JOUR2);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await expect(deanLink(page)).toBeFocused();

    await page.goto(`${JOUR2}?etape=inconnue`);
    await expect(page).toHaveURL(JOUR2);
    await expect(fiche(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
    await expect(sheet(page).locator("[data-part='annonce-etape']")).toHaveText("Cette étape n'est plus dans ce jour.");
    await expect(sheet(page).locator("[data-part='annonce-etape']")).toHaveAttribute("role", "status");
  });

  test("fiche: verrouiller et annuler", async ({ page }) => {
    await page.clock.install();
    await openTrip(page, JOUR2);
    await openDeanFromList(page, JOUR2);
    const panel = fiche(page);
    const lock = panel.getByRole("button", { name: "Verrouiller" });
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    await expect(panel.getByRole("link", { name: "Remplacer" })).toBeVisible();

    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator("[data-part='verrou']")).toHaveText(
      "Étape verrouillée : elle ne bougera pas quand tu modifies ton programme.",
    );
    await expect(panel.getByRole("link", { name: "Remplacer" })).toHaveCount(0);
    const toast = page.locator("[data-undo-toast]");
    await expect(toast).toContainText("Étape verrouillée.");
    await expect(page.locator("[data-undo-region]")).toHaveAttribute("role", "status");
    await expect(lock).toBeFocused();

    // « Annuler » dans les 5 s : état exact rétabli, « Remplacer » revient, focus sur « Verrouiller ».
    await toast.getByRole("button", { name: "Annuler" }).click();
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    await expect(panel.locator("[data-part='verrou']")).toHaveCount(0);
    await expect(panel.getByRole("link", { name: "Remplacer" })).toBeVisible();
    await expect(lock).toBeFocused();
    await expect(toast).toHaveCount(0);

    // Verrou posé de nouveau : mention dans la ligne du jour (nom accessible compris) ; le toast disparaît à 5 000 ms.
    await lock.click();
    await expect(toast).toContainText("Étape verrouillée.");
    await page.clock.runFor(4_900);
    await expect(toast).toHaveCount(1);
    await page.clock.runFor(100);
    await expect(toast).toHaveCount(0);
    await fiche(page).getByRole("button", { name: "Fermer" }).click();
    await expect(deanLink(page)).toBeFocused();
    await expect(deanLink(page)).toHaveAccessibleName(/Verrouillée/);
    await expect(deanLink(page).locator("[data-part='verrou']")).toHaveText("Verrouillée");
    // Le verrou reste en mémoire d'un jour à l'autre.
    await sheet(page).getByRole("link", { name: "Jour 3, lun." }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lundi 31 août");
    await sheet(page).getByRole("link", { name: "Jour 2, dim." }).click();
    await expect(deanLink(page)).toHaveAccessibleName(/Verrouillée/);
  });

  test("fiche: Tattoo verrouillé dans les données, déverrouillé avec « Verrou retiré. »", async ({ page }) => {
    await page.goto(`/voyages/${TRIP}/jour/1?etape=j1-tattoo`);
    await expect(ficheTitle(page)).toHaveText("[Royal Edinburgh Military Tattoo]");
    const panel = fiche(page);
    await expect(panel.locator("[data-part='verrou']")).toBeVisible();
    await expect(panel.getByRole("link", { name: "Remplacer" })).toHaveCount(0);
    const lock = panel.getByRole("button", { name: "Verrouiller" });
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-undo-toast]")).toContainText("Verrou retiré.");
    await expect(panel.getByRole("link", { name: "Remplacer" })).toBeVisible();
  });

  test("fiche: « Remplacer » est un lien vers l'écran 14, aucun « Supprimer »", async ({ page }) => {
    await page.goto(`${JOUR2}?etape=${DEAN}`);
    await expect(fiche(page).getByRole("link", { name: "Remplacer" })).toHaveAttribute(
      "href",
      `/voyages/${TRIP}/jour/2/remplacer/${DEAN}`,
    );
    await expect(fiche(page).getByText(/Supprimer/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Supprimer/ })).toHaveCount(0);
  });

  test("fiche: événement", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    const events = page.getByRole("region", { name: "Événements du jour" });
    await events.getByRole("link", { name: /\[Concert d'orgue à St Giles\]/ }).click();
    await expect(page).toHaveURL(`${DEV_JOUR2}?etape=${CONCERT}`);
    await expect(ficheTitle(page)).toHaveText("[Concert d'orgue à St Giles]");
    await expect(ficheTitle(page)).toBeFocused();
    const panel = fiche(page);
    await expect(panel).toContainText("Proposé pendant ton séjour, pas dans ton programme.");
    await expect(panel.locator("[data-part='moment']")).toContainText("18:00 – 19:00");
    await expect(panel).toContainText("Non confirmé");
    await expect(panel.getByRole("link", { name: "Remplacer" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Verrouiller" })).toHaveCount(0);
    await expect(selectedMarkers(page)).toHaveCount(0);
    await panel.getByRole("button", { name: "Fermer" }).click();
    await expect(page).toHaveURL(DEV_JOUR2);
    await expect(page.getByRole("region", { name: "Événements du jour" }).getByRole("link", { name: /Concert d'orgue/ })).toBeFocused();
  });

  test("fiche: cibles d'au moins 44 × 44 px, toast compris", async ({ page }) => {
    await page.goto(`/dev/voyages/${TRIP}/jour/5?etape=j5-distillerie`);
    await expect(ficheTitle(page)).toBeFocused();
    await fiche(page).getByRole("button", { name: "Verrouiller" }).click();
    await expect(page.locator("[data-undo-toast]")).toBeVisible();
    await fiche(page).getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.92, "Fiche étape");
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button"))
        .filter((el) => !el.closest(".sr-only") && !el.classList.contains("sr-only"))
        .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
        .map(({ name, box }) => `${name} (${box.width} × ${box.height})`),
    );
    expect(small).toEqual([]);
  });

  test("journee: marqueur ferme la fiche et fait défiler la liste", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    await openDeanFromList(page, DEV_JOUR2);
    const length = await page.evaluate(() => history.length);
    const marker = dayMarkers(page).nth(0);
    await expect(marker).toHaveAccessibleName(/^Étape 1 :/);
    await marker.click();
    await expect(page).toHaveURL(DEV_JOUR2);
    await expect(fiche(page)).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await expect.poll(() => fullyInside(listStops(page).nth(0), body(page))).toBe(true);
    await expect(marker).toHaveAttribute("aria-current", "true");
    await expect(selectedMarkers(page)).toHaveCount(1);
    await expect(marker).toBeFocused();
    await expect(deanLink(page)).not.toBeFocused();
  });
});
