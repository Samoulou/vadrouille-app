import { randomBytes, randomUUID } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { ADRESSE_AVIS } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { R17 } from "./mes-voyages-helpers";

/**
 * Écran 16 « Après le voyage » sur `api` (M8a, ticket 1062 ; spécification M8 § 6.3, critères 3, 5, 9 et 11). Projet
 * `api` : connexion réelle (code lu dans Mailpit), données réelles sur la base du job `db` (voyage débloqué de
 * `ADRESSE_AVIS`, terminé depuis 2 jours, écrit par `tests/db/donnees-bout-en-bout.test.ts`). Parcours : lien « Donner
 * ton avis » de « Mes voyages », choix, rechargement (le choix est là), changement, effacement ; sans session, la page de
 * connexion ; voyage inconnu, 404. Aucune valeur de nom d'étape dans l'adresse ni dans le stockage du navigateur.
 */
const test = base.extend({
  // Adresse IP de confiance unique à chaque essai (limites `avis` et envoi du code, par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::8a` });
  },
});

test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const RETOUR = /^\/voyages\/([0-9a-f-]{36})\/retour$/;
const CHATEAU = "[Château d'Édimbourg]";

type Resume = { ID: string };

async function messages(request: APIRequestContext, adresse: string): Promise<Resume[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return ((await reponse.json()) as { messages?: Resume[] }).messages ?? [];
}

/** Connexion par le code lu dans Mailpit (comme `rappels-api.api.spec.ts`) : seul message reçu après la demande. */
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

const groupe = (page: Page, nom: string) => page.getByRole("group", { name: `Ton avis sur ${nom}`, exact: true });
const choix = (page: Page, nom: string, libelle: string) => groupe(page, nom).getByRole("button", { name: libelle, exact: true });

test("avis: api : « Donner ton avis » dans Mes voyages ; choisir, recharger, changer, effacer ; rien dans l'adresse ni le stockage", async ({ page, request }) => {
  test.setTimeout(120_000);
  await connecter(page, request, ADRESSE_AVIS);
  const lien = page.getByRole("link", { name: "Donner ton avis (Édimbourg)", exact: true });
  await expect(lien).toBeVisible();
  const href = (await lien.getAttribute("href")) ?? "";
  expect(href, "données de bout en bout absentes : pnpm test:db les écrit").toMatch(RETOUR);
  await lien.click();
  await expect(page).toHaveURL((url) => url.pathname === href);
  await expect(page.getByRole("heading", { level: 1, name: "Ton avis sur Édimbourg" })).toBeVisible();
  // Aucune mention de démonstration sur `api`.
  await expect(page.getByText(/Démonstration/)).toHaveCount(0);

  // Remise à zéro si un essai précédent a laissé un avis (base réutilisée sur un poste).
  for (const libelle of ["J'ai aimé", "Pas pour moi", "Pas fait"]) {
    if ((await choix(page, CHATEAU, libelle).getAttribute("aria-pressed")) === "true") {
      await choix(page, CHATEAU, libelle).click();
      await expect(choix(page, CHATEAU, libelle)).toHaveAttribute("aria-pressed", "false");
    }
  }

  await choix(page, CHATEAU, "J'ai aimé").click();
  await expect(choix(page, CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(choix(page, CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "true");

  await choix(page, CHATEAU, "Pas fait").click();
  await expect(choix(page, CHATEAU, "Pas fait")).toHaveAttribute("aria-pressed", "true");
  await expect(choix(page, CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(choix(page, CHATEAU, "Pas fait")).toHaveAttribute("aria-pressed", "true");

  await choix(page, CHATEAU, "Pas fait").click();
  await expect(choix(page, CHATEAU, "Pas fait")).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  for (const bouton of await groupe(page, CHATEAU).getByRole("button").all()) await expect(bouton).toHaveAttribute("aria-pressed", "false");

  // Critère 9 : aucune valeur de nom d'étape dans l'adresse ni dans le stockage du navigateur.
  expect(decodeURIComponent(page.url())).not.toContain(CHATEAU);
  const stockage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stockage).not.toContain("Château");
});

test("avis: api : voyage inconnu, 404 ; sans session, la page de connexion", async ({ page, request }) => {
  await connecter(page, request, ADRESSE_AVIS);
  const inconnu = await page.goto(`/voyages/${randomUUID()}/retour`);
  expect(inconnu?.status()).toBe(404);
  await page.context().clearCookies();
  const lien = `/voyages/${randomUUID()}/retour`;
  await page.goto(lien);
  await expect(page).toHaveURL((url) => url.pathname !== lien && url.pathname.startsWith("/connexion"));
});
