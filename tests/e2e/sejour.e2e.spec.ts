import { expect, test, type Page } from "@playwright/test";

import { edimbourg } from "../../src/mocks/edimbourg";

import { blockGoogle } from "./carte-helpers";
import { collectEvents } from "./presentation-helpers";
import {
  HEIGHTS,
  TRIP,
  body,
  dayList,
  dayMarkers,
  dragVertical,
  expectSheetAt,
  fiche,
  ficheTitle,
  fullyInside,
  handle,
  listStops,
  openTrip,
  sheet,
  sheetHeight,
} from "./sejour-helpers";

/**
 * Critères F5a et F5c (spécification F5, critères [a], [c] et transverses) : panneau, mise en page commune,
 * Journée et Séjour,
 * en 390 × 844 sur le build de production. Les critères qui touchent la carte s'exécutent sur
 * /dev/voyages (carte simulée, F5-TL-1) ; les autres sur /voyages, où la carte affiche l'état
 * « configuration absente » de F4.
 */

const JOUR2 = `/voyages/${TRIP}/jour/2`;
const DEV_JOUR2 = `/dev/voyages/${TRIP}/jour/2`;
const SEJOUR = `/voyages/${TRIP}`;
const DEV_SEJOUR = `/dev/voyages/${TRIP}`;
const CONCERT = "j2-concert-orgue";

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  // Aucune requête vers un domaine Google pendant les specs de F5.
  expect(googleRequests).toEqual([]);
});

test.describe("panneau", () => {
  test("sheet: trois hauteurs sans glisser", async ({ page }) => {
    await openTrip(page, JOUR2);
    expect(Math.abs((await sheetHeight(page)) - 464)).toBeLessThanOrEqual(2);
    await expectSheetAt(page, 0.55);

    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.92);
    await page.getByRole("button", { name: "Réduire le panneau" }).click();
    await expectSheetAt(page, 0.25);
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.55);

    await handle(page).focus();
    await page.keyboard.press("ArrowUp");
    await expectSheetAt(page, 0.92);
    await page.keyboard.press("ArrowUp");
    await expectSheetAt(page, 0.92);
    await page.keyboard.press("ArrowDown");
    await expectSheetAt(page, 0.55);
    await page.keyboard.press("ArrowDown");
    await expectSheetAt(page, 0.25);
    await page.keyboard.press("ArrowDown");
    await expectSheetAt(page, 0.25);
    await expect(handle(page)).toBeFocused();
  });

  test("sheet: glisser et défilement", async ({ page }) => {
    await openTrip(page, JOUR2);
    // 200 px vers le haut, lentement (environ 0,25 px/ms) : 92 %.
    await dragVertical(page, handle(page), -200, { steps: 20, delay: 40 });
    await expectSheetAt(page, 0.92);

    await page.getByRole("button", { name: "Réduire le panneau" }).click();
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.55);
    // 40 px vers le haut, lentement : retour à 55 %.
    await dragVertical(page, handle(page), -40, { steps: 4, delay: 40 });
    await expectSheetAt(page, 0.55);
    // 60 px vers le bas, rapidement (au-delà de 0,5 px/ms) : 25 %.
    await dragVertical(page, handle(page), 60, { steps: 1, delay: 0 });
    await expectSheetAt(page, 0.25);

    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.55);
    // Faire défiler le contenu ne change pas la hauteur.
    const contentBox = (await body(page).boundingBox())!;
    await page.mouse.move(contentBox.x + contentBox.width / 2, contentBox.y + contentBox.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => body(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expectSheetAt(page, 0.55);
  });

  test("sheet: hauteur conservée entre les jours", async ({ page }) => {
    await openTrip(page, JOUR2);
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.92);
    await sheet(page).getByRole("link", { name: "Jour 3, lun." }).click();
    await expect(page).toHaveURL(`/voyages/${TRIP}/jour/3`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lundi 31 août");
    await expectSheetAt(page, 0.92);
    await page.reload();
    await expect(sheet(page)).toBeVisible();
    await expectSheetAt(page, 0.55);
  });

  test("sheet: avec prefers-reduced-motion, aucune transition calculée", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openTrip(page, JOUR2);
    const transition = await sheet(page).evaluate((el) => {
      const style = getComputedStyle(el);
      return { property: style.transitionProperty, durations: style.transitionDuration.split(",").map((d) => parseFloat(d)) };
    });
    expect(transition.property === "none" || transition.durations.every((d) => d <= 0.001)).toBe(true);
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    // Hauteur finale immédiatement, sans état intermédiaire.
    expect(Math.abs((await sheetHeight(page)) - HEIGHTS[0.92])).toBeLessThanOrEqual(2);
  });

  test("sheet: non modal, région « Programme », aucun piège à focus", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    await expect(sheet(page)).not.toHaveAttribute("aria-modal", /.*/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Depuis la poignée, Maj+Tab revient sur la carte (marqueurs), hors du panneau.
    await handle(page).focus();
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toMatch(/^Étape 5 :/);
    // Depuis le dernier élément du panneau, Tab sort du panneau (pas de retour forcé dans le panneau).
    const last = sheet(page).locator("a[href], button").last();
    await last.focus();
    await page.keyboard.press("Tab");
    const inside = await sheet(page).evaluate((el) => el.contains(document.activeElement));
    expect(inside).toBe(false);
  });
});

