import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { ADRESSE_PARTAGE_CREATION, JETON_PARTAGE_REVERROUILLE, JETON_PARTAGE_VALIDE } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { R17 } from "./mes-voyages-helpers";
import { createLink, openShareSheet, revokeLink, RP, RPJ, sheetButton } from "./partage-helpers";

/**
 * Vue partagée sur l'adaptateur `api` (ticket 1013, M6a ; spécification M6 § 3.3 et § 6.1 ; décisions 0157 § 2.1 et
 * 0158 § 3 et § 4.2). Projet `api` : lecture réelle sur la base du job `db`, données écrites par
 * `tests/db/donnees-bout-en-bout.test.ts` (`tests/support/bout-en-bout-api.ts`).
 *
 * - **Lecture** (visiteur sans session) : `RP` liste les journées (nombre d'étapes) et `RPJ` montre les étapes d'une
 *   journée ; ni l'une ni l'autre ne montre un champ sentinelle de l'instantané, de `checklist_items` ou de `stays`
 *   (critères 11 et 12). Le voyage reverrouillé (lien toujours `valid`, droit `tripUnlocked` retiré) répond la même
 *   page 404 que le jeton inconnu, le jeton d'une autre forme et le jeton signé du site d'essai.
 * - **Création** (revue du ticket 1013, point 7) : la personne connectée crée un lien depuis la feuille, un visiteur
 *   sans session l'ouvre, la personne le désactive, et le visiteur reçoit le 404 commun.
 *
 * En-têtes de F10-TL-8 vérifiés sur le 200 et sur les 404. Le 500 porte les mêmes (règle `/p/:path*` de
 * `next.config.ts`, posée quel que soit le statut) : aucune panne n'est provoquée ici. Aucune trace (cookies).
 */
const test = base.extend({
  // Adresse IP de confiance unique à chaque essai (limite `partage-vue` : 60 par minute et par adresse IP ; envoi du
  // code : 3 par 10 minutes et par adresse IP). Un préfixe /64 distinct (une adresse IPv6 compte par préfixe /64).
  extraHTTPHeaders: async ({}, fournir) => {
    await fournir(adresseDeConfiance());
  },
});

test.describe.configure({ mode: "serial" });

const INVALIDE = "Ce lien de partage n'est pas valide.";
const SENTINELLE = "SENTINELLE";
const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const UUID = /^\/voyages\/([0-9a-f-]{36})$/;

