import { expect, type Page } from "@playwright/test";

import { fiche } from "./sejour-helpers";

/**
 * Feuille « Signaler une erreur » (tâche M5c, ticket 904 ; spécification M5 § 5) : ouverte depuis la fiche d'une étape,
 * adaptateur `mock`. Jardin botanique (J2), étape non verrouillée, ni engagement ni lieu à soi.
 */
export const JARDIN = "j2-jardin-botanique";
export const FICHE_JARDIN_DEBLOQUE = `/voyages/mock_trip_edimbourg_debloque/jour/2?etape=${JARDIN}`;
export const JOUR_2_DEBLOQUE = "/voyages/mock_trip_edimbourg_debloque/jour/2";
export const FICHE_JARDIN_NON_DEBLOQUE = `/voyages/mock_trip_edimbourg/jour/2?etape=${JARDIN}`;

export const reportButton = (page: Page) => fiche(page).getByRole("button", { name: "Signaler une erreur" });
export const reportSheet = (page: Page) => page.getByRole("dialog", { name: "Signaler une erreur" });
export const reasons = (page: Page) => reportSheet(page).getByRole("radiogroup", { name: "Ce qui ne va pas" });

/** Ouvre la fiche puis la feuille ; le titre de niveau 1 de la feuille a le focus. */
export async function openReportSheet(page: Page, path: string) {
  await page.goto(path);
  await expect(fiche(page).getByRole("heading", { level: 1 })).toBeVisible();
  await reportButton(page).click();
  await expect(reportSheet(page).getByRole("heading", { level: 1, name: "Signaler une erreur" })).toBeFocused();
}

/** Feuille ouverte : choisit le motif `label` et envoie ; la feuille se ferme. */
export async function sendReport(page: Page, label: string) {
  await reasons(page).getByRole("radio", { name: label }).click();
  await reportSheet(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(reportSheet(page)).toHaveCount(0);
}

