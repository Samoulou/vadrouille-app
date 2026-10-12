import { expect, test } from "@playwright/test";

import {
  ED,
  ED_OK,
  MOMENTS,
  R15,
  announcement,
  dayLine,
  expectNothingPersisted,
  openToday,
  region,
  runUntil,
  setClock,
  setHidden,
  stopRow,
  subtitle,
} from "./aujourdhui-helpers";
import { blockExternal } from "./etats-helpers";
import { collectEvents } from "./presentation-helpers";

/**
 * Spécification F10, critères [a] (F10a) : écran 15 « Aujourd'hui » (`R15`) en ligne, lien depuis le Séjour,
 * bandeau hors ligne de l'écran ouvert. Build de production, 390 × 844, fuseau `Europe/London` sauf mention,
 * horloge du navigateur installée (`page.clock`). Aucune requête vers un autre hôte que l'application (C4).
 */

test.use({ timezoneId: "Europe/London" });

let external: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  external = await blockExternal(page, baseURL!);
});
test.afterEach(() => {
  expect(external).toEqual([]);
});

test("aujourdhui: prochaine étape", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  const response = await openToday(page);
  const cacheControl = response?.headers()["cache-control"] ?? "";
  expect(cacheControl).toContain("private");
  expect(cacheControl).toContain("no-store");
  await expect(page).toHaveTitle("Édimbourg · Aujourd'hui");
  await expect(subtitle(page)).toHaveText("Édimbourg · Jour 2 · Dimanche 30 août");
  await expect(page.locator("[data-part='fuseau']")).toHaveCount(0);
  await expect(region(page, "En ce moment")).toHaveCount(0);

  const next = region(page, "Prochaine étape");
  await expect(next).toContainText("10:50 – 11:50");
  await expect(next).toContainText("[Dean Village]");
  await expect(next.locator("[data-part='pour-y-aller']")).toHaveText("Pour y aller : À pied, 20 min");
  const itinerary = next.getByRole("link", { name: /^Itinéraire/ });
  await expect(itinerary).toHaveAttribute("target", "_blank");
  const rel = (await itinerary.getAttribute("rel")) ?? "";
  expect(rel).toContain("noopener");
  expect(rel).toContain("noreferrer");
  expect(await itinerary.getAttribute("href")).toContain("mock_place_dean_village");

  // Ordre et première vue : « Prochaine étape » avant le bandeau « À réserver », dans la fenêtre sans défilement.
  const order = await page.evaluate(() => {
    const nextBlock = document.querySelector("[data-part='prochaine-etape']");
    const banner = document.querySelector("[data-part='bandeau-action']");
    return nextBlock && banner ? nextBlock.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
  });
  expect(order).toBeTruthy();
  for (const locator of [next.getByRole("heading", { name: "Prochaine étape" }), next.getByText("[Dean Village]")]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  await expect(page.getByText("Données de lieux : Google")).toHaveCount(0);
});

test("aujourdhui: au fil de la journée", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);

  await runUntil(page, MOMENTS.enCours);
  const current = region(page, "En ce moment");
  await expect(current).toContainText("[Dean Village]");
  await expect(current).toContainText("jusqu'à 11:50");
  const then = region(page, "Ensuite");
  await expect(then).toContainText("[Café de Stockbridge]");
  await expect(then).toContainText("12:05 – 13:15");

  await runUntil(page, MOMENTS.tempsLibre);
  await expect(current).toContainText("Temps libre jusqu'à 18:30");
  await expect(then).toContainText("[Bonne table de New Town]");
  await expect(then).toContainText("19:00 – 20:30");
  await expect(then.getByRole("link", { name: /^Itinéraire/ })).toHaveCount(0);

  await runUntil(page, MOMENTS.plusDEtape);
  await expect(page.getByText("Plus d'étape aujourd'hui.")).toBeVisible();
  await expect(region(page, "Demain")).toContainText("Première étape à 08:00 : [Excursion guidée dans les Highlands]");
});

test("aujourdhui: mise à jour", async ({ page }) => {
  await setClock(page, "2026-08-30T10:49:30+01:00");
  await openToday(page);
  await expect(region(page, "Prochaine étape")).toContainText("[Dean Village]");
  await expect(announcement(page)).toHaveText("");

  await runUntil(page, "2026-08-30T10:49:59+01:00");
  await expect(region(page, "Prochaine étape")).toContainText("[Dean Village]");
  await expect(region(page, "En ce moment")).toHaveCount(0);

  await runUntil(page, "2026-08-30T10:51:00+01:00");
  await expect(region(page, "En ce moment")).toContainText("[Dean Village]");
  await expect(announcement(page)).toHaveText("En ce moment : [Dean Village].");

  await setHidden(page, true);
  await page.clock.setSystemTime(new Date("2026-08-30T12:10:00+01:00"));
  await setHidden(page, false);
  await expect(region(page, "En ce moment")).toContainText("[Café de Stockbridge]");
  await expect(announcement(page)).toHaveText("En ce moment : [Café de Stockbridge].");
});

