import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { edimbourg } from "../../src/mocks/edimbourg";
import { ADRESSE_A, ADRESSE_B } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { NOT_FOUND_TITLE } from "./etats-helpers";
import { DATES, ED, ED_OK, LIS, POR, R17, setClock } from "./mes-voyages-helpers";
import { body, dayList, sheet } from "./sejour-helpers";

/**
 * Projet `api` (spécification B6, B6b point 5 et critères « Écrans 11, 12 et 17 avec `DATA_ADAPTER=api` » et
 * « `not_found` pour une autre organisation » ; décision 0086 § 2.3, B6-TL-10). Serveur à connexion réelle
 * (`AUTH_ADAPTER=better-auth`) **et** lecture réelle (`DATA_ADAPTER=api`, double de relectures), sur la base du job
 * `db`. Données écrites par le processus de test, avant toute session (`tests/db/donnees-bout-en-bout.test.ts`, voir
 * `tests/support/bout-en-bout-api.ts`) ; la session est ouverte par le code lu dans Mailpit, jamais forgée.
 *
 * Mêmes assertions que les scénarios `mock` : chaque écran servi par l'adaptateur `api` rend **le même texte** que le
 * même écran du serveur principal (adaptateur `mock`, même build, `urlMock`), pour les quatre voyages de « Mes voyages »,
 * le Séjour de chacun et chaque Journée d'Édimbourg et de son pendant débloqué ; seuls écarts admis, ceux que fixe la
 * spécification (critère `lecture: l'adaptateur api recompose le voyage simulé`, règle 2 (a)) : les deux trajets du J5
 * entre la distillerie et le dîner valent 70 minutes chacun (50 puis 20 dans `mock`). Aucune trace (cookies).
 */
const test = base.extend<{ urlMock: string }>({
  urlMock: ["", { option: true }],
  // Adresse IP de confiance unique à chaque essai (limiteur de l'envoi du code : 3 par 10 minutes et par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::2` });
  },
});

// Un seul scénario par fichier, en série : deux connexions par essai, sous la limite de 5 envois par heure et par adresse.
test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";

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

/** `uuid` des voyages de « Mes voyages » (liens de l'écran 17), dans l'ordre de l'écran. */
async function idsDesVoyages(page: Page): Promise<string[]> {
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  const liens = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  // Un voyage peut avoir deux liens (carte et accès direct) : identifiants distincts, dans l'ordre d'apparition.
  return [...new Set(liens.flatMap((href) => /^\/voyages\/([0-9a-f-]{36})(?:\/presentation)?$/.exec(href)?.[1] ?? []))];
}

/** Texte rendu d'une zone, espaces normalisés. */
const texte = async (page: Page, zone: (p: Page) => ReturnType<Page["locator"]>) => ((await zone(page).innerText()) ?? "").replace(/\s+/g, " ").trim();

/**
 * Écart de B6a (PR #473, « budget de `mock` saisi à la main ») : la lecture calcule `budgetPerPerson` par
 * `budgetParPersonne` sur les faits stockés, et la plupart des étapes du jeu simulé n'ont pas de coût ; les lignes de
 * budget sont retirées des deux côtés de la comparaison (aucune autre partie du texte).
 */
