import { expect, type BrowserContext, type Page, type Request } from "@playwright/test";

/**
 * Hôtes Google bloqués dans chaque spec de F4 et pendant la mesure Lighthouse : aucune dépendance au réseau
 * Google. Seule liste : les motifs Playwright, les motifs Lighthouse et le test d'hôte en dérivent (0022 § 1).
 * `subdomains` : l'hôte et tous ses sous-domaines ; sinon l'hôte exact.
 */
export const GOOGLE_HOSTS = [
  { host: "googleapis.com", subdomains: true },
  { host: "gstatic.com", subdomains: true },
  { host: "maps.google.com", subdomains: false },
] as const;

/** Motifs de `page.route` (Playwright). */
export const GOOGLE_ROUTES = GOOGLE_HOSTS.map(({ host, subdomains }) => (subdomains ? `**/*.${host}/**` : `**/${host}/**`));

/** Motifs de `blockedUrlPatterns` (Lighthouse, jokers `*` sur l'adresse entière). */
export const GOOGLE_LIGHTHOUSE_PATTERNS = GOOGLE_HOSTS.map(({ host, subdomains }) => (subdomains ? `*.${host}/*` : `*://${host}/*`));

/** Vrai si `hostname` est un hôte Google de la liste. */
export function isGoogleHost(hostname: string): boolean {
  return GOOGLE_HOSTS.some(({ host, subdomains }) => hostname === host || (subdomains && hostname.endsWith(`.${host}`)));
}

/**
 * Bloque les domaines Google (`route.abort()`) et relève toute requête qui les vise,
 * interceptée ou non. Renvoie la liste, à vérifier en fin de test. Sur un contexte (`BrowserContext`), le blocage
 * couvre aussi les requêtes du service worker (F10b, F10-TL-6).
 */
export async function blockGoogle(target: Page | BrowserContext): Promise<string[]> {
  const requests: string[] = [];
  for (const pattern of GOOGLE_ROUTES) {
    await target.route(pattern, (route) => route.abort());
  }
  const record = (request: Request) => {
    if (isGoogleHost(new URL(request.url()).hostname)) {
      requests.push(request.url());
    }
  };
  if ("browser" in target) target.on("request", record);
  else target.on("request", record);
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
