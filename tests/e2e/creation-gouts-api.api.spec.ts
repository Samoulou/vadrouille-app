import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { ADRESSE_GOUTS_CREATION } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { reachBrief, upcomingTrip } from "./creation-helpers";
import { R17 } from "./mes-voyages-helpers";

/**
 * Goûts proposés au voyage suivant sur `api` (M8c-2, ticket 1131 ; spécification M8 § 6.6, critères 1 à 4 ; décision 0160
 * § 1.6). Projet `api` : connexion réelle (code lu dans Mailpit), données réelles sur la base du job `db` (voyage débloqué
 * de `ADRESSE_GOUTS_CREATION`, terminé depuis 2 jours, deux réponses « éviter » actives, écrits par
 * `tests/db/donnees-bout-en-bout.test.ts`). Parcours : sans session, l'écran 2 n'a pas de bloc ; connectée, la personne
 * retient un goût sur l'écran 16, crée un voyage : à l'écran 2, « Tes goûts retenus » le propose, décoché ; cocher,
 * décocher, « Contraire à ce voyage », « Déjà dans ce voyage » ; le goût retiré dans un autre onglet n'est plus proposé à
 * l'affichage suivant de l'écran 2. Aucun appel de modèle : le brief est rempli par « Remplir moi-même » et le voyage n'est
 * pas lancé.
 */
const test = base.extend({
  // Adresse IP de confiance unique à chaque essai (limites `gouts` et envoi du code, par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::8d` });
  },
});

test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const RETOUR = /^\/voyages\/([0-9a-f-]{36})\/retour$/;
const MUSEES = "category:museum:less";
const LIBELLE_MUSEES = "Tu préfères éviter les musées et monuments";

type Resume = { ID: string };

async function messages(request: APIRequestContext, adresse: string): Promise<Resume[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return ((await reponse.json()) as { messages?: Resume[] }).messages ?? [];
}

