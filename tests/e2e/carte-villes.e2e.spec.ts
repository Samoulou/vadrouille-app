import { expect, test } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import {
  VILLES,
  boites,
  choix,
  dansLaFenetre,
  expectEtiquettesLisibles,
  ouvrir,
  panneau,
  simulee,
  zoneVisible,
  type Rect,
} from "./carte-villes-helpers";
import { expectNoHorizontalOverflow, expectNotTruncated } from "./plusieurs-villes-helpers";
import { expectSheetAt } from "./sejour-helpers";

/**
 * M4-suite-carte (décision 0150, critère 19 de `specs/M4-suite-changement-de-ville.md`) : carte d'ensemble à plusieurs
 * villes et carte de la Journée d'un changement de ville, en 390 × 844, carte simulée (`/dev/carte/villes/[jeu]`).
 */

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

const dedans = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

async function choisir(page: Parameters<typeof ouvrir>[0], nom: string) {
  await choix(page).getByRole("radio", { name: nom, exact: true }).click();
  await expect(choix(page).getByRole("radio", { name: nom, exact: true })).toHaveAttribute("aria-checked", "true");
}

test("M4-suite-carte: repères par ville", async ({ page }) => {
  await ouvrir(page, VILLES("rome-florence"));
  const carte = page.getByRole("region", { name: "Carte du séjour" });
  await expect(carte.getByRole("img")).toHaveText(["1 · Rome", "2 · Florence"]);
  expect(await carte.getByRole("img").evaluateAll((imgs) => imgs.map((img) => img.getAttribute("aria-label")))).toEqual([
    "Rome, ville 1",
    "Florence, ville 2",
  ]);
  await expect(carte.locator("[data-part='etiquette-ville']").first()).toHaveAttribute("aria-hidden", "true");
});

test("M4-suite-carte: étiquette de ville", async ({ page }) => {
  // Non-recouvrement : Paris puis Versailles (environ 17 km), « Toutes les villes » et chaque ville.
  await ouvrir(page, VILLES("paris-versailles"));
  await expectEtiquettesLisibles(page);
  for (const ville of ["Paris", "Versailles"]) {
    await choisir(page, ville);
    await expectEtiquettesLisibles(page);
  }
  // Visibilité complète : toutes les villes puis chaque ville.
  for (const [jeu, villes] of [
    ["rome-florence", ["Rome", "Florence"]],
    ["paris-berlin", ["Paris", "Berlin"]],
    ["rome-florence-venise", ["Rome", "Florence", "Venise"]],
  ] as const) {
    await ouvrir(page, VILLES(jeu));
    await expectEtiquettesLisibles(page);
    for (const ville of villes) {
      await choisir(page, ville);
      await expectEtiquettesLisibles(page);
    }
  }
  // Journée J3, chaque moitié : une étape à moins de 30 px à droite du logement quitté.
  await ouvrir(page, VILLES("rome-florence", "/jour/3"));
  const b = await expectEtiquettesLisibles(page, { etapes: true });
  const logement = b.termini[0]!;
  expect(b.etapes.some((etape) => etape.x - (logement.x + logement.width) < 30 && Math.abs(etape.y - logement.y) < 30)).toBe(true);
  await choisir(page, "Florence");
  await expectEtiquettesLisibles(page, { etapes: true });
  // Nom long : ni tronqué ni plus large que --ligne-etiquette-ville-max (176 px).
  await ouvrir(page, VILLES("noms-longs"));
  const longue = page.locator("[data-part='etiquette-ville']", { hasText: "Saint-Jacques-de-Compostelle" });
  await expectNotTruncated(longue);
  expect((await longue.boundingBox())!.width).toBeLessThanOrEqual(176.5);
});

