import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { codeCells, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { continueButton, field, fillTrip, R1, R2, R4_LANCER } from "./creation-helpers";
import { expectPath } from "./debloquer-helpers";
import { R17 } from "./mes-voyages-helpers";
import { sheet } from "./sejour-helpers";

/**
 * Bout en bout simulé de la génération sur l'adaptateur `api` (spécification B9, B9e point 3 et critère « Bout en bout
 * simulé » ; décisions 0081 B9-TL-2 et B9-TL-8). Projet `api` : serveur à connexion réelle (`AUTH_ADAPTER=better-auth`) et
 * données réelles (`DATA_ADAPTER=api`) sur la base du job `db`, `VADROUILLE_ENV=ci` : la barrière des appels réels est
 * fermée, la composition de la génération est la variante **simulée** (doubles sur les fixtures de la destination), le
 * monde local du Workflow SDK exécute le workflow de la chaîne de l'aperçu dans le même serveur, et la lecture garde le double
 * de relectures, complété pour les lieux des fixtures (0100 § 5.3, amendée par 0110 § 1). Aucune clé n'est posée (garde de
 * `playwright.config.ts`).
 *
 * Chaîne inversée (M1a-3, PR 862 ; spécification M1a, critères 9 et 15 ; décision 0136 § 4 et § 9) : `CHAINE_APERCU` vaut
 * `"inversee"`, donc `createTrip` démarre `generateProgramme` (étapes `a` et `e`) sur la sortie simulée de Rome
 * (`prototype/fixtures/modeles/rome.json`, `places/rome-chaine-inversee.json`).
 *
 * Parcours : écrans 1 et 2 (brouillon de Rome aux dates de la sortie simulée, logement « Un quartier », donc sans écran 3,
 * F8-PO-8 ; brief rempli à la main : `structureBrief` et `suggestLodging` ne sont pas livrés sur l'adaptateur `api`, B9a ; le
 * récit n'est pas envoyé sur `api`, 0136 § 3 « Récit »), écran 4 (connexion par le code lu dans Mailpit, adresse neuve :
 * organisation neuve, sans voyage), lancement (`createTrip` en base), écran 5 jusqu'à « prêt » (exécution réelle des étapes
 * sur les doubles), puis « Mes voyages » qui liste le voyage, Séjour qui affiche les journées de l'aperçu (voyage non
 * débloqué, 0136 § 3.5) et Journée 1, avec un repas de midi et un repas du soir de la sortie simulée, durées du relecteur
 * simulé (aucune `travel_unknown` : la page s'affiche). Aucune requête du navigateur hors du serveur de test
 * (donc vers aucun fournisseur) ; côté serveur, la barrière fermée ne laisse construire aucun client réel. Aucune trace
 * (cookies de session).
 */
const test = base.extend<{ urlMock: string }>({
  urlMock: ["", { option: true }],
  // Adresse IP de confiance unique à chaque essai (limiteur de l'envoi du code : 3 par 10 minutes et par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::5` });
  },
});

test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const PREPARATION = /^\/voyages\/([0-9a-f-]{36})\/preparation$/;
/** Quartier des fixtures de Rome (`prototype/fixtures/places/rome-chaine-inversee.json`) : libellé que le double résout. */
const QUARTIER_FIXTURES = "Rione Monti (près du Colisée)";
/** Dates de la sortie simulée de Rome (cinq journées, 4 au 8 mai 2027). */
const ROME = { destination: "Rome", start: "2027-05-04", end: "2027-05-08", lodging: "Un quartier" } as const;
/** Repas de midi et du soir de la Journée 1 dans la sortie simulée de Rome (noms écrits par l'IA, jamais Google). */
const REPAS_J1 = ["Antico Forno ai Serpenti", "Trattoria Vecchia Roma"];

async function identifiantsMailpit(request: APIRequestContext, adresse: string): Promise<string[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return (((await reponse.json()) as { messages?: { ID: string }[] }).messages ?? []).map((m) => m.ID);
}

/** Écran 4 : adresse saisie, code lu dans Mailpit (seul message reçu après la demande), collé dans les six cases. */
async function connecterDepuisLEcran4(page: Page, request: APIRequestContext, adresse: string) {
  const avant = new Set(await identifiantsMailpit(request, adresse));
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
}

