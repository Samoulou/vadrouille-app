import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { edimbourg } from "../../src/mocks/edimbourg";

/** Aides des specs de F5 (Séjour, Journée), en 390 × 844. */

export const TRIP = "mock_trip_edimbourg";
export const VIEWPORT_HEIGHT = 844;
export const HEIGHTS = { 0.25: 0.25 * VIEWPORT_HEIGHT, 0.55: 0.55 * VIEWPORT_HEIGHT, 0.92: 0.92 * VIEWPORT_HEIGHT } as const;

export const sheet = (page: Page) => page.getByRole("region", { name: "Programme", exact: true });
/** Panneau quand la fiche étape est ouverte (région « Fiche étape », F5b). */
export const fiche = (page: Page) => page.getByRole("region", { name: "Fiche étape", exact: true });
export const ficheTitle = (page: Page) => fiche(page).getByRole("heading", { level: 1 });
export const handle = (page: Page) => sheet(page).locator("[data-part='poignee']");
export const body = (page: Page) => sheet(page).locator("[data-part='contenu']");
export const dayList = (page: Page) => page.locator("#liste-etapes");
export const listStops = (page: Page) => dayList(page).locator("a[data-part='arret']");
export const dayMarkers = (page: Page, n = 2) =>
  page.getByRole("region", { name: `Carte du jour ${n}` }).getByRole("button", { name: /^Étape \d+ :/ });

export async function sheetHeight(page: Page, region: "Programme" | "Fiche étape" = "Programme"): Promise<number> {
  const target = region === "Programme" ? sheet(page) : fiche(page);
  return (await target.boundingBox())?.height ?? 0;
}

/** Attend que le panneau (nommé `region`) soit posé à `part` de la fenêtre (2 px près). */
export async function expectSheetAt(page: Page, part: keyof typeof HEIGHTS, region: "Programme" | "Fiche étape" = "Programme") {
  await expect.poll(() => sheetHeight(page, region), { timeout: 3_000 }).toBeGreaterThan(HEIGHTS[part] - 2);
  await expect.poll(() => sheetHeight(page, region), { timeout: 3_000 }).toBeLessThan(HEIGHTS[part] + 2);
  await expect(region === "Programme" ? sheet(page) : fiche(page)).toHaveAttribute("data-snap", String(part));
}

/** Ouvre une page du voyage et attend le panneau ; sur /dev, attend aussi la carte simulée cadrée. */
export async function openTrip(page: Page, path: string) {
  await page.goto(path);
  await expect(sheet(page)).toBeVisible();
  if (path.startsWith("/dev/")) {
    await expect(page.locator("[data-renderer='simulated']")).toHaveAttribute("data-zoom", /\d+/);
  }
}

/** Glisser vertical à la souris (événements pointeur) : `steps` pas de `dy / steps` px, `delay` ms entre deux pas. */
export async function dragVertical(page: Page, target: Locator, dy: number, { steps, delay }: { steps: number; delay: number }) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x, y + (dy * i) / steps);
    if (delay > 0) await page.waitForTimeout(delay);
  }
  await page.mouse.up();
}

/** Le rectangle de `inner` est entièrement dans celui de `outer` (1 px près). */
export async function fullyInside(inner: Locator, outer: Locator): Promise<boolean> {
  const a = await inner.boundingBox();
  const b = await outer.boundingBox();
  if (!a || !b) return false;
  return a.y >= b.y - 1 && a.y + a.height <= b.y + b.height + 1 && a.x >= b.x - 1 && a.x + a.width <= b.x + b.width + 1;
}

/**
 * Scénario du handover § 14 « trouver la liste à réserver » : depuis le Séjour (`path`), la liste « À faire avant de
 * partir » et ses liens. Partagé par la spec mobile et la spec grand écran (décision 0022 § 7).
 */
export async function findChecklistToBook(page: Page, context: BrowserContext, path: string) {
  const aFaire = sheet(page).getByRole("region", { name: "À faire avant de partir" });
  const box = (name: string) => aFaire.getByRole("button", { name, exact: true });
  const row = (name: string) => aFaire.getByRole("listitem").filter({ has: page.getByRole("button", { name, exact: true }) });
  await openTrip(page, path);
  const rows = aFaire.getByRole("listitem");
  await expect(rows).toHaveCount(5);
  for (const [index, item] of edimbourg.checklist.entries()) {
    // Réservation : le seul nom stocké, « Réserver : » composé à l'écran (M5e, décision 0147 § 7.1).
    await expect(rows.nth(index).getByRole("button")).toHaveAccessibleName(item.kind === "reservation" ? `Réserver : ${item.label}` : item.label);
  }
  await expect(aFaire.getByRole("img", { name: "4 réservations à faire" })).toHaveText("4");
  // « [Billets du Tattoo] » : faite, barrée, en ink-soft, sans lien.
  const tattoo = row("[Billets du Tattoo]");
  await expect(box("[Billets du Tattoo]")).toHaveAttribute("aria-pressed", "true");
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
  const reserver = row("Réserver : [Château d'Édimbourg]").getByRole("link", { name: "Réserver" });
  await expect(reserver).toHaveAttribute("href", "https://example.org/mock/chateau");
  await expect(reserver).toHaveAttribute("target", "_blank");
  await expect(reserver).toHaveAttribute("rel", "noopener noreferrer");
  await context.route("https://example.org/**", (route) => route.fulfill({ status: 200, body: "" }));
  const [popup] = await Promise.all([page.waitForEvent("popup"), reserver.click()]);
  expect(popup.url()).toBe("https://example.org/mock/chateau");
  await popup.close();
  // « [Assurance voyage] » : lien rémunéré.
  await expect(row("Réserver : [Assurance voyage]")).toContainText("Lien rémunéré");
  await expect(row("Réserver : [Château d'Édimbourg]")).not.toContainText("Lien rémunéré");
}
