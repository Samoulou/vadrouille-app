import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { CHATEAU, INSTANTS, choice, openReview, scopeAt } from "./apres-voyage-helpers";

/**
 * Accessibilité de l'écran 16 « Après le voyage » (M8a, ticket 1062 ; spécification M8 § 6.3, critère 12) : axe sans
 * violation avant la fin, ouvert, en lecture seule et hors ligne ; choix `aria-disabled` hors ligne ; cibles ≥ 44 px.
 */

test.use({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/London" });

async function axe(page: Page) {
  const resultats = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(resultats.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const [nom, instant] of [
  ["avant le dernier jour", INSTANTS.veilleDernierJour],
  ["ouvert", INSTANTS.dernierJour],
  ["lecture seule", INSTANTS.lectureSeule],
] as const) {
  test(`apres-voyage a11y: ${nom}`, async ({ page, baseURL }) => {
    await scopeAt(page, baseURL ?? "", instant);
    await openReview(page);
    await axe(page);
  });
}

test("apres-voyage a11y: ouvert, choix de 44 px au moins ; hors ligne : bandeau, aria-disabled, axe", async ({ page, context, baseURL }) => {
  await scopeAt(page, baseURL ?? "", INSTANTS.dernierJour);
  await openReview(page);
  for (const bouton of await page.getByRole("group", { name: `Ton avis sur ${CHATEAU}`, exact: true }).getByRole("button").all()) {
    const boite = await bouton.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(boite?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
  await context.setOffline(true);
  await expect(page.getByText("Tu es hors ligne. Tu pourras donner ton avis dès que le réseau revient.")).toBeVisible();
  await expect(choice(page, CHATEAU, "J'ai aimé")).toHaveAttribute("aria-disabled", "true");
  await axe(page);
  await context.setOffline(false);
});
