import { expect, type Locator, type Page } from "@playwright/test";

import { useScope as creerPortee, type Scope } from "./debloquer-helpers";

/**
 * Aides des specs de l'écran 16 « Après le voyage » (`R16`, M8a, ticket 1062) sur `mock`, en 390 × 844. L'accès (avant la
 * fin, ouvert, lecture seule) est calculé par le serveur à l'horloge de la portée de simulation : chaque test crée sa
 * portée (`useScope`) et la remet à l'instant voulu (`R-sim`) ; l'horloge du navigateur ne sert qu'aux liens de « Mes
 * voyages » et de l'écran 15.
 */

export const ED_OK = "mock_trip_edimbourg_debloque";
export const R16 = `/voyages/${ED_OK}/retour`;
export const CHATEAU = "[Château d'Édimbourg]";

/** Instants de la spécification M8 § 6.3 (heure de Londres en été, UTC+1). */
export const INSTANTS = {
  veilleDernierJour: "2026-09-02T23:59:00+01:00",
  dernierJour: "2026-09-03T00:00:00+01:00",
  dernierJourModifiable: "2026-10-03T12:00:00+01:00",
  lectureSeule: "2026-10-04T00:00:00+01:00",
} as const;

/** Portée de simulation propre au test, l'horloge du serveur à `iso`. */
export async function scopeAt(page: Page, baseURL: string, iso: string): Promise<Scope> {
  const scope = await creerPortee(page.context(), baseURL);
  await scope.control({ action: "reset", now: iso });
  return scope;
}

/** Ouvre `R16` (200) et attend son titre de niveau 1. */
export async function openReview(page: Page, url = R16) {
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return response;
}

export const group = (page: Page, name: string): Locator => page.getByRole("group", { name: `Ton avis sur ${name}`, exact: true });
export const choice = (page: Page, name: string, label: string): Locator => group(page, name).getByRole("button", { name: label, exact: true });