test("aujourdhui: rappels", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  const banner = region(page, "À réserver");
  await expect(banner).toHaveAttribute("data-part", "bandeau-action");
  await expect(banner.getByRole("list", { name: "Aujourd'hui" })).toHaveText("19:00 [Bonne table de New Town]");
  await expect(banner.getByRole("list", { name: "Demain" })).toHaveText("08:00 [Excursion guidée dans les Highlands]");
  await expect(banner).toContainText("Si c'est déjà réservé, ignore ce rappel.");

  await runUntil(page, MOMENTS.plusDEtape);
  await expect(banner.getByRole("list", { name: "Aujourd'hui" })).toHaveCount(0);
  await expect(banner).not.toContainText("19:00");
  await expect(banner.getByRole("list", { name: "Demain" })).toHaveText("08:00 [Excursion guidée dans les Highlands]");
});

test.describe("fuseau de l'appareil différent de la destination", () => {
  test.use({ timezoneId: "Europe/Zurich" });

  test("aujourdhui: heure de la destination", async ({ page }) => {
    await setClock(page, "2026-08-30T00:30:00+02:00");
    await openToday(page);
    await expect(subtitle(page)).toHaveText("Édimbourg · Jour 1 · Samedi 29 août");
    await expect(page.locator("[data-part='fuseau']")).toHaveText("Heures d'Édimbourg");
    await expect(page.getByText("Plus d'étape aujourd'hui.")).toBeVisible();
    await expect(region(page, "Demain")).toContainText("Première étape à 09:15 : [Royal Mile]");
  });
});

test("aujourdhui: hors des dates", async ({ page }) => {
  const events = collectEvents(page);
  const cases: [string, string][] = [
    [MOMENTS.avant, "Ton voyage commence le samedi 29 août."],
    [MOMENTS.veille, "Ton voyage commence demain."],
    [MOMENTS.apres, "Ton voyage est terminé."],
    [MOMENTS.apresTrenteJours, "Ton voyage est terminé."],
  ];
  await setClock(page, cases[0]![0]);
  for (const [iso, text] of cases) {
    await page.clock.setSystemTime(new Date(iso));
    await openToday(page);
    await expect(page.getByText(text)).toBeVisible();
    await expect(subtitle(page)).toHaveText("Édimbourg");
    await expect(region(page, "Prochaine étape")).toHaveCount(0);
    await expect(region(page, "À réserver")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Voir le séjour" })).toHaveAttribute("href", `/voyages/${ED}`);
    if (iso === MOMENTS.veille) {
      await expect(region(page, "Demain")).toContainText("Première étape à 12:45 : [Petite adresse du Grassmarket]");
    } else {
      await expect(region(page, "Demain")).toHaveCount(0);
    }
  }
  // Un `today_opened` par chargement, hors des dates aussi (C18).
  await expect.poll(() => events.filter((event) => event.name === "today_opened").length).toBe(cases.length);

  await page.clock.setSystemTime(new Date(MOMENTS.dernierJour));
  await openToday(page);
  await expect(subtitle(page)).toHaveText(/^Édimbourg · Jour 6 · /);
  await expect(region(page, "Demain")).toHaveCount(0);
});

test("aujourdhui: jour en préparation", async ({ page }) => {
  const events = collectEvents(page);
  await setClock(page, "2026-09-03T10:00:00+01:00");
  await openToday(page, `/voyages/${ED_OK}/aujourdhui`);
  await expect(page.getByText("Ta journée est encore en préparation.")).toBeVisible();
  for (const name of ["En ce moment", "Prochaine étape", "Ta journée", "Demain"]) {
    await expect(region(page, name)).toHaveCount(0);
  }
  await expect.poll(() => events.filter((event) => event.name === "today_opened")).toEqual([
    { name: "today_opened", properties: { offline: false } },
  ]);
});

test.describe("sans JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("aujourdhui: chargement", async ({ page }) => {
    const response = await page.goto(R15);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Aujourd'hui" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Chargement de ta journée." })).toHaveCount(1);
    // Le moteur de texte de Playwright ignore `<noscript>` : contrôle par ses éléments.
    await expect(page.locator("noscript p")).toHaveText("Cet écran a besoin de JavaScript pour calculer ta journée.");
    await expect(page.locator("noscript p")).toBeVisible();
    await expect(page.locator("noscript a")).toHaveText("Voir le séjour");
    await expect(page.locator("noscript a")).toHaveAttribute("href", `/voyages/${ED}`);
    const text = await page.locator("body").innerText();
    expect(text).toContain("Cet écran a besoin de JavaScript pour calculer ta journée.");
    expect(text).not.toContain("[Dean Village]");
    expect(text).not.toContain("Prochaine étape");
  });
});