test("M4-suite-carte: regroupement", async ({ page }) => {
  await ouvrir(page, VILLES("paris-berlin"));
  await expect(page.locator("[data-part='anneau']")).toHaveCount(0);
  await expect(page.locator("[data-part='repere-ville']")).toHaveCount(2);
  await choisir(page, "Paris");
  const carte = (await simulee(page).boundingBox())!;
  const anneaux = await page.locator("[data-part='anneau']").evaluateAll((elements) =>
    elements.map((element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  // Paris : J1 et J2 (deux étapes chacun), J3 avant le transfer (deux étapes).
  expect(anneaux.filter((anneau) => dedans(anneau, carte))).toHaveLength(6);
  await expect(page.getByRole("img", { name: "Paris, ville 1" })).toBeVisible();
  // Villes voisines cadrées au zoom 10 ou plus : anneaux visibles sur « Toutes les villes ».
  await ouvrir(page, VILLES("paris-versailles"));
  expect(Number(await simulee(page).getAttribute("data-zoom"))).toBeGreaterThanOrEqual(10);
  expect(await page.locator("[data-part='anneau']").count()).toBeGreaterThan(0);
});

test("M4-suite-carte: choix de la vue sur Séjour", async ({ page }) => {
  await ouvrir(page, VILLES("rome-florence"));
  await expect(choix(page).getByRole("radio")).toHaveText(["Toutes les villes", "Rome", "Florence"]);
  await expect(choix(page).getByRole("radio", { name: "Toutes les villes" })).toHaveAttribute("aria-checked", "true");
  // Aucun élément focalisable nouveau dans la région de la carte.
  expect(await page.getByRole("region", { name: "Carte du séjour" }).locator("a, button, [tabindex]").count()).toBe(0);

  // « Florence » : son repère dans la zone visible, celui de Rome non ; rechoisir ne recadre pas ; un glissement ne change pas le choix.
  await choisir(page, "Florence");
  const zone = await zoneVisible(page);
  expect(dedans((await page.getByRole("img", { name: "Florence, ville 2" }).boundingBox())!, zone)).toBe(true);
  expect(dedans((await page.getByRole("img", { name: "Rome, ville 1" }).boundingBox())!, zone)).toBe(false);
  const centre = await simulee(page).getAttribute("data-center-lat");
  await choisir(page, "Florence");
  await expect(simulee(page)).toHaveAttribute("data-center-lat", centre!);
  const box = (await simulee(page).boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 150, { steps: 5 });
  await page.mouse.up();
  await expect(simulee(page)).not.toHaveAttribute("data-center-lat", centre!);
  await expect(choix(page).getByRole("radio", { name: "Florence" })).toHaveAttribute("aria-checked", "true");

  // Quitter le Séjour pour une Journée puis revenir : « Toutes les villes ».
  await panneau(page).getByRole("link", { name: /^Jour 2/ }).click();
  await expect(page.getByRole("region", { name: "Carte du jour 2" })).toBeVisible();
  await panneau(page).getByRole("link", { name: "Séjour" }).click();
  await expect(choix(page).getByRole("radio", { name: "Toutes les villes" })).toHaveAttribute("aria-checked", "true");
  await expectEtiquettesLisibles(page);

  // Quatre options dont « Saint-Jacques-de-Compostelle » : cibles de 44 × 44 px, dans le panneau, jamais tronquées.
  await ouvrir(page, VILLES("rome-compostelle-florence"));
  const options = choix(page).getByRole("radio");
  await expect(options).toHaveText(["Toutes les villes", "Rome", "Saint-Jacques-de-Compostelle", "Florence"]);
  const sheet = (await panneau(page).boundingBox())!;
  for (const option of await options.all()) {
    const r = (await option.boundingBox())!;
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(dedans(r, sheet)).toBe(true);
    await expectNotTruncated(option);
  }
  await expectNoHorizontalOverflow(page);
  // Panneau au plus bas : l'en-tête entier (poignée, onglets, options) est dans la fenêtre.
  await page.locator("[data-part='poignee']").press("ArrowDown");
  await expectSheetAt(page, 0.25);
  for (const option of await options.all()) expect(await dansLaFenetre(option)).toBe(true);
  expect(await dansLaFenetre(page.locator("[data-part='poignee']"))).toBe(true);
});

test("M4-suite-carte: choix de la vue sur Séjour, trois villes aux noms longs", async ({ page }) => {
  await ouvrir(page, VILLES("noms-longs"));
  const options = choix(page).getByRole("radio");
  // « Toutes les villes » et trois villes ; le choix est chargé à la demande (décision 0152 § 4).
  await expect(options).toHaveCount(4);
  const rangees = new Set<number>();
  for (const option of await options.all()) {
    const r = (await option.boundingBox())!;
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    await expectNotTruncated(option);
    rangees.add(Math.round(r.y));
  }
  expect(rangees.size).toBeGreaterThanOrEqual(3);
  await expectNoHorizontalOverflow(page);

  // Panneau au plus bas : un clic sur une option visible de la première rangée ne change pas la hauteur du panneau.
  await page.locator("[data-part='poignee']").press("ArrowDown");
  await expectSheetAt(page, 0.25);
  await options.first().click();
  await expectSheetAt(page, 0.25);
  await choix(page).getByRole("radio", { name: "Saint-Jacques-de-Compostelle" }).click();
  await expectSheetAt(page, 0.25);

  // Focus clavier (Tab) sur le choix : le panneau remonte à 0,55, et la dernière option est entièrement visible.
  await page.locator("[data-part='poignee']").focus();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press("Tab");
    if (await choix(page).evaluate((group) => group.contains(document.activeElement))) break;
  }
  await expectSheetAt(page, 0.55);
  await page.keyboard.press("End");
  const derniere = options.last();
  await derniere.focus();
  expect(await dansLaFenetre(derniere)).toBe(true);
});

test("M4-suite-carte: cadrage de la Journée du changement de ville", async ({ page }) => {
  await ouvrir(page, VILLES("rome-florence", "/jour/3"));
  await expect(choix(page).getByRole("radio")).toHaveText(["Rome", "Florence"]);
  await expect(choix(page).getByRole("radio", { name: "Rome" })).toHaveAttribute("aria-checked", "true");
  const carte = page.getByRole("region", { name: "Carte du jour 3" });
  expect(await carte.getByRole("img").evaluateAll((imgs) => imgs.map((img) => img.getAttribute("aria-label")))).toEqual([
    "Logement quitté, Rome",
    "Nouveau logement, Florence",
  ]);
  await expect(carte.getByRole("button", { name: /^Étape \d+ :/ })).toHaveText(["1", "2", "3"]);
  let zone = await zoneVisible(page);
  for (const n of [1, 2]) expect(dedans((await carte.getByRole("button", { name: new RegExp(`^Étape ${n} :`) }).boundingBox())!, zone)).toBe(true);
  expect(dedans((await carte.getByRole("img", { name: "Nouveau logement, Florence" }).boundingBox())!, zone)).toBe(false);

  // Sélection dans l'autre moitié : le choix passe à « Florence » et l'étape 3 est dans la zone visible.
  await page.locator("#liste-etapes a[data-part='arret']", { hasText: "Étape d'arrivée" }).click();
  await expect(choix(page).getByRole("radio", { name: "Florence" })).toHaveAttribute("aria-checked", "true");
  zone = await zoneVisible(page);
  await expect
    .poll(async () => dedans((await carte.getByRole("button", { name: /^Étape 3 :/ }).boundingBox())!, zone))
    .toBe(true);
  const b = await boites(page);
  expect(b.etiquettes.map((etiquette) => etiquette.texte)).toEqual(["Florence"]);
});
