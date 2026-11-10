import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { ADRESSE_REMPLACER } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { R17 } from "./mes-voyages-helpers";
import { applyButton, askProposal, changes, proposalTitle, replaceTitle } from "./revision-helpers";
import { sheet } from "./sejour-helpers";

/**
 * Remplacer une étape (écran 14) sur l'adaptateur `api` (tâche M1g, PR 869). Serveur à connexion réelle et données
 * réelles (`DATA_ADAPTER=api`, double de relectures), sur la base du job `db` ; organisation propre au scénario
 * (`tests/support/bout-en-bout-api.ts`, données écrites par `pnpm test:db`). Le dîner du J1 d'Édimbourg est remplacé
 * par son option déjà vérifiée « [Bistrot de Victoria Street] » (version 2, `TripPatch` en base), puis rétabli par
 * « Annuler » dans le toast (version 3, après un premier essai coupé) ; chaque étape est relue sur le serveur. Les versions et le patch sont vérifiés
 * en base par `tests/db/remplacement.test.ts`. Sur un poste, rejouer demande une base neuve (les versions restent).
 */
const test = base.extend<{ urlMock: string }>({
  urlMock: ["", { option: true }],
  // Adresse IP de confiance unique à chaque essai (limiteur de l'envoi du code).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::7` });
  },
});

// Les trois scénarios écrivent dans la même organisation, dans cet ordre.
test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const UUID = "[0-9a-f-]{36}";
const ANCIEN = "[Bonne table de l'Old Town]";
const NOUVEAU = "[Bistrot de Victoria Street]";
const DEGUSTATION = "[Dégustation dans une épicerie fine de Stockbridge]";

async function identifiantsMailpit(request: APIRequestContext, adresse: string): Promise<string[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return (((await reponse.json()) as { messages?: { ID: string }[] }).messages ?? []).map((m) => m.ID);
}

