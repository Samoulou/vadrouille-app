import { expect, type Page } from "@playwright/test";

/** Domaines Google bloqués dans chaque spec de F4 : aucune dépendance au réseau Google. */
export const GOOGLE_ROUTES = ["**/*.googleapis.com/**", "**/*.gstatic.com/**", "**/maps.google.com/**"];
const GOOGLE_HOST = /(^|\.)(googleapis\.com|gstatic\.com)$|^maps\.google\.com$/;

/**
 * Bloque les domaines Google (`route.abort()`) et relève toute requête qui les vise,
 * interceptée ou non. Renvoie la liste, à vérifier en fin de test.
 */
export async function blockGoogle(page: Page): Promise<string[]> {
  const requests: string[] = [];
  for (const pattern of GOOGLE_ROUTES) {
    await page.route(pattern, (route) => route.abort());
  }
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (GOOGLE_HOST.test(url.hostname)) {
      requests.push(request.url());
    }
  });
  return requests;
}

export const mapRegion = (page: Page, n = 2) => page.getByRole("region", { name: `Carte du jour ${n}` });
export const simulated = (page: Page) => page.locator("[data-renderer='simulated']");
export const list = (page: Page) => page.locator("#liste-etapes");
export const markers = (page: Page) => mapRegion(page).getByRole("button", { name: /^Étape \d+ :/ });

/** Ouvre /dev/carte et attend la carte simulée cadrée. */
export async function openSimulated(page: Page, query = "") {
  await page.goto(`/dev/carte${query}`);
  await expect(simulated(page)).toHaveAttribute("data-zoom", /\d+/);
}

export async function cameraOf(page: Page) {
  return simulated(page).evaluate((el) => ({
    lat: Number((el as HTMLElement).dataset.centerLat),
    lng: Number((el as HTMLElement).dataset.centerLng),
    zoom: Number((el as HTMLElement).dataset.zoom),
  }));
}