function adresseDeConfiance(): Record<string, string> {
  const prefixe = randomBytes(4).toString("hex");
  return { "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::6a` };
}

/** En-têtes de F10-TL-8 (`next.config.ts`, `/p/:path*`), et jamais l'en-tête interne « compté ». */
function expectEnTetesConfidentialite(reponse: { headers(): Record<string, string> } | null | undefined, contexte: string) {
  const entetes = reponse?.headers() ?? {};
  expect(entetes["cache-control"], contexte).toMatch(/no-store/);
  expect(entetes["x-robots-tag"], contexte).toBe("noindex, nofollow");
  expect(entetes["referrer-policy"], contexte).toBe("strict-origin");
  expect(entetes["x-vadrouille-partage-compte"], contexte).toBeUndefined();
}

test("partage: api, RP d'un lien valide : la journée et son nombre d'étapes, sans carte ni sentinelle", async ({ page }) => {
  const valide = await page.goto(RP(JETON_PARTAGE_VALIDE));
  expect(valide?.status()).toBe(200);
  await expect(page).toHaveTitle("Lyon · Programme partagé");
  // `RP` ne liste que les journées (nombre d'étapes) ; les noms d'étapes sont sur `RPJ`.
  const jour = page.getByRole("link").filter({ hasText: "1 étape" });
  await expect(jour).toHaveCount(1);
  await expect(jour).toHaveAttribute("href", RPJ(JETON_PARTAGE_VALIDE, 1));
  expectEnTetesConfidentialite(valide, "RP");
  const html = await page.content();
  expect(html).not.toContain("test_place_m6a");
  expect(html).not.toContain(SENTINELLE);
  // Sans carte (Q814) : aucun script de carte chargé.
  expect(await page.locator("script[src*='maps']").count()).toBe(0);
});

test("partage: api, RPJ d'un lien valide : l'étape « [Vieille ville] », sans libellé de logement, À faire ni sentinelle", async ({ page }) => {
  const reponse = await page.goto(RPJ(JETON_PARTAGE_VALIDE, 1));
  expect(reponse?.status()).toBe(200);
  await expect(page.getByText("[Vieille ville]").first()).toBeVisible();
  expectEnTetesConfidentialite(reponse, "RPJ");
  const html = await page.content();
  for (const interdit of [SENTINELLE, "test_place_m6a", "À réserver"]) expect(html, interdit).not.toContain(interdit);
});

test("partage: api, voyage reverrouillé, jeton inconnu et autres formes : même 404, en-têtes F10-TL-8", async ({ page }) => {
  const corps: string[] = [];
  for (const jeton of [JETON_PARTAGE_REVERROUILLE, "Q".repeat(43), "v1.eyJ0IjoiMSJ9.c2lnbmF0dXJl", "court"]) {
    const reponse = await page.goto(RP(jeton));
    expect(reponse?.status(), jeton).toBe(404);
    await expect(page.getByText(INVALIDE)).toBeVisible();
    expect(await page.content(), jeton).not.toContain("Marseille");
    expectEnTetesConfidentialite(reponse, jeton);
    corps.push((await page.getByRole("main").innerText()).trim());
  }
  expect(new Set(corps).size).toBe(1);

  // Journée du voyage reverrouillé : même 404, mêmes en-têtes.
  const jour = await page.goto(RPJ(JETON_PARTAGE_REVERROUILLE, 1));
  expect(jour?.status()).toBe(404);
  expectEnTetesConfidentialite(jour, "RPJ reverrouillé");
});

test("partage: api, préchargement du routeur : 204 sans corps, sans lecture", async ({ request }) => {
  const prechargement = await request.get(RP(JETON_PARTAGE_VALIDE), { headers: { "next-router-prefetch": "1" } });
  expect(prechargement.status()).toBe(204);
  expect(await prechargement.text()).toBe("");
  expect(prechargement.headers()["cache-control"]).toBe("private, no-store");
});

// --- Créer, ouvrir sans session, désactiver, 404 (revue du ticket 1013, point 7) ------------------------------------

async function identifiantsMailpit(request: APIRequestContext, adresse: string): Promise<string[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return (((await reponse.json()) as { messages?: { ID: string }[] }).messages ?? []).map((m) => m.ID);
}

/** Connexion par le code lu dans Mailpit (B3b-envoi, comme `calendrier-api.api.spec.ts`) : seul message reçu après la demande. */
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

test("partage: api, créer depuis la feuille, ouvrir sans session, désactiver, 404", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(120_000);
  await connecter(page, request, ADRESSE_PARTAGE_CREATION);
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  const hrefs = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  const ids = [...new Set(hrefs.flatMap((href) => UUID.exec(href)?.[1] ?? []))];
  expect(ids, "données de bout en bout absentes : pnpm test:db les écrit").toHaveLength(1);

  // Séjour du voyage débloqué : feuille « Partager », création d'un lien.
  await page.goto(`/voyages/${ids[0]}`);
  await openShareSheet(page);
  // Nouvel essai (`retries`) sur la même base : un lien laissé actif par l'essai précédent est d'abord désactivé.
  if (await sheetButton(page, "Désactiver le lien").isVisible()) await revokeLink(page);
  const jeton = await createLink(page);

  // Visiteur sans session (contexte neuf, sans cookie) : la vue du voyage.
  const visiteur = await browser.newContext({ baseURL, extraHTTPHeaders: adresseDeConfiance() });
  try {
    const anonyme = await visiteur.newPage();
    const vue = await anonyme.goto(RP(jeton));
    expect(vue?.status()).toBe(200);
    await expect(anonyme).toHaveTitle(/· Programme partagé$/);
    expectEnTetesConfidentialite(vue, "lien créé");
    expect(await visiteur.cookies()).toEqual([]);

    // La personne désactive le lien ; le visiteur reçoit le 404 commun, dès la requête suivante. Juste après la création,
    // la feuille montre le lien créé (champ et « Copier ») ; « Désactiver le lien » est dans l'état « lien actif », qu'elle
    // montre à sa réouverture (comme `partage.e2e.spec.ts`).
    await sheetButton(page, "Fermer").click();
    await openShareSheet(page);
    await revokeLink(page);
    const apres = await anonyme.goto(RP(jeton));
    expect(apres?.status()).toBe(404);
    await expect(anonyme.getByText(INVALIDE)).toBeVisible();
    expectEnTetesConfidentialite(apres, "lien désactivé");
    expect((await anonyme.goto(RPJ(jeton, 1)))?.status()).toBe(404);
  } finally {
    await visiteur.close();
  }
});
