import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ED, MOMENTS, openToday, region, setClock } from "./aujourdhui-helpers";
import { blockExternal, expectFocusOutlines, expectPageBasics, expectTouchTargets } from "./etats-helpers";
import { HEADER } from "./debloquer-helpers";
import { controlNetwork, expectFallback, FALLBACK_TITLE, R_REPLI, waitForActiveWorker } from "./hors-ligne-helpers";
import {
  createLink,
  createShareScope,
  openShareSheet,
  R11,
  RP,
  RPJ,
  SHARE_TOKEN_DESACTIVE,
  SHARE_TOKEN_VALIDE,
  shareButton,
  shareSheet,
  sheetButton,
} from "./partage-helpers";

/**
 * Axe (WCAG 2.2 AA) sur l'écran 15 « Aujourd'hui » (`R15`, F10a, C2) : en cours, temps libre, plus d'étape,
 * avant et après le voyage, rappels, hors ligne ; cibles de 44 px, contour de focus de Ligne, un seul titre de
 * niveau 1, `lang="fr"`. F10b et F10c ajoutent ici `R-repli`, la feuille « Partager », `RP` et `RPJ`.
 */

test.use({ timezoneId: "Europe/London" });

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

let external: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  external = await blockExternal(page, baseURL!);
});
test.afterEach(() => {
  expect(external).toEqual([]);
});

const STATES: [string, string][] = [
  ["rappels et prochaine étape", MOMENTS.prochaine],
  ["en cours", MOMENTS.enCours],
  ["temps libre", MOMENTS.tempsLibre],
  ["plus d'étape", MOMENTS.plusDEtape],
  ["avant le voyage", MOMENTS.avant],
  ["après le voyage", MOMENTS.apres],
];

for (const [name, iso] of STATES) {
  test(`aujourdhui: aucune violation axe, ${name}`, async ({ page }) => {
    await setClock(page, iso);
    await openToday(page);
    await expectPageBasics(page);
    await expectNoViolations(page);
  });
}

test("aujourdhui: aucune violation axe, hors ligne", async ({ page, context }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await context.setOffline(true);
  await expect(page.locator("#aujourdhui-hors-ligne")).toBeVisible();
  await expectNoViolations(page);
  await context.setOffline(false);
});

test("aujourdhui: cibles de 44 px et contour de focus de Ligne", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await expect(region(page, "Prochaine étape")).toBeVisible();
  await expectTouchTargets(page);
  await expectFocusOutlines(page);
});

/**
 * Page de repli hors ligne (`R-repli`, F10b) : ouverte directement, et servie par le service worker à une
 * navigation qui échoue faute de réseau (service workers autorisés pour ce bloc, F10-TL-6).
 */
test.describe("page de repli", () => {
  test.use({ serviceWorkers: "allow" });

  test("hors-ligne: aucune violation axe, page de repli ouverte directement", async ({ page }) => {
    await page.goto(R_REPLI);
    await expect(page.getByRole("heading", { level: 1, name: FALLBACK_TITLE })).toBeVisible();
    await expectPageBasics(page);
    await expectNoViolations(page);
    await expectTouchTargets(page);
    await expectFocusOutlines(page);
  });

  test("hors-ligne: aucune violation axe, page de repli servie hors ligne", async ({ page, context, baseURL }) => {
    const setOffline = await controlNetwork(context, baseURL!);
    await setClock(page, MOMENTS.prochaine);
    await openToday(page);
    await waitForActiveWorker(page);
    await setOffline(true);
    await page.goto(`/voyages/${ED}/jour/2`);
    await expectFallback(page);
    await expectPageBasics(page);
    await expectNoViolations(page);
    await setOffline(false);
  });
});

/**
 * Feuille « Partager », `RP`, `RPJ` et 404 de la vue partagée (F10c, C2). Chaque test a sa portée de simulation
 * au 2026-08-30 ; l'en-tête de la portée est ajouté par une route de la page posée après `blockExternal`, qui
 * passe la main (`fallback`) au blocage des autres origines.
 */
