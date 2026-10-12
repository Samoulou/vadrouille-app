import { expect, test } from "@playwright/test";

import { blockExternal } from "./etats-helpers";
import {
  DATES,
  ED,
  ED_OK,
  LIS,
  POR,
  R17,
  expectNothingPersisted,
  linkTargets,
  openTrips,
  plate,
  section,
  sectionTitles,
  setClock,
  tripLink,
} from "./mes-voyages-helpers";
import { sheet } from "./sejour-helpers";

/**
 * Spécification F11, critères [a] (F11a) : écran 17 « Mes voyages » (`R17`), réouverture d'un voyage, voyages
 * simulés supplémentaires. Build de production, 390 × 844, horloge du navigateur installée (`page.clock`),
 * fuseau `Europe/London` sauf mention. Aucune requête vers un autre hôte que l'application (C1).
 */

test.use({ timezoneId: "Europe/London" });

let external: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  external = await blockExternal(page, baseURL!);
});
test.afterEach(() => {
  expect(external).toEqual([]);
});

test("mes-voyages: sections avant le voyage", async ({ page }) => {
  await setClock(page, DATES.avant);
  await openTrips(page);
  await expect(page).toHaveTitle("Mes voyages · Vadrouille");

  await expect(plate(page)).toHaveCount(1);
  await expect(plate(page)).toHaveAttribute("data-destination-plate", "bruyere");
  await expect(plate(page)).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes");
  await expect(plate(page)).toHaveAttribute("href", `/voyages/${ED_OK}`);

  expect(await sectionTitles(page)).toEqual(["À venir", "Pas encore débloqués", "Passés"]);
  const upcoming = section(page, "À venir").getByRole("link");
  await expect(upcoming).toHaveCount(2);
  await expect(upcoming.nth(0)).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes 4 réservations à faire");
  await expect(upcoming.nth(1)).toHaveAccessibleName("Porto sam. 08.05 – mar. 11.05.2027 · 2 adultes 2 réservations à faire");
  await expect(upcoming.nth(0).getByRole("img", { name: "4 réservations à faire" })).toHaveText("4");

  const locked = tripLink(page, "Pas encore débloqués", "Édimbourg");
  await expect(locked).toContainText("Tes premières propositions");
  await expect(locked.getByRole("img")).toHaveCount(0);
  await expect(tripLink(page, "Passés", "Lisbonne")).toHaveAccessibleName("Lisbonne jeu. 14.05 – dim. 17.05 · 2 adultes");
  await expect(section(page, "Passés").getByRole("img")).toHaveCount(0);
  await expect(page.locator("[class*='dest-']")).toHaveCount(1);
});

test("mes-voyages: sections pendant et après", async ({ page }) => {
  await setClock(page, DATES.pendant);
  await openTrips(page);
  expect(await sectionTitles(page)).toEqual(["En cours", "À venir", "Pas encore débloqués", "Passés"]);
  await expect(tripLink(page, "En cours", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED_OK}`);
  await expect(tripLink(page, "En cours", "Édimbourg")).toContainText("réservations à faire");
  await expect(tripLink(page, "Pas encore débloqués", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED}/presentation`);

  await page.clock.setSystemTime(new Date(DATES.apres));
  await page.reload();
  await openTrips(page);
  expect(await sectionTitles(page)).toEqual(["À venir", "Passés"]);
  await expect(plate(page)).toHaveAttribute("data-destination-plate", "granit");
  await expect(plate(page)).toHaveAccessibleName("Porto sam. 08.05 – mar. 11.05.2027 · 2 adultes");
  const past = section(page, "Passés").getByRole("link");
  await expect(past).toHaveCount(3);
  await expect(past.nth(0)).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes Non débloqué");
  await expect(past.nth(1)).toHaveAccessibleName("Édimbourg sam. 29.08 – jeu. 03.09 · 2 adultes");
  await expect(past.nth(2)).toHaveAccessibleName(/^Lisbonne /);
});