/** Connexion par le code lu dans Mailpit (comme `gouts-api.api.spec.ts`) : seul message reçu après la demande. */
async function connecter(page: Page, request: APIRequestContext, adresse: string) {
  const avant = new Set((await messages(request, adresse)).map((m) => m.ID));
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
const sectionGouts = (page: Page) => page.locator('[data-section="gouts"]');
const bloc = (page: Page) => page.locator('[data-part="gouts-retenus"]');
const choix = (page: Page) => bloc(page).locator(`[data-taste="${MUSEES}"]`).getByRole("button");
const envies = (page: Page) => page.getByRole("group", { name: "Envies", exact: true });
const enTeteLimiter = (page: Page) => page.getByRole("button", { name: /^À limiter/ });

/** Remise à zéro (base réutilisée sur un poste, et fin du scénario) : « Retirer tous mes goûts » si la section est là. */
async function toutRetirer(page: Page) {
  await page.goto(R17);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if ((await sectionGouts(page).count()) === 0) return;
  await sectionGouts(page).getByRole("button", { name: "Retirer tous mes goûts", exact: true }).click();
  await sectionGouts(page).getByRole("button", { name: "Tout retirer", exact: true }).click();
  await expect(sectionGouts(page)).toHaveCount(0);
}

/** Écran 1 rempli, puis l'écran 2 à l'état « Vérification » par « Remplir moi-même » (aucun récit, aucun modèle). */
async function atteindreVerification(page: Page) {
  await reachBrief(page, upcomingTrip());
  await page.getByRole("button", { name: "Remplir moi-même", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vérifie tes envies", exact: true })).toBeVisible();
  await expect(envies(page)).toBeVisible();
}

test("création: api : sans session, l'écran 2 n'a pas de bloc « Tes goûts retenus »", async ({ page }) => {
  await atteindreVerification(page);
  await expect(bloc(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tes goûts retenus", exact: true })).toHaveCount(0);
});

test("création: api : un goût retenu est proposé à l'écran 2, décoché ; coché, il entre dans « À limiter » ; retiré ailleurs, il n'est plus proposé", async ({ page, request }) => {
  test.setTimeout(120_000);
  await connecter(page, request, ADRESSE_GOUTS_CREATION);
  await toutRetirer(page);

  // Critère 1 : connectée mais sans goût retenu, aucun bloc.
  await atteindreVerification(page);
  await expect(bloc(page)).toHaveCount(0);

  // Un goût retenu sur l'écran 16 du voyage terminé (« éviter les musées », confirmé).
  await page.goto(R17);
  const lien = page.getByRole("link", { name: "Donner ton avis (Édimbourg)", exact: true });
  await expect(lien).toBeVisible();
  const href = (await lien.getAttribute("href")) ?? "";
  expect(href, "données de bout en bout absentes : pnpm test:db les écrit").toMatch(RETOUR);
  await lien.click();
  await expect(page).toHaveURL((url) => url.pathname === href);
  await sectionRetenir(page).locator(`[data-taste="${MUSEES}"]`).getByRole("button").click();
  await sectionRetenir(page).getByRole("button", { name: "Retenir ces goûts", exact: true }).click();
  await expect(sectionRetenir(page).getByText("Goûts retenus :", { exact: true })).toBeVisible();

  // Critère 2 : à l'écran 2 du voyage suivant, le goût est proposé, décoché ; rien dans « À limiter ».
  await atteindreVerification(page);
  await expect(bloc(page).getByRole("heading", { level: 2, name: "Tes goûts retenus", exact: true })).toBeVisible();
  await expect(bloc(page).getByText("Retenus après tes voyages précédents. Coche ceux qui valent pour ce voyage.", { exact: true })).toBeVisible();
  await expect(bloc(page).locator("[data-taste]")).toHaveCount(1);
  await expect(choix(page)).toHaveText(LIBELLE_MUSEES);
  await expect(choix(page)).toHaveAttribute("aria-pressed", "false");
  await expect(enTeteLimiter(page)).toContainText("Facultatif");

  // Cocher : « Musées » entre dans « À limiter » ; décocher le retire.
  await choix(page).click();
  await expect(choix(page)).toHaveAttribute("aria-pressed", "true");
  await expect(enTeteLimiter(page)).toContainText("Musées");
  await choix(page).click();
  await expect(choix(page)).toHaveAttribute("aria-pressed", "false");
  await expect(enTeteLimiter(page)).toContainText("Facultatif");

  // Critère 3 : « Musées » dans les envies de ce voyage : le goût est contraire, décoché et indisponible.
  const envieMusees = envies(page).getByRole("button", { name: "Musées", exact: true });
  await envieMusees.click();
  await expect(choix(page)).toHaveAttribute("aria-pressed", "false");
  await expect(choix(page)).toHaveAttribute("aria-disabled", "true");
  await expect(bloc(page).locator(`[data-taste="${MUSEES}"]`)).toContainText("Contraire à ce voyage");
  await envieMusees.click();
  await expect(choix(page)).not.toHaveAttribute("aria-disabled", "true");

  // « Musées » déjà « à limiter » par la `Chip` du champ : le goût est coché et indisponible.
  await enTeteLimiter(page).click();
  await page.getByRole("group", { name: "À limiter", exact: true }).getByRole("button", { name: "Musées", exact: true }).click();
  await expect(choix(page)).toHaveAttribute("aria-pressed", "true");
  await expect(choix(page)).toHaveAttribute("aria-disabled", "true");
  await expect(bloc(page).locator(`[data-taste="${MUSEES}"]`)).toContainText("Déjà dans ce voyage");

  // Rien d'un goût dans l'adresse ni dans le stockage du navigateur.
  expect(decodeURIComponent(page.url())).not.toContain("category:");
  const stockage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stockage).not.toContain("category:");

  // Critère 4 : le goût retiré dans un autre onglet n'est plus proposé à l'affichage suivant de l'écran 2 (le brouillon
  // vit dans la mémoire de l'onglet : un rechargement de l'écran 2 ramène à l'écran 1, d'où le parcours repris).
  const autre = await page.context().newPage();
  await toutRetirer(autre);
  await autre.close();
  await atteindreVerification(page);
  await expect(bloc(page)).toHaveCount(0);
});
