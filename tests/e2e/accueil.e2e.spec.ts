import { expect, test, type Page } from "@playwright/test";

import { demoLinks, demoSection } from "./accueil-helpers";
import { blockGoogle } from "./carte-helpers";

/**
 * Critères D1 (spécification D1) : la page d'accueil mène, sans saisie, aux parcours simulés,
 * en 390 × 844 sur le build de production.
 */

/** Arrivée attendue de chaque lien, dans l'ordre du parcours (D1-PO-2). */
const ARRIVALS: { name: string; check: (page: Page) => Promise<void> }[] = [
  {
    name: "Tes premières propositions J'aime / Pas pour moi, avant de débloquer",
    check: async (page) => {
      await expect(page.getByRole("button", { name: "J'aime", exact: true })).toBeVisible();
    },
  },
  {
    name: "Suite du tri Voyage débloqué",
    check: async (page) => {
      await expect(page.getByRole("heading", { name: "Suite du tri" })).toBeVisible();
    },
  },
  {
    name: "Séjour Le programme jour par jour",
    check: async (page) => {
      await expect(page.getByRole("region", { name: "Programme", exact: true })).toBeVisible();
    },
  },
  {
    name: "Jour 1 Étapes et trajets du jour",
    check: async (page) => {
      await expect(page).toHaveTitle(/Jour 1/);
    },
  },
  // F9a (F9-PO-17) : cinquième entrée, paiement simulé ouvert pour les tests (VADROUILLE_DEMO_PAYMENT=1).
  {
    name: "Débloquer L'offre et le paiement simulé",
    check: async (page) => {
      await expect(page.getByRole("heading", { level: 1, name: "Débloquer ton voyage" })).toBeVisible();
    },
  },
];

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test("accueil: section « Démonstration », mention et voyage d'exemple", async ({ page }) => {
  await page.goto("/");
  await expect(demoSection(page).getByRole("heading", { level: 2, name: "Démonstration" })).toBeVisible();
  await expect(demoSection(page).getByText("Données simulées. Les lieux entre crochets ne sont pas vérifiés.")).toBeVisible();
  await expect(demoSection(page).getByText("Voyage d'exemple : Édimbourg")).toBeVisible();
  await expect(demoSection(page).getByRole("list").getByRole("listitem")).toHaveCount(ARRIVALS.length);
  await expect(demoLinks(page)).toHaveCount(ARRIVALS.length);
  for (const [index, arrival] of ARRIVALS.entries()) {
    await expect(demoLinks(page).nth(index)).toHaveAccessibleName(arrival.name);
  }
});

test("accueil: chaque lien mène à un écran livré (200, pas de 404), puis retour à /", async ({ page }) => {
  await page.goto("/");
  const hrefs = await demoLinks(page).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(hrefs).toHaveLength(ARRIVALS.length);

  for (const [index, arrival] of ARRIVALS.entries()) {
    const href = hrefs[index] ?? "";
    expect(href).toMatch(/^\/voyages\//);

    // Statut de la page d'arrivée, chargée comme document.
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);

    await demoLinks(page).nth(index).click();
    await expect(page).toHaveURL(href);
    await arrival.check(page);
    await expect(page.getByText("This page could not be found")).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(demoLinks(page)).toHaveCount(ARRIVALS.length);
  }
});

test("accueil: chaque lien en chargement direct, statut 200", async ({ page }) => {
  await page.goto("/");
  const hrefs = await demoLinks(page).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(hrefs).toHaveLength(ARRIVALS.length);
  for (const [index, arrival] of ARRIVALS.entries()) {
    const href = hrefs[index] ?? "";
    const response = await page.goto(href);
    expect(response?.status(), href).toBe(200);
    await expect(page).toHaveURL(href);
    await arrival.check(page);
  }
});

test("accueil: chaque lien mesure au moins 44 × 44 px", async ({ page }) => {
  await page.goto("/");
  const count = await demoLinks(page).count();
  expect(count).toBe(ARRIVALS.length);
  for (let index = 0; index < count; index += 1) {
    const box = await demoLinks(page).nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("accueil: contour de focus 2 px line décalé de 2 px sur chaque lien", async ({ page }) => {
  await page.goto("/");
  const line = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim());
  await page.keyboard.press("Tab");
  for (let index = 0; index < ARRIVALS.length; index += 1) {
    const link = demoLinks(page).nth(index);
    await expect(link).toBeFocused();
    const style = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      const rgb = s.outlineColor.match(/\d+/g)!.slice(0, 3).map(Number);
      return {
        width: s.outlineWidth,
        style: s.outlineStyle,
        offset: s.outlineOffset,
        color: `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
      };
    });
    expect(style).toEqual({ width: "2px", style: "solid", offset: "2px", color: line });
    await page.keyboard.press("Tab");
  }
});
