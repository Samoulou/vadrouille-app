import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { expectPath, main, simulate, useScope } from "./debloquer-helpers";
import { APERCU_ESSAI, ESSAI_R11, ESSAI_R6, ESSAI_R9, ESSAI_R9_SIM, ESSAI_URL } from "./essai-helpers";
import { card, cardName, dialog } from "./presentation-helpers";

/**
 * Spécification E2E-essai, lot 1 (ticket 691) : un voyage d'essai déjà écrit (programme sans propositions, forme de
 * `p0Run`) suit le parcours de l'app sur le build de production, en 390 × 844 : premières propositions, « J'aime / Pas
 * pour moi », « Débloquer » avec paiement simulé, puis Séjour et Journées complets. Aucune requête vers Google ni vers un
 * autre hôte. Chaque test a sa portée de simulation (`R-sim`).
 */

test.use({ baseURL: ESSAI_URL });

let googleRequests: string[] = [];
let foreignRequests: string[] = [];

test.beforeEach(async ({ page, context }) => {
  googleRequests = await blockGoogle(page);
  foreignRequests = [];
  const origin = new URL(ESSAI_URL).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) foreignRequests.push(request.url());
  });
  await useScope(context, ESSAI_URL);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
  expect(foreignRequests).toEqual([]);
});

const joursListes = (page: Page) => page.locator("a[data-part='jour']");
const joursADebloquer = (page: Page) => page.locator("[data-part='jour-a-debloquer']");

/** Trie toutes les cartes du paquet, en alternant « J'aime » (ou « Je choisis ») et « Pas pour moi ». */
async function trierTout(page: Page, total: number): Promise<string[]> {
  const vues: string[] = [];
  for (let rang = 0; rang < total; rang += 1) {
    await expect(page.getByText(`${rang + 1} sur ${total}`, { exact: true })).toBeVisible();
    vues.push(await cardName(page));
    const nom = rang % 2 === 0 ? /^(J'aime|Je choisis)$/ : /^Pas pour moi$/;
    await page.getByRole("button", { name: nom }).click();
  }
  return vues;
}

test("essai: premières propositions, tri sans question, puis fin du tri", async ({ page }) => {
  await page.goto("/voyages");
  await page.getByRole("link", { name: /Ville d'essai/ }).first().click();
  await expectPath(page, ESSAI_R6);
  await expect(page.getByRole("heading", { level: 1, name: "Tes premières propositions" })).toBeAttached();
  await expect(card(page)).toBeVisible();

  // Aperçu : les étapes du programme dans son ordre, la première journée puis le début de la deuxième (8 au plus).
  const vues = await trierTout(page, APERCU_ESSAI.length);
  expect(vues).toEqual(APERCU_ESSAI);
  // Trois refus d'activité de même catégorie tirée : aucune question de préférence sur un voyage d'essai.
  await expect(dialog(page)).toHaveCount(0);

  const fin = page.locator("[data-deck-end='apercu']");
  await expect(fin.getByRole("heading", { level: 2, name: "Tu as vu tes premières propositions" })).toBeVisible();
  await expect(fin).toContainText("Voyage d'essai : tes choix ne changent pas encore ton programme.");
  await expect(fin.getByRole("link", { name: "Débloquer" })).toHaveAttribute("href", ESSAI_R9);
});

test("essai: avant le déblocage, seules les journées des premières propositions sont lisibles", async ({ page, request }) => {
  await page.goto(ESSAI_R11);
  await expect(page.getByRole("heading", { level: 1, name: "Ville d'essai" })).toBeVisible();
  await expect(joursListes(page)).toHaveCount(2);
  await expect(joursADebloquer(page)).toHaveCount(1);
  await expect(joursADebloquer(page)).toContainText("Mercredi 12 mai");
  await expect(joursADebloquer(page)).toContainText("À débloquer");
  await expect(page.locator("a[data-part='debloquer']")).toHaveAttribute("href", ESSAI_R9);
  expect((await request.get(`${ESSAI_URL}${ESSAI_R11}/jour/3`)).status()).toBe(404);
  expect((await request.get(`${ESSAI_URL}${ESSAI_R11}/jour/2`)).status()).toBe(200);
});

test("essai: paiement simulé, puis toutes les journées, après un rechargement aussi ; autre portée inchangée", async ({ page, browser }) => {
  await page.goto(ESSAI_R11);
  await page.locator("a[data-part='debloquer']").click();
  await expectPath(page, ESSAI_R9);
  await page.getByRole("button", { name: "Payer avec TWINT", exact: true }).click();
  await expectPath(page, ESSAI_R9_SIM);
  await expect(main(page)).toContainText("Démonstration : aucun paiement n'est effectué et aucune donnée de paiement n'est demandée.");
  await expect(main(page)).toContainText("Voyage : Ville d'essai");
  await simulate(page, "Simuler un paiement réussi");

  await expectPath(page, ESSAI_R11);
  await expect(joursListes(page)).toHaveCount(3);
  await expect(joursADebloquer(page)).toHaveCount(0);
  await expect(page.locator("a[data-part='debloquer']")).toHaveCount(0);

  await page.reload();
  await expect(joursListes(page)).toHaveCount(3);
  await page.goto(`${ESSAI_R11}/jour/3`);
  await expect(page.getByRole("heading", { level: 1, name: "Mercredi 12 mai" })).toBeVisible();
  await expect(page.locator("#liste-etapes")).toContainText("[Lieu d'essai 7]");

  // Suite du tri (6b) : les étapes hors des premières propositions.
  await page.goto(ESSAI_R6);
  await expect(card(page)).toBeVisible();
  expect(await cardName(page)).toBe("[Lieu d'essai 7]");
  await expect(page.getByText("1 sur 4", { exact: true })).toBeVisible();

  // Le droit simulé appartient à la portée : une autre portée voit toujours le voyage non débloqué.
  const autre = await browser.newContext({ baseURL: ESSAI_URL, viewport: { width: 390, height: 844 } });
  await useScope(autre, ESSAI_URL);
  const seconde = await autre.newPage();
  await blockGoogle(seconde);
  await seconde.goto(ESSAI_R11);
  await expect(seconde.getByRole("heading", { level: 1, name: "Ville d'essai" })).toBeVisible();
  await expect(joursListes(seconde)).toHaveCount(2);
  await expect(joursADebloquer(seconde)).toHaveCount(1);
  await autre.close();
});
