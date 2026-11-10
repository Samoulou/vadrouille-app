import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import { ADRESSE_GOUTS } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { R17 } from "./mes-voyages-helpers";

/**
 * Retenir et retirer ses goûts sur `api` (M8c-1, ticket 1121 ; spécification M8 § 6.5, critères 2, 3 et 4). Projet `api` :
 * connexion réelle (code lu dans Mailpit), données réelles sur la base du job `db` (voyage débloqué de `ADRESSE_GOUTS`,
 * terminé depuis 2 jours, deux réponses « éviter » actives, écrits par `tests/db/donnees-bout-en-bout.test.ts`). Parcours :
 * écran 16, choix décochés au départ, « Retenir ces goûts » sans choix (message), un goût retenu, rechargement (« Déjà
 * retenu ») ; « Mes voyages » : la ligne, « Retirer », « Annuler », rechargement, « Retirer tous mes goûts ». Aucun code de
 * goût dans l'adresse ni dans le stockage du navigateur.
 */
const test = base.extend({
  // Adresse IP de confiance unique à chaque essai (limites `gouts` et envoi du code, par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::8c` });
  },
});

test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const RETOUR = /^\/voyages\/([0-9a-f-]{36})\/retour$/;
const MUSEES = "category:museum:less";
const NATURE = "category:nature:less";

type Resume = { ID: string };

async function messages(request: APIRequestContext, adresse: string): Promise<Resume[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return ((await reponse.json()) as { messages?: Resume[] }).messages ?? [];
}

/** Connexion par le code lu dans Mailpit (comme `apres-voyage-api.api.spec.ts`) : seul message reçu après la demande. */
async function connecter(page: Page, request: APIRequestContext, adresse: string) {
  const avant = new Set((await messages(request, adresse)).map((m) => m.ID));
  await page.context().clearCookies();
  await page.goto(connexionRoute(R17));
  await emailField(page).fill(adresse);
  await page.getByRole("button", { name: "Recevoir un code", exact: true }).click();
  await expect(firstCell(page)).toBeFocused();
  let nouveau: string | undefined;
  await expect
    .poll(async () => {
      nouveau = (await messages(request, adresse)).find((m) => !avant.has(m.ID))?.ID;
      return nouveau !== undefined;
    })
    .toBe(true);
  const detail = await request.get(`${API_MAILPIT}/message/${nouveau}`);
  const code = /[0-9]{6}/.exec(((await detail.json()) as { Text?: string }).Text ?? "")?.[0];
  expect(code).toBeDefined();
  await expect(codeCells(page)).toHaveCount(6);
  await pasteCode(page, code ?? "");
  await expect(page).toHaveURL((url) => url.pathname === R17);
}

const sectionRetenir = (page: Page) => page.locator('[data-part="retenir-gouts"]');
const choix = (page: Page, id: string) => sectionRetenir(page).locator(`[data-taste="${id}"]`).getByRole("button");
const sectionGouts = (page: Page) => page.locator('[data-section="gouts"]');
const ligne = (page: Page, id: string): Locator => sectionGouts(page).locator(`[data-taste="${id}"]`);

/** Remise à zéro (base réutilisée sur un poste) : « Retirer tous mes goûts » si la section est là. */
async function toutRetirer(page: Page) {
  await page.goto(R17);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if ((await sectionGouts(page).count()) === 0) return;
  await sectionGouts(page).getByRole("button", { name: "Retirer tous mes goûts", exact: true }).click();
  await sectionGouts(page).getByRole("button", { name: "Tout retirer", exact: true }).click();
  await expect(sectionGouts(page)).toHaveCount(0);
}

test("goûts: api : retenir un goût sur l'écran 16, le retrouver dans Mes voyages, le retirer, annuler, tout retirer", async ({ page, request }) => {
  test.setTimeout(120_000);
  await connecter(page, request, ADRESSE_GOUTS);
  await toutRetirer(page);

  const lien = page.getByRole("link", { name: "Donner ton avis (Édimbourg)", exact: true });
  await expect(lien).toBeVisible();
  const href = (await lien.getAttribute("href")) ?? "";
  expect(href, "données de bout en bout absentes : pnpm test:db les écrit").toMatch(RETOUR);
  await lien.click();
  await expect(page).toHaveURL((url) => url.pathname === href);

  // Critère 2 : deux candidats, décochés au départ ; sans choix, un message et rien de retenu.
  await expect(page.getByRole("heading", { level: 2, name: "Retenir mes goûts", exact: true })).toBeVisible();
  await expect(sectionRetenir(page).locator("[data-taste]")).toHaveCount(2);
  for (const id of [MUSEES, NATURE]) await expect(choix(page, id)).toHaveAttribute("aria-pressed", "false");
  await sectionRetenir(page).getByRole("button", { name: "Retenir ces goûts", exact: true }).click();
  await expect(sectionRetenir(page).getByRole("alert")).toHaveText("Coche au moins un goût à retenir.");
  await page.reload();
  for (const id of [MUSEES, NATURE]) await expect(choix(page, id)).toHaveAttribute("aria-pressed", "false");

  // Un goût coché, retenu.
  await choix(page, MUSEES).click();
  await expect(choix(page, MUSEES)).toHaveAttribute("aria-pressed", "true");
  await sectionRetenir(page).getByRole("button", { name: "Retenir ces goûts", exact: true }).click();
  await expect(sectionRetenir(page).getByText("Goûts retenus :", { exact: true })).toBeVisible();
  await expect(sectionRetenir(page).locator("[data-taste]")).toHaveCount(1);

  // Critère 3 : au rechargement, « Déjà retenu », coché et indisponible ; l'autre candidat reste décoché.
  await page.reload();
  await expect(choix(page, MUSEES)).toHaveAttribute("aria-pressed", "true");
  await expect(choix(page, MUSEES)).toHaveAttribute("aria-disabled", "true");
  await expect(sectionRetenir(page).locator(`[data-taste="${MUSEES}"]`)).toContainText("Déjà retenu");
  await expect(choix(page, NATURE)).toHaveAttribute("aria-pressed", "false");

  // Critère 4 : « Mes voyages » liste le goût avec son voyage d'origine.
  await page.goto(R17);
  await expect(page.getByRole("heading", { level: 2, name: "Tes goûts retenus", exact: true })).toBeVisible();
  await expect(sectionGouts(page).locator("[data-taste]")).toHaveCount(1);
  await expect(ligne(page, MUSEES)).toContainText("Retenu après Édimbourg");

  // « Retirer », puis « Annuler » dans les 5 s : la ligne revient, et elle est encore là au rechargement.
  await ligne(page, MUSEES).getByRole("button").click();
  await expect(ligne(page, MUSEES)).toHaveCount(0);
  await expect(page.getByText("Goût retiré.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(ligne(page, MUSEES)).toHaveCount(1);
  await page.reload();
  await expect(ligne(page, MUSEES)).toContainText("Retenu après Édimbourg");

  // « Retirer tous mes goûts » après confirmation : plus de section, ni au rechargement.
  await sectionGouts(page).getByRole("button", { name: "Retirer tous mes goûts", exact: true }).click();
  await sectionGouts(page).getByRole("button", { name: "Tout retirer", exact: true }).click();
  await expect(sectionGouts(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(sectionGouts(page)).toHaveCount(0);

  // Rien d'un goût dans l'adresse ni dans le stockage du navigateur.
  expect(decodeURIComponent(page.url())).not.toContain("category:");
  const stockage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stockage).not.toContain("category:");
});
