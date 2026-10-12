import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { LARGE_SCREEN, SIZES, coveredMapPoints, intersects, mapZone, rectOf, tripSheet } from "./grand-ecran-helpers";
import {
  TRIP,
  body,
  dayList,
  dayMarkers,
  expectSheetAt,
  fiche,
  ficheTitle,
  findChecklistToBook,
  fullyInside,
  listStops,
  openTrip,
  sheet,
} from "./sejour-helpers";

/**
 * Critères F12b (spécification F12, C10 à C15 et C17) : grand écran du voyage, à 1280 × 800 (souris, sans toucher),
 * 1024 × 768 et en bascule 390 ↔ 1280, sur le build de production. Les critères qui touchent le recentrage
 * s'exécutent sur /dev/voyages (carte simulée) ; les autres sur /voyages (carte de remplacement, sans clé).
 * Disposition non maquettée : rendu provisoire (UX/UI, Q7, Q173).
 */

test.use(LARGE_SCREEN);

const JOUR2 = `/voyages/${TRIP}/jour/2`;
const DEV_JOUR2 = `/dev/voyages/${TRIP}/jour/2`;
const SEJOUR = `/voyages/${TRIP}`;
const DEAN = "j2-dean-village";

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

const deanLink = (page: Page) => dayList(page).getByRole("link", { name: /\[Dean Village\]/ });
/** Aucune transition calculée sur le panneau (même critère que la spec mobile, F5). */
const noTransition = (page: Page) =>
  tripSheet(page).evaluate((el) => {
    const style = getComputedStyle(el);
    return style.transitionProperty === "none" || style.transitionDuration.split(",").every((d) => parseFloat(d) <= 0.001);
  });
const tabs = (page: Page) => tripSheet(page).getByRole("navigation").first();

/** Disposition latérale : carte à gauche, panneau de 420 px à droite sur toute la hauteur, sans chevauchement. */
async function expectSideLayout(page: Page, size: { width: number; height: number }) {
  await expect.poll(async () => (await rectOf(tripSheet(page))).width).toBe(420);
  const panel = await rectOf(tripSheet(page));
  const map = await rectOf(mapZone(page));
  expect(panel).toEqual({ x: size.width - 420, y: 0, width: 420, height: size.height });
  expect(map).toEqual({ x: 0, y: 0, width: size.width - 420, height: size.height });
  expect(intersects(panel, map)).toBe(false);
  // Ni poignée ni boutons « Agrandir le panneau » / « Réduire le panneau ».
  await expect(page.getByRole("button", { name: /(Agrandir|Réduire) le panneau/ })).toHaveCount(0);
  await expect(tripSheet(page).locator("[data-part='poignee-zone']")).toBeHidden();
}

