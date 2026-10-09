import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { SUITE, card, dialog, openDeck, press } from "./presentation-helpers";

/** Axe (WCAG 2.2 AA) sur la présentation : carte activité, carte repas, feuille de question, détail, fin, écran 6b. */

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

test("presentation: aucune violation axe, carte d'activité", async ({ page }) => {
  await openDeck(page);
  await expectNoViolations(page);
});

test("presentation: aucune violation axe, carte repas et toast", async ({ page }) => {
  await openDeck(page);
  await press(page, "J'aime");
  await expect(card(page)).toContainText("option 1 sur 2");
  await expectNoViolations(page);
});

test("presentation: aucune violation axe, carte à plus de 20 min", async ({ page }) => {
  await openDeck(page);
  for (const day of [1, 2, 4]) await press(page, `Tout garder pour le jour ${day}`);
  await press(page, "J'aime");
  await expect(card(page).locator("[data-part='trajet']")).toBeVisible();
  await expectNoViolations(page);
});

test("presentation: aucune violation axe, feuille de question", async ({ page }) => {
  await openDeck(page);
  await press(page, "Pas pour moi");
  await press(page, "Je choisis");
  await press(page, "J'aime");
  await press(page, "J'aime");
  await press(page, "J'aime");
  await press(page, "Pas pour moi");
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Trop cher" }).click();
  await expectNoViolations(page);
});

test("presentation: aucune violation axe, détail", async ({ page }) => {
  await openDeck(page);
  for (const day of [1, 2, 4]) await press(page, `Tout garder pour le jour ${day}`);
  await press(page, "J'aime");
  await card(page).click();
  await expect(dialog(page)).toBeVisible();
  await expectNoViolations(page);
});

test("presentation: aucune violation axe, fin de l'aperçu", async ({ page }) => {
  await openDeck(page);
  for (const day of [1, 2, 4, 5]) await press(page, `Tout garder pour le jour ${day}`);
  await expect(page.getByRole("heading", { name: "Tu as vu tes premières propositions" })).toBeVisible();
  await expectNoViolations(page);
});

test("presentation: aucune violation axe, écran 6b", async ({ page }) => {
  await openDeck(page, SUITE);
  await expectNoViolations(page);
  for (const day of [3, 4]) await press(page, `Tout garder pour le jour ${day}`);
  await expect(page.getByRole("heading", { name: "Tu as tout trié" })).toBeVisible();
  await expectNoViolations(page);
});

test("presentation: contour de focus 2 px line décalé de 2 px", async ({ page }) => {
  await openDeck(page);
  await card(page).focus();
  const line = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim());
  const style = await card(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset, color: s.outlineColor };
  });
  expect(style.width).toBe("2px");
  expect(style.style).toBe("solid");
  expect(style.offset).toBe("2px");
  const hex = await page.evaluate((color) => {
    const rgb = color.match(/\d+/g)!.slice(0, 3).map(Number);
    return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }, style.color);
  expect(hex).toBe(line);
});

test("presentation: « Annuler » en aplat page et texte ink au focus clavier (décision 0014, § 1.2)", async ({ page }) => {
  await openDeck(page);
  await press(page, "J'aime");
  const annuler = page.locator("[data-undo-toast]").getByRole("button", { name: "Annuler" });
  await expect(annuler).toBeVisible();
  await page.locator("[data-action='keep-day']").focus();
  await page.keyboard.press("Tab");
  await expect(annuler).toBeFocused();
  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      page: root.getPropertyValue("--color-page").trim(),
      ink: root.getPropertyValue("--color-ink").trim(),
      line: root.getPropertyValue("--color-line").trim(),
    };
  });
  const style = await annuler.evaluate((el) => {
    const s = getComputedStyle(el);
    const hex = (color: string) =>
      `#${color
        .match(/\d+/g)!
        .slice(0, 3)
        .map((c) => Number(c).toString(16).padStart(2, "0"))
        .join("")}`;
    return { bg: hex(s.backgroundColor), color: hex(s.color), outline: hex(s.outlineColor), width: s.outlineWidth, offset: s.outlineOffset };
  });
  expect(style.bg).toBe(tokens.page);
  expect(style.color).toBe(tokens.ink);
  // Le contour standard est conservé autour du bouton.
  expect(style.outline).toBe(tokens.line);
  expect(style.width).toBe("2px");
  expect(style.offset).toBe("2px");
});
