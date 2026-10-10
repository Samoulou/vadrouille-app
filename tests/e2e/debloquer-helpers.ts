import { randomUUID } from "node:crypto";

import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Aides des specs de F9a (« Débloquer », paiement simulé, confirmation), en 390 × 844 sur le build de
 * production. Chaque test crée sa portée de simulation (décision 0017 § 10.3) : l'en-tête
 * `x-vadrouille-simulation` n'est ajouté qu'aux requêtes vers l'origine de l'application, jamais par
 * `extraHTTPHeaders`. La portée est remise à zéro par `R-sim` ; l'horloge du serveur n'avance que par `R-sim`.
 */

export const TRIP = "mock_trip_edimbourg";
export const UNLOCKED_TRIP = "mock_trip_edimbourg_debloque";
export const R6 = `/voyages/${TRIP}/presentation`;
export const R9 = `/voyages/${TRIP}/debloquer`;
export const R11 = `/voyages/${TRIP}`;
export const R9_SIM = new RegExp(`^/voyages/${TRIP}/debloquer/paiement-simule/[A-Za-z0-9_-]{22}$`);
export const R9_RETOUR = new RegExp(`^/voyages/${TRIP}/debloquer/confirmation\\?paiement=[A-Za-z0-9_-]{22}$`);
export const R9_ECHEC = new RegExp(`^/voyages/${TRIP}/debloquer\\?paiement=[A-Za-z0-9_-]{22}$`);
export const SIM = "/dev/api/simulation";
export const HEADER = "x-vadrouille-simulation";
export const CHECKOUT_TTL_MS = 30 * 60_000;

export interface Scope {
  name: string;
  /** Envoie une commande à `R-sim` dans cette portée. */
  control(body: Record<string, unknown>): Promise<void>;
}

/** Portée explicite pour tout le contexte (tous ses onglets), remise à zéro au 2026-08-01T12:00:00+02:00. */
export async function useScope(context: BrowserContext, baseURL: string): Promise<Scope> {
  const name = `f9a-${randomUUID()}`;
  await context.route(`${baseURL}/**`, (route) => route.continue({ headers: { ...route.request().headers(), [HEADER]: name } }));
  const request = context.request;
  const control = async (body: Record<string, unknown>) => {
    const response = await request.post(`${baseURL}${SIM}`, { headers: { [HEADER]: name }, data: body });
    expect(response.status(), JSON.stringify(body)).toBe(204);
  };
  await control({ action: "reset", now: "2026-08-01T12:00:00+02:00" });
  return { name, control };
}

/** Chemin et requête de l'adresse courante. */
export function pathOf(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

export async function expectPath(page: Page, expected: string | RegExp) {
  await expect.poll(() => pathOf(page), { timeout: 10_000 }).toMatch(typeof expected === "string" ? new RegExp(`^${escape(expected)}$`) : expected);
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const main = (page: Page) => page.getByRole("main");
export const payTwint = (page: Page) => page.getByRole("button", { name: "Payer avec TWINT", exact: true });
export const payCard = (page: Page) => page.getByRole("button", { name: "Payer par carte", exact: true });

export async function openOffer(page: Page, path = R9) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Depuis l'écran 9, commence un paiement et attend la page de paiement simulé. */
export async function startPayment(page: Page, method: "twint" | "card"): Promise<string> {
  await (method === "twint" ? payTwint(page) : payCard(page)).click();
  await expectPath(page, R9_SIM);
  await expect(page.getByRole("heading", { level: 1, name: "Paiement simulé" })).toBeVisible();
  return pathOf(page).split("/").pop() ?? "";
}

export async function simulate(page: Page, name: "Simuler un paiement réussi" | "Simuler un refus" | "Annuler") {
  await page.getByRole("button", { name, exact: true }).click();
}

/** Lit l'état du stockage navigateur de la page (critère « aucune donnée persistée côté client »). */
export async function clientStorage(page: Page) {
  return page.evaluate(async () => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    cookie: document.cookie,
  }));
}
