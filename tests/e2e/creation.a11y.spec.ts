import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { AUTH_CONFIG, MOCK_CODE, MOCK_WRONG_CODE, codeAlert, connexionRoute, emailField, pasteCode, requestCodeFor, uniqueEmail } from "./connexion-helpers";
import { EDIMBOURG, R1, R3, R3_DEV, continueButton, fillTrip, installClock, reachAfterBrief, reachBrief, reachReview } from "./creation-helpers";
import { expectPath, useScope } from "./debloquer-helpers";
import { R5, STEP_MS, advance, alertRegion, counter, launchFromCreation, leaveLodging } from "./preparation-helpers";

/**
 * Axe (WCAG 2.2 AA), cibles de 44 × 44 px, contour de focus et titre de niveau 1 unique sur chaque état des
 * écrans 1 et 2 (spécification F8, « Tests » ; critères transverses) : écran 1 vide, avec erreurs, avec une ville
 * et un engagement ; écran 2 récit, vérification avec champs déduits, sections repliées ; F8c : écran 5 en
 * préparation, prêt, incomplet et en erreur, bandeaux « conflict » et « error » de `R-lancer`.
 */

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  // Chaque élément interactif affiché mesure au moins 44 × 44 px (le contenu d'une section repliée est masqué).
  const controls = page.getByRole("main").locator("a:visible, button:visible, input:visible, textarea:visible");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const box = await control.boundingBox();
    const label = (await control.getAttribute("aria-label")) ?? (await control.textContent()) ?? (await control.getAttribute("id"));
    expect(box, label ?? "").not.toBeNull();
    expect(box!.width, label ?? "").toBeGreaterThanOrEqual(44);
    expect(box!.height, label ?? "").toBeGreaterThanOrEqual(44);
  }

  // Contour de focus : 2 px `line`, décalé de 2 px, au clavier, sur chaque élément atteint par la tabulation.
  const line = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim());
  await page.locator("body").focus();
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Tab");
    const style = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const s = getComputedStyle(element);
      const rgb = s.outlineColor.match(/\d+/g)!.slice(0, 3).map(Number);
      return {
        width: s.outlineWidth,
        style: s.outlineStyle,
        offset: s.outlineOffset,
        color: `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
      };
    });
    if (style === null) continue;
    const who = await page.evaluate(() => { const e = document.activeElement as HTMLElement; return [e.tagName, e.id, e.getAttribute("type"), e.getAttribute("aria-label"), e.textContent?.slice(0, 20)].join("|"); });
    expect(style, who).toEqual({ width: "2px", style: "solid", offset: "2px", color: line });
  }
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
  await installClock(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test("creation: aucune violation axe, écran 1 vide", async ({ page }) => {
  await page.goto(R1);
  await expectAccessible(page);
});

test("creation: aucune violation axe, écran 1 avec erreurs", async ({ page }) => {
  await page.goto(R1);
  await continueButton(page).click();
  await expect(page.getByLabel("Destination", { exact: true })).toBeFocused();
  await expectAccessible(page);
});

test("creation: aucune violation axe, écran 1 avec une ville et un engagement", async ({ page }) => {
  await page.goto(R1);
  await fillTrip(page, EDIMBOURG);
  await page.getByRole("button", { name: "Ajouter une ville" }).click();
  await page.getByLabel("Nom de la ville").fill("Glasgow");
  await page.getByLabel("Arrivée dans cette ville").fill("2026-09-01");
  await page.getByRole("button", { name: "Ajouter un engagement" }).click();
  await expect(page.getByRole("list", { name: "Tes villes" })).toBeVisible();
  await expectAccessible(page);
});

test("creation: aucune violation axe, écran 1 après un brouillon perdu", async ({ page }) => {
  await reachBrief(page);
  await page.reload();
  await expect(page.getByText("Ton brouillon n'a pas été conservé.", { exact: false })).toBeVisible();
  await expectAccessible(page);
});

test("brief: aucune violation axe, récit", async ({ page }) => {
  await reachBrief(page);
  await expectAccessible(page);
});

test("brief: aucune violation axe, récit avec erreur", async ({ page }) => {
  await reachBrief(page);
  await page.getByRole("button", { name: "Préparer mon brief" }).click();
  await expect(page.getByText("Écris au moins une phrase, ou remplis le brief toi-même.")).toBeVisible();
  await expectAccessible(page);
});

test("brief: aucune violation axe, vérification avec champs déduits et sections repliées", async ({ page }) => {
  await reachBrief(page);
  await reachReview(page);
  await expect(page.getByRole("button", { name: /^À limiter/ })).toHaveAttribute("aria-expanded", "false");
  await expectAccessible(page);
});

test("brief: aucune violation axe, vérification remplie soi-même avec erreurs et sections ouvertes", async ({ page }) => {
  await reachBrief(page);
  await page.getByRole("button", { name: "Remplir moi-même" }).click();
  await continueButton(page).click();
  await expect(page.getByText("Choisis un rythme.")).toBeVisible();
  for (const name of [/^Déplacements/, /^À limiter/, /^Budget par repas/]) await page.getByRole("button", { name }).click();
  await expectAccessible(page);
});

// F8b : écrans 3 et 4 (spécification F8, « Tests » ; critères transverses).

test("logement: aucune violation axe, quartier et logements (configuration absente)", async ({ page }) => {
  await reachAfterBrief(page);
  await expectPath(page, R3);
  await expect(page.getByRole("button", { name: "Partir du quartier, choisir plus tard" })).toBeVisible();
  await expectAccessible(page);
});

test("logement: aucune violation axe, carte simulée (R3-dev)", async ({ page }) => {
  await page.goto(R3_DEV);
  await expect(page.locator("[data-part='zone']")).toBeVisible();
  await expectAccessible(page);
});

test("logement: aucune violation axe, aucun quartier", async ({ page }) => {
  await reachAfterBrief(page, { ...EDIMBOURG, destination: "Glasgow" });
  await expect(page.getByText("Aucun quartier à te proposer pour l'instant.")).toBeVisible();
  await expectAccessible(page);
});

test("connexion: aucune violation axe, étape email", async ({ page }) => {
  await page.goto(connexionRoute("/voyages/nouveau/lancer"));
  await expect(emailField(page)).toBeVisible();
  await expectAccessible(page);
});

test("connexion: aucune violation axe, email invalide", async ({ page }) => {
  await page.goto(connexionRoute("/voyages"));
  await emailField(page).fill("camille@");
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");
  await expectAccessible(page);
});

test("connexion: aucune violation axe, étape code", async ({ page }) => {
  await page.goto(connexionRoute("/voyages"));
  await requestCodeFor(page, uniqueEmail());
  await expectAccessible(page);
});

test("connexion: aucune violation axe, code faux", async ({ page }) => {
  await page.goto(connexionRoute("/voyages"));
  await requestCodeFor(page, uniqueEmail());
  await pasteCode(page, MOCK_WRONG_CODE);
  await expect(codeAlert(page)).not.toHaveText("");
  await expectAccessible(page);
});

test("connexion: aucune violation axe, trop d'essais", async ({ page }) => {
  await page.goto(connexionRoute("/voyages"));
  await requestCodeFor(page, uniqueEmail());
  for (let attempt = 1; attempt <= AUTH_CONFIG.maxAttempts; attempt += 1) {
    await expect(page.getByRole("textbox", { name: "Chiffre 1 sur 6" })).toBeEnabled();
    await pasteCode(page, MOCK_WRONG_CODE);
    await expect(codeAlert(page)).not.toHaveText("");
  }
  await expect(codeAlert(page)).toHaveText(/^Trop d'essais/);
  await expectAccessible(page);
});

test("preparation: aucune violation axe, en préparation", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await launchFromCreation(page);
  await advance(page, scope, 5 * STEP_MS, async (p) => expect(counter(p)).toHaveText("5 propositions prêtes sur 8", { timeout: 1000 }));
  await expectAccessible(page);
});

test("preparation: aucune violation axe, prêt", async ({ page }) => {
  await page.goto(R5);
  await expect(page.getByRole("link", { name: "Voir mes propositions" })).toBeVisible();
  await expectAccessible(page);
});

test("preparation: aucune violation axe, aperçu incomplet", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await scope.control({ action: "configureGeneration", outcome: "incomplete" });
  await launchFromCreation(page);
  const banner = (p: Page) => p.getByText("2 propositions n'ont pas trouvé de lieu compatible.");
  await advance(page, scope, 8 * STEP_MS, async (p) => expect(banner(p)).toBeVisible({ timeout: 1000 }));
  await expectAccessible(page);
});

test("preparation: aucune violation axe, erreur", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await scope.control({ action: "configureGeneration", outcome: "failed" });
  await launchFromCreation(page);
  const retry = (p: Page) => alertRegion(p).getByRole("button", { name: "Réessayer" });
  await advance(page, scope, 3 * STEP_MS, async (p) => expect(retry(p)).toBeVisible({ timeout: 1000 }));
  await expectAccessible(page);
});

test("lancement: aucune violation axe, aperçu déjà en préparation", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await launchFromCreation(page);
  await reachAfterBrief(page);
  await leaveLodging(page);
  await expect(page.getByRole("link", { name: "Voir ces propositions" })).toBeVisible();
  await expectAccessible(page);
});

test("lancement: aucune violation axe, erreur", async ({ page, context, baseURL }) => {
  // Horloge de la portée au-delà de l'arrivée (29 août) : `createTrip` refuse le brouillon, bandeau « error ».
  const scope = await useScope(context, baseURL!);
  for (let week = 0; week < 5; week += 1) await scope.control({ action: "advanceClock", ms: 7 * 86_400_000 });
  await reachAfterBrief(page);
  await leaveLodging(page);
  await requestCodeFor(page, uniqueEmail());
  await pasteCode(page, MOCK_CODE);
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await expectAccessible(page);
});
