import { expect, type Locator, type Page } from "@playwright/test";

/** Aides des specs de « Ton compte » (`/compte` ; M9c, ticket 1122 ; spécification M9 § 6.4), en 390 × 844. */

export const R_COMPTE = "/compte";
export const TITRE = "Ton compte";
export const HORS_LIGNE = "Tu es hors ligne. Exporter tes données et supprimer ton compte demandent une connexion.";
export const NOM_EXPORT = /^vadrouille-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/;

export const bouton = (page: Page, name: string): Locator => page.getByRole("button", { name, exact: true });
export const exporter = (page: Page) => bouton(page, "Exporter mes données");
export const supprimer = (page: Page) => bouton(page, "Supprimer mon compte");
export const deconnecter = (page: Page) => bouton(page, "Se déconnecter");
export const titre = (page: Page, name = TITRE) => page.getByRole("heading", { level: 1, name, exact: true });

/** Ouvre « Ton compte » et attend l'écran. */
export async function openCompte(page: Page) {
  const response = await page.goto(R_COMPTE);
  expect(response?.status()).toBe(200);
  await expect(titre(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return response;
}
