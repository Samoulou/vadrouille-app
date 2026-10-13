import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { card } from "./presentation-helpers";
import { ATTRIBUTION, PROTOTYPE_TRIP, PROTOTYPE_URL, prototypeSection } from "./prototype-helpers";

/**
 * P0b1 (spécification P0, « Tests attendus ») sur le build de production, servi en mode prototype par le second
 * serveur de `playwright.config.ts` (`DATA_ADAPTER=prototype`, `VADROUILLE_PROTOTYPE=1`, `CI=true`, programme de
 * test fabriqué à la main, relecteur simulé). Aucune requête vers Google : les domaines Google sont bloqués et
 * comptés, comme dans les autres scénarios.
 */

test.use({ baseURL: PROTOTYPE_URL });

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test("parcours prototype : accueil, section « Prototype », présentation, Séjour, Jour 1", async ({ page }) => {
  await page.goto("/");
  const section = prototypeSection(page);
  await expect(section.getByRole("heading", { level: 2, name: "Prototype" })).toBeVisible();
  await expect(section).toContainText(`Programme produit par le prototype de recherche. ${ATTRIBUTION}.`);
  await expect(page.getByRole("heading", { name: "Démonstration" })).toHaveCount(0);

  await section.getByRole("link", { name: /^Tes propositions/ }).click();
  await expect(page).toHaveURL(`/voyages/${PROTOTYPE_TRIP}/presentation`);
  await expect(page.getByText("[Lieu de test 1]").first()).toBeVisible();

  await page.goto("/");
  await prototypeSection(page).getByRole("link", { name: /^Séjour/ }).click();
  await expect(page).toHaveURL(`/voyages/${PROTOTYPE_TRIP}`);
  await expect(page.getByText("Ville de test").first()).toBeVisible();

  await page.locator("a[data-part='jour']").first().click();
  await expect(page).toHaveURL(`/voyages/${PROTOTYPE_TRIP}/jour/1`);
  await expect(page.getByRole("heading", { level: 1, name: "Balade et dégustations (test)" })).toBeVisible();
  await expect(page.locator("#liste-etapes")).toContainText("[Lieu de test 1]");
});

test("affichage: mention « Données de lieux : Google » en mode prototype (écrans 6, 11, 12, 13 et 15)", async ({ page }) => {
  for (const path of [
    `/voyages/${PROTOTYPE_TRIP}/presentation`,
    `/voyages/${PROTOTYPE_TRIP}`,
    `/voyages/${PROTOTYPE_TRIP}/jour/1`,
    `/voyages/${PROTOTYPE_TRIP}/aujourdhui`,
    // En dernier : la fiche est vérifiée après la boucle.
    `/voyages/${PROTOTYPE_TRIP}/jour/1?etape=j1-a1`,
  ]) {
    await page.goto(path);
    await expect(page.locator("[data-part='attribution']", { hasText: ATTRIBUTION }).first(), path).toBeVisible();
  }
  // Écran 13 : la fiche remplace le panneau du jour ; la mention est rendue dans la fiche elle-même.
  await expect(page.locator("[data-part='fiche'] [data-part='attribution']")).toHaveText(ATTRIBUTION);
});

test("feuille de détail d'une proposition : mention Google et lien de source hors de l'application (écran 6)", async ({ page }) => {
  await page.goto(`/voyages/${PROTOTYPE_TRIP}/presentation`);
  await card(page).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("[data-part='attribution']")).toHaveText(ATTRIBUTION);
  const source = sheet.getByRole("link");
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("rel", "noopener noreferrer");
});

test("liens de source avec rel « noopener noreferrer », ouverts hors de l'application", async ({ page }) => {
  await page.goto(`/voyages/${PROTOTYPE_TRIP}/jour/1?etape=j1-a1`);
  const source = page.locator("a[data-part='source']").first();
  await expect(source).toHaveAttribute("rel", "noopener noreferrer");
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("href", "https://exemple.org/lieu-1");
});

test("en-têtes sans cache sur l'accueil, la présentation et le Séjour en mode prototype", async ({ request }) => {
  for (const path of ["/", `/voyages/${PROTOTYPE_TRIP}/presentation`, `/voyages/${PROTOTYPE_TRIP}`]) {
    const response = await request.get(`${PROTOTYPE_URL}${path}`);
    expect(response.status(), path).toBe(200);
    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl, path).toContain("no-store");
    expect(cacheControl, path).not.toMatch(/public|s-maxage|stale-while-revalidate/);
  }
});

test("les routes du prototype ne sont pas prérendues : manifeste de build inchangé", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", "..", ".next", "prerender-manifest.json"), "utf8")) as {
    routes: Record<string, unknown>;
    dynamicRoutes: Record<string, unknown>;
  };
  // Mêmes routes prérendues qu'avant P0b1 (aucune page servie par un adaptateur), plus la page de repli hors ligne
  // et le manifeste de F10b, construits sans aucune donnée (F10-TL-4, F10-TL-9).
  expect(Object.keys(manifest.routes).sort()).toEqual([
    "/_global-error",
    "/_not-found",
    "/hors-ligne",
    "/manifest.webmanifest",
    "/voyages/nouveau",
  ]);
  expect(Object.keys(manifest.dynamicRoutes)).toEqual([]);
});

test("pages de développement à carte simulée : jamais de données du prototype", async ({ request }) => {
  const response = await request.get(`${PROTOTYPE_URL}/dev/voyages/${PROTOTYPE_TRIP}`);
  expect(response.status()).toBe(404);
});

test("identifiant inconnu ou détourné : page introuvable", async ({ request }) => {
  for (const id of ["proto_inconnu_1", "..%2F..%2Fpackage", "proto%00", "a".repeat(65)]) {
    const response = await request.get(`${PROTOTYPE_URL}/voyages/${id}`);
    expect(response.status(), id).toBe(404);
  }
});
