import { expect, type Locator, type Page } from "@playwright/test";

/** Aides des specs de F11a (« Mes voyages », `R17`), en 390 × 844. */

export const R17 = "/voyages";
export const ED = "mock_trip_edimbourg";
export const ED_OK = "mock_trip_edimbourg_debloque";
export const LIS = "mock_trip_lisbonne";
export const POR = "mock_trip_porto";

/** Dates de la spécification (C6, C7, C11), heure de Londres en été. */
export const DATES = {
  avant: "2026-08-01T12:00:00+01:00",
  pendant: "2026-08-30T10:40:00+01:00",
  apres: "2026-10-09T12:00:00+01:00",
} as const;

/** Horloge du navigateur installée avant l'ouverture de la page (comme F10). */
export async function setClock(page: Page, iso: string) {
  await page.clock.install({ time: new Date(iso) });
}

/** Ouvre `R17` et attend la fin du classement (titre de niveau 2 ou texte de l'état vide). */
export async function openTrips(page: Page) {
  const response = await page.goto(R17);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  return response;
}

export const plate = (page: Page): Locator => page.locator("[data-destination-plate]");
export const section = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true });
export const sectionTitles = (page: Page) => page.getByRole("heading", { level: 2 }).allTextContents();
export const tripLink = (page: Page, sectionName: string, destination: string): Locator =>
  section(page, sectionName).getByRole("link", { name: new RegExp(`^${destination} `) });

/** Toutes les adresses des liens de `R17`. */
export async function linkTargets(page: Page): Promise<string[]> {
  return page.getByRole("main").getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
}

/** C2 : rien n'est persisté côté client (stockages, IndexedDB, Cache Storage, cookies). */
export async function expectNothingPersisted(page: Page) {
  const storage = await page.evaluate(async () => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
  }));
  expect(storage).toEqual({ local: 0, session: 0, databases: 0, caches: 0 });
  expect(await page.context().cookies()).toEqual([]);
}