test.describe("date de la destination, appareil à Zurich (C8)", () => {
  test.use({ timezoneId: "Europe/Zurich" });

  test("mes-voyages: 29.08 à 00:30 à Zurich (23:30 le 28 à Édimbourg) : À venir ; à 01:30 : En cours", async ({ page }) => {
    await setClock(page, "2026-08-29T00:30:00+02:00");
    await openTrips(page);
    expect(await sectionTitles(page)).not.toContain("En cours");
    await expect(tripLink(page, "À venir", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED_OK}`);

    await page.clock.setSystemTime(new Date("2026-08-29T01:30:00+02:00"));
    await page.reload();
    await openTrips(page);
    await expect(tripLink(page, "En cours", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED_OK}`);
  });
});

test("mes-voyages: réouverture", async ({ page }) => {
  await setClock(page, DATES.avant);
  await openTrips(page);
  await expect(tripLink(page, "À venir", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED_OK}`);
  await expect(tripLink(page, "Pas encore débloqués", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED}/presentation`);
  await expect(tripLink(page, "Passés", "Lisbonne")).toHaveAttribute("href", `/voyages/${LIS}`);

  // Navigations côté client : plaque → Séjour → onglet « Jour 3 », puis retour de deux pas jusqu'à `/voyages`
  // (sans réafficher le Séjour, qui deviendrait le dernier onglet consulté).
  await plate(page).click();
  await expect(page).toHaveURL(`/voyages/${ED_OK}`);
  await sheet(page).getByRole("link", { name: "Jour 3, lun." }).click();
  await expect(page).toHaveURL(`/voyages/${ED_OK}/jour/3`);
  await page.evaluate(() => window.history.go(-2));
  await expect(page).toHaveURL(R17);
  await expect(plate(page)).toHaveAttribute("href", `/voyages/${ED_OK}/jour/3`);
  await expect(tripLink(page, "À venir", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED_OK}/jour/3`);
  // Les autres voyages ne changent pas.
  await expect(tripLink(page, "Pas encore débloqués", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED}/presentation`);
  await expect(tripLink(page, "À venir", "Porto")).toHaveAttribute("href", `/voyages/${POR}`);

  // La Journée rouvre ; « Retour » puis « Retour » repassent par le Séjour, qui devient le dernier onglet.
  await plate(page).click();
  await expect(page).toHaveURL(`/voyages/${ED_OK}/jour/3`);
  await page.getByRole("link", { name: "Retour" }).click();
  await expect(page).toHaveURL(`/voyages/${ED_OK}`);
  await page.getByRole("link", { name: "Retour" }).click();
  await expect(page).toHaveURL(R17);
  await expect(plate(page)).toHaveAttribute("href", `/voyages/${ED_OK}`);

  // Rechargement : mémoire de l'onglet perdue, de nouveau au Séjour.
  await page.goto(R17);
  await openTrips(page);
  await expect(plate(page)).toHaveAttribute("href", `/voyages/${ED_OK}`);
  await expect(page).toHaveURL(R17);
});