test.describe("grand écran", () => {
  test("grand écran: disposition du voyage", async ({ page }) => {
    await openTrip(page, JOUR2);
    await expectSideLayout(page, SIZES.large);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
    // La page ne défile pas ; le contenu du panneau, si.
    const scroll = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
    }));
    expect(scroll).toEqual({ height: SIZES.large.height, width: SIZES.large.width });
    const scrollable = await body(page).evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrollable).toBe(true);
    await body(page).hover();
    await page.mouse.wheel(0, 2_000);
    await expect.poll(() => body(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // `DayTabs` toujours visible en tête du panneau après le défilement du contenu.
    await expect(tabs(page)).toBeInViewport();
    const tabsBox = await rectOf(tabs(page));
    expect(tabsBox.x).toBeGreaterThanOrEqual(SIZES.large.width - 420);
    expect(tabsBox.y).toBeLessThan(100);
    await expect(tabs(page).getByRole("link", { name: "Jour 2, dim." })).toBeInViewport();
  });

  test("grand écran: seuil", async ({ page }) => {
    await page.setViewportSize(SIZES.threshold);
    await openTrip(page, JOUR2);
    await expectSideLayout(page, SIZES.threshold);
    // Un pixel sous le seuil : mise en page mobile, panneau coulissant à 55 %, poignée présente.
    await page.setViewportSize(SIZES.belowThreshold);
    await expect(page.getByRole("button", { name: "Agrandir le panneau" })).toBeVisible();
    await expect.poll(async () => (await rectOf(sheet(page))).height).toBeCloseTo(0.55 * SIZES.belowThreshold.height, 0);
    const panel = await rectOf(sheet(page));
    expect(panel.width).toBe(SIZES.belowThreshold.width);
    expect(panel.y + panel.height).toBeCloseTo(SIZES.belowThreshold.height, 0);
    await expect(sheet(page)).toHaveAttribute("data-snap", "0.55");
  });

  test("grand écran: synchronisation", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    await expectSideLayout(page, SIZES.large);
    // Toucher une étape : fiche dans le panneau, focus sur son titre, marqueur au milieu de la zone de la carte.
    await deanLink(page).click();
    await expect(page).toHaveURL(`${DEV_JOUR2}?etape=${DEAN}`);
    await expect(ficheTitle(page)).toHaveText("[Dean Village]");
    await expect(ficheTitle(page)).toBeFocused();
    const map = await rectOf(mapZone(page));
    const marker = dayMarkers(page).nth(1);
    await expect(marker).toHaveAttribute("aria-current", "true");
    const center = async () => {
      const box = await rectOf(marker);
      return { dx: Math.abs(box.x + box.width / 2 - (map.x + map.width / 2)), dy: Math.abs(box.y + box.height / 2 - (map.y + map.height / 2)) };
    };
    await expect.poll(async () => (await center()).dx).toBeLessThanOrEqual(1);
    expect((await center()).dy).toBeLessThanOrEqual(1);
    // Toucher un marqueur : la fiche se ferme, la liste défile jusqu'à l'étape, le focus reste sur le marqueur.
    const first = dayMarkers(page).nth(0);
    await first.click();
    await expect(page).toHaveURL(DEV_JOUR2);
    await expect(fiche(page)).toHaveCount(0);
    await expect.poll(() => fullyInside(listStops(page).nth(0), body(page))).toBe(true);
    await expect(first).toHaveAttribute("aria-current", "true");
    await expect(first).toBeFocused();
    // La hauteur mobile du panneau n'a pas changé (aucun point d'arrêt en grand écran).
    await expect(sheet(page)).toHaveAttribute("data-snap", "0.55");
    // Déplacer la carte ne change ni la liste ni l'adresse.
    await body(page).evaluate((el) => el.scrollTo({ top: 0 }));
    const before = await body(page).evaluate((el) => el.scrollTop);
    await page.mouse.move(map.x + map.width / 3, map.y + 40);
    await page.mouse.down();
    await page.mouse.move(map.x + map.width / 3 + 120, map.y + 120, { steps: 6 });
    await page.mouse.up();
    await expect(page).toHaveURL(DEV_JOUR2);
    expect(await body(page).evaluate((el) => el.scrollTop)).toBe(before);
    await expect(listStops(page)).toHaveCount(5);
  });

  for (const how of ["Fermer", "Échap"] as const) {
    test(`grand écran: fiche fermée par ${how}, focus rendu au lien d'origine`, async ({ page }) => {
      await openTrip(page, `/dev/voyages/${TRIP}`);
      await sheet(page).getByRole("link", { name: "Jour 2, dim." }).click();
      await expect(page).toHaveURL(DEV_JOUR2);
      await deanLink(page).click();
      await expect(page).toHaveURL(`${DEV_JOUR2}?etape=${DEAN}`);
      await expect(ficheTitle(page)).toBeFocused();
      if (how === "Fermer") await fiche(page).getByRole("button", { name: "Fermer" }).click();
      else await page.keyboard.press("Escape");
      await expect(page).toHaveURL(DEV_JOUR2);
      await expect(fiche(page)).toHaveCount(0);
      await expect(deanLink(page)).toBeFocused();
      // Mêmes adresses et même historique qu'en mobile : le retour mène au Séjour sans rouvrir la fiche.
      await page.goBack();
      await expect(page).toHaveURL(`/dev/voyages/${TRIP}`);
      await expect(fiche(page)).toHaveCount(0);
      await expectSideLayout(page, SIZES.large);
    });
  }

  test("grand écran: bascule sans perte", async ({ page }) => {
    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") documents.push(request.url());
    });
    await page.setViewportSize(SIZES.mobile);
    await openTrip(page, JOUR2);
    await deanLink(page).click();
    await expect(ficheTitle(page)).toBeFocused();
    await fiche(page).getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.92, "Fiche étape");
    const fermer = fiche(page).getByRole("button", { name: "Fermer" });
    await fermer.focus();
    const url = page.url();
    expect(documents).toHaveLength(1);

    await page.setViewportSize(SIZES.large);
    await expectSideLayout(page, SIZES.large);
    await expect(fiche(page)).toBeVisible();
    await expect(page).toHaveURL(url);
    await expect(fermer).toBeFocused();

    await page.setViewportSize(SIZES.mobile);
    await expectSheetAt(page, 0.92, "Fiche étape");
    await expect(page).toHaveURL(url);
    await expect(ficheTitle(page)).toHaveText("[Dean Village]");
    await expect(fermer).toBeFocused();
    expect(documents).toHaveLength(1);
  });

  for (const path of [JOUR2, DEV_JOUR2, SEJOUR]) {
    test(`grand écran: carte jamais couverte (${path})`, async ({ page }) => {
      await openTrip(page, path);
      await expectSideLayout(page, SIZES.large);
      expect(await coveredMapPoints(page)).toEqual([]);
      // Chaque élément du panneau reste hors de la zone de la carte.
      const map = await rectOf(mapZone(page));
      const boxes = await tripSheet(page).evaluate((root) =>
        [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
      );
      expect(boxes.filter((box) => intersects(box, map) && box.x < map.x + map.width - 0.5)).toEqual([]);
    });
  }

  test("grand écran: toast d'annulation sous le contenu du panneau, sans couvrir le contenu ni la carte", async ({ page }) => {
    await openTrip(page, JOUR2);
    await deanLink(page).click();
    await expect(ficheTitle(page)).toBeFocused();
    await expectSideLayout(page, SIZES.large);
    await fiche(page).getByRole("button", { name: "Verrouiller" }).click();
    const toast = page.locator("[data-undo-toast]");
    await expect(toast).toBeVisible();
    const toastBox = await rectOf(toast);
    const content = await rectOf(tripSheet(page).locator("[data-part='contenu']"));
    const panel = await rectOf(tripSheet(page));
    expect(intersects(toastBox, content)).toBe(false);
    expect(intersects(toastBox, await rectOf(mapZone(page)))).toBe(false);
    expect(toastBox.x).toBeGreaterThanOrEqual(panel.x);
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(panel.y + panel.height);
    await expect(toast.getByRole("button", { name: "Annuler" })).toBeInViewport();
  });

  test("grand écran: mouvement réduit, aucune transition à la bascule ni au recentrage", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(SIZES.mobile);
    await openTrip(page, DEV_JOUR2);
    const transition = () => noTransition(page);
    expect(await transition()).toBe(true);
    await page.setViewportSize(SIZES.large);
    await expectSideLayout(page, SIZES.large);
    expect(await transition()).toBe(true);
    // Recentrage sur une étape : la carte simulée se pose sans transition (aucune animation calculée).
    await deanLink(page).click();
    await expect(dayMarkers(page).nth(1)).toHaveAttribute("aria-current", "true");
    // Sous mouvement réduit, la règle globale ramène toute transition à 0,01 ms (instantanée) : seules comptent les
    // animations perceptibles (plus de 1 ms), comme dans la spec mobile de F5.
    const moving = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => {
          const effect = animation.effect as KeyframeEffect | null;
          const target = effect?.target;
          if (!(target instanceof Element) || !target.closest("[data-sheet], [data-part='zone-carte']")) return false;
          return Number(effect?.getComputedTiming().duration ?? 0) > 1;
        })
        .map((animation) => (animation instanceof CSSTransition ? animation.transitionProperty : "animation")),
    );
    expect(moving).toEqual([]);
  });

  test("grand écran: transition coupée en grand écran même sans mouvement réduit", async ({ page }) => {
    await openTrip(page, JOUR2);
    expect(await noTransition(page)).toBe(true);
  });

  test("grand écran: trouver la liste à réserver (scénario du handover § 14, à la souris)", async ({ page, context }) => {
    await findChecklistToBook(page, context, SEJOUR);
    await expectSideLayout(page, SIZES.large);
  });

  test("grand écran: trouver la liste à réserver au clavier", async ({ page }) => {
    await openTrip(page, SEJOUR);
    const aFaire = sheet(page).getByRole("region", { name: "À faire avant de partir" });
    const chateau = aFaire.getByRole("button", { name: "[Château d'Édimbourg]", exact: true });
    // Au clavier depuis le début de la page : la case du château est atteinte par Tab et cochée par Espace.
    await page.locator("body").focus();
    let reached = false;
    for (let i = 0; i < 40 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await chateau.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);
    await page.keyboard.press("Space");
    await expect(chateau).toHaveAttribute("aria-pressed", "true");
    await expect(aFaire.getByRole("img", { name: "3 réservations à faire" })).toBeVisible();
  });
});
