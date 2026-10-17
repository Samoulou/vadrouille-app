import { expect, type Locator, type Page, type Request } from "@playwright/test";

import { MOCK_CODE, pasteCode, requestCodeFor, uniqueEmail } from "./connexion-helpers";
import { EDIMBOURG, R3, R4_LANCER, R_LANCER, reachAfterBrief, type TripInput } from "./creation-helpers";
import { expectPath, type Scope } from "./debloquer-helpers";

/**
 * Aides des specs du lancement et de l'écran 5 (F8c), en 390 × 844 sur le build de production. Chaque test qui se
 * connecte a sa portée de simulation (`useScope`) : une session dans la portée par défaut ferait sauter l'écran 4
 * aux autres tests. L'avancement de la génération est calculé par le serveur sur l'horloge de la portée, avancée
 * par `R-sim` ; `page.clock.runFor(1000)` déclenche l'interrogation suivante du navigateur (0017 § 9 et § 10).
 */

export const TRIP = "mock_trip_edimbourg";
export const R5 = `/voyages/${TRIP}/preparation`;
export const R6 = `/voyages/${TRIP}/presentation`;
export const R11 = `/voyages/${TRIP}`;
/** Intervalle entre deux propositions prêtes du jeu simulé (`MOCK_GENERATION_STEP_MS`). */
export { MOCK_GENERATION_STEP_MS as STEP_MS } from "../../src/mocks/creation-edimbourg";

export const heading = (page: Page) => page.getByRole("heading", { level: 1 });
export const counter = (page: Page) => page.locator("[data-compteur]");
export const dayRows = (page: Page) => page.getByRole("list", { name: "Jours de tes premières propositions" }).getByRole("listitem");
/** Région `role="status"` des annonces (passages de jour, état final). */
export const announcements = (page: Page) => page.locator("[data-annonces]");
export const alertRegion = (page: Page) => page.locator("main [role='alert']");
export const rings = (row: Locator) => row.locator("[data-anneau]");

/** Écran 3 « Pas encore » : « Partir du quartier, choisir plus tard », vers l'écran 4 (ou `R-lancer` avec une session). */
export async function leaveLodging(page: Page) {
  await expectPath(page, R3);
  await page
    .getByRole("button", {
      name: "Partir du quartier, choisir plus tard",
      exact: true,
    })
    .click();
}

/** Brouillon complet (écrans 1 à 3), puis connexion par le code simulé : l'écran 5 du voyage créé s'affiche. */
export async function launchFromCreation(page: Page, trip: TripInput = EDIMBOURG) {
  await reachAfterBrief(page, trip);
  await leaveLodging(page);
  await expectPath(page, R4_LANCER);
  await requestCodeFor(page, uniqueEmail());
  await pasteCode(page, MOCK_CODE);
  await expectPath(page, R5);
}

/**
 * Avance l'horloge de la portée de `ms`, puis l'horloge du navigateur d'une seconde à la fois jusqu'à l'état
 * attendu (`runFor` déclenche l'interrogation suivante ; l'état du serveur ne change plus entre deux essais).
 */
export async function advance(page: Page, scope: Scope, ms: number, expected: (page: Page) => Promise<void>) {
  if (ms > 0) await scope.control({ action: "advanceClock", ms });
  await expect(async () => {
    await page.clock.runFor(1000);
    await expected(page);
  }).toPass({ timeout: 10_000, intervals: [100, 250, 500] });
}

/** Appels de l'action serveur `createTrip` : POST d'une action Next.js sur l'adresse de `R-lancer`. */
export function collectLaunchCalls(page: Page): Request[] {
  const calls: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === R_LANCER && request.headers()["next-action"]) calls.push(request);
  });
  return calls;
}
