import { expect, test, type Page } from "@playwright/test";

import { MOCK_LODGING_SUGGESTION } from "../../src/mocks/creation-edimbourg";

import { blockGoogle } from "./carte-helpers";
import {
  EDIMBOURG,
  R2,
  R3,
  R3_DEV,
  R4_LANCER,
  continueButton,
  field,
  fillTrip,
  installClock,
  reachAfterBrief,
  reachReview,
} from "./creation-helpers";
import { expectPath } from "./debloquer-helpers";

/**
 * Écran 3 « Où loger » (spécification F8, critères [b] ; décision 0017 § 1 et § 7), build de production, 390 × 844,
 * domaines Google bloqués, horloge du navigateur au 2026-08-01T08:00. En CI, sans clé Google, la mini-carte est
 * l'état « configuration absente » de F4 ; la carte simulée n'est servie que par `R3-dev`.
 */

let googleRequests: string[] = [];
let foreignRequests: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  googleRequests = await blockGoogle(page);
  foreignRequests = [];
  const origin = new URL(baseURL!).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== origin) foreignRequests.push(request.url());
  });
  await installClock(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
  expect(foreignRequests).toEqual([]);
});

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const AREA = MOCK_LODGING_SUGGESTION.area;
const LODGINGS = MOCK_LODGING_SUGGESTION.lodgings;

async function expectSuggestion(page: Page) {
  await expect(page.getByRole("heading", { level: 2, name: AREA.name })).toBeVisible();
  await expect(page.getByText(AREA.reason)).toBeVisible();
  const choices = page.getByRole("button", { name: /^Choisir ce logement : / });
  await expect(choices).toHaveCount(LODGINGS.length);
  expect(LODGINGS.length).toBeLessThanOrEqual(3);
  for (const lodging of LODGINGS) {
    await expect(page.getByRole("button", { name: `Choisir ce logement : ${lodging.name}`, exact: true })).toHaveText("Choisir ce logement");
  }
  await expect(page.getByRole("button", { name: "Partir du quartier, choisir plus tard", exact: true })).toBeVisible();
}

test("logement: quartier et logements", async ({ page }) => {
  await reachAfterBrief(page);
  await expectPath(page, R3);
  await expect(heading(page)).toHaveText("Où loger à Édimbourg");
  await expectSuggestion(page);
  // Sur R3 en CI : état « configuration absente » de F4 à la place de la mini-carte, quartier lisible.
  const map = page.getByRole("region", { name: `Carte du quartier ${AREA.name}` });
  await expect(map.getByRole("status")).toHaveText("Carte indisponible. Le quartier est décrit ci-dessus.");
  await expect(map.locator("[data-renderer='simulated']")).toHaveCount(0);
});

test("logement: R3-dev, la carte simulée affiche la zone", async ({ page }) => {
  await page.goto(R3_DEV);
  await expect(heading(page)).toHaveText("Où loger à Édimbourg");
  await expectSuggestion(page);
  const map = page.getByRole("region", { name: `Carte du quartier ${AREA.name}` });
  await expect(map.locator("[data-renderer='simulated']")).toBeVisible();
  await expect(map.locator("[data-part='zone']")).toBeVisible();
  await expect(map.getByRole("status")).toHaveText("");
});

test("logement: choisir un logement mène à l'écran 4 de la création", async ({ page }) => {
  await reachAfterBrief(page);
  await page.getByRole("button", { name: `Choisir ce logement : ${LODGINGS[0]!.name}`, exact: true }).click();
  await expectPath(page, R4_LANCER);
  await expect(heading(page)).toHaveText("Connecte-toi pour recevoir tes propositions");
});

test("logement: ville inconnue du jeu simulé", async ({ page }) => {
  await reachAfterBrief(page, { ...EDIMBOURG, destination: "Glasgow" });
  await expectPath(page, R3);
  await expect(heading(page)).toHaveText("Où loger à Glasgow");
  await expect(page.getByRole("status").filter({ hasText: "Aucun quartier à te proposer pour l'instant." })).toBeVisible();
  await page.getByRole("button", { name: "Continuer sans logement", exact: true }).click();
  await expectPath(page, R4_LANCER);
});

test("logement: un voyage avec logement « Oui » ne passe pas par l'écran 3", async ({ page }) => {
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });
  await page.goto("/voyages/nouveau");
  await fillTrip(page, { ...EDIMBOURG, lodging: "Oui" });
  await field(page, "Nom ou adresse du logement").fill("[Hôtel de test]");
  await continueButton(page).click();
  await expectPath(page, R2);
  await reachReview(page);
  await continueButton(page).click();
  await expectPath(page, R4_LANCER);
  expect(visited).not.toContain(R3);
});

test("logement: deux villes sans logement, un écran 3 par ville sur la même adresse", async ({ page }) => {
  await page.goto("/voyages/nouveau");
  await fillTrip(page, { ...EDIMBOURG, end: "2026-09-05" });
  await page.getByRole("button", { name: "Ajouter une ville", exact: true }).click();
  await field(page, "Nom de la ville").fill("Glasgow");
  await field(page, "Arrivée dans cette ville").fill("2026-09-02");
  await page.getByRole("radiogroup", { name: "As-tu déjà un logement ?" }).last().getByRole("radio", { name: "Pas encore" }).click();
  await continueButton(page).click();
  await expectPath(page, R2);
  await reachReview(page);
  await continueButton(page).click();
  await expectPath(page, R3);
  await expect(heading(page)).toHaveText("Où loger à Édimbourg");
  await page.getByRole("button", { name: "Partir du quartier, choisir plus tard", exact: true }).click();
  await expectPath(page, R3);
  await expect(heading(page)).toHaveText("Où loger à Glasgow");
  await expect(heading(page)).toBeFocused();
  // « Retour » : écran 3 de la ville précédente, même adresse.
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await expect(heading(page)).toHaveText("Où loger à Édimbourg");
  await expectPath(page, R3);
});

test("logement: recharger l'écran 3 ramène à l'écran 1 avec l'annonce", async ({ page }) => {
  await reachAfterBrief(page);
  await expectPath(page, R3);
  await page.reload();
  await expectPath(page, "/voyages/nouveau");
  await expect(page.getByRole("status").filter({ hasText: "Ton brouillon n'a pas été conservé." })).toBeVisible();
});
