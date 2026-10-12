import { expect, test } from "@playwright/test";

import {
  CATALOGUE_PATH,
  ERROR_PATH,
  ERROR_TITLE,
  FAKE_ID,
  NOT_FOUND_PATHS,
  NOT_FOUND_TITLE,
  blockExternal,
  expectFocusOutlines,
  expectPageBasics,
  expectTouchTargets,
  openErrorPage,
} from "./etats-helpers";

/**
 * Critères F11c (spécification F11, C1, C3, C29 à C31 ; décision 0021 § 7 et § 8), en 390 × 844 sur le build
 * de production, avec VADROUILLE_DEV_PAGES=1 (playwright.config.ts).
 */

let external: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  external = await blockExternal(page, baseURL!);
});

test.afterEach(() => {
  // C1 : aucune requête vers un autre hôte que l'application.
  expect(external).toEqual([]);
});

test.describe("page introuvable", () => {
  test("etats: page introuvable", async ({ page }) => {
    const contents: string[] = [];
    for (const path of NOT_FOUND_PATHS) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expectPageBasics(page);
      await expect(page).toHaveTitle(`${NOT_FOUND_TITLE} · Vadrouille`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOT_FOUND_TITLE);
      await expect(page.getByText("Cette page n'existe pas ou n'est plus disponible.")).toBeVisible();
      const links = page.getByRole("link");
      await expect(links).toHaveCount(1);
      await expect(links).toHaveAccessibleName("Retour à l'accueil");
      await expect(links).toHaveAttribute("href", "/");
      const text = await page.locator("body").innerText();
      // Ni l'adresse demandée, ni l'identifiant, ni la raison.
      expect(text, path).not.toMatch(/inexistante|inconnu|presentation|voyage|organisation/i);
      contents.push(text);
    }
    // Même contenu, quelle que soit l'adresse ou la raison de la 404.
    expect(new Set(contents).size).toBe(1);
  });

  test("etats: « Retour à l'accueil » mène à /", async ({ page }) => {
    await page.goto(NOT_FOUND_PATHS[0]);
    await page.getByRole("link", { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vadrouille");
  });

  test("etats: page introuvable, cibles de 44 px et contour de focus", async ({ page }) => {
    await page.goto(NOT_FOUND_PATHS[0]);
    await expectTouchTargets(page);
    await expectFocusOutlines(page);
  });
});

test.describe("page d'erreur", () => {
  test("etats: erreur inattendue", async ({ page }) => {
    const response = await openErrorPage(page);
    expect(response?.status()).toBe(500);
    await expectPageBasics(page);
    await expect(page).toHaveTitle(`${ERROR_TITLE} · Vadrouille`);
    await expect(page.getByText("Réessaie dans un instant. Si le problème continue, reviens à l'accueil.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
    // Le message de l'erreur levée (avec son identifiant factice) n'apparaît ni à l'écran ni dans le document.
    expect(await page.locator("body").innerText()).not.toContain(FAKE_ID);
    expect(await page.content()).not.toContain(FAKE_ID);
    expect(await page.content()).not.toContain("Erreur volontaire");
  });

  test("etats: « Réessayer » relance le rendu sur le serveur", async ({ page }) => {
    await openErrorPage(page);
    const rerender = page.waitForRequest(
      (request) => new URL(request.url()).pathname === ERROR_PATH && request.headers()["rsc"] === "1",
    );
    await page.getByRole("button", { name: "Réessayer" }).click();
    await rerender;
    // La page lève toujours : la page d'erreur revient, sans le message de l'erreur.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ERROR_TITLE);
    expect(await page.content()).not.toContain(FAKE_ID);
  });

  test("etats: « Retour à l'accueil » quitte la page d'erreur", async ({ page }) => {
    await openErrorPage(page);
    await page.getByRole("link", { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vadrouille");
  });

  test("etats: page d'erreur, cibles de 44 px et contour de focus", async ({ page }) => {
    await openErrorPage(page);
    await expectTouchTargets(page);
    await expectFocusOutlines(page);
  });
});

test.describe("catalogue", () => {
  test("etats: catalogue", async ({ page }) => {
    const response = await page.goto(CATALOGUE_PATH);
    expect(response?.status()).toBe(200);
    await expectPageBasics(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("États transverses");

    const section = (name: string) => page.getByRole("region", { name, exact: true });
    await expect(section("Information incertaine").getByText("À confirmer", { exact: true })).toBeVisible();
    await expect(section("Événement non confirmé").getByText("Non confirmé", { exact: true })).toBeVisible();
    const banners: [string, string][] = [
      ["Hors ligne", "offline"],
      ["Conflit", "conflict"],
      ["Aucune option compatible", "noOption"],
      ["Erreur de calcul", "error"],
      ["Jour en préparation", "generating"],
      ["Trajet au-delà du rythme", "travel"],
    ];
    for (const [name, kind] of banners) {
      await expect(section(name).locator(`[data-kind='${kind}']`), kind).toBeVisible();
    }
    await expect(section("Erreur de calcul").getByRole("alert")).toHaveText(
      "Les temps de trajet n'ont pas pu être recalculés. Ton programme précédent est conservé.",
    );
    await expect(page.getByText("Texte d'exemple : l'écran qui possède ce message n'est pas encore livré.")).toHaveCount(3);
    await expectTouchTargets(page);
  });

  test("etats: les liens du catalogue mènent aux deux pages", async ({ page }) => {
    await page.goto(CATALOGUE_PATH);
    await page.getByRole("link", { name: "Ouvrir une adresse inexistante" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOT_FOUND_TITLE);

    await page.goto(CATALOGUE_PATH);
    await page.getByRole("link", { name: "Ouvrir une page qui lève une erreur" }).click();
    await expect(page).toHaveURL(ERROR_PATH);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ERROR_TITLE);
    expect(await page.content()).not.toContain(FAKE_ID);
  });

  test("etats: catalogue, contour de focus", async ({ page }) => {
    await page.goto(CATALOGUE_PATH);
    await expectFocusOutlines(page);
  });
});
