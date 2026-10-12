import { expect, type Locator, type Page } from "@playwright/test";

/** Aides des specs de F10a (écran 15 « Aujourd'hui », `R15`), en 390 × 844. */

export const ED = "mock_trip_edimbourg";
export const ED_OK = "mock_trip_edimbourg_debloque";
export const R15 = `/voyages/${ED}/aujourdhui`;

/** Instants de la spécification F10 (heure de Londres en été, UTC+1). */
export const MOMENTS = {
  prochaine: "2026-08-30T10:40:00+01:00",
  enCours: "2026-08-30T10:51:00+01:00",
  tempsLibre: "2026-08-30T16:00:00+01:00",
  plusDEtape: "2026-08-30T21:00:00+01:00",
  avant: "2026-08-01T12:00:00+01:00",
  veille: "2026-08-28T12:00:00+01:00",
  dernierJour: "2026-09-03T12:00:00+01:00",
  apres: "2026-09-04T12:00:00+01:00",
  apresTrenteJours: "2026-10-11T12:00:00+01:00",
} as const;

/** Horloge du navigateur installée avant l'ouverture de la page (l'horloge du serveur n'intervient pas). */
export async function setClock(page: Page, iso: string) {
  await page.clock.install({ time: new Date(iso) });
}

/** Ouvre l'écran 15 et attend la fin de « Chargement de ta journée ». */
export async function openToday(page: Page, url = R15) {
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Aujourd'hui" })).toBeVisible();
  await expect(page.locator("[data-part='chargement']")).toHaveCount(0);
  return response;
}

/** Fait avancer l'horloge du navigateur jusqu'à l'instant donné (minuteurs déclenchés). */
export async function runUntil(page: Page, iso: string) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.runFor(new Date(iso).getTime() - now);
}

export const region = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true });
export const subtitle = (page: Page): Locator => page.locator("[data-part='sous-titre']");
export const announcement = (page: Page): Locator => page.locator("[data-part='annonce']");
export const dayLine = (page: Page): Locator => region(page, "Ta journée").locator("ol");
export const stopRow = (page: Page, name: string): Locator => dayLine(page).locator("li[data-type='stop']", { hasText: name });

/** Tout ce qui pourrait avoir été enregistré sur l'appareil (C20). */
export async function expectNothingPersisted(page: Page) {
  const storage = await page.evaluate(async () => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(storage).toEqual({ local: 0, session: 0, databases: 0, caches: 0, workers: 0 });
  expect(await page.context().cookies()).toEqual([]);
}

/** Onglet caché puis rendu visible (`visibilitychange`), sans faire avancer les minuteurs. */
export async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (value ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}
