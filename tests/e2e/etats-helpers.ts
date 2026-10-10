import { expect, type Page } from "@playwright/test";

/** Aides des specs de F11c (page introuvable, page d'erreur, catalogue des états), en 390 × 844. */

/** Une adresse qu'aucune route ne reconnaît, puis deux `notFound()` d'écrans (Séjour, présentation). */
export const NOT_FOUND_PATHS = ["/adresse-inexistante", "/voyages/inconnu", "/voyages/inconnu/presentation"] as const;
export const ERROR_PATH = "/dev/etats/erreur";
export const CATALOGUE_PATH = "/dev/etats";
/** Identifiant factice du message de l'erreur volontaire (DEV_ERROR_MESSAGE de src/dev/EtatsShowcase.tsx). */
export const FAKE_ID = "mock_trip_secret_7f3a";

export const NOT_FOUND_TITLE = "Page introuvable";
export const ERROR_TITLE = "Cette page n'a pas pu s'afficher";

const INTERACTIVE = "button, a[href], input, [role='radio'], [tabindex]:not([tabindex='-1'])";

/**
 * Critère C1 : aucune requête vers un autre hôte que l'application. Toute requête externe est interrompue
 * et retenue ; la spec vérifie la liste vide à la fin.
 */
export async function blockExternal(page: Page, baseURL: string): Promise<string[]> {
  const origin = new URL(baseURL).origin;
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).origin === origin || url.startsWith("data:")) {
      return route.continue();
    }
    external.push(url);
    return route.abort();
  });
  return external;
}

/** Ouvre la page d'erreur volontaire et attend le rendu de `error.tsx` (après l'hydratation). */
export async function openErrorPage(page: Page) {
  const response = await page.goto(ERROR_PATH);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ERROR_TITLE);
  return response;
}

/** Chaque élément interactif mesure au moins 44 × 44 px (critère C3). */
export async function expectTouchTargets(page: Page) {
  const elements = page.locator(INTERACTIVE);
  const count = await elements.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await elements.nth(index).boundingBox();
    const description = await elements.nth(index).evaluate((el) => el.outerHTML.slice(0, 120));
    expect(box, description).not.toBeNull();
    expect(box!.width, description).toBeGreaterThanOrEqual(44);
    expect(box!.height, description).toBeGreaterThanOrEqual(44);
  }
}

/** Au clavier, chaque élément interactif a le contour de Ligne : 2 px `line`, décalé de 2 px (critère C3). */
export async function expectFocusOutlines(page: Page) {
  const tabbable = await page.locator(INTERACTIVE).count();
  const line = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim());
  for (let step = 0; step < tabbable; step += 1) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.color = style.outlineColor;
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color.match(/\d+/g)!.slice(0, 3).map(Number);
      probe.remove();
      return {
        html: el.outerHTML.slice(0, 120),
        focusVisible: el.matches(":focus-visible"),
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`,
        hex: `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
      };
    });
    expect(focus, `tabulation ${step + 1}`).not.toBeNull();
    expect(focus!.focusVisible, focus!.html).toBe(true);
    expect(focus!.outline, focus!.html).toBe("solid 2px 2px");
    expect(focus!.hex, focus!.html).toBe(line);
  }
}

/** Un seul titre de niveau 1, `lang="fr"`, aucun défilement horizontal en 390 px (critère C3). */
export async function expectPageBasics(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
