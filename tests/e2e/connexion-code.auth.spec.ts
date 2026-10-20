import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test as base, type APIRequestContext } from "@playwright/test";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";

/**
 * Projet `auth`, scénario `connexion: code lu dans Mailpit` (spécification B3b-envoi, critère E7 ; B3b-envoi-PO-3, reprise
 * de B3-PO-12). Serveur à connexion réelle avec `EMAIL_TRANSPORT=smtp` vers le Mailpit du job `db` (SMTP et API sur
 * `127.0.0.1`, boucle locale seulement ; décision 0098 § 5). L'adresse `b3-<aléa>@exemple.test` et l'adresse IP de
 * confiance sont uniques à chaque essai (nouvelles tentatives comprises) : le scénario se rejoue sur la même base sans
 * remise à zéro des compteurs du limiteur. Aucune trace (cookies de session, code) : `trace: "off"` du projet.
 */
const test = base.extend({
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::1` });
  },
});

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const SUITE = "/voyages";

/** Identifiant de l'action `signOut` dans le build servi (manifeste des références serveur de Next). */
function identifiantAction(nom: string): string {
  const manifeste = JSON.parse(readFileSync(path.join(process.cwd(), ".next/server/server-reference-manifest.json"), "utf8")) as {
    node: Record<string, { exportedName?: string; filename?: string }>;
  };
  const trouves = Object.entries(manifeste.node).filter(([, v]) => v.exportedName === nom && v.filename === "src/server/actions/compte.ts");
  expect(trouves).toHaveLength(1);
  return trouves[0]![0];
}

type Resume = { ID: string };
type Message = { Text?: string; HTML?: string; To?: { Address: string }[]; Subject?: string };

/** Dernier message reçu par `adresse` d'après l'API de Mailpit, ou `undefined`. */
async function dernierMessage(request: APIRequestContext, adresse: string): Promise<Message | undefined> {
  const recherche = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "5" } });
  expect(recherche.ok()).toBe(true);
  const [premier] = ((await recherche.json()) as { messages?: Resume[] }).messages ?? [];
  if (premier === undefined) return undefined;
  const detail = await request.get(`${API_MAILPIT}/message/${premier.ID}`);
  expect(detail.ok()).toBe(true);
  return (await detail.json()) as Message;
}

test("connexion: code lu dans Mailpit", async ({ page, context, request }) => {
  const email = `b3-${randomBytes(6).toString("hex")}@exemple.test`;

  await page.goto(connexionRoute(SUITE));
  await emailField(page).fill(email);
  await page.getByRole("button", { name: "Recevoir un code", exact: true }).click();
  await expect(page.getByText(`Code envoyé à ${email}`)).toBeVisible();
  await expect(firstCell(page)).toBeFocused();

  // Le message de Mailpit contient le code et aucun lien de connexion (cadrage D8).
  await expect.poll(async () => (await dernierMessage(request, email)) !== undefined).toBe(true);
  const message = await dernierMessage(request, email);
  expect(message?.To?.map((a) => a.Address)).toEqual([email]);
  const code = /[0-9]{6}/.exec(message?.Text ?? "")?.[0];
  expect(code).toBeDefined();
  expect(`${message?.Text ?? ""}\n${message?.HTML ?? ""}`).not.toMatch(/https?:|www\.|<a |<img/i);

  // Code saisi : l'adresse devient /voyages, état vide (B3-PO-10).
  await expect(codeCells(page)).toHaveCount(6);
  await pasteCode(page, code ?? "");
  await expect(page).toHaveURL((url) => url.pathname === SUITE);
  await expect(page.getByText("Tu n'as pas encore de voyage.")).toBeVisible();

  // Un cookie de session `httpOnly` existe ; recharger /voyages garde la session.
  const cookies = await context.cookies();
  const session = cookies.filter((cookie) => cookie.name.includes("session"));
  expect(session.length).toBeGreaterThan(0);
  expect(session.every((cookie) => cookie.httpOnly)).toBe(true);
  await page.reload();
  await expect(page).toHaveURL((url) => url.pathname === SUITE);
  await expect(page.getByText("Tu n'as pas encore de voyage.")).toBeVisible();

  // Déconnexion par l'action (appel de test, faute d'écran : B3-PO-7), puis /voyages redirige vers l'écran 4.
  // Posté sur l'écran 4, dont le paquet importe `src/server/actions/compte.ts` (l'action est donc connue de cette page).
  const sortie = await page.request.post(new URL("/connexion", page.url()).href, {
    headers: { "Next-Action": identifiantAction("signOut"), Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
    data: "[]",
  });
  expect(sortie.status()).toBe(200);
  expect(await sortie.text()).toContain('"signedOut":true');
  await page.goto(SUITE);
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === connexionRoute(SUITE));
  await expect(page.getByRole("textbox", { name: "Ton adresse email" })).toBeVisible();
});
