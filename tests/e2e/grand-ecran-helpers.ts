import type { Locator, Page } from "@playwright/test";

/**
 * Aides des specs grand écran (spécification F12, F12b ; décision 0022 § 7) : pas de projet Playwright dédié, chaque
 * fichier `grand-ecran-*.{e2e,a11y,visual}.spec.ts` commence par `test.use(LARGE_SCREEN)` (souris, sans toucher).
 */
export const LARGE_SCREEN = { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false } as const;

/** Tailles des critères C11 et C14 (`page.setViewportSize`). */
export const SIZES = {
  large: { width: 1280, height: 800 },
  threshold: { width: 1024, height: 768 },
  belowThreshold: { width: 1023, height: 768 },
  mobile: { width: 390, height: 844 },
} as const;

/** Conteneur de la carte dans la mise en page du voyage (`TripShell`). */
export const mapZone = (page: Page) => page.locator("[data-part='zone-carte']");

/** Panneau du voyage, quel que soit son nom de région (« Programme » ou « Fiche étape »). */
export const tripSheet = (page: Page) => page.locator("[data-sheet]");

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function rectOf(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("élément sans rectangle");
  return box;
}

/** Les deux rectangles partagent une surface non nulle (bords communs exclus). */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Aucun élément du panneau (toast compris) ne couvre la carte : en neuf points de contrôle de la zone de la carte,
 * l'élément le plus haut appartient à la zone de la carte (C15). Renvoie les points couverts.
 */
export async function coveredMapPoints(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const zone = document.querySelector<HTMLElement>("[data-part='zone-carte']");
    if (!zone) return ["zone de carte absente"];
    const rect = zone.getBoundingClientRect();
    const covered: string[] = [];
    for (const fx of [0.02, 0.5, 0.98]) {
      for (const fy of [0.02, 0.5, 0.98]) {
        const x = rect.left + fx * rect.width;
        const y = rect.top + fy * rect.height;
        const top = document.elementFromPoint(x, y);
        if (!top || !zone.contains(top)) covered.push(`${Math.round(x)},${Math.round(y)} : ${top?.outerHTML.slice(0, 80)}`);
      }
    }
    return covered;
  });
}
