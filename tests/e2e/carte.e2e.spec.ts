import { expect, test, type Page } from "@playwright/test";

import { buildDayRoute } from "../../src/components/carte/route";
import { fitCamera, scaleAt } from "../../src/components/carte/simulated-model";
import { edimbourg } from "../../src/mocks/edimbourg";
import { edimbourgCarte } from "../../src/mocks/edimbourg-carte";

import { blockGoogle, cameraOf, list, mapRegion, markers, openSimulated, simulated } from "./carte-helpers";

/** Critères F4 sur /dev/carte, carte simulée sauf mention contraire, en 390 × 844. */

const TEXTS = {
  horsLigne: "Carte indisponible hors ligne",
  indisponible: "Carte indisponible. La liste contient tout le programme.",
  erreur: "La carte n'a pas pu être chargée. La liste contient tout le programme.",
};

const stopPosition = (dayIndex: number, stopId: string) => {
  const point = edimbourgCarte
    .find((map) => map.dayIndex === dayIndex)!
    .points.find((p) => p.ref.type === "stop" && p.ref.stopId === stopId)!;
  return { lat: point.lat, lng: point.lng };
};

const listStops = (page: Page) => list(page).locator("a[data-part='arret']");

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.describe("carte simulée", () => {
  test.afterEach(() => {
    // La carte simulée ne fait aucune requête vers Google.
    expect(googleRequests).toEqual([]);
  });

  test("jour 2 : un bouton par étape, nommés dans l'ordre de la DayLine ; terminus ni bouton ni focusable", async ({ page }) => {
    await openSimulated(page);
    await expect(mapRegion(page)).toBeVisible();
    const stopNames = await listStops(page).evaluateAll((links) => links.map((a) => a.querySelector("span")!.textContent));
    expect(stopNames.length).toBe(5);
    await expect(markers(page)).toHaveCount(stopNames.length);
    const labels = await markers(page).evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
    expect(labels).toEqual(stopNames.map((name, i) => `Étape ${i + 1} : ${name}`));

    const terminus = simulated(page).locator("[data-part='terminus']");
    await expect(terminus).toHaveCount(1);
    await expect(terminus).toHaveAttribute("aria-hidden", "true");
    expect(await terminus.getAttribute("tabindex")).toBeNull();
    expect(await terminus.evaluate((el) => el.closest("button") === null && el.querySelector("button, [tabindex]") === null)).toBe(true);
  });

  test("toucher le marqueur 3 fait défiler la liste jusqu'à l'étape 3, sans changer l'adresse ni la sélection", async ({ page }) => {
    await openSimulated(page);
    const url = page.url();
    const etape3 = listStops(page).nth(2);
    await page.evaluate(() => window.scrollTo(0, 0));
    await markers(page).nth(2).click();
    await expect(etape3).toBeInViewport();
    expect(page.url()).toBe(url);
    await expect(markers(page).nth(2)).not.toHaveAttribute("aria-current", "true");
    await expect(page.locator("[aria-current='true']")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Entrée sur un marqueur = toucher", async ({ page }) => {
    await openSimulated(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await markers(page).nth(4).focus();
    await page.keyboard.press("Enter");
    await expect(listStops(page).nth(4)).toBeInViewport();
  });

  test("toucher l'étape 3 dans la liste sélectionne le marqueur 3 et recentre la carte, zoom inchangé", async ({ page }) => {
    await openSimulated(page);
    const before = await cameraOf(page);
    await listStops(page).nth(2).click();
    const marker = markers(page).nth(2);
    await expect(marker).toHaveAttribute("aria-current", "true");
    await expect(mapRegion(page).locator("[aria-current='true']")).toHaveCount(1);
    const pastille = marker.locator("[data-kind='stop']");
    const box = (await pastille.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([38, 38]);
    const colors = await page.evaluate(() => {
      const probe = document.querySelector("[aria-current='true'] [data-kind='stop']")!;
      const line = document.createElement("span");
      line.style.color = "var(--color-line)";
      document.body.append(line);
      const result = { background: getComputedStyle(probe).backgroundColor, line: getComputedStyle(line).color };
      line.remove();
      return result;
    });
    expect(colors.background).toBe(colors.line);

    const camera = await cameraOf(page);
    expect(camera).toEqual({ ...stopPosition(2, "j2-dejeuner"), zoom: before.zoom });
    await page.evaluate(() => window.scrollTo(0, 0));
    const container = (await simulated(page).boundingBox())!;
    const center = (await marker.boundingBox())!;
    expect(Math.abs(center.x + center.width / 2 - (container.x + container.width / 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(center.y + center.height / 2 - (container.y + container.height / 2))).toBeLessThanOrEqual(2);
  });

  test("avec prefers-reduced-motion, le recentrage est instantané (aucune transition)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSimulated(page);
    await listStops(page).nth(1).click();
    expect(await cameraOf(page)).toMatchObject(stopPosition(2, "j2-dean-village"));
    const transitions = await simulated(page).evaluate((root) =>
      [root, ...Array.from(root.querySelectorAll("*"))].filter((el) => {
        const style = getComputedStyle(el);
        return (
          style.transitionDuration.split(",").some((d) => parseFloat(d) > 0.001) || style.animationName !== "none"
        );
      }).length,
    );
    expect(transitions).toBe(0);
  });

  test("glisser de 100 px vers la gauche déplace le centre selon le modèle, sans rappel ni sélection", async ({ page }) => {
    await openSimulated(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await cameraOf(page);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const box = (await simulated(page).boundingBox())!;
    // Zone sans marqueur : coin inférieur gauche de la carte.
    const x = box.x + 30;
    const y = box.y + box.height - 20;
    await page.mouse.move(x + 100, y);
    await page.mouse.down();
    await page.mouse.move(x + 50, y, { steps: 5 });
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.up();
    const after = await cameraOf(page);
    expect(after.zoom).toBe(before.zoom);
    expect(after.lat).toBeCloseTo(before.lat, 9);
    expect(after.lng - before.lng).toBeCloseTo(100 / scaleAt(before.zoom), 9);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await expect(page.locator("[aria-current='true']")).toHaveCount(0);
  });

  test("changer de jour recadre : toutes les positions dans le conteneur, zoom du modèle", async ({ page }) => {
    await openSimulated(page);
    await page.getByRole("button", { name: "J4", exact: true }).click();
    await expect(page.getByRole("region", { name: "Carte du jour 4" })).toBeVisible();
    const box = (await simulated(page).boundingBox())!;
    const day = edimbourg.days.find((d) => d.index === 4)!;
    const map = edimbourgCarte.find((m) => m.dayIndex === 4)!;
    const expected = fitCamera(buildDayRoute(day, map).positions, { width: box.width, height: box.height }, {
      top: 44,
      right: 44,
      bottom: 44,
      left: 44,
    })!;
    await expect(simulated(page)).toHaveAttribute("data-zoom", String(expected.zoom));
    const points = simulated(page).locator("[data-kind]");
    const count = await points.count();
    expect(count).toBe(buildDayRoute(day, map).stops.length + buildDayRoute(day, map).termini.length);
    for (let i = 0; i < count; i += 1) {
      const p = (await points.nth(i).boundingBox())!;
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      expect(cx).toBeGreaterThanOrEqual(box.x);
      expect(cx).toBeLessThanOrEqual(box.x + box.width);
      expect(cy).toBeGreaterThanOrEqual(box.y);
      expect(cy).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  test("hors ligne : état « Carte indisponible hors ligne », liste lisible, retour de la carte en ligne", async ({ page, context }) => {
    await openSimulated(page);
    const items = await list(page).locator("ol > li").count();
    await context.setOffline(true);
    await expect(mapRegion(page).getByRole("status")).toHaveText(TEXTS.horsLigne);
    await expect(simulated(page)).toHaveCount(0);
    await expect(list(page).locator("ol > li")).toHaveCount(items);
    await expect(listStops(page).first()).toBeVisible();
    await context.setOffline(false);
    await expect(mapRegion(page).getByRole("status")).toHaveCount(0);
    await expect(simulated(page)).toBeVisible();
  });

  test("avec une configuration vide injectée, la carte simulée s'affiche", async ({ page }) => {
    await openSimulated(page, "?config=absente");
    await expect(mapRegion(page).getByRole("status")).toHaveCount(0);
    await expect(markers(page)).toHaveCount(5);
  });

  test("accessibilité : lien d'évitement en premier, ordre lien, marqueurs, liste ; cibles 44 px ; focus 2 px line", async ({ page }) => {
    await openSimulated(page);
    const demo = page.locator("[data-demo='jour']");
    const order = await demo.evaluate((root) =>
      Array.from(root.querySelectorAll<HTMLElement>("a[href], button, [tabindex]"))
        .filter((el) => el.tabIndex >= 0)
        .map((el, i) => {
          el.dataset.ordre = String(i);
          return el.getAttribute("aria-label") ?? el.textContent ?? "";
        }),
    );
    expect(order[0]).toBe("Aller à la liste des étapes");
    expect(order.slice(1, 6).map((label) => label.match(/^Étape (\d+) :/)?.[1])).toEqual(["1", "2", "3", "4", "5"]);

    const skip = page.getByRole("link", { name: "Aller à la liste des étapes" });
    await skip.focus();
    const visited: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      visited.push(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.ordre ?? "hors"));
      await page.keyboard.press("Tab");
    }
    expect(visited).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
    expect(await demo.locator("[data-ordre='6']").evaluate((el) => el.closest("#liste-etapes") !== null)).toBe(true);

    // Lien visible au focus, puis focus sur la liste.
    await skip.focus();
    const skipBox = (await skip.boundingBox())!;
    expect(skipBox.width).toBeGreaterThan(44);
    expect(skipBox.height).toBeGreaterThanOrEqual(20);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("liste-etapes");
    await expect(list(page)).toHaveAttribute("tabindex", "-1");

    for (const box of await markers(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await skip.focus();
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement!;
      const style = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.color = "var(--color-line)";
      document.body.append(probe);
      const line = getComputedStyle(probe).color;
      probe.remove();
      return { label: el.getAttribute("aria-label"), width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle, color: style.outlineColor, line };
    });
    expect(outline).toMatchObject({ width: "2px", offset: "2px", style: "solid" });
    expect(outline.label).toMatch(/^Étape 1 :/);
    expect(outline.color).toBe(outline.line);
  });

  test("vue d'ensemble : anneaux de 12 px masqués, ni numéro, ni carré, ni tracé, ni élément focusable", async ({ page }) => {
    await page.goto("/dev/carte?vue=ensemble");
    const region = page.getByRole("region", { name: "Carte du séjour" });
    await expect(region).toBeVisible();
    const rings = region.locator("[data-kind='overview']");
    const stops = edimbourgCarte.flatMap((m) => m.points).filter((p) => p.ref.type === "stop").length;
    const termini = new Set(
      edimbourgCarte.flatMap((m) => m.points).filter((p) => p.ref.type === "terminus").map((p) => `${p.lat},${p.lng}`),
    ).size;
    await expect(rings).toHaveCount(stops + termini);
    for (const box of await rings.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
      expect([Math.round(box.width), Math.round(box.height)]).toEqual([12, 12]);
    }
    expect(await rings.evaluateAll((els) => els.every((el) => el.closest("[aria-hidden='true']") && el.textContent === ""))).toBe(true);
    await expect(region.locator("[data-kind='terminus'], line, button, a, [tabindex]")).toHaveCount(0);
  });

  test("hauteur stable : la DayLine ne bouge pas entre la carte et chaque état de remplacement", async ({ page, context }) => {
    const top = async () => (await list(page).boundingBox())!.y + (await page.evaluate(() => window.scrollY));
    await openSimulated(page);
    const reference = await top();
    await context.setOffline(true);
    await expect(mapRegion(page).getByRole("status")).toHaveText(TEXTS.horsLigne);
    expect(await top()).toBe(reference);
    await context.setOffline(false);

    await page.goto("/dev/carte?rendu=google&config=absente");
    await expect(mapRegion(page).getByRole("status")).toHaveText(TEXTS.indisponible);
    expect(await top()).toBe(reference);
  });
});

test.describe("rendu Google", () => {
  test("configuration absente : état « Carte indisponible… », aucun script Google demandé, aucun nom de variable", async ({ page }) => {
    await page.goto("/dev/carte?rendu=google&config=absente");
    const status = mapRegion(page).getByRole("status");
    await expect(status).toHaveText(TEXTS.indisponible);
    await expect(status.getByRole("button")).toHaveCount(0);
    expect(await page.content()).not.toMatch(/NEXT_PUBLIC|GOOGLE_MAPS/);
    expect(googleRequests).toEqual([]);
  });

  test("clé factice et domaines Google bloqués : état d'erreur en 10 s au plus, « Réessayer » relance un chargement", async ({ page }) => {
    const top = async () => (await list(page).boundingBox())!.y + (await page.evaluate(() => window.scrollY));
    await openSimulated(page);
    const reference = await top();

    await page.goto("/dev/carte?rendu=google&config=factice");
    const status = mapRegion(page).getByRole("status");
    await expect(status).toContainText(TEXTS.erreur, { timeout: 10_000 });
    expect(await top()).toBe(reference);
    const attempts = googleRequests.length;
    expect(attempts).toBeGreaterThan(0);
    await status.getByRole("button", { name: "Réessayer" }).click();
    await expect.poll(() => googleRequests.length).toBeGreaterThan(attempts);
    await expect(mapRegion(page).getByRole("status")).toContainText(TEXTS.erreur, { timeout: 10_000 });
    // Aucun appel Places ni Routes : seule la Maps JavaScript API est demandée.
    expect(googleRequests.filter((url) => /places\.googleapis\.com|routes\.googleapis\.com/.test(url))).toEqual([]);
  });

  test("hors ligne : l'état « Carte indisponible hors ligne » remplace aussi le rendu Google", async ({ page, context }) => {
    await page.goto("/dev/carte?rendu=google&config=factice");
    await expect(mapRegion(page)).toBeVisible();
    await context.setOffline(true);
    await expect(mapRegion(page).getByRole("status")).toHaveText(TEXTS.horsLigne);
    await expect(mapRegion(page).getByRole("button", { name: "Réessayer" })).toHaveCount(0);
    await expect(list(page).locator("a[data-part='arret']").first()).toBeVisible();
  });
});

test("carte: aucune donnée persistée côté client", async ({ page, context }) => {
  await openSimulated(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await markers(page).nth(1).click();
  await listStops(page).nth(2).click();
  await page.getByRole("button", { name: "J4", exact: true }).click();
  await expect(page.getByRole("region", { name: "Carte du jour 4" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole("region", { name: "Carte du jour 4" }).getByRole("status")).toHaveText(TEXTS.horsLigne);
  await context.setOffline(false);
  await expect(simulated(page)).toBeVisible();
  await page.goto("/dev/carte?vue=ensemble");
  await expect(page.getByRole("region", { name: "Carte du séjour" })).toBeVisible();

  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
    cookie: document.cookie,
  }));
  expect(storage).toEqual({ local: 0, session: 0, databases: 0, caches: 0, workers: 0, cookie: "" });
  expect(await context.cookies()).toEqual([]);
  expect(googleRequests).toEqual([]);
});