test.describe("Journée", () => {
  test("journee: contenu du jour", async ({ page }) => {
    await openTrip(page, JOUR2);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
    await expect(sheet(page).locator("[data-part='trajet-budget']")).toHaveText("1 h 25 de trajet · environ 95 CHF par personne");
    const day = edimbourg.days.find((d) => d.index === 2)!;
    await expect(dayList(page).locator("ol > li")).toHaveCount(day.items.length);
    await expect(dayList(page)).toHaveAttribute("tabindex", "-1");
    const events = page.getByRole("region", { name: "Événements du jour" });
    await expect(events.getByRole("heading", { level: 2 })).toHaveText("Événements du jour");
    const concert = events.getByRole("link", { name: /\[Concert d'orgue à St Giles\]/ });
    await expect(concert).toContainText("18:00 – 19:00");
    await expect(concert).toContainText("Non confirmé");
    await expect(concert).toHaveAttribute("href", `/voyages/${TRIP}/jour/2?etape=j2-concert-orgue`);
    await expect(sheet(page).getByRole("link", { name: "Jour 2, dim." })).toHaveAttribute("aria-current", "page");
    await expect(sheet(page).locator("[aria-current='page']")).toHaveCount(1);
  });

  test("journee: bandeau de trajet", async ({ page }) => {
    await openTrip(page, `/voyages/${TRIP}/jour/5`);
    const banner = sheet(page).locator("[data-kind='travel']");
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toContainText("2 h 45 de trajet ce jour, au-delà des 1 h 30 prévues pour ton rythme.");
    await expect(banner).toContainText("vers [Distillerie accessible en bus]");
    for (const n of [1, 2]) {
      await openTrip(page, `/voyages/${TRIP}/jour/${n}`);
      await expect(sheet(page).locator("[data-kind='travel']")).toHaveCount(0);
    }
  });

  test("journee: jour en préparation (voyage débloqué simulé, J6)", async ({ page }) => {
    await openTrip(page, "/voyages/mock_trip_edimbourg_debloque/jour/6");
    await expect(sheet(page).locator("[data-kind='generating']")).toHaveText("Jour 6 en préparation");
    await expect(dayList(page)).toHaveCount(0);
    await expect(sheet(page).locator("[data-kind='travel']")).toHaveCount(0);
  });

  test("journee: marqueur fait défiler la liste", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await page.getByRole("button", { name: "Réduire le panneau" }).click();
    await expectSheetAt(page, 0.25);
    const url = page.url();
    const marker = dayMarkers(page).nth(3);
    await expect(marker).toHaveAccessibleName(/^Étape 4 :/);
    await marker.click();
    await expectSheetAt(page, 0.55);
    await expect.poll(() => fullyInside(listStops(page).nth(3), body(page))).toBe(true);
    expect(page.url()).toBe(url);
    await expect(marker).toBeFocused();
    // Sans fiche ouverte, toucher n'ouvre pas de fiche et ne sélectionne pas (F4-PO-4) ; avec une fiche ouverte : sejour-fiche.e2e.spec.ts.
    await expect(page.locator("[aria-current='true']")).toHaveCount(0);
  });

  test("journee: carte et jour indépendants", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    await body(page).evaluate((el) => el.scrollTo({ top: 120 }));
    const scroll = await body(page).evaluate((el) => el.scrollTop);
    const url = page.url();
    const map = page.locator("[data-renderer='simulated']");
    const before = await map.getAttribute("data-center-lng");
    // Glisser la carte de 100 px dans une zone sans marqueur, au-dessus du panneau.
    await page.mouse.move(300, 330);
    await page.mouse.down();
    await page.mouse.move(250, 330, { steps: 5 });
    await page.mouse.move(200, 330, { steps: 5 });
    await page.mouse.up();
    await expect(map).not.toHaveAttribute("data-center-lng", before ?? "");
    expect(await body(page).evaluate((el) => el.scrollTop)).toBe(scroll);
    expect(page.url()).toBe(url);
    // Glisser horizontalement de 200 px sur le panneau ne change pas de jour.
    const title = page.getByRole("heading", { level: 1 });
    const box = (await title.boundingBox())!;
    await page.mouse.move(box.x + 250, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    expect(page.url()).toBe(url);
    await expect(title).toHaveText("Dimanche 30 août");
  });

  test("journee: lien d'évitement panneau à 25 %", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await page.getByRole("button", { name: "Réduire le panneau" }).click();
    await expectSheetAt(page, 0.25);
    await page.getByRole("link", { name: "Aller à la liste des étapes" }).focus();
    await expect(page.getByRole("link", { name: "Aller à la liste des étapes" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expectSheetAt(page, 0.55);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("liste-etapes");
  });

  test("journee: ordre de tabulation", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    const names: string[] = [];
    for (let i = 0; i < 17; i += 1) {
      await page.keyboard.press("Tab");
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el?.getAttribute("aria-label") ?? el?.querySelector(".sr-only")?.textContent ?? el?.textContent?.trim() ?? "";
        }),
      );
    }
    expect(names.slice(0, 2)).toEqual(["Aller à la liste des étapes", "Retour"]);
    expect(names.slice(2, 7).map((name) => name.match(/^Étape (\d+) :/)?.[1])).toEqual(["1", "2", "3", "4", "5"]);
    expect(names[7]).toBe("Agrandir le panneau");
    expect(names[8]).toBe("Séjour");
    expect(names.slice(9, 15)).toEqual(["Jour 1, sam.", "Jour 2, dim.", "Jour 3, lun.", "Jour 4, mar.", "Jour 5, mer.", "Jour 6, jeu."]);
    // Puis le contenu du panneau dans l'ordre de lecture : première étape de la ligne du jour.
    expect(names[15]).toContain("[Royal Mile]");
    expect(names[16]).toContain("[Dean Village]");
  });

  test("journee: surprends-moi", async ({ page }) => {
    await openTrip(page, JOUR2);
    const button = sheet(page).getByRole("button", { name: "Surprends-moi" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = page.locator(`[id="${await button.getAttribute("aria-controls")}"]`);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button).toBeFocused();
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText("[Circus Lane]");
    await expect(panel).toContainText("[Stockbridge, 20 min, gratuit]");
    await expect(panel).toContainText("Pourquoi pour toi");
    await expect(panel.getByRole("link", { name: "Source : [Office du tourisme d'Édimbourg]" })).toHaveAttribute(
      "href",
      "https://example.org/mock/circus-lane",
    );
    await expect(panel).toContainText("Source consultée le 18 août 2026");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveCount(0);

    await openTrip(page, `/voyages/${TRIP}/jour/1`);
    await expect(sheet(page).getByRole("button", { name: "Surprends-moi" })).toHaveCount(0);
  });

  test("journee: « Retour » et titre du document", async ({ page }) => {
    await openTrip(page, JOUR2);
    await expect(page).toHaveTitle("Édimbourg · Jour 2");
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(`/voyages/${TRIP}`);
    await expect(page).toHaveTitle("Édimbourg · Séjour");
    await expect(sheet(page).getByRole("link", { name: "Séjour" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/voyages");
  });

  test("journee: route sans clé", async ({ page }) => {
    await openTrip(page, JOUR2);
    await expect(page.getByRole("region", { name: "Carte du jour 2" }).getByRole("status")).toHaveText(
      "Carte indisponible. La liste contient tout le programme.",
    );
    const day = edimbourg.days.find((d) => d.index === 2)!;
    await expect(dayList(page).locator("ol > li")).toHaveCount(day.items.length);
    await expect(listStops(page)).toHaveCount(day.items.filter((item) => item.type === "stop").length);
  });
});

test.describe("Séjour", () => {
  const aFaire = (page: Page) => sheet(page).getByRole("region", { name: "À faire avant de partir" });
  const pendant = (page: Page) => sheet(page).getByRole("region", { name: "Pendant ton séjour" });
  const jourParJour = (page: Page) => sheet(page).getByRole("region", { name: "Jour par jour" });
  const box = (page: Page, name: string) => aFaire(page).getByRole("button", { name, exact: true });
  const row = (page: Page, name: string) =>
    aFaire(page).getByRole("listitem").filter({ has: page.getByRole("button", { name, exact: true }) });

  test("sejour: en-tête et budget", async ({ page }) => {
    await openTrip(page, SEJOUR);
    await expect(page).toHaveTitle("Édimbourg · Séjour");
    await expect(sheet(page).getByRole("link", { name: "Séjour" })).toHaveAttribute("aria-current", "page");
    const plate = sheet(page).locator("[data-destination-plate]");
    await expect(plate).toHaveAttribute("data-destination-plate", "bruyere");
    await expect(plate.getByRole("heading", { level: 1 })).toHaveText("Édimbourg");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(plate).toContainText("sam. 29.08 – jeu. 03.09 · 2 adultes");
    // Aplat dest-bruyere, style destination (36 px, 800).
    const style = await plate.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-dest-bruyere)";
      document.body.append(probe);
      const bruyere = getComputedStyle(probe).color;
      probe.remove();
      const title = getComputedStyle(el.querySelector("h1")!);
      return { background: getComputedStyle(el).backgroundColor, bruyere, size: title.fontSize, weight: title.fontWeight };
    });
    expect(style.background).toBe(style.bruyere);
    expect(style).toMatchObject({ size: "36px", weight: "800" });
    await expect(sheet(page).locator("[data-part='budget']")).toHaveText("Budget estimé : environ 640 CHF par personne");
    // Carte d'ensemble : sans clé en CI, l'état « configuration absente » de F4 ; avec la carte simulée, la vue d'ensemble.
    await expect(page.getByRole("region", { name: "Carte du séjour" })).toBeVisible();
    await openTrip(page, DEV_SEJOUR);
    await expect(page.getByRole("region", { name: "Carte du séjour" }).locator("[data-renderer='simulated']")).toBeVisible();
  });

  test("sejour: trouver la liste à réserver", async ({ page, context }) => {
    // Scénario du handover § 14 : depuis le Séjour, la liste « À faire avant de partir » et ses liens.
    await openTrip(page, SEJOUR);
    const rows = aFaire(page).getByRole("listitem");
    await expect(rows).toHaveCount(5);
    for (const [index, item] of edimbourg.checklist.entries()) {
      await expect(rows.nth(index).getByRole("button")).toHaveAccessibleName(item.label);
    }
    await expect(aFaire(page).getByRole("img", { name: "4 réservations à faire" })).toHaveText("4");
    // « [Billets du Tattoo] » : faite, barrée, en ink-soft, sans lien.
    const tattoo = row(page, "[Billets du Tattoo]");
    await expect(box(page, "[Billets du Tattoo]")).toHaveAttribute("aria-pressed", "true");
    await expect(tattoo.getByRole("link")).toHaveCount(0);
    const done = await tattoo.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-ink-soft)";
      document.body.append(probe);
      const inkSoft = getComputedStyle(probe).color;
      probe.remove();
      const name = el.querySelector("[id]")!;
      return { color: getComputedStyle(name).color, inkSoft, decoration: getComputedStyle(name).textDecorationLine };
    });
    expect(done.color).toBe(done.inkSoft);
    expect(done.decoration).toBe("line-through");
    // « Réserver » : nouvel onglet, rel="noopener noreferrer".
    const reserver = row(page, "[Château d'Édimbourg]").getByRole("link", { name: "Réserver" });
    await expect(reserver).toHaveAttribute("href", "https://example.org/mock/chateau");
    await expect(reserver).toHaveAttribute("target", "_blank");
    await expect(reserver).toHaveAttribute("rel", "noopener noreferrer");
    await context.route("https://example.org/**", (route) => route.fulfill({ status: 200, body: "" }));
    const [popup] = await Promise.all([page.waitForEvent("popup"), reserver.click()]);
    expect(popup.url()).toBe("https://example.org/mock/chateau");
    await popup.close();
    // « [Assurance voyage] » : lien rémunéré.
    await expect(row(page, "[Assurance voyage]")).toContainText("Lien rémunéré");
    await expect(row(page, "[Château d'Édimbourg]")).not.toContainText("Lien rémunéré");
  });

  test("sejour: liste à réserver", async ({ page }) => {
    const events = collectEvents(page);
    await openTrip(page, SEJOUR);
    const chateau = box(page, "[Château d'Édimbourg]");
    await chateau.click();
    await expect(chateau).toHaveAttribute("aria-pressed", "true");
    await expect(row(page, "[Château d'Édimbourg]").getByRole("link")).toHaveCount(0);
    await expect(row(page, "[Château d'Édimbourg]").locator("[id]")).toHaveCSS("text-decoration-line", "line-through");
    await expect(aFaire(page).getByRole("img", { name: "3 réservations à faire" })).toBeVisible();
    await expect.poll(() => events).toEqual([{ name: "checklist_item_done", properties: {} }]);
    await expect(page.locator("[data-undo-toast]")).toHaveCount(0);
    await expect(chateau).toBeFocused();

    await chateau.click();
    await expect(chateau).toHaveAttribute("aria-pressed", "false");
    await expect(row(page, "[Château d'Édimbourg]").getByRole("link", { name: "Réserver" })).toBeVisible();
    await expect(aFaire(page).getByRole("img", { name: "4 réservations à faire" })).toBeVisible();
    await page.waitForTimeout(300);
    expect(events).toHaveLength(1);

    for (const name of ["[Excursion dans les Highlands]", "[Château d'Édimbourg]", "[Visite de la distillerie]", "[Assurance voyage]"]) {
      await box(page, name).click();
    }
    await expect(aFaire(page).getByRole("img")).toHaveCount(0);
    await expect.poll(() => events.length).toBe(5);

    // Les cases cochées restent cochées d'un onglet à l'autre du voyage (état de TripShell), pas au rechargement.
    await sheet(page).getByRole("link", { name: "Jour 2, dim." }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
    await sheet(page).getByRole("link", { name: "Séjour", exact: true }).click();
    await expect(box(page, "[Château d'Édimbourg]")).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(box(page, "[Château d'Édimbourg]")).toHaveAttribute("aria-pressed", "false");
  });

  test("sejour: pendant ton séjour", async ({ page }) => {
    await openTrip(page, SEJOUR);
    const links = pendant(page).getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toContainText("J2 · dim. 30.08 · 18:00 – 19:00");
    await expect(links.nth(0)).toContainText("[Concert d'orgue à St Giles]");
    await expect(links.nth(0)).toContainText("Non confirmé");
    await expect(links.nth(0)).toHaveAttribute("href", `/voyages/${TRIP}/jour/2?etape=${CONCERT}`);
    const marche = edimbourg.days[3]!.events[0]!;
    await expect(links.nth(1)).toContainText(`J4 · mar. 01.09 · ${marche.end ? `${marche.start} – ${marche.end}` : marche.start}`);
    await expect(links.nth(1)).toContainText("[Marché nocturne de Leith]");
    await expect(links.nth(1)).toContainText("Non confirmé");
    await expect(links.nth(1)).toHaveAttribute("href", `/voyages/${TRIP}/jour/4?etape=${marche.id}`);
    await expect(pendant(page)).not.toContainText("Tattoo");
    // Chaque ligne mène à la fiche de l'événement dans son jour.
    await links.nth(1).click();
    await expect(page).toHaveURL(`/voyages/${TRIP}/jour/4?etape=${marche.id}`);
    await expect(ficheTitle(page)).toHaveText("[Marché nocturne de Leith]");
  });

  test("sejour: fiche d'un événement et retour", async ({ page }) => {
    await openTrip(page, SEJOUR);
    await pendant(page).getByRole("link", { name: /Concert d'orgue/ }).click();
    await expect(page).toHaveURL(`/voyages/${TRIP}/jour/2?etape=${CONCERT}`);
    await expect(ficheTitle(page)).toHaveText("[Concert d'orgue à St Giles]");
    await expect(ficheTitle(page)).toBeFocused();

    // « Fermer » : adresse du jour remplacée, J2 sans fiche, focus sur la ligne du concert dans « Événements du jour ».
    await fiche(page).getByRole("button", { name: "Fermer" }).click();
    await expect(page).toHaveURL(`/voyages/${TRIP}/jour/2`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
    const dayEvents = sheet(page).getByRole("region", { name: "Événements du jour" });
    await expect(dayEvents.getByRole("link", { name: /Concert d'orgue/ })).toBeFocused();

    // Rouvrir depuis le Séjour, puis retour du navigateur : Séjour, focus sur la ligne du concert.
    await openTrip(page, SEJOUR);
    await pendant(page).getByRole("link", { name: /Concert d'orgue/ }).click();
    await expect(ficheTitle(page)).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(`/voyages/${TRIP}`);
    await expect(pendant(page).getByRole("link", { name: /Concert d'orgue/ })).toBeFocused();
  });

  test("sejour: jour par jour", async ({ page }) => {
    await openTrip(page, SEJOUR);
    const links = jourParJour(page).getByRole("link");
    await expect(links).toHaveCount(6);
    for (const day of edimbourg.days) {
      const link = links.nth(day.index - 1);
      const stops = day.items.filter((item) => item.type === "stop").length;
      await expect(link).toHaveAttribute("href", `/voyages/${TRIP}/jour/${day.index}`);
      await expect(link).toContainText(`J${day.index}`);
      await expect(link).toContainText(day.title);
      await expect(link).toContainText(new RegExp(`${stops} étapes? · .+ de trajet`));
    }
    await expect(links.nth(1)).toContainText("1 h 25 de trajet");
    await links.nth(4).click();
    await expect(page).toHaveURL(`/voyages/${TRIP}/jour/5`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mercredi 2 septembre");
  });

  test("sejour: jour en préparation (voyage débloqué simulé, J6)", async ({ page }) => {
    await openTrip(page, "/voyages/mock_trip_edimbourg_debloque");
    const j6 = jourParJour(page).getByRole("link").nth(5);
    await expect(j6).toContainText("En préparation");
    await expect(j6).not.toContainText("de trajet");
  });

  test("sejour: ordre de tabulation", async ({ page }) => {
    await openTrip(page, DEV_SEJOUR);
    const names: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const labelledBy = el?.getAttribute("aria-labelledby");
          const label = labelledBy ? document.getElementById(labelledBy)?.textContent : null;
          return el?.getAttribute("aria-label") ?? label ?? el?.querySelector(".sr-only")?.textContent ?? el?.textContent?.trim() ?? "";
        }),
      );
    }
    expect(names.slice(0, 3)).toEqual(["Retour", "Agrandir le panneau", "Séjour"]);
    expect(names.slice(3, 9)).toEqual(["Jour 1, sam.", "Jour 2, dim.", "Jour 3, lun.", "Jour 4, mar.", "Jour 5, mer.", "Jour 6, jeu."]);
    // Puis le contenu du panneau dans l'ordre de lecture : cases et liens « Réserver » de la liste.
    expect(names.slice(9, 12)).toEqual(["[Billets du Tattoo]", "[Excursion dans les Highlands]", "Réserver"]);
    // Les marqueurs de la vue d'ensemble ne sont pas focusables.
    const focusable = await page
      .getByRole("region", { name: "Carte du séjour" })
      .evaluate((map) => Array.from(map.querySelectorAll<HTMLElement>("*")).filter((el) => el.tabIndex >= 0).length);
    expect(focusable).toBe(0);
  });

  test("sejour: case de 22 px dans 44 × 44 px, « Réserver » d'au moins 44 px, toute cible d'au moins 44 × 44 px", async ({ page }) => {
    await openTrip(page, SEJOUR);
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.92);
    const sizes = await aFaire(page).evaluate((section) =>
      Array.from(section.querySelectorAll("[data-part='case']")).map((button) => {
        const square = button.querySelector("span")!.getBoundingClientRect();
        const zone = button.getBoundingClientRect();
        return { square: [square.width, square.height], zone: [zone.width, zone.height] };
      }),
    );
    expect(sizes).toHaveLength(5);
    for (const size of sizes) {
      expect(size.square).toEqual([22, 22]);
      expect(size.zone[0]).toBeGreaterThanOrEqual(44);
      expect(size.zone[1]).toBeGreaterThanOrEqual(44);
    }
    for (const link of await aFaire(page).getByRole("link", { name: "Réserver" }).all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    // Toutes les cibles du Séjour, panneau défilé jusqu'au bout.
    await body(page).evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button"))
        .filter((el) => !el.closest(".sr-only") && !el.classList.contains("sr-only"))
        .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
        .map(({ name, box }) => `${name} (${box.width} × ${box.height})`),
    );
    expect(small).toEqual([]);
  });
});

test.describe("transverses", () => {
  test("sejour: 404 hors organisation ou hors limites", async ({ page }) => {
    for (const path of [
      "/voyages/inconnu",
      "/voyages/inconnu/jour/2",
      `/voyages/${TRIP}/jour/0`,
      `/voyages/${TRIP}/jour/7`,
      `/voyages/${TRIP}/jour/02`,
      `/voyages/${TRIP}/jour/abc`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test("sejour: aucune donnée persistée côté client", async ({ page, context }) => {
    await openTrip(page, `/voyages/${TRIP}`);
    // Séjour (F5c) : cases cochées puis décochées.
    const chateau = sheet(page).getByRole("button", { name: "[Château d'Édimbourg]", exact: true });
    await chateau.click();
    await sheet(page).getByRole("button", { name: "[Assurance voyage]", exact: true }).click();
    await chateau.click();
    await expect(chateau).toHaveAttribute("aria-pressed", "false");
    await sheet(page).getByRole("link", { name: "Jour 2, dim." }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await page.getByRole("button", { name: "Réduire le panneau" }).click();
    await sheet(page).getByRole("button", { name: "Surprends-moi" }).click();
    await sheet(page).getByRole("link", { name: "Jour 5, mer." }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mercredi 2 septembre");
    await listStops(page).first().click();
    await expect(page).toHaveURL(/\?etape=/);
    // Fiche (F5b) : verrou posé puis annulé, puis posé de nouveau.
    const lock = fiche(page).getByRole("button", { name: "Verrouiller" });
    await lock.click();
    await page.locator("[data-undo-toast]").getByRole("button", { name: "Annuler" }).click();
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "true");

    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).length,
      caches: (await caches.keys()).length,
      cookie: document.cookie,
    }));
    expect(stored).toEqual({ local: 0, session: 0, databases: 0, caches: 0, cookie: "" });
    expect(await context.cookies()).toEqual([]);
    const url = new URL(page.url());
    expect([...url.searchParams.keys()]).toEqual(["etape"]);
    const stopIds = edimbourg.days.flatMap((day) => [
      ...day.items.flatMap((item) => (item.type === "stop" ? [item.stop.id] : [])),
      ...day.events.map((event) => event.id),
    ]);
    const placeIds = edimbourg.days.flatMap((day) =>
      day.items.flatMap((item) => (item.type === "stop" && item.stop.placeId ? [item.stop.placeId] : [])),
    );
    const etape = url.searchParams.get("etape")!;
    expect(stopIds).toContain(etape);
    expect(placeIds).not.toContain(etape);
  });

  test("cibles d'au moins 44 × 44 px et contour de focus 2 px line décalé de 2 px", async ({ page }) => {
    await openTrip(page, DEV_JOUR2);
    await sheet(page).getByRole("button", { name: "Surprends-moi" }).click();
    await page.getByRole("button", { name: "Agrandir le panneau" }).click();
    await expectSheetAt(page, 0.92);
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button"))
        .filter((el) => !el.closest(".sr-only") && !el.classList.contains("sr-only"))
        .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
        .map(({ name, box }) => `${name} (${box.width} × ${box.height})`),
    );
    expect(small).toEqual([]);

    await handle(page).focus();
    await page.keyboard.press("ArrowUp");
    const outline = await handle(page).evaluate((el) => {
      const style = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.color = "var(--color-line)";
      document.body.append(probe);
      const line = getComputedStyle(probe).color;
      probe.remove();
      return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle, color: style.outlineColor, line };
    });
    expect(outline).toMatchObject({ width: "2px", offset: "2px", style: "solid" });
    expect(outline.color).toBe(outline.line);
  });
});
