import { expect, type Locator, type Page } from "@playwright/test";

import { COMPOSTELLE_FLORENCE_TRIP_ID, ROME_FLORENCE_TRIP_ID } from "../../src/mocks/rome-florence";

/**
 * M4c (spécification M4 § 7, critères 13 à 18, 22 et 25 ; spécification M4-suite, critère 16) : voyages simulés à deux
 * villes de l'adaptateur `mock`, servis à leur adresse seulement (hors de « Mes voyages »). Aucun ne passe par `createTrip`.
 */
export const ROME_FLORENCE = `/voyages/${ROME_FLORENCE_TRIP_ID}`;
export const COMPOSTELLE_FLORENCE = `/voyages/${COMPOSTELLE_FLORENCE_TRIP_ID}`;

export const sheet = (page: Page) => page.getByRole("region", { name: "Programme", exact: true });

/** La page n'a aucun débordement horizontal. */
export async function expectNoHorizontalOverflow(page: Page) {
  const largeur = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(largeur.scroll).toBeLessThanOrEqual(largeur.client);
}

/** Un texte ne déborde pas de sa boîte et n'est pas tronqué (`scrollWidth ≤ clientWidth`, aucun `text-overflow`). */
export async function expectNotTruncated(locator: Locator) {
  const mesure = await locator.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
    textOverflow: getComputedStyle(element).textOverflow,
    lineClamp: getComputedStyle(element).webkitLineClamp,
  }));
  expect(mesure.scroll).toBeLessThanOrEqual(mesure.client);
  expect(mesure.textOverflow).toBe("clip");
  expect(["none", ""]).toContain(mesure.lineClamp);
}

/** Centre vertical d'un élément, en pixels CSS. */
export async function centreVertical(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.y + box!.height / 2;
}
