import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Carte à plusieurs villes (décision 0150, critère 19 de M4-suite) : page de développement `/dev/carte/villes/[jeu]`,
 * mêmes `TripShell` et carte que les routes du voyage, carte simulée, jeux de `src/mocks/carte-villes.ts`.
 */
export const VILLES = (jeu: string, suite = "") => `/dev/carte/villes/${jeu}${suite}`;

export const simulee = (page: Page) => page.locator("[data-renderer='simulated']");
export const panneau = (page: Page) => page.locator("[data-sheet]");
export const choix = (page: Page) => panneau(page).getByRole("radiogroup", { name: "Afficher sur la carte" });

/** Ouvre une page de la carte à plusieurs villes et attend la carte simulée cadrée. */
export async function ouvrir(page: Page, chemin: string) {
  await page.goto(chemin);
  await expect(simulee(page)).toHaveAttribute("data-zoom", /\d+/);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const recoupe = (a: Rect, b: Rect) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
const dedans = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

/**
 * Boîtes des éléments de la carte : étiquettes dessinées (celles dont le terminus est dans la carte), terminus dans la
 * carte, marqueurs d'étape, « Retour » et « Partager », région de la carte.
 */
export async function boites(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const carte = rect(document.querySelector("[data-renderer='simulated']")!);
    const dansLaCarte = (r: { x: number; y: number; width: number; height: number }) => {
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      return cx >= carte.x && cx <= carte.x + carte.width && cy >= carte.y && cy <= carte.y + carte.height;
    };
    const termini = Array.from(document.querySelectorAll("[data-renderer='simulated'] [data-kind='terminus']"), rect).filter(dansLaCarte);
    const etiquettes = Array.from(document.querySelectorAll<HTMLElement>("[data-part='etiquette-ville']"))
      .filter((element) => dansLaCarte(rect(element.parentElement!.querySelector("[data-kind='terminus']")!)))
      .map((element) => ({ ...rect(element), texte: element.textContent ?? "", scroll: element.scrollWidth, client: element.clientWidth }));
    const etapes = Array.from(document.querySelectorAll("[data-renderer='simulated'] [data-stop-id]"), rect).filter(dansLaCarte);
    const controles = Array.from(document.querySelectorAll("[data-part='retour'], [data-part='partager']"), rect);
    return { carte, termini, etiquettes, etapes, controles };
  });
}

/**
 * Étiquettes entières dans la carte, hors de « Retour » et « Partager », jamais tronquées, disjointes deux à deux et des
 * terminus (et des marqueurs d'étape si `etapes`).
 */
export async function expectEtiquettesLisibles(page: Page, { etapes = false }: { etapes?: boolean } = {}) {
  const b = await boites(page);
  expect(b.etiquettes.length).toBeGreaterThan(0);
  for (const [index, etiquette] of b.etiquettes.entries()) {
    expect(dedans(etiquette, b.carte), `${etiquette.texte} dans la carte`).toBe(true);
    for (const controle of b.controles) expect(recoupe(etiquette, controle), `${etiquette.texte} hors des contrôles`).toBe(false);
    expect(etiquette.scroll).toBeLessThanOrEqual(etiquette.client);
    for (const autre of b.etiquettes.slice(index + 1)) expect(recoupe(etiquette, autre), `${etiquette.texte} / ${autre.texte}`).toBe(false);
    for (const terminus of b.termini) expect(recoupe(etiquette, terminus), `${etiquette.texte} sur un terminus`).toBe(false);
    if (etapes) for (const etape of b.etapes) expect(recoupe(etiquette, etape), `${etiquette.texte} sur une étape`).toBe(false);
  }
  return b;
}

/** La boîte de `inner` est entièrement dans la fenêtre (390 × 844). */
export async function dansLaFenetre(inner: Locator): Promise<boolean> {
  const box = await inner.boundingBox();
  return box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390.5 && box.y + box.height <= 844.5;
}

/** Positions des étapes positionnées d'une ville (marqueurs de la Journée), dans la carte et au-dessus du panneau. */
export async function zoneVisible(page: Page): Promise<Rect> {
  const carte = (await simulee(page).boundingBox())!;
  const haut = (await panneau(page).boundingBox())!.y;
  return { x: carte.x, y: carte.y, width: carte.width, height: haut - carte.y };
}
