import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { AccountExportSchema } from "../../src/contracts/account-export";

import { bouton, deconnecter, exporter, NOM_EXPORT, R_COMPTE, supprimer, titre } from "./compte-helpers";
import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { R17 } from "./mes-voyages-helpers";

/**
 * « Ton compte » sur `api` (M9c, ticket 1122 ; spécification M9 § 6.4, critères 1 à 4). Projet `api` : connexion réelle
 * (code lu dans Mailpit), base du job `db`. Chaque test crée son compte (adresse tirée au hasard) : aucune donnée de
 * bout en bout n'est requise, et la suppression ne touche aucun autre test. La connexion vient d'avoir lieu : l'export et
 * la suppression passent sans code de plus (§ 1.3 point 4).
 *
 * Non couverts ici, faute d'horloge ou de paiement pilotables depuis le navigateur (couverts par les tests unitaires de
 * `AccountScreen` et par `tests/db/`) : la connexion de plus de 10 minutes (critères 3 et 5), le paiement en attente
 * (critère 6), la limite atteinte.
 */
const test = base.extend({
  // Adresse IP de confiance unique à chaque essai (limites de l'envoi du code, de l'export et de la suppression).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::9c` });
  },
});

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";

type Resume = { ID: string };

const adresseNeuve = () => `m9c-${randomBytes(6).toString("hex")}@exemple.test`;
const versConnexion = (page: Page) => expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === connexionRoute(R_COMPTE));

async function messages(request: APIRequestContext, adresse: string): Promise<Resume[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return ((await reponse.json()) as { messages?: Resume[] }).messages ?? [];
}

/** Depuis la page de connexion affichée : adresse, code lu dans Mailpit (seul message reçu après la demande), saisie. */
async function saisirLeCode(page: Page, request: APIRequestContext, adresse: string) {
  const avant = new Set((await messages(request, adresse)).map((m) => m.ID));
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
}

/** Sans session, « Ton compte » mène à la connexion, puis y revient (critère 1). */
async function ouvrirCompte(page: Page, request: APIRequestContext, adresse: string) {
  await page.context().clearCookies();
  await page.goto(R_COMPTE);
  await versConnexion(page);
  await saisirLeCode(page, request, adresse);
  await expect(page).toHaveURL((url) => url.pathname === R_COMPTE && url.search === "");
  await expect(titre(page)).toBeVisible();
}

test("compte: api : connexion puis retour à « Ton compte » ; adresse ; export ; lien de Mes voyages ; déconnexion", async ({ page, request }) => {
  test.setTimeout(120_000);
  const adresse = adresseNeuve();
  await ouvrirCompte(page, request, adresse);
  await expect(page.getByText(`Connecté avec ${adresse}`, { exact: true })).toBeVisible();
  await expect(supprimer(page)).toBeVisible();
  await expect(deconnecter(page)).toBeVisible();
  await expect(page.getByText("Disponible avec un vrai compte.")).toHaveCount(0);

  // Critère 3 : connexion récente, le téléchargement démarre sans écran de plus.
  const attente = page.waitForEvent("download");
  await exporter(page).click();
  const telechargement = await attente;
  expect(telechargement.suggestedFilename()).toMatch(NOM_EXPORT);
  const fichier = AccountExportSchema.parse(JSON.parse(await readFile(await telechargement.path(), "utf8")));
  expect(fichier.account.email).toBe(adresse);
  expect(fichier.trips).toEqual([]);
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Ton fichier est prêt.");
  await expect(titre(page)).toBeVisible();

  // Critère 1 : « Mes voyages » a un lien « Ton compte ».
  await page.goto(R17);
  await page.getByRole("main").getByRole("link", { name: "Ton compte", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === R_COMPTE);
  await expect(titre(page)).toBeVisible();

  // Critère 2 : « Se déconnecter » mène à l'accueil ; recharger « Ton compte » mène à la connexion.
  await deconnecter(page).click();
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "");
  await expect(page.getByText("Ton compte est supprimé.")).toHaveCount(0);
  await page.goto(R_COMPTE);
  await versConnexion(page);
});

test("compte: api : supprimer son compte, de l'explication à l'accueil ; la session n'existe plus", async ({ page, request }) => {
  test.setTimeout(120_000);
  const adresse = adresseNeuve();
  await ouvrirCompte(page, request, adresse);

  // Critère 4 : écran d'explication, « Continuer » et « Garder mon compte ».
  await supprimer(page).click();
  await expect(titre(page, "Supprimer ton compte")).toBeFocused();
  await expect(page.getByText(/^Seront supprimés : ton adresse e-mail/)).toBeVisible();
  await expect(page.getByText(/^Nous gardons la trace de tes paiements/)).toBeVisible();
  await expect(page.getByText("Rien ne pourra être rétabli. Pense à exporter tes données avant.", { exact: true })).toBeVisible();
  await bouton(page, "Garder mon compte").click();
  await expect(titre(page)).toBeFocused();
  await expect(page.getByText(`Connecté avec ${adresse}`, { exact: true })).toBeVisible();

  // Connexion récente : pas de code de plus ; « Supprimer définitivement », nom accessible sans ambiguïté (critère 8).
  await supprimer(page).click();
  await bouton(page, "Continuer").click();
  const definitif = bouton(page, "Supprimer définitivement mon compte");
  await expect(definitif).toBeVisible();
  await expect(definitif).toHaveText("Supprimer définitivement");
  await definitif.click();

  // Accueil, déconnecté, avec l'annonce (M9-PO-7).
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "?compte=supprime");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Ton compte est supprimé.");
  await page.goto(R_COMPTE);
  await versConnexion(page);
});
