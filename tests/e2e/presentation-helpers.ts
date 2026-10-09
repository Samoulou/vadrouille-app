import { expect, type Page } from "@playwright/test";

import { CONSOLE_PREFIX } from "../../src/analytics/track";

export const APERCU = "/voyages/mock_trip_edimbourg/presentation";
export const SUITE = "/voyages/mock_trip_edimbourg_debloque/presentation";

export interface RecordedEvent {
  name: string;
  properties: Record<string, unknown>;
}

/**
 * Événements de mesure écrits par l'enregistreur console (pages de développement actives sur le
 * build de production des tests) : aucune requête réseau, lus dans la console.
 */
export function collectEvents(page: Page): RecordedEvent[] {
  const events: RecordedEvent[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith(`${CONSOLE_PREFIX} `)) {
      events.push(JSON.parse(text.slice(CONSOLE_PREFIX.length + 1)) as RecordedEvent);
    }
  });
  return events;
}

export const card = (page: Page) => page.locator("[data-part='carte']");
export const progress = (page: Page) => page.getByRole("progressbar");
export const toast = (page: Page) => page.locator("[data-undo-toast]");
export const dialog = (page: Page) => page.getByRole("dialog");

/** Nom de la proposition en cours, tiré du nom accessible de la carte. */
export async function cardName(page: Page): Promise<string> {
  const label = await card(page).getAttribute("aria-label");
  return (label ?? "").replace("Voir le détail de ", "");
}

export async function openDeck(page: Page, url = APERCU) {
  await page.goto(url);
  await expect(card(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Clique un bouton du paquet par son nom exact. */
export async function press(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

/**
 * Glisse la carte horizontalement de `ratio` × sa largeur. `slow` : pas de 2 px toutes les 25 ms
 * (environ 0,08 px/ms) puis pause avant de relâcher ; sinon, mouvement rapide.
 */
export async function swipe(page: Page, ratio: number, { slow = false, release = true } = {}) {
  const box = (await card(page).boundingBox())!;
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  const distance = ratio * box.width;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  if (slow) {
    const steps = Math.max(1, Math.round(Math.abs(distance) / 2));
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(startX + (distance * i) / steps, y);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(150);
  } else {
    await page.mouse.move(startX + distance, y, { steps: 8 });
  }
  if (release) {
    await page.mouse.up();
  }
}