test("aujourdhui: chargement remplacé après le montage", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await expect(page.getByText("Chargement de ta journée.")).toHaveCount(0);
  await expect(region(page, "Prochaine étape")).toBeVisible();
});

test("aujourdhui: navigation", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await runUntil(page, MOMENTS.enCours);

  await expect(dayLine(page)).toHaveCount(1);
  await expect(dayLine(page).getByRole("link")).toHaveCount(0);
  await expect(region(page, "Ta journée").locator("[aria-current]")).toHaveCount(1);
  const dean = stopRow(page, "[Dean Village]");
  await expect(dean).toHaveAttribute("aria-current", "step");
  await expect(dean).toContainText("En cours");
  const royal = stopRow(page, "[Royal Mile]");
  await expect(royal.getByText("Terminée")).toBeVisible();
  await expect(royal).toContainText("Terminée");
  const cafe = stopRow(page, "[Café de Stockbridge]");
  await expect(cafe).not.toContainText("Terminée");
  await expect(cafe).not.toContainText("En cours");

  await expect(page.getByRole("link", { name: "Voir la journée sur la carte" })).toHaveAttribute("href", `/voyages/${ED}/jour/2`);
  await expect(page.getByRole("link", { name: "Retour" })).toHaveAttribute("href", `/voyages/${ED}`);
  await page.getByRole("link", { name: "Retour" }).click();
  await expect(page).toHaveURL(`/voyages/${ED}`);
});

test("aujourdhui: réseau perdu", async ({ page, context }) => {
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await context.setOffline(true);

  // Région live montée vide avec la journée, remplie hors ligne (annonce fiable), vidée au retour du réseau.
  const banner = page.locator("#aujourdhui-hors-ligne");
  await expect(banner).toHaveAttribute("role", "status");
  await expect(banner).toContainText("Tu es hors ligne. Ce programme est celui du dernier chargement.");
  await expect(region(page, "Prochaine étape")).toContainText("[Dean Village]");
  const links = [
    page.getByRole("link", { name: /^Itinéraire/ }),
    page.getByRole("link", { name: "Voir la journée sur la carte" }),
  ];
  for (const link of links) {
    await expect(link).toHaveAttribute("aria-disabled", "true");
    await expect(link).toHaveAttribute("aria-describedby", "aujourdhui-hors-ligne");
    await link.focus();
    await expect(link).toBeFocused();
    const pages = context.pages().length;
    await link.click({ force: true });
    await link.click({ force: true, button: "middle" });
    expect(context.pages()).toHaveLength(pages);
    await expect(page).toHaveURL(R15);
  }

  await runUntil(page, MOMENTS.enCours);
  await expect(region(page, "En ce moment")).toContainText("[Dean Village]");

  await context.setOffline(false);
  await expect(banner).toBeEmpty();
  await expect(page.getByRole("link", { name: "Voir la journée sur la carte" })).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("link", { name: /^Itinéraire/ })).toHaveCount(0); // « Ensuite » : le café n'a pas de lieu Google.
  await expectNothingPersisted(page);
});

test("aujourdhui: une mesure par chargement, rien d'enregistré", async ({ page }) => {
  const events = collectEvents(page);
  await setClock(page, MOMENTS.prochaine);
  await openToday(page);
  await runUntil(page, MOMENTS.enCours);
  await expect.poll(() => events.filter((event) => event.name === "today_opened")).toEqual([
    { name: "today_opened", properties: { offline: false } },
  ]);
  await page.reload();
  await expect(region(page, "En ce moment")).toBeVisible();
  await expect.poll(() => events.filter((event) => event.name === "today_opened").length).toBe(2);
  await expectNothingPersisted(page);
});

test("aujourdhui: voyage inconnu, 404", async ({ page }) => {
  const response = await page.goto("/voyages/inconnu/aujourdhui");
  expect(response?.status()).toBe(404);
});

test("sejour: lien aujourd'hui", async ({ page }) => {
  await setClock(page, MOMENTS.prochaine);
  await page.goto(`/voyages/${ED}`);
  const link = page.getByRole("link", { name: "Aujourd'hui · Jour 2" });
  await expect(link).toHaveAttribute("href", R15);
  await link.click();
  await expect(page).toHaveURL(R15);
  await expect(subtitle(page)).toHaveText("Édimbourg · Jour 2 · Dimanche 30 août");

  await page.clock.setSystemTime(new Date(MOMENTS.avant));
  await page.goto(`/voyages/${ED}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-part='aujourdhui']")).toHaveCount(0);

  await page.goto(`/dev/voyages/${ED}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-part='aujourdhui']")).toHaveCount(0);
});
