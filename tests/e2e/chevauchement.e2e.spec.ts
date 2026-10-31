import { expect, test } from "@playwright/test";

import { LIBELLE_AVEC_ESPACES, LIBELLE_SANS_ESPACE } from "../../src/mocks/chevauchement";
import { VILLE_LONGUE } from "../../src/mocks/rome-florence";

import { blockGoogle } from "./carte-helpers";
import { aideChangement, bandeau, CHEVAUCHEMENT, expectNoOverflow, remplirAvecBillet } from "./chevauchement-helpers";
import { continueButton, installClock, R1, R2 } from "./creation-helpers";
import { ROME_FLORENCE, expectNoHorizontalOverflow, sheet } from "./plusieurs-villes-helpers";

/**
 * Spécification M4-suite (§ 4.2, § 5 et § 6 ; critères 12, 13 et 17), sur l'adaptateur `mock`, en 390 × 844 sur le build de
 * production : bandeau de chevauchement de la Journée (`mock_trip_chevauchement`) et aide du billet de changement de ville
 * à l'écran 1.
 */

const N = " ";
let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test.describe("Journée: bandeau de chevauchement", () => {
  test("J4 : un seul bandeau role=status, avant la ligne du jour ; « Voir les événements du jour » amène le focus sur la région", async ({ page }) => {
    await page.goto(`${CHEVAUCHEMENT}/jour/4`);
    await expect(sheet(page)).toBeVisible();
    await expect(bandeau(page)).toHaveCount(1);
    await expect(bandeau(page).locator("p")).toHaveText(
      `À 12:30, «${N}${LIBELLE_SANS_ESPACE}${N}» tombe pendant que tu te rends à Florence. Vérifie tes horaires.`,
    );
    const region = page.getByRole("region", { name: "Événements du jour" });
    // Le bandeau est rendu par le serveur : le toucher avant l'hydratation ne fait rien, d'où la reprise.
    await expect(async () => {
      await bandeau(page).getByRole("button", { name: "Voir les événements du jour" }).click();
      await expect(region).toBeFocused({ timeout: 500 });
    }).toPass();
    await expect(region).toHaveAttribute("tabindex", "-1");
  });

  test("à 390 px, un libellé de 80 caractères sans espace passe à la ligne dans le bandeau, sans débordement", async ({ page }) => {
    await page.goto(`${CHEVAUCHEMENT}/jour/4`);
    const message = bandeau(page).locator("p");
    await expect(message).toBeVisible();
    expect(await message.evaluate((element) => getComputedStyle(element).overflowWrap)).toBe("anywhere");
    // Le libellé occupe plus d'une ligne : la coupure a lieu dans le mot.
    const hauteur = await message.evaluate((element) => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight));
    expect(hauteur).toBeGreaterThanOrEqual(3);
    await expectNoOverflow(message);
    await expectNoOverflow(bandeau(page));
    await expectNoHorizontalOverflow(page);
  });

  test("à 390 px, avec « Saint-Jacques-de-Compostelle » et un libellé de 80 caractères avec espaces, le texte estimé ne déborde pas", async ({ page }) => {
    await page.goto(`${CHEVAUCHEMENT}/jour/2`);
    await expect(bandeau(page).locator("p")).toHaveText(
      `À 11:00, «${N}${LIBELLE_AVEC_ESPACES}${N}» tombe pendant que tu te rends à ${VILLE_LONGUE}, d'après la durée estimée. Vérifie tes horaires.`,
    );
    await expectNoOverflow(bandeau(page).locator("p"));
    await expectNoHorizontalOverflow(page);
  });

  test("aucun bandeau les jours ordinaires, ni le jour du changement de ville sans engagement qui chevauche, ni sur Séjour", async ({ page }) => {
    await page.goto(`${CHEVAUCHEMENT}/jour/3`);
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(bandeau(page)).toHaveCount(0);
    await page.goto(`${ROME_FLORENCE}/jour/3`);
    await expect(page.locator("li[data-type='transfer']")).toBeAttached();
    await expect(bandeau(page)).toHaveCount(0);
    await page.goto(CHEVAUCHEMENT);
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator("[data-kind='overlap']")).toHaveCount(0);
  });
});

test.describe("Écran 1: aide du billet de changement de ville", () => {
  test("reliée au « Type de réservation » après l'aide générale ; à 390 px, avec « Saint-Jacques-de-Compostelle », rien ne déborde ; n'empêche pas l'envoi", async ({ page }) => {
    await installClock(page);
    await page.goto(R1);
    await remplirAvecBillet(page, VILLE_LONGUE, LIBELLE_AVEC_ESPACES);
    const aide = page.getByText(/^Ce jour-là, tu changes de ville/);
    await expect(aide).toHaveText(aideChangement(VILLE_LONGUE));
    const type = page.getByRole("radiogroup", { name: "Type de réservation" });
    await expect(type).toHaveAccessibleDescription(/^Pour changer de ville, .* Ce jour-là, tu changes de ville/);
    await expectNoOverflow(aide);
    await expectNoHorizontalOverflow(page);
    // « Sortie » : l'aide et son lien disparaissent.
    await type.getByRole("radio", { name: "Sortie" }).click();
    await expect(aide).toHaveCount(0);
    await expect(type).not.toHaveAccessibleDescription(/tu changes de ville/);
    await type.getByRole("radio", { name: "Billet" }).click();
    await expect(aide).toBeVisible();
    await continueButton(page).click();
    await expect(page).toHaveURL(new RegExp(`${R2}$`));
  });
});
