import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { ADRESSE_A, ADRESSE_B } from "../support/bout-en-bout-api";

import { calendrier, ED_OK, evenementsIcs, expectFichierIcs, lienCalendrier, texteIcs } from "./calendrier-helpers";
import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { DATES, R17, setClock } from "./mes-voyages-helpers";
import { sheet } from "./sejour-helpers";

/**
 * « Ajouter au calendrier » sur l'adaptateur `api` (spécification M6 § 6.2, critères 1 à 5 et 9 ; décision 0157 § 1.6
 * et § 2.5 ; ticket 1005, M6b). Projet `api` : connexion réelle et lecture réelle sur la base du job `db`, données de
 * `tests/db/donnees-bout-en-bout.test.ts` (organisations A et B des scénarios de lecture, **lecture seule** : le
 * téléchargement n'écrit rien d'autre qu'une ligne du limiteur). Le fichier de `api` a les mêmes entrées que celui de
 * `mock` (même voyage simulé, converti en base) ; seuls `UID`, `SEQUENCE`, `URL` et le lien de `DESCRIPTION` diffèrent
 * (identifiant `uuid`, version en base, `APP_URL` posée sur ce serveur). Aucune trace (cookies).
 */
const test = base.extend<{ urlMock: string }>({
  urlMock: ["", { option: true }],
  // Adresse IP de confiance unique à chaque essai (limiteur de l'envoi du code : 3 par 10 minutes et par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::c` });
  },
});

test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const UUID = /^\/voyages\/([0-9a-f-]{36})(\/presentation)?$/;

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
 * Voyages de « Mes voyages » : `uuid` et déblocage, dans l'ordre de l'écran. L'adresse d'une carte dépend de l'horloge
 * (`reopenTarget` : après les dates, un voyage non débloqué rouvre le Séjour, pas `/presentation`) : le scénario fixe
 * l'horloge à `DATES.avant` avant de lire les voyages de A, comme `lecture-api.api.spec.ts`, où le voyage non débloqué
 * d'Édimbourg de l'organisation A mène à `/presentation`. Un voyage peut avoir deux liens (carte mise en avant et ligne) :
 * il est non débloqué si **l'un** d'eux mène à `/presentation`. L'organisation A n'est débloquée par aucun scénario
 * (`debloquer-api.api.spec.ts` a ses propres organisations) : son voyage non débloqué l'est de façon déterministe.
 */
async function voyages(page: Page): Promise<{ id: string; debloque: boolean }[]> {
  await page.goto(R17);
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  const liens = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  const vus = new Map<string, boolean>();
  for (const href of liens) {
    const m = UUID.exec(href);
    if (m?.[1]) vus.set(m[1], (vus.get(m[1]) ?? true) && m[2] === undefined);
  }
  return [...vus].map(([id, debloque]) => ({ id, debloque }));
}

/** Entrées comparables entre `mock` et `api` : nom, début, fin, « À réserver. ». */
const comparables = (ics: string) =>
  evenementsIcs(ics).map((e) => ({
    nom: texteIcs(e.SUMMARY?.[0] ?? ""),
    debut: e.DTSTART,
    fin: e.DTEND ?? [],
    aReserver: texteIcs(e.DESCRIPTION?.[0] ?? "").startsWith("À réserver."),
  }));