/** Connexion par le code lu dans Mailpit (B3b-envoi) : seul message reçu après la demande. */
async function connecter(page: Page, request: APIRequestContext, adresse: string) {
  const avant = new Set(await identifiantsMailpit(request, adresse));
  await page.context().clearCookies();
  await page.goto(connexionRoute(R17));
  await emailField(page).fill(adresse);
  await page.getByRole("button", { name: "Recevoir un code", exact: true }).click();
  await expect(firstCell(page)).toBeFocused();
  let nouveau: string | undefined;
  await expect
    .poll(async () => {
      nouveau = (await identifiantsMailpit(request, adresse)).find((id) => !avant.has(id));
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

/**
 * Identifiant du voyage d'Édimbourg non débloqué (seule carte « Édimbourg … Non débloqué » de l'écran 17). Son lien porte
 * `/presentation` tant que le voyage est à venir, et plus une fois passé (dates du jeu simulé) : les deux formes sont admises.
 */
async function edimbourg(page: Page): Promise<string> {
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  const liens = await page
    .getByRole("main")
    .getByRole("link")
    .evaluateAll((e) => e.filter((l) => /Édimbourg/.test(l.textContent ?? "") && /Non débloqué/.test(l.textContent ?? "")).map((l) => l.getAttribute("href") ?? ""));
  const ids = [...new Set(liens.flatMap((href) => new RegExp(`^/voyages/(${UUID})(?:/presentation)?$`).exec(href)?.[1] ?? []))];
  expect(ids, "données de bout en bout absentes : pnpm test:db les écrit sur une base neuve").toHaveLength(1);
  return ids[0] as string;
}

const etape = (page: Page, nom: string) => sheet(page).getByRole("link", { name: nom });
const toast = (page: Page) => page.locator("[data-undo-toast]");

test("PR 869 : remplacer le dîner du J1 sur api, relu sur le serveur, puis annuler dans le toast", async ({ page, request }) => {
  test.setTimeout(180_000);
  await connecter(page, request, ADRESSE_REMPLACER);
  const id = await edimbourg(page);
  const jour1 = `/voyages/${id}/jour/1`;

  await page.goto(jour1);
  await expect(etape(page, ANCIEN)).toBeVisible();
  await expect(etape(page, NOUVEAU)).toHaveCount(0);

  await page.goto(`${jour1}/remplacer/j1-diner`);
  await expect(replaceTitle(page)).toBeFocused();
  await askProposal(page, "Pas mon style");
  await expect(proposalTitle(page)).toHaveText(NOUVEAU);

  await applyButton(page).click();
  await expect(page).toHaveURL((url) => url.pathname === jour1);
  await expect(toast(page)).toContainText("Modifié.");
  await expect(etape(page, NOUVEAU)).toBeVisible();
  await expect(etape(page, ANCIEN)).toHaveCount(0);

  // Échec de l'annulation (requête de l'action serveur coupée une fois) : annoncé, focus sur « Annuler », rien de perdu.
  let coupee = false;
  await page.route("**/*", async (route) => {
    const requete = route.request();
    if (!coupee && requete.method() === "POST" && requete.headers()["next-action"] !== undefined) {
      coupee = true;
      await route.abort();
    } else await route.continue();
  });
  await toast(page).getByRole("button", { name: "Annuler" }).click();
  await expect(toast(page)).toContainText("L'annulation n'a pas abouti. Ta modification est toujours là. Réessaie avec Annuler.");
  await expect(toast(page).getByRole("button", { name: "Annuler" })).toBeFocused();
  await expect(etape(page, NOUVEAU)).toBeVisible();
  await page.unroute("**/*");

  // « Annuler » à nouveau : la version 3 rétablit le dîner, relue sur le serveur.
  await toast(page).getByRole("button", { name: "Annuler" }).click();
  await expect(page.locator("[data-part='annonce-annulation']")).toHaveText("Modification annulée.");
  await expect(etape(page, ANCIEN)).toBeVisible();
  await expect(etape(page, NOUVEAU)).toHaveCount(0);

  // Rechargement complet : le serveur sert la version rétablie.
  await page.reload();
  await expect(etape(page, ANCIEN)).toBeVisible();
  await expect(etape(page, NOUVEAU)).toHaveCount(0);
});

test("PR 869 : remplacement appliqué puis rechargé sans annuler : le serveur sert la nouvelle version", async ({ page, request }) => {
  test.setTimeout(180_000);
  await connecter(page, request, ADRESSE_REMPLACER);
  const id = await edimbourg(page);
  const jour1 = `/voyages/${id}/jour/1`;

  await page.goto(`${jour1}/remplacer/j1-diner`);
  await expect(replaceTitle(page)).toBeFocused();
  await askProposal(page, "Trop loin");
  await expect(proposalTitle(page)).toHaveText(NOUVEAU);
  await applyButton(page).click();
  await expect(page).toHaveURL((url) => url.pathname === jour1);
  await expect(toast(page)).toContainText("Modifié.");

  await page.reload();
  await expect(etape(page, NOUVEAU)).toBeVisible();
  await expect(etape(page, ANCIEN)).toHaveCount(0);
  // L'ancienne étape n'est plus au programme : son écran 14 répond introuvable.
  const reponse = await page.goto(`${jour1}/remplacer/j1-diner`);
  expect(reponse?.status()).toBe(404);
});

test("PR 869 : remplacer Dean Village (J2) : « Ce qui change » montre les trajets et le budget du moteur", async ({ page, request }) => {
  test.setTimeout(180_000);
  await connecter(page, request, ADRESSE_REMPLACER);
  const id = await edimbourg(page);
  const jour2 = `/voyages/${id}/jour/2`;

  await page.goto(`${jour2}/remplacer/j2-dean-village`);
  await expect(replaceTitle(page)).toBeFocused();
  await askProposal(page, "Trop chargé");
  await expect(proposalTitle(page)).toHaveText(DEGUSTATION);
  // Lignes du moteur (durées du double, celles du brouillon simulé) : 20 → 25 min et 15 → 10 min, budget + 15.
  const lignes = changes(page).locator("li");
  await expect(lignes.filter({ hasText: DEGUSTATION }).filter({ hasText: "20 min" })).toContainText("25 min");
  await expect(lignes.filter({ hasText: "[Café de Stockbridge]" }).filter({ hasText: "15 min" })).toContainText("10 min");
  await expect(changes(page).locator("[data-change='budget']")).toContainText("15");

  await applyButton(page).click();
  await expect(page).toHaveURL((url) => url.pathname === jour2);
  await expect(toast(page)).toContainText("Modifié.");
  await page.reload();
  await expect(etape(page, DEGUSTATION)).toBeVisible();
});
