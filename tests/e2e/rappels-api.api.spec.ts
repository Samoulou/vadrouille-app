import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { ADRESSE_RAPPELS } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { R17 } from "./mes-voyages-helpers";

/**
 * Rappels par e-mail sur le **monde local du Workflow SDK** (M6c, ticket 1021 ; décision 0157 § 1.7 point 11 ; revue de la
 * PR 1024, bloquant 2 du Tech Lead). Projet `api` : connexion réelle, données réelles sur la base du job `db` (voyage
 * débloqué de `ADRESSE_RAPPELS`, écrit par `tests/db/donnees-bout-en-bout.test.ts`), transport SMTP vers Mailpit, et durées
 * accélérées par `RAPPELS_ACCELERATION=1800` (serveur `api` de `playwright.config.ts`, refusée hors de `local` et `ci`) :
 * l'instant de l'accord vaut la veille du premier jour à 18:00, une seconde réelle vaut une demi-heure, une journée
 * 48 secondes.
 *
 * Parcours : **démarrage** (l'interrupteur du Séjour donne l'accord et démarre `rappelsVeille` dans le serveur), premier
 * **réveil** et **envoi** du rappel de J1 vers Mailpit, **sommeil** puis réveil et rappel de J2, **retrait** par
 * l'interrupteur, puis **fin** de l'exécution à son réveil suivant : aucun rappel de J3. Les messages ne portent que les
 * liens de la journée et du Séjour. Aucun envoi réel (Mailpit sur la boucle locale), aucune trace (cookies).
 */
const test = base.extend({
  // Adresse IP de confiance unique à chaque essai (limites `rappels-accord` et envoi du code, par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::6c` });
  },
});

test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const UUID = /^\/voyages\/([0-9a-f-]{36})$/;
const OBJET = "Ta journée de demain";
const NOM = "Rappel par e-mail la veille";
/** Une journée accélérée : 86 400 / 1 800 = 48 secondes réelles. */
const JOURNEE_MS = 48_000;

type Resume = { ID: string; Subject?: string };

async function messages(request: APIRequestContext, adresse: string): Promise<Resume[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return ((await reponse.json()) as { messages?: Resume[] }).messages ?? [];
}

/** Rappels reçus (objet du § 7), du plus ancien au plus récent : identifiant et texte. */
async function rappels(request: APIRequestContext): Promise<{ id: string; texte: string }[]> {
  const liste = (await messages(request, ADRESSE_RAPPELS)).filter((m) => m.Subject === OBJET).reverse();
  const resultat: { id: string; texte: string }[] = [];
  for (const m of liste) {
    const detail = await request.get(`${API_MAILPIT}/message/${m.ID}`);
    resultat.push({ id: m.ID, texte: ((await detail.json()) as { Text?: string }).Text ?? "" });
  }
  return resultat;
}

/** Connexion par le code lu dans Mailpit (comme `partage-api.api.spec.ts`) : seul message reçu après la demande. */
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

test("rappels: api, monde local du Workflow SDK : accord, rappels de J1 puis J2 dans Mailpit, retrait, fin sans rappel de J3", async ({ page, request, baseURL }) => {
  test.setTimeout(300_000);
  await connecter(page, request, ADRESSE_RAPPELS);
  const hrefs = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  const ids = [...new Set(hrefs.flatMap((href) => UUID.exec(href)?.[1] ?? []))];
  expect(ids, "données de bout en bout absentes : pnpm test:db les écrit").toHaveLength(1);
  const tripId = ids[0] ?? "";
  const deja = (await rappels(request)).length;

  // Démarrage : l'interrupteur du Séjour donne l'accord (action serveur), l'exécution démarre dans le serveur.
  await page.goto(`/voyages/${tripId}`);
  const interrupteur = page.getByRole("switch", { name: NOM });
  await expect(interrupteur).toHaveAttribute("aria-checked", "false");
  await interrupteur.click();
  await expect(interrupteur).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("status").filter({ hasText: "Rappels activés." })).toHaveCount(1);

  // Premier réveil : rappel de J1, liens seuls (Journée 1 et Séjour), aucune donnée du voyage.
  await expect.poll(async () => (await rappels(request)).length - deja, { timeout: 30_000, intervals: [500] }).toBe(1);
  const [premier] = (await rappels(request)).slice(deja);
  expect(premier?.texte).toContain(`${baseURL}/voyages/${tripId}/jour/1`);
  expect(premier?.texte).toContain(`${baseURL}/voyages/${tripId}`);
  expect(premier?.texte).not.toMatch(/Édimbourg|Edinburgh|ChIJ/);

  // Sommeil, puis réveil suivant : rappel de J2 (une journée accélérée plus tard).
  await expect.poll(async () => (await rappels(request)).length - deja, { timeout: JOURNEE_MS + 30_000, intervals: [1_000] }).toBe(2);
  const second = (await rappels(request)).slice(deja)[1];
  expect(second?.texte).toContain(`${baseURL}/voyages/${tripId}/jour/2`);

  // Retrait : jamais refusé ; l'exécution le lit à son réveil suivant et se termine, sans rappel de J3.
  await interrupteur.click();
  await expect(interrupteur).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("status").filter({ hasText: "Rappels arrêtés." })).toHaveCount(1);
  await page.waitForTimeout(JOURNEE_MS + 10_000);
  expect((await rappels(request)).length - deja).toBe(2);
  expect(await page.context().cookies()).not.toEqual([]);
});