test.describe("partage", () => {
  test.beforeEach(async ({ page, context, baseURL }) => {
    const scope = await createShareScope(context, baseURL!);
    await page.route(`${baseURL}/**`, (route) => route.fallback({ headers: { ...route.request().headers(), [HEADER]: scope.name } }));
  });

  /**
   * Cibles de 44 px de la feuille (le helper de page compte aussi les gardes de focus de Radix, de taille nulle par
   * construction).
   */
  async function expectSheetTouchTargets(page: Page) {
    const elements = shareSheet(page).locator("button, a[href], input");
    const count = await elements.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await elements.nth(index).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  }

  /**
   * Cibles de 44 px de la vue partagée. Le lien d'évitement de la carte (`data-part="evitement"`, F4, commun avec
   * la Journée) n'est pas mesuré : masqué hors focus, il est hors du périmètre de F10c (signalé dans la PR).
   */
  async function expectViewTouchTargets(page: Page) {
    const elements = page.locator("button, a[href]:not([data-part='evitement']), input, [tabindex]:not([tabindex='-1'])");
    const count = await elements.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const element = elements.nth(index);
      const box = await element.boundingBox();
      const description = await element.evaluate((el) => el.outerHTML.slice(0, 120));
      expect(box!.height, description).toBeGreaterThanOrEqual(44);
      expect(box!.width, description).toBeGreaterThanOrEqual(44);
    }
  }

  /** Envoi d'une action serveur (en-tête `Next-Action`), retenu ou interrompu par le test. */
  const isAction = (method: string, headers: Record<string, string>) => method === "POST" && "next-action" in headers;

  test("partage: aucune violation axe, feuille en chargement", async ({ page }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*", async (route) => {
      if (isAction(route.request().method(), route.request().headers())) await held;
      await route.fallback();
    });
    await page.goto(R11());
    await shareButton(page).click();
    await expect(shareSheet(page).getByText("Chargement du partage.")).toBeVisible();
    await expectNoViolations(page);
    release();
    await expect(sheetButton(page, "Désactiver le lien")).toBeVisible();
  });

  test("partage: aucune violation axe, lien actif, confirmations, aucun lien, lien créé", async ({ page }) => {
    await page.goto(R11());
    await openShareSheet(page);
    await expect(sheetButton(page, "Désactiver le lien")).toBeVisible();
    await expectNoViolations(page);
    await sheetButton(page, "Désactiver le lien").click();
    await expect(shareSheet(page).getByText("Le lien ne fonctionnera plus pour personne.")).toBeVisible();
    await expectNoViolations(page);
    await sheetButton(page, "Annuler").click();
    await sheetButton(page, "Créer un nouveau lien").click();
    await expect(shareSheet(page).getByText("L'ancien lien ne fonctionnera plus pour personne.")).toBeVisible();
    await expectNoViolations(page);
    await sheetButton(page, "Annuler").click();
    await sheetButton(page, "Désactiver le lien").click();
    await sheetButton(page, "Désactiver").click();
    await expect(sheetButton(page, "Créer un lien")).toBeVisible();
    await expectNoViolations(page);
    await createLink(page);
    await expectNoViolations(page);
    await expectSheetTouchTargets(page);
  });

  test("partage: aucune violation axe, erreur", async ({ page }) => {
    await page.goto(R11());
    await openShareSheet(page);
    await page.route("**/*", (route) =>
      isAction(route.request().method(), route.request().headers()) ? route.abort("failed") : route.fallback(),
    );
    await sheetButton(page, "Désactiver le lien").click();
    await sheetButton(page, "Désactiver").click();
    await expect(shareSheet(page).getByRole("alert")).toHaveText(/Impossible de modifier le partage pour le moment\./);
    await expectNoViolations(page);
  });

  test("partage: aucune violation axe, feuille hors ligne", async ({ page, context }) => {
    await page.goto(R11());
    await openShareSheet(page);
    await context.setOffline(true);
    await expect(shareSheet(page).getByText("Tu es hors ligne. Partager demande une connexion.")).toBeVisible();
    await expectNoViolations(page);
    await context.setOffline(false);
  });

  for (const [name, path] of [
    ["RP", RP(SHARE_TOKEN_VALIDE)],
    ["RPJ jour 2", RPJ(SHARE_TOKEN_VALIDE, 2)],
    ["RPJ jour 6, en préparation", RPJ(SHARE_TOKEN_VALIDE, 6)],
  ] as const) {
    test(`partage: aucune violation axe, ${name}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByText("Programme partagé · lecture seule")).toBeVisible();
      await expectPageBasics(page);
      await expectNoViolations(page);
      await expectViewTouchTargets(page);
      await expectFocusOutlines(page);
    });
  }

  test("partage: aucune violation axe, lien non valide (404)", async ({ page }) => {
    const response = await page.goto(RP(SHARE_TOKEN_DESACTIVE));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Ce lien de partage n'est pas valide." })).toBeVisible();
    await expectPageBasics(page);
    await expectNoViolations(page);
  });
});