const sansBudget = (t: string) =>
  t
    .replace(/Budget estimé : environ [\d\s'’]+ CHF par personne(?: \(sans le jour \d+\))*/g, "")
    .replace(/ · environ [\d\s'’]+ CHF par personne/g, "")
    .replace(/Environ [\d\s'’]+ CHF par personne/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Lignes « À faire » : l'ordre n'est pas stocké (`checklist_items` n'a pas de colonne d'ordre ; B6a lit par `id`,
 * question au rôle data). Le texte de la liste est remplacé par une marque dans le rendu, et ses lignes sont comparées
 * à part, triées.
 */
async function sejourComparable(page: Page): Promise<{ rendu: string; aFaire: string[] }> {
  const region = sheet(page).getByRole("region", { name: "À faire avant de partir" });
  const lignes = (await region.count()) === 0 ? [] : await region.getByRole("listitem").allInnerTexts();
  const aFaire = lignes.map((l) => l.replace(/\s+/g, " ").trim());
  let rendu = await texte(page, body);
  for (const ligne of aFaire) rendu = rendu.replace(ligne, "");
  return { rendu: sansBudget(rendu), aFaire: [...aFaire].sort() };
}

/** Lignes « Jour par jour » du Séjour (liens des journées servies), texte normalisé, dans l'ordre de l'écran. */
async function joursDuSejour(page: Page): Promise<string[]> {
  const liens = await sheet(page).locator("a[data-part='jour']").allInnerTexts();
  return liens.map((l) => sansBudget(l.replace(/\s+/g, " ").trim()));
}

/**
 * Écart fixé du J5 (critère `lecture: l'adaptateur api recompose le voyage simulé`, règle 2 (a)) : les deux trajets en
 * bus qui relient la distillerie au dîner de Leith, séparés par un temps libre, sont mesurés par la même relecture
 * (B6-PO-4) et valent 70 minutes chacun (« 1 h 10 », 50 puis 20 dans `mock`), leur `estimated` restant celui de
 * `mock` ; le bandeau « Le plus
 * long » en découle. Chaque remplacement doit trouver son texte dans le rendu de `mock`.
 */
function ecartDuJ5(rendu: string): string {
  const remplacements: [string, string][] = [
    ["Le plus long : Bus, environ 50 min (estimation), vers [Distillerie accessible en bus].", "Le plus long : Bus, 1 h 10, vers [Occasion spéciale à Leith]."],
    ["À confirmer Bus, environ 50 min (estimation) 15:50", "À confirmer Bus, environ 1 h 10 (estimation) 15:50"],
    ["Idées Bus, 20 min 19:00", "Idées Bus, 1 h 10 19:00"],
  ];
  let resultat = rendu;
  for (const [avant, apres] of remplacements) {
    expect(resultat, "écart du J5").toContain(avant);
    resultat = resultat.replace(avant, apres);
  }
  return resultat;
}

/**
 * Ouvre `chemin` sur le serveur `origine` ; vérifie le statut et `Cache-Control: private, no-store` (Q524,
 * `next.config.ts`, règle `/voyages/:path*`) sur **chaque** réponse, 404 comprises. Les deux serveurs servent le même
 * build : la règle vaut pour l'un comme pour l'autre.
 */
async function ouvrir(page: Page, origine: string, chemin: string, statut = 200) {
  const reponse = await page.goto(`${origine}${chemin}`);
  expect(reponse?.status(), chemin).toBe(statut);
  const cache = reponse?.headers()["cache-control"] ?? "";
  expect(cache, `Cache-Control de ${chemin}`).toMatch(/\bprivate\b/);
  expect(cache, `Cache-Control de ${chemin}`).toMatch(/\bno-store\b/);
  return reponse;
}

test("écrans 11, 12 et 17 avec DATA_ADAPTER=api : même rendu que mock ; autre organisation : introuvable", async ({ page, request, baseURL, urlMock }) => {
  test.setTimeout(180_000);
  expect(urlMock).not.toBe("");
  const api = baseURL ?? "";

  // B : identifiants de ses voyages (une autre organisation que celle de A).
  await connecter(page, request, ADRESSE_B);
  const voyagesB = await idsDesVoyages(page);
  expect(voyagesB, "données de bout en bout absentes : pnpm test:db les écrit (tests/db/donnees-bout-en-bout.test.ts)").toHaveLength(4);

  // A : écran 17, mêmes sections et mêmes cartes que mock, à la même horloge (DATES.avant de F11a).
  await connecter(page, request, ADRESSE_A);
  await setClock(page, DATES.avant);
  const reponse17 = await ouvrir(page, api, R17);
  expect(reponse17?.headers()["cache-control"]).toMatch(/private/);
  expect(reponse17?.headers()["cache-control"]).toMatch(/no-store/);
  const main = (p: Page) => p.getByRole("main");
  await expect(page.getByRole("status")).toHaveCount(0);
  const rendu17Api = await texte(page, main);
  const liensApi = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  await ouvrir(page, urlMock, R17);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(rendu17Api).toBe(await texte(page, main));
  const liensMock = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  expect(liensApi).toHaveLength(liensMock.length);
  // Mêmes voyages dans le même ordre, mêmes suffixes (`/presentation` pour un voyage non débloqué, F11a) :
  // `mock_trip_*` d'un côté, `uuid` de la base de l'autre.
  const LIEN = /^\/voyages\/([^/]+)(\/presentation)?$/;
  // « Créer un voyage » (F11-PO-4, ticket 803) : même adresse des deux côtés, ce n'est pas un voyage.
  const CREER = "/voyages/nouveau";
  expect(liensApi.filter((href) => href === CREER)).toEqual(liensMock.filter((href) => href === CREER));
  expect(liensApi.indexOf(CREER)).toBe(liensMock.indexOf(CREER));
  const correspondance = new Map<string, string>();
  liensMock.forEach((href, i) => {
    if (href === CREER) return;
    const mock = LIEN.exec(href);
    const reel = LIEN.exec(liensApi[i] ?? "");
    expect(reel?.[2], href).toBe(mock?.[2]);
    correspondance.set(mock?.[1] as string, reel?.[1] as string);
  });
  expect(new Set(correspondance.keys())).toEqual(new Set([ED, ED_OK, LIS, POR]));
  expect(correspondance.size).toBe(4);
  for (const id of correspondance.values()) expect(id).toMatch(/^[0-9a-f-]{36}$/);

  // Écran 11 : le Séjour de chacun des quatre voyages, même texte que mock ; voyage non débloqué d'Édimbourg (`ED`) : J1 et
  // J2 seulement (attente modifiée de l'erratum M1a-3 de 0136, PR 862 : sous la chaîne inversée, `api` ne sert avant le
  // déblocage que les journées de l'aperçu, 0136 § 3.5 ; `mock` sert les six).
  for (const [idMock, idApi] of correspondance) {
    const reponse = await ouvrir(page, api, `/voyages/${idApi}`);
    expect(reponse?.headers()["cache-control"]).toMatch(/private.*no-store|no-store.*private/);
    await expect(sheet(page)).toBeVisible();
    if (idMock === ED) {
      const joursApi = await joursDuSejour(page);
      await ouvrir(page, urlMock, `/voyages/${idMock}`);
      await expect(sheet(page)).toBeVisible();
      const joursMock = await joursDuSejour(page);
      expect(joursApi, `Séjour ${idMock} : journées servies`).toEqual(joursMock.slice(0, 2));
      continue;
    }
    const renduApi = await sejourComparable(page);
    await ouvrir(page, urlMock, `/voyages/${idMock}`);
    await expect(sheet(page)).toBeVisible();
    expect(renduApi, `Séjour ${idMock}`).toEqual(await sejourComparable(page));
  }

  // Écran 12 : chaque Journée d'Édimbourg et de son pendant débloqué. J5 : écart fixé (70 et 70 au lieu de 50 et 20).
  // `ED` non débloqué : Journées 3 à 6 introuvables sur `api` (erratum M1a-3 de 0136, PR 862).
  for (const idMock of [ED, ED_OK]) {
    for (const day of edimbourg.days) {
      const chemin = (id: string) => `/voyages/${id}/jour/${day.index}`;
      if (idMock === ED && day.index > 2) {
        await ouvrir(page, api, chemin(correspondance.get(idMock) as string), 404);
        await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND_TITLE })).toBeVisible();
        continue;
      }
      await ouvrir(page, api, chemin(correspondance.get(idMock) as string));
      await expect(sheet(page)).toBeVisible();
      const renduApi = sansBudget(await texte(page, body));
      await ouvrir(page, urlMock, chemin(idMock));
      await expect(sheet(page)).toBeVisible();
      let attendu = sansBudget(await texte(page, body));
      if (day.index === 5) attendu = ecartDuJ5(attendu);
      expect(renduApi, `Journée ${day.index} de ${idMock}`).toBe(attendu);
      if (idMock === ED && day.index === 2) await expect(dayList(page)).toBeVisible();
    }
  }

  // `not_found` : le Séjour et une Journée d'un voyage de B donnent la page introuvable à A.
  for (const idB of voyagesB) {
    for (const chemin of [`/voyages/${idB}`, `/voyages/${idB}/jour/1`]) {
      await ouvrir(page, api, chemin, 404);
      await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND_TITLE })).toBeVisible();
    }
  }
});