test("génération simulée de bout en bout sur l'adaptateur api : écrans 1 à 5, Mes voyages, Séjour, Journée 1 (chaîne inversée, Rome)", async ({ page, request }) => {
  test.setTimeout(240_000);
  // Aucune requête du navigateur hors du serveur de test (donc aucune vers un fournisseur de cartes, de lieux ou de modèles).
  const horsServeur: string[] = [];
  page.on("request", (requete) => {
    const url = new URL(requete.url());
    if (url.protocol !== "data:" && url.protocol !== "blob:" && url.hostname !== "127.0.0.1") horsServeur.push(url.hostname);
  });
  await page.context().clearCookies();

  // Écran 1 : Rome aux dates de la sortie simulée, logement « Un quartier » : le libellé du jeu de fixtures, que le double de
  // Text Search résout (écran 3 sauté, F8-PO-8). Écran 2 : brief rempli à la main.
  await page.goto(R1);
  await fillTrip(page, ROME);
  await field(page, "Quartier").fill(QUARTIER_FIXTURES);
  await continueButton(page).click();
  await expectPath(page, R2);
  await page.getByRole("button", { name: "Remplir moi-même" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vérifie tes envies" })).toBeFocused();
  // Brief des tests de l'aperçu (`BRIEF_EDIMBOURG`, `tests/support/banc-apercu.ts`) : rythme, quatre envies, deux modes. Au moins
  // un mode de déplacement est nécessaire : la recherche de l'aperçu en demande un (entrée des modèles, `deplacements`).
  await page.getByRole("radio", { name: "Équilibré" }).click();
  for (const envie of ["Restaurants", "Dégustations", "Balades en ville", "Musées"]) {
    await page.getByRole("group", { name: "Envies" }).getByRole("button", { name: envie, exact: true }).click();
  }
  await page.getByRole("button", { name: /^Déplacements/ }).click();
  for (const mode of ["À pied", "Transports publics"]) {
    await page.getByRole("group", { name: "Déplacements" }).getByRole("button", { name: mode, exact: true }).click();
  }
  await continueButton(page).click();

  // Écran 4 : connexion réelle, puis lancement.
  await expectPath(page, R4_LANCER);
  const adresse = `b9e-${randomBytes(6).toString("hex")}@example.test`;
  await connecterDepuisLEcran4(page, request, adresse);

  // Écran 5 du voyage créé en base (`uuid`), jusqu'à l'état final : les étapes de `generateProgramme` tournent sur les doubles.
  await expect(page).toHaveURL((url) => PREPARATION.test(url.pathname), { timeout: 30_000 });
  const tripId = PREPARATION.exec(new URL(page.url()).pathname)?.[1] as string;
  // L'écran 5 s'affiche dès le lancement, pendant la génération (aucune version publiée : la page vérifie le voyage par
  // `getGenerationStatus`, plus par `getTrip`, revue de la PR #588, bloquant 2), puis suit l'avancement sans recharger.
  // Le compteur n'existe que sur l'écran 5 (jamais sur « Page introuvable ») ; aucune page n'est rechargée ensuite.
  await expect(page.locator("[data-compteur]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tes premières propositions sont prêtes", { timeout: 120_000 });
  // Aperçu `ready` (huit cases ancrées et justifiées sur J1 et J2), jamais interrompu : région d'alerte vide, compteur 8 sur 8.
  await expect(page.locator("main [role='alert']")).toHaveText("");
  await expect(page.locator("[data-compteur]")).toHaveText(/^8 propositions prêtes sur 8$/);
  await expect(page.getByRole("link", { name: "Voir mes propositions", exact: true })).toHaveAttribute("href", `/voyages/${tripId}/presentation`);

  // M7a (PR 870) : à la fin de `generateProgramme`, un seul e-mail « propositions prêtes » à l'adresse du compte, dans
  // Mailpit (SMTP du serveur `api`), avec le lien de la présentation du voyage ; le code de connexion reste le seul autre.
  let notifications: { Subject?: string; Text?: string }[] = [];
  await expect
    .poll(async () => {
      const details = await Promise.all((await identifiantsMailpit(request, adresse)).map(async (id) => (await request.get(`${API_MAILPIT}/message/${id}`)).json()));
      notifications = (details as { Subject?: string; Text?: string }[]).filter((m) => m.Subject === "Tes premières propositions sont prêtes");
      return notifications.length;
    })
    .toBe(1);
  expect(notifications[0]?.Text).toContain(`/voyages/${tripId}/presentation`);
  expect(notifications[0]?.Text).not.toContain("Rome");

  // « Mes voyages » liste le voyage (organisation neuve : ce seul voyage).
  await page.goto(R17);
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  const liens = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  const voyages = [...new Set(liens.flatMap((href) => /^\/voyages\/([0-9a-f-]{36})(?:\/presentation)?$/.exec(href)?.[1] ?? []))];
  expect(voyages).toEqual([tripId]);
  await expect(page.getByRole("main")).toContainText("Rome");

  // Séjour : la feuille « Programme » sert les journées de l'aperçu avec leurs étapes (voyage non débloqué : J1 et J2,
  // 0136 § 3.5) ; les jours 3 à 5 existent et sont listés verrouillés, « à débloquer », sans étape ni résumé.
  const reponse = await page.goto(`/voyages/${tripId}`);
  expect(reponse?.status()).toBe(200);
  await expect(sheet(page)).toBeVisible();
  const servis = sheet(page).locator("a[data-part='jour']");
  await expect(servis).toHaveCount(2);
  for (const [rang, jour] of [1, 2].entries()) {
    await expect(servis.nth(rang)).toContainText(`Jour ${jour}`);
    await expect(servis.nth(rang)).toContainText(/\d+ étapes? · /);
  }
  const verrouilles = sheet(page).locator("li[data-part='jour-a-debloquer']");
  await expect(verrouilles).toHaveCount(3);
  for (const [rang, jour] of [3, 4, 5].entries()) {
    await expect(verrouilles.nth(rang)).toContainText(`Jour ${jour}, à débloquer`);
    await expect(verrouilles.nth(rang)).toContainText("À débloquer");
    await expect(verrouilles.nth(rang)).not.toContainText(/étapes? · /);
  }

  // Journée 1 : servie (durées du relecteur simulé, aucune `travel_unknown`), avec le repas de midi et celui du soir de la
  // sortie simulée (critère 15) ; une journée hors aperçu n'est pas servie avant le déblocage.
  const journee1 = await page.goto(`/voyages/${tripId}/jour/1`);
  expect(journee1?.status()).toBe(200);
  await expect(sheet(page)).toBeVisible();
  for (const repas of REPAS_J1) await expect(page.locator("body")).toContainText(repas);
  expect((await page.goto(`/voyages/${tripId}/jour/4`))?.status()).toBe(404);

  // Seul le navigateur est surveillé ici. Côté serveur, aucun appel réel ne peut partir : aucune clé n'est posée (garde de
  // `playwright.config.ts`) et la barrière est fermée en `ci` (variante simulée, doubles sur fixtures) ; les clients réels
  // ne sont construits que par la variante `reelle` (revue de la PR #588, mineur 8).
  expect(horsServeur, "requêtes du navigateur hors du serveur de test").toEqual([]);
});
