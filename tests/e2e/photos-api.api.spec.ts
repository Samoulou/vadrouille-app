import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { ADRESSE_PHOTOS } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { DATES, R17, setClock } from "./mes-voyages-helpers";
import { card } from "./presentation-helpers";

/**
 * Photos du tri sur `api` (PR 879, M1e ; décision 0128 généralisée). Projet `api` : connexion réelle
 * (`AUTH_ADAPTER=better-auth`) et données réelles (`DATA_ADAPTER=api`) sur la base du job `db`. La barrière des appels
 * réels (B9-TL-8) est fermée hors d'une préversion autorisée : la carte du tri garde son emplacement « Photo du lieu »,
 * sans image, et le navigateur n'appelle aucune action serveur (ni photo, ni Google). Organisation propre au scénario
 * (`tests/support/bout-en-bout-api.ts`), lue sans rien décider. Aucune trace (cookies).
 */
const test = base.extend<{ urlMock: string }>({
  urlMock: ["", { option: true }],
  // Adresse IP de confiance unique à chaque essai (limiteur de l'envoi du code : 3 par 10 minutes et par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::e` });
  },
});

test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const UUID = "[0-9a-f-]{36}";

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

test("photos api: barrière fermée, emplacement « Photo du lieu » sans image ni appel d'action (PR 879)", async ({ page, request }) => {
  test.setTimeout(120_000);
  await connecter(page, request, ADRESSE_PHOTOS);
  await setClock(page, DATES.avant);
  await page.goto(R17);
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  const liens = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  const ids = [...new Set(liens.flatMap((href) => new RegExp(`^/voyages/(${UUID})/presentation$`).exec(href)?.[1] ?? []))];
  expect(ids, "données de bout en bout absentes : pnpm test:db les écrit").toHaveLength(1);

  // Toute action serveur appelée par le navigateur (en-tête `next-action`) et toute requête hors du serveur de test (image
  // Google comprise) sont relevées.
  const actions: string[] = [];
  const externes: string[] = [];
  page.on("request", (requete) => {
    if (requete.headers()["next-action"] !== undefined) actions.push(requete.url());
    const hote = new URL(requete.url()).hostname;
    if (requete.url().startsWith("http") && hote !== "127.0.0.1" && hote !== "localhost") externes.push(hote);
  });

  await page.goto(`/voyages/${ids[0]}/presentation`);
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator("[data-part='emplacement-photo']")).toHaveText("Photo du lieu");
  await expect(card(page).locator("[data-part='photo']")).toHaveCount(0);
  await expect(card(page).locator("img")).toHaveCount(0);
  // Le détail de la carte (feuille) ne demande rien non plus.
  await card(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card(page).locator("[data-part='emplacement-photo']")).toHaveText("Photo du lieu");
  expect(actions).toEqual([]);
  expect(externes).toEqual([]);
});
