import { expect, test } from "@playwright/test";

import { VILLE_LONGUE } from "../../src/mocks/rome-florence";

import { blockGoogle } from "./carte-helpers";
import { COMPOSTELLE_FLORENCE, ROME_FLORENCE, centreVertical, expectNoHorizontalOverflow, expectNotTruncated, sheet } from "./plusieurs-villes-helpers";

/**
 * M4c (spécification M4 § 7 ; critères 13, 14, 16, 17 et 22), sur l'adaptateur `mock`, en 390 × 844 sur le build de
 * production : Rome puis Florence (`mock_trip_rome_florence`), et la même fixture avec « Saint-Jacques-de-Compostelle »
 * comme première ville pour les mesures à 390 px (critère 16 de la spécification M4-suite, test écrit par M4c).
 */

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test.describe("Séjour: jour par jour groupé par ville", () => {
  test("titres de niveau 3 « Rome · 2 nuits » et « Florence · 2 nuits », « Rome · Florence » sous la plaque, J3 sous Florence avec « Vers Florence »", async ({ page }) => {
    await page.goto(ROME_FLORENCE);
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator("[data-part='villes']")).toHaveText("Rome · Florence");
    const titres = page.getByRole("heading", { level: 3 });
    await expect(titres).toHaveText(["Rome · 2 nuits", "Florence · 2 nuits"]);
    const florence = page.locator("[data-part='jours-ville']").nth(1);
    const j3 = florence.locator("a[data-part='jour']").first();
    await expect(j3).toHaveAttribute("href", `${ROME_FLORENCE}/jour/3`);
    await expect(j3.locator("[data-part='vers-ville']")).toHaveText("Vers Florence");
  });

  test("à 390 px, avec « Saint-Jacques-de-Compostelle », aucun texte ne déborde", async ({ page }) => {
    await page.goto(COMPOSTELLE_FLORENCE);
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator("[data-part='villes']")).toHaveText(`${VILLE_LONGUE} · Florence`);
    await expect(page.getByRole("heading", { level: 3, name: `${VILLE_LONGUE} · 1 nuit` })).toBeAttached();
    await expectNotTruncated(page.locator("[data-part='villes']"));
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("Journée: ligne « Vers {ville} »", () => {
  test("J3 : ligne non focalisable « Vers Florence, … », pastille « Jour 3, lun., de Rome à Florence »", async ({ page }) => {
    await page.goto(`${ROME_FLORENCE}/jour/3`);
    await expect(sheet(page)).toBeVisible();
    const ligne = page.locator("li[data-type='transfer']");
    await expect(ligne).toHaveAttribute("aria-label", "Vers Florence, [Train Rome–Florence], 12:00 – 13:40");
    await expect(ligne.locator("a, button, [tabindex]")).toHaveCount(0);
    const pastille = page.getByRole("link", { name: "Jour 3, lun., de Rome à Florence", exact: true });
    await expect(pastille).toHaveAttribute("aria-current", "page");
    // Les autres jours ne nomment pas de ville.
    await expect(page.getByRole("link", { name: "Jour 2, dim.", exact: true })).toBeAttached();
  });

  test("à 390 px, avec « Saint-Jacques-de-Compostelle », la ligne passe à la ligne sans déborder", async ({ page }) => {
    await page.goto(`${COMPOSTELLE_FLORENCE}/jour/2`);
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator("li[data-type='transfer']")).toBeAttached();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("Écran 5: ville de chaque jour", () => {
  test("pastilles « Jour 1, Rome » et « Jour 2, de … à Florence » ; légendes visibles masquées aux lecteurs d'écran", async ({ page }) => {
    // L'écran 5 simulé montre les rangées de J1 et J2 : Rome puis Florence n'y a pas de changement de ville (J3, couvert
    // par `PreparationView.villes.test.tsx`) ; la variante au nom long change de ville à J2.
    await page.goto(`${ROME_FLORENCE}/preparation`);
    const legendes = page.locator("[data-part='legende-ville']");
    await expect(legendes).toHaveText(["Rome", "Rome"]);
    await expect(legendes.first()).toHaveAttribute("aria-hidden", "true");
    const rangees = page.getByRole("list", { name: "Jours de tes premières propositions" }).locator(":scope > li");
    await expect(rangees.nth(0).locator(".sr-only").first()).toHaveText("Jour 1, Rome");
    await expect(page.getByText(/Aperçu/)).toHaveCount(0);

    await page.goto(`${COMPOSTELLE_FLORENCE}/preparation`);
    const changement = page.getByRole("list", { name: "Jours de tes premières propositions" }).locator(":scope > li").nth(1);
    await expect(changement.locator("[data-part='legende-ville']")).toHaveText(`De ${VILLE_LONGUE} à Florence`);
    await expect(changement.locator(".sr-only").first()).toHaveText(`Jour 2, de ${VILLE_LONGUE} à Florence`);
  });

  test("Écran 5: alignement à 390 px (M4-suite, critère 16)", async ({ page }) => {
    await page.goto(`${COMPOSTELLE_FLORENCE}/preparation`);
    const rangees = page.getByRole("list", { name: "Jours de tes premières propositions" }).locator(":scope > li");
    await expect(rangees.first().locator("[data-part='legende-ville']")).toHaveText(VILLE_LONGUE);
    await page.evaluate(() => document.fonts.ready);

    const n = await rangees.count();
    expect(n).toBeGreaterThan(0);
    for (let index = 0; index < n; index += 1) {
      const rangee = rangees.nth(index);
      const [pastille, miniLigne, etat] = await Promise.all(
        [1, 2, 3].map((colonne) => centreVertical(rangee.locator(`:scope > span.row-start-2.col-start-${colonne} > *`).first())),
      );
      expect(Math.abs(pastille! - miniLigne!), `rangée ${index + 1}`).toBeLessThanOrEqual(1);
      expect(Math.abs(etat! - miniLigne!), `rangée ${index + 1}`).toBeLessThanOrEqual(1);
      await expectNotTruncated(rangee.locator("[data-part='legende-ville']"));
    }

    // « De Saint-Jacques-de-Compostelle à Florence » occupe au moins deux hauteurs de ligne.
    const changement = rangees.nth(1).locator("[data-part='legende-ville']");
    await expect(changement).toHaveText(`De ${VILLE_LONGUE} à Florence`);
    const { hauteur, ligne } = await changement.evaluate((element) => ({
      hauteur: element.getBoundingClientRect().height,
      ligne: parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(hauteur).toBeGreaterThanOrEqual(2 * ligne - 0.5);
    await expectNoHorizontalOverflow(page);
  });

  test("Édimbourg seul : aucune rangée ne nomme de ville", async ({ page }) => {
    await page.goto("/voyages/mock_trip_edimbourg/preparation");
    await expect(page.getByRole("list", { name: "Jours de tes premières propositions" })).toBeVisible();
    await expect(page.locator("[data-part='legende-ville']")).toHaveCount(0);
  });
});

test.describe("Présentation: plusieurs villes", () => {
  test("6b : la carte affiche « Jour {n} · {ville} »", async ({ page }) => {
    await page.goto(`${ROME_FLORENCE}/presentation`);
    const carte = page.locator("[data-part='carte']");
    await expect(carte).toBeVisible();
    await expect(carte.locator("[data-part='ville']")).toHaveText(/^Jour [13] · (Rome|De Rome à Florence)$/);
    await expectNoHorizontalOverflow(page);
  });
});