test("calendrier: api, fichier du voyage débloqué, même contenu que mock ; non débloqué, autre organisation et sans session refusés", async ({
  page,
  request,
  baseURL,
  urlMock,
  browser,
}) => {
  test.setTimeout(180_000);
  expect(urlMock).not.toBe("");
  const api = baseURL ?? "";

  // B : identifiants de ses voyages (autre organisation que A ; le suffixe ne sert pas ici).
  await connecter(page, request, ADRESSE_B);
  const voyagesB = await voyages(page);
  expect(voyagesB, "données de bout en bout absentes : pnpm test:db les écrit").toHaveLength(4);

  await connecter(page, request, ADRESSE_A);
  // Horloge fixée avant la lecture de l'écran 17 de A, comme dans `lecture-api.api.spec.ts`.
  await setClock(page, DATES.avant);
  const voyagesA = await voyages(page);
  expect(voyagesA).toHaveLength(4);
  const nonDebloque = voyagesA.find((v) => !v.debloque);
  expect(nonDebloque).toBeDefined();

  // Pendant débloqué d'Édimbourg : celui dont le fichier a les mêmes entrées que `mock`.
  const fichierMock = await expectFichierIcs(await request.get(`${urlMock}${calendrier(ED_OK)}`));
  const attendu = comparables(fichierMock);
  let trouve: string | null = null;
  for (const { id, debloque } of voyagesA.filter((v) => v.debloque)) {
    const reponse = await page.request.get(`${api}${calendrier(id)}`);
    if (reponse.status() !== 200) continue;
    const texte = await expectFichierIcs(reponse);
    if (texte.includes("X-WR-CALNAME:Édimbourg · Programme") && debloque) {
      expect(comparables(texte)).toEqual(attendu);
      trouve = id;
      // UID sans identifiant interne, sous `.invalid` ; SEQUENCE = version en base ; URL = Journée de l'application.
      const evenements = evenementsIcs(texte);
      for (const e of evenements) {
        expect(e.UID?.[0]).toMatch(/^[A-Za-z0-9_-]{22}@vadrouille\.invalid$/);
        expect(e.SEQUENCE?.[0]).toMatch(/^[1-9][0-9]*$/);
        const url = e.URL?.[0] ?? "";
        expect(url.startsWith(`${api}/voyages/${id}/jour/`), url).toBe(true);
        expect(url.slice(`${api}/voyages/${id}/jour/`.length)).toMatch(/^[1-9][0-9]*$/);
      }
      const second = evenementsIcs(await (await page.request.get(`${api}${calendrier(id)}`)).text());
      expect(second.map((e) => e.UID?.[0])).toEqual(evenements.map((e) => e.UID?.[0]));

      // Bouton du Séjour : un lien vers la même adresse.
      await page.goto(`/voyages/${id}`);
      await expect(sheet(page)).toBeVisible();
      await expect(lienCalendrier(page)).toHaveAttribute("href", calendrier(id));
    }
  }
  expect(trouve, "pendant débloqué d'Édimbourg introuvable").not.toBeNull();

  // Voyage non débloqué : pas de bouton, et 404 sans contenu.
  const idNonDebloque = nonDebloque?.id as string;
  const refus = await page.request.get(`${api}${calendrier(idNonDebloque)}`);
  expect(refus.status()).toBe(404);
  expect(await refus.text()).not.toContain("BEGIN:VCALENDAR");
  expect(refus.headers()["cache-control"]).toMatch(/no-store/);

  // Autre organisation : 404 sans contenu, pour chacun des voyages de B.
  for (const { id } of voyagesB) {
    const reponse = await page.request.get(`${api}${calendrier(id)}`);
    expect(reponse.status(), id).toBe(404);
    expect(await reponse.text(), id).not.toContain("BEGIN:VCALENDAR");
  }

  // Sans session : même réponse que le Séjour sans session (redirection vers l'écran 4, suite le Séjour).
  const anonyme = await browser.newContext();
  const suite = connexionRoute(`/voyages/${trouve as string}`);
  const sansSession = await anonyme.request.get(`${api}${calendrier(trouve as string)}`, { maxRedirects: 0 });
  expect(sansSession.status()).toBe(307);
  expect(sansSession.headers()["location"]).toBe(suite);
  expect(await sansSession.text()).toBe("");
  const visiteur = await anonyme.newPage();
  await visiteur.goto(`${api}/voyages/${trouve as string}`);
  await expect.poll(() => `${new URL(visiteur.url()).pathname}${new URL(visiteur.url()).search}`).toBe(suite);
  await anonyme.close();
});
