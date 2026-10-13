import { expect, type BrowserContext, type Page } from "@playwright/test";

import { GOOGLE_ROUTES, isGoogleHost } from "./carte-helpers";

/** Aides des specs de F10b (manifeste, service worker, page de repli `R-repli`), en 390 × 844. */

export const R_REPLI = "/hors-ligne";
export const FALLBACK_TITLE = "Tu es hors ligne";

/**
 * Bloque les domaines Google au niveau du contexte (F10-TL-6) : `context.route` couvre aussi les requêtes du
 * service worker. Relève toute requête qui les vise, de la page ou du service worker.
 */
export async function blockGoogleInContext(context: BrowserContext): Promise<string[]> {
  const requests: string[] = [];
  for (const pattern of GOOGLE_ROUTES) {
    await context.route(pattern, (route) => route.abort());
  }
  context.on("request", (request) => {
    if (isGoogleHost(new URL(request.url()).hostname)) requests.push(request.url());
  });
  return requests;
}

/**
 * Réseau coupé ou rétabli pour la page **et** pour le service worker. Avec le drapeau de `playwright.config.ts`,
 * `context.setOffline` atteint le service worker, mais pas de façon fiable : constaté avec Playwright 1.56, un
 * service worker relancé entre deux navigations retrouve le réseau. Chaque requête vers l'application passe donc
 * aussi par `context.route`, qui l'interrompt (`internetdisconnected`) tant que le réseau est coupé. À appeler une
 * fois par test, avant toute navigation ; renvoie la fonction qui bascule le réseau.
 */
export async function controlNetwork(context: BrowserContext, baseURL: string): Promise<(offline: boolean) => Promise<void>> {
  const origin = new URL(baseURL).origin;
  let offline = false;
  await context.route(
    (url) => url.origin === origin,
    (route) => (offline ? route.abort("internetdisconnected") : route.fallback()),
  );
  return async (value: boolean) => {
    offline = value;
    await context.setOffline(value);
  };
}

/** Attend que le service worker enregistré par l'écran 15 soit actif (installation terminée, caches écrits). */
export async function waitForActiveWorker(page: Page) {
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state ?? null), {
      timeout: 15_000,
    })
    .toBe("activated");
}

export interface CacheEntry {
  cache: string;
  url: string;
}

/** Toutes les entrées de Cache Storage, triées (relevés de C23, C25, C36). */
export async function cacheEntries(page: Page): Promise<CacheEntry[]> {
  const entries = await page.evaluate(async () => {
    const all: { cache: string; url: string }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) all.push({ cache: name, url: request.url });
    }
    return all;
  });
  return entries.sort((a, b) => (a.cache + a.url).localeCompare(b.cache + b.url));
}

/** Corps et type de chaque réponse enregistrée. */
export async function cacheBodies(page: Page): Promise<{ url: string; type: string; body: string }[]> {
  return page.evaluate(async () => {
    const all: { url: string; type: string; body: string }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        all.push({ url: request.url, type: response?.headers.get("content-type") ?? "", body: (await response?.text()) ?? "" });
      }
    }
    return all;
  });
}

/** Stockage hors Cache Storage : Web Storage, IndexedDB, cookies (vides au MVP). */
export async function expectNoOtherStorage(page: Page) {
  const storage = await page.evaluate(async () => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    cookie: document.cookie,
  }));
  expect(storage).toEqual({ local: 0, session: 0, databases: 0, cookie: "" });
  expect(await page.context().cookies()).toEqual([]);
}

/** Page de repli affichée, à l'adresse `/hors-ligne` sans paramètre. */
export async function expectFallback(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: FALLBACK_TITLE })).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Accueil" })).toHaveAttribute("href", "/");
  const url = new URL(page.url());
  expect(url.pathname).toBe(R_REPLI);
  expect(url.search).toBe("");
  expect(url.hash).toBe("");
}
