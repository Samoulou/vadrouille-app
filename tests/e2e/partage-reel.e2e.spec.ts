import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { HEADER } from "./debloquer-helpers";
import { createShareScope, openShareSheet, RP, RPJ, shareButton, shareField, sheetButton, statusOf } from "./partage-helpers";
import { ATTRIBUTION, PROTOTYPE_TRIP, PROTOTYPE_URL } from "./prototype-helpers";

/**
 * Partage réel du site d'essai (décision 0135), sur le serveur `prototype` des e2e (dossier de programmes, sans base) :
 * « Partager » sur un voyage débloqué, lien signé `v1.<charge>.<mac>`, vue partagée lue par un contexte neuf, sans
 * cookie ni session ; jeton altéré : 404. Horloge de la portée au 2026-11-01 (le partage du voyage de test prend fin le
 * 2026-12-24). Carte (0135 § 8) : mention « Données de lieux : Google » sur `RP` et `RPJ`, et, sans clé Maps (CI) ni
 * réseau Google, carte dans son état de remplacement (vue sans carte, jamais une autre carte) ; axe sans violation.
 */

const NOW = "2026-11-01T10:00:00Z";
const SIGNED_TOKEN_IN_URL = /\/p\/(v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43})$/;

test.use({ baseURL: PROTOTYPE_URL });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Mention de la source des lieux, et carte dans son état de remplacement : aucune carte rendue, aucun repère. */
async function expectGoogleAttributionWithoutMap(page: Page, path: string) {
  await expect(page.locator("[data-part='attribution']", { hasText: ATTRIBUTION }).first(), path).toBeVisible();
  const map = page.locator("[data-day-map]");
  await expect(map, path).toBeVisible();
  await expect(map.locator("[data-fallback]"), path).toBeVisible();
  await expect(map.getByRole("status"), path).toHaveText("Carte indisponible. La liste contient tout le programme.");
  await expect(map.locator("[data-part='attribution']"), path).toHaveText(ATTRIBUTION);
  await expect(map.getByRole("button"), path).toHaveCount(0);
  await expect(map.locator("[data-renderer='simulated']"), path).toHaveCount(0);
}

test("voyage réel : lien signé créé depuis le Séjour, lu sans connexion ; jeton altéré : 404", async ({ browser, context, page }) => {
  const google = await blockGoogle(context);
  const scope = await createShareScope(context, PROTOTYPE_URL, NOW);

  await page.goto(`/voyages/${PROTOTYPE_TRIP}`);
  await expect(shareButton(page)).toBeVisible();
  await openShareSheet(page);
  await sheetButton(page, "Créer un lien").click();
  await expect(shareField(page)).toBeVisible();
  const url = new URL(await shareField(page).inputValue());
  const token = SIGNED_TOKEN_IN_URL.exec(url.pathname)?.[1];
  expect(token, url.pathname).toBeTruthy();

  // Visiteur : contexte neuf, aucun cookie ; seule la portée du test (horloge) est transmise.
  const visitor = await browser.newContext({ baseURL: PROTOTYPE_URL, extraHTTPHeaders: { [HEADER]: scope.name }, viewport: { width: 390, height: 844 } });
  const blocked = await blockGoogle(visitor);
  const shared = await visitor.newPage();
  const response = await shared.goto(RP(token!));
  expect(response?.status()).toBe(200);
  await expect(shared).toHaveTitle("Ville de test · Programme partagé");
  await expect(shared.getByText("Programme partagé · lecture seule").first()).toBeVisible();
  await expect(shared.getByRole("button", { name: "Partager", exact: true })).toHaveCount(0);
  await expectGoogleAttributionWithoutMap(shared, RP(token!));
  expect((await new AxeBuilder({ page: shared }).withTags(TAGS).analyze()).violations).toEqual([]);
  expect((await shared.goto(RPJ(token!, 1)))?.status()).toBe(200);
  await expectGoogleAttributionWithoutMap(shared, RPJ(token!, 1));
  expect((await new AxeBuilder({ page: shared }).withTags(TAGS).analyze()).violations).toEqual([]);
  expect(await visitor.cookies()).toEqual([]);
  await visitor.close();
  expect(blocked).toEqual([]);

  const [version, charge, mac] = token!.split(".") as [string, string, string];
  const altered = `${version}.${charge}.${mac.startsWith("A") ? "B" : "A"}${mac.slice(1)}`;
  expect(await statusOf(context.request, PROTOTYPE_URL, scope.name, RP(altered))).toBe(404);
  expect(await statusOf(context.request, PROTOTYPE_URL, scope.name, RPJ(token!, 9))).toBe(404);
  expect(google).toEqual([]);
});