test("mes-voyages: réouverture aux dates du voyage", async ({ page }) => {
  // Sans écran 15 dans `main` (F10a non fusionnée) : aux dates du voyage, le lien suit le dernier onglet (C11).
  await setClock(page, DATES.pendant);
  await openTrips(page);
  await expect(tripLink(page, "En cours", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED_OK}`);
  await tripLink(page, "En cours", "Édimbourg").click();
  await sheet(page).getByRole("link", { name: "Jour 3, lun." }).click();
  await expect(page).toHaveURL(`/voyages/${ED_OK}/jour/3`);
  await page.evaluate(() => window.history.go(-2));
  await expect(page).toHaveURL(R17);
  await expect(tripLink(page, "En cours", "Édimbourg")).toHaveAttribute("href", `/voyages/${ED_OK}/jour/3`);
  await expect(plate(page)).toHaveAttribute("href", `/voyages/${ED_OK}/jour/3`);
});

test("mes-voyages: « Retour » du Séjour de chaque voyage mène à /voyages (200) ; R17 sans « Retour »", async ({ page }) => {
  await setClock(page, DATES.avant);
  for (const id of [ED, ED_OK, LIS, POR]) {
    await page.goto(`/voyages/${id}`);
    await expect(sheet(page)).toBeVisible();
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(R17);
    await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  }
  const response = await openTrips(page);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("link", { name: "Retour" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retour" })).toHaveCount(0);
});

test("mes-voyages: aucun lien vers une 404 aux trois dates ; « Créer un voyage » pas encore ajouté (F11-PO-4)", async ({ page }) => {
  // L'écran 1 existe depuis F8a ; le lien « Créer un voyage » sera ajouté par la première PR qui touche R17 (F11-PO-4).
  const created = await page.request.get("/voyages/nouveau");
  expect(created.status()).toBe(200);
  await setClock(page, DATES.avant);
  for (const iso of Object.values(DATES)) {
    await page.clock.setSystemTime(new Date(iso));
    await openTrips(page);
    await expect(page.getByRole("link", { name: "Créer un voyage" })).toHaveCount(0);
    const targets = await linkTargets(page);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of new Set(targets)) {
      const response = await page.request.get(target);
      expect(response.status(), target).toBe(200);
    }
  }
});

test("mes-voyages: Lisbonne et Porto s'ouvrent, carte dans son état de remplacement", async ({ page }) => {
  await setClock(page, DATES.avant);
  for (const [id, destination] of [
    [LIS, "Lisbonne"],
    [POR, "Porto"],
  ] as const) {
    await page.goto(`/voyages/${id}`);
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(destination);
    await page.goto(`/voyages/${id}/jour/2`);
    await expect(sheet(page).locator("a[data-part='arret']").first()).toBeVisible();
  }
});

test("mes-voyages: aucune donnée persistée côté client", async ({ page }) => {
  await setClock(page, DATES.avant);
  await openTrips(page);
  await plate(page).click();
  await sheet(page).getByRole("link", { name: "Jour 3, lun." }).click();
  await expect(page).toHaveURL(`/voyages/${ED_OK}/jour/3`);
  await page.getByRole("link", { name: "Retour" }).click();
  await page.getByRole("link", { name: "Retour" }).click();
  await expect(page).toHaveURL(R17);
  await openTrips(page);
  await tripLink(page, "Pas encore débloqués", "Édimbourg").click();
  await expect(page).toHaveURL(`/voyages/${ED}/presentation`);
  await page.goBack();
  await expect(page).toHaveURL(R17);
  expect(new URL(page.url()).search).toBe("");
  await expectNothingPersisted(page);
});

test("mes-voyages: entrée « Mes voyages » de la démonstration", async ({ page }) => {
  await setClock(page, DATES.avant);
  await page.goto("/");
  const link = page.getByRole("region", { name: "Démonstration" }).getByRole("link", { name: "Mes voyages Écran 17, voyages simulés" });
  await expect(link).toHaveAttribute("href", R17);
  await link.click();
  await expect(page).toHaveURL(R17);
  await openTrips(page);
});

test("mes-voyages: aucun voyage, dans le catalogue des états (C13)", async ({ page }) => {
  await page.goto("/dev/etats");
  const empty = page.getByRole("region", { name: "Aucun voyage", exact: true });
  await expect(empty.getByRole("heading", { level: 3, name: "Mes voyages" })).toBeVisible();
  await expect(empty.getByText("Tu n'as pas encore de voyage.", { exact: true })).toBeVisible();
  await expect(empty.getByRole("link")).toHaveCount(0);
  await expect(empty.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(empty.locator("[data-destination-plate]")).toHaveCount(0);
  await expect(empty.getByRole("status")).toHaveCount(0);
});
