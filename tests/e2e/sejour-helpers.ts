import { expect, type Locator, type Page } from "@playwright/test";

/** Aides des specs de F5 (Séjour, Journée), en 390 × 844. */

export const TRIP = "mock_trip_edimbourg";
export const VIEWPORT_HEIGHT = 844;
export const HEIGHTS = { 0.25: 0.25 * VIEWPORT_HEIGHT, 0.55: 0.55 * VIEWPORT_HEIGHT, 0.92: 0.92 * VIEWPORT_HEIGHT } as const;

export const sheet = (page: Page) => page.getByRole("region", { name: "Programme", exact: true });
export const handle = (page: Page) => sheet(page).locator("[data-part='poignee']");
export const body = (page: Page) => sheet(page).locator("[data-part='contenu']");
export const dayList = (page: Page) => page.locator("#liste-etapes");
export const listStops = (page: Page) => dayList(page).locator("a[data-part='arret']");
export const dayMarkers = (page: Page, n = 2) =>
  page.getByRole("region", { name: `Carte du jour ${n}` }).getByRole("button", { name: /^Étape \d+ :/ });

export async function sheetHeight(page: Page): Promise<number> {
  return (await sheet(page).boundingBox())?.height ?? 0;
}

/** Attend que le panneau soit posé à `part` de la fenêtre (2 px près). */
export async function expectSheetAt(page: Page, part: keyof typeof HEIGHTS) {
  await expect.poll(() => sheetHeight(page), { timeout: 3_000 }).toBeGreaterThan(HEIGHTS[part] - 2);
  await expect.poll(() => sheetHeight(page), { timeout: 3_000 }).toBeLessThan(HEIGHTS[part] + 2);
  await expect(sheet(page)).toHaveAttribute("data-snap", String(part));
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
