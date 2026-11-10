import { expect, type Locator, type Page } from "@playwright/test";

import { CHEVAUCHEMENT_TRIP_ID } from "../../src/mocks/chevauchement";

import { continueButton, EDIMBOURG, fillTrip } from "./creation-helpers";

/**
 * Spécification M4-suite (§ 4.2, § 5 et § 6 ; critères 12, 13 et 17) : voyage simulé du bandeau de chevauchement (Rome,
 * « Saint-Jacques-de-Compostelle », Florence), servi à son adresse seulement, et écran 1 avec l'aide du billet de
 * changement de ville.
 */
export const CHEVAUCHEMENT = `/voyages/${CHEVAUCHEMENT_TRIP_ID}`;

/** Bandeau de chevauchement de la Journée (`StatusBanner` `overlap`), chargé à la demande. */
export const bandeau = (page: Page) => page.locator("[role='status'][data-kind='overlap']");

/** Texte exact de l'aide de l'écran 1 (§ 6), espace insécable avant le deux-points. */
export const aideChangement = (ville: string) => `Ce jour-là, tu changes de ville : ce billet sera ton transport vers ${ville}.`;

/** Le contenu d'un élément ne déborde pas de sa boîte. */
export async function expectNoOverflow(locator: Locator) {
  const mesure = await locator.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(mesure.scroll).toBeLessThanOrEqual(mesure.client);
}

/**
 * Écran 1 : Rome, puis `ville` à partir du 2026-08-31 (voyage du 29.08 au 03.09 d'`EDIMBOURG`), et un « Billet » ce
 * jour-là, à 09:00, au libellé donné. L'aide s'affiche sous son « Type de réservation ».
 */
export async function remplirAvecBillet(page: Page, ville: string, libelle: string) {
  await fillTrip(page, { ...EDIMBOURG, destination: "Rome" });
  await page.getByRole("button", { name: "Ajouter une ville" }).click();
  await page.getByLabel("Nom de la ville", { exact: true }).fill(ville);
  await page.getByLabel("Arrivée dans cette ville", { exact: true }).fill("2026-08-31");
  for (const groupe of await page.getByRole("radiogroup", { name: "As-tu déjà un logement ?" }).all()) {
    await groupe.getByRole("radio", { name: "Pas encore" }).click();
  }
  await page.getByRole("button", { name: "Ajouter une réservation" }).click();
  await page.getByRole("radiogroup", { name: "Type de réservation" }).getByRole("radio", { name: "Billet" }).click();
  await page.getByLabel("Libellé", { exact: true }).fill(libelle);
  await page.getByLabel("Date", { exact: true }).fill("2026-08-31");
  await page.getByLabel("Heure de début", { exact: true }).fill("09:00");
  await expect(continueButton(page)).toBeVisible();
}
