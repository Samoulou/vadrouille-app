import { existsSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { R1, R4_LANCER, R_LANCER, installClock, reachAfterBrief } from "./creation-helpers";
import { expectPath, pathOf, useScope } from "./debloquer-helpers";
import {
  R5,
  R6,
  R11,
  STEP_MS,
  advance,
  alertRegion,
  announcements,
  collectLaunchCalls,
  counter,
  dayRows,
  heading,
  launchFromCreation,
  leaveLodging,
  rings,
} from "./preparation-helpers";
import { collectEvents } from "./presentation-helpers";

/**
 * Lancement et écran 5 (spécification F8, critères [c] ; décisions 0017 § 9 et § 10, 0018 § 18 et § 19), build de
 * production, 390 × 844, domaines Google bloqués, horloge du navigateur installée au 2026-08-01T08:00 (jamais en
 * temps fixe). Chaque test qui se connecte a sa portée de simulation ; l'avancement de la génération ne dépend que
 * de l'horloge de la portée, avancée par `R-sim`.
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

const QUICK = { timeout: 1000 };
const counterIs = (text: string) => async (page: Page) => expect(counter(page)).toHaveText(text, QUICK);
const dayStates = async (page: Page) => Promise.all((await dayRows(page).all()).map((row) => row.getAttribute("data-day-state")));

/** Élément focalisé, décrit par son nom de balise et son texte (le focus ne doit jamais bouger). */
const focused = (page: Page) => page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.textContent?.slice(0, 40) ?? ""}`);

test("preparation: progression et sorties", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  const launches = collectLaunchCalls(page);
  const events = collectEvents(page);
  await launchFromCreation(page);
  expect(launches).toHaveLength(1);

  await expect(heading(page)).toHaveText("On prépare tes premières propositions");
  await expect(counter(page)).toHaveText("0 proposition prête sur 8");
  await expect(dayRows(page)).toHaveCount(2);
  await expect(dayRows(page).nth(0)).toContainText("En préparation");
  await expect(dayRows(page).nth(1)).toContainText("En préparation");
  const focus = await focused(page);

  // Une proposition de plus toutes les 2 secondes de la portée : J1 prêt au 4e pas, J2 et l'état final au 8e.
  await advance(page, scope, STEP_MS, counterIs("1 proposition prête sur 8"));
  await advance(page, scope, 3 * STEP_MS, counterIs("4 propositions prêtes sur 8"));
  await expect(dayRows(page).nth(0)).toContainText("Jour 1 prêt");
  await expect(dayRows(page).nth(1)).toContainText("En préparation");
  await expect(announcements(page)).toHaveText("Jour 1 prêt");
  await advance(page, scope, 4 * STEP_MS, counterIs("8 propositions prêtes sur 8"));
  await expect(heading(page)).toHaveText("Tes premières propositions sont prêtes");
  await expect(dayRows(page).nth(1)).toContainText("Jour 2 prêt");

  const voir = page.getByRole("link", {
    name: "Voir mes propositions",
    exact: true,
  });
  const passer = page.getByRole("link", {
    name: "Passer, voir le programme",
    exact: true,
  });
  await expect(voir).toHaveAttribute("href", R6);
  await expect(passer).toHaveAttribute("href", R11);
  // Aucune redirection automatique, focus inchangé, aucun nom de lieu (les noms du jeu simulé sont entre crochets).
  await page.clock.runFor(5000);
  expect(pathOf(page)).toBe(R5);
  expect(await focused(page)).toBe(focus);
  expect(await page.locator("main").innerText()).not.toMatch(/\[/);

  // `preview_ready` une fois, avec la durée depuis l'appel à `createTrip` (au moins une interrogation d'une seconde).
  await expect.poll(() => events.filter((event) => event.name === "preview_ready")).toHaveLength(1);
  const [ready] = events.filter((event) => event.name === "preview_ready");
  expect(Object.keys(ready!.properties)).toEqual(["duration_ms"]);
  expect((ready!.properties as { duration_ms: number }).duration_ms).toBeGreaterThanOrEqual(1000);

  // Retour sur l'écran dans l'onglet : aucun doublon ; après rechargement : sans durée.
  await passer.click();
  await expectPath(page, R11);
  await page.goBack();
  await expectPath(page, R5);
  await expect(heading(page)).toHaveText("Tes premières propositions sont prêtes");
  await page.clock.runFor(2000);
  expect(events.filter((event) => event.name === "preview_ready")).toHaveLength(1);
  await page.reload();
  await expect(heading(page)).toHaveText("Tes premières propositions sont prêtes");
  await expect.poll(() => events.filter((event) => event.name === "preview_ready")).toHaveLength(2);
  expect(events.filter((event) => event.name === "preview_ready")[1]!.properties).toEqual({});
  expect(launches).toHaveLength(1);
});

test("preparation: sans bandeau de génération", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await launchFromCreation(page);
  const generating = page.locator("[data-kind='generating']");
  await expect(announcements(page)).toBeAttached();
  await expect(announcements(page)).toHaveText("");
  await expect(alertRegion(page)).toBeAttached();

  // Compteur hors région live ; mini-lignes décoratives.
  const live = await counter(page).evaluate((element) => element.closest("[role='status'], [role='alert'], [aria-live]") !== null);
  expect(live).toBe(false);
  for (const line of await page.locator("[data-mini-ligne]").all()) await expect(line).toHaveAttribute("aria-hidden", "true");

  const seen: string[] = [];
  for (let step = 1; step <= 8; step++) {
    const text = `${step} ${step > 1 ? "propositions prêtes" : "proposition prête"} sur 8`;
    await advance(page, scope, STEP_MS, counterIs(text));
    seen.push(text);
    await expect(generating).toHaveCount(0);
    // Anneaux : 4 par jour au plus, un par proposition prête du jour, jamais plus que `readyStops`.
    await expect(rings(dayRows(page).nth(0))).toHaveCount(Math.min(4, step));
    await expect(rings(dayRows(page).nth(1))).toHaveCount(Math.max(0, step - 4));
  }
  expect(seen.slice(0, 2)).toEqual(["1 proposition prête sur 8", "2 propositions prêtes sur 8"]);
  await expect(announcements(page).locator("p")).toHaveText(["Jour 1 prêt", "Jour 2 prêt", "Tes premières propositions sont prêtes"]);
  await page.clock.runFor(3000);
  await expect(announcements(page).locator("p")).toHaveCount(3);
  expect(await dayStates(page)).toEqual(["ready", "ready"]);
});

test("preparation: aperçu incomplet", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await scope.control({ action: "configureGeneration", outcome: "incomplete" });
  await launchFromCreation(page);
  await advance(page, scope, 8 * STEP_MS, counterIs("6 propositions prêtes sur 8"));
  await expect(heading(page)).toHaveText("Tes premières propositions sont prêtes");
  await expect(
    page.getByRole("status").filter({
      hasText: "2 propositions n'ont pas trouvé de lieu compatible.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir mes propositions", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Passer, voir le programme", exact: true })).toBeVisible();
  await expect(rings(dayRows(page).nth(1))).toHaveCount(2);
});

test("preparation: erreur réparable, « Réessayer » relance le suivi", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await scope.control({ action: "configureGeneration", outcome: "failed" });
  await launchFromCreation(page);
  await advance(page, scope, 3 * STEP_MS, async (p) => expect(alertRegion(p)).toContainText("La préparation s'est interrompue.", QUICK));
  const retry = alertRegion(page).getByRole("button", {
    name: "Réessayer",
    exact: true,
  });
  await expect(retry).toBeVisible();
  // Le suivi est arrêté : avancer la portée ne change rien sans « Réessayer ».
  await scope.control({ action: "advanceClock", ms: 3 * STEP_MS });
  await page.clock.runFor(3000);
  await expect(counter(page)).toHaveText("3 propositions prêtes sur 8");
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(alertRegion(page)).toHaveText("");
  await advance(page, scope, 0, counterIs("4 propositions prêtes sur 8"));
});

test("preparation: erreur définitive, sans « Réessayer »", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await scope.control({
    action: "configureGeneration",
    outcome: "failedFinal",
  });
  await launchFromCreation(page);
  await advance(page, scope, 3 * STEP_MS, async (p) => expect(alertRegion(p)).toContainText("La préparation s'est interrompue.", QUICK));
  await expect(alertRegion(page).getByRole("button", { name: "Réessayer" })).toHaveCount(0);
  await expect(
    alertRegion(page).getByRole("link", {
      name: "Voir mes voyages",
      exact: true,
    }),
  ).toHaveAttribute("href", "/voyages");
  await expect(page.getByRole("link", { name: "Voir mes propositions" })).toHaveCount(0);
});

test("preparation: mouvement réduit, aucune animation de tracé", async ({ page }) => {
  // Portée par défaut, ouverture directe : le voyage simulé est déjà complet, les rails pleins sont affichés.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(R5);
  await expect(heading(page)).toHaveText("Tes premières propositions sont prêtes");
  const rails = page.locator("[data-rail-plein]");
  await expect(rails).toHaveCount(2);
  for (const rail of await rails.all()) {
    const property = await rail.evaluate((element) => getComputedStyle(element).transitionProperty);
    expect(property).not.toContain("transform");
    expect(await rail.evaluate((element) => element.getAnimations().length)).toBe(0);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await rails.first().evaluate((element) => getComputedStyle(element).transitionProperty)).toContain("transform");
});

test("preparation: « Retour » vers Mes voyages", async ({ page }) => {
  await page.goto(R5);
  const back = page.getByRole("button", { name: "Retour", exact: true });
  // F8-PO-20 : présent seulement si « Mes voyages » (F11a) existe dans le build testé.
  if (existsSync(join(__dirname, "..", "..", "src", "app", "voyages", "page.tsx"))) {
    await back.click();
    await expectPath(page, "/voyages");
  } else {
    await expect(back).toHaveCount(0);
  }
});

test("preparation: 404 hors organisation", async ({ page }) => {
  const response = await page.goto("/voyages/inconnu/preparation");
  expect(response?.status()).toBe(404);
});

test("creation: lancement gardé", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const launches = collectLaunchCalls(page);

  // Ouverture directe (aucun brouillon) : R1 et l'annonce du brouillon perdu.
  await page.goto(R_LANCER);
  await expectPath(page, R1);
  await expect(page.getByText("Ton brouillon n'a pas été conservé.", { exact: false })).toBeVisible();

  // Brouillon complet sans session : R-lancer remplace son adresse par R4(R-lancer).
  await reachAfterBrief(page);
  await leaveLodging(page);
  await expectPath(page, R4_LANCER);
  await page.evaluate((path) => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push(path), R_LANCER);
  await expectPath(page, R4_LANCER);
  await expect(heading(page)).toHaveText("Connecte-toi pour recevoir tes propositions");
  expect(launches).toHaveLength(0);
});

test("creation: aperçu déjà en préparation", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const launches = collectLaunchCalls(page);
  await launchFromCreation(page);
  await expect(counter(page)).toHaveText("0 proposition prête sur 8");

  // Nouveau brouillon (nouveau `requestId`) avec la session : l'écran 4 est sauté, le lancement refuse.
  await reachAfterBrief(page);
  await leaveLodging(page);
  await expectPath(page, R_LANCER);
  const alert = page.getByRole("alert").filter({ hasText: "Tu as déjà des propositions en préparation." });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Voir ces propositions", exact: true })).toHaveAttribute("href", R5);
  expect(launches).toHaveLength(2);
  await alert.getByRole("link", { name: "Voir ces propositions", exact: true }).click();
  await expectPath(page, R5);
});
