import { expect, test } from "@playwright/test";

import { AJOUTER_DEBLOQUE, AJOUTER_NON_DEBLOQUE, JOUR_2_DEBLOQUE, addTitle, moments, nameField, previewAdd, results, search, searchField } from "./ajouter-helpers";
import { fiche, listStops, sheet } from "./sejour-helpers";

/**
 * « Ajouter un lieu », adaptateur `mock` (tâche M5d-2, ticket 961 ; spécification M5 § 6, critères 19, 21, 22, 23, 25 et
 * 26 ; F7, F7-PO-1 et F7-PO-8) : entrée depuis la Journée, recherche simulée, nom toujours vide, moment proposé, aperçu,
 * « Appliquer », toast « Lieu ajouté. » et « Annuler », mention « Ajouté par toi. » sur la fiche. Sur `mock`, l'ajout reste
 * en mémoire de la page (Q762), et un second ajout du même jour s'ajoute au premier (0154 § 3, M5d-3) ; rien de la recherche
 * n'atteint l'adresse ni le stockage du navigateur.
 */

test("ajouter: entrée « Ajouter un lieu » sous la ligne du jour, voyage débloqué seulement (M5-PO-1)", async ({ page }) => {
  await page.goto(JOUR_2_DEBLOQUE);
  const entree = sheet(page).getByRole("link", { name: "Ajouter un lieu" });
  await expect(entree).toHaveAttribute("href", AJOUTER_DEBLOQUE);
  await entree.click();
  await expect(page).toHaveURL(AJOUTER_DEBLOQUE);
  await expect(addTitle(page)).toBeFocused();
  await expect(page).toHaveTitle("Ajouter un lieu · Jour 2");

  await page.goto("/voyages/mock_trip_edimbourg/jour/2");
  await expect(listStops(page).first()).toBeVisible();
  await expect(sheet(page).getByRole("link", { name: "Ajouter un lieu" })).toHaveCount(0);
  await page.goto(AJOUTER_NON_DEBLOQUE);
  await expect(sheet(page).getByText("Tu pourras ajouter tes propres lieux une fois ton voyage débloqué.")).toBeVisible();
  await expect(searchField(page)).toHaveCount(0);
});

test("ajouter: recherche à la demande, résultats jamais sur la carte, nom vide, heure proposée 15:00", async ({ page }) => {
  await page.goto(AJOUTER_DEBLOQUE);
  const marqueurs = await page.locator("[data-part='zone-carte'] [data-stop-id]").count();
  await searchField(page).fill("a");
  await searchField(page).press("Enter");
  await expect(sheet(page).getByRole("alert").filter({ hasText: "Écris au moins 2 lettres." })).toBeVisible();

  await search(page, "aucun lieu");
  await expect(sheet(page).getByText("Aucun lieu trouvé. Essaie un autre nom.")).toBeVisible();

  await search(page, "librairie");
  await expect(results(page).getByRole("radio")).toHaveCount(3);
  await expect(results(page).getByRole("radio", { checked: true })).toHaveCount(0);
  // Jeu simulé : aucune donnée Google, donc aucune mention ; aucun marqueur nouveau (critère 26).
  await expect(sheet(page).getByText("Données de lieux : Google")).toHaveCount(0);
  await expect(page.locator("[data-part='zone-carte'] [data-stop-id]")).toHaveCount(marqueurs);

  await results(page).getByRole("radio").first().click();
  await expect(nameField(page)).toHaveValue("");
  await expect(nameField(page)).not.toHaveAttribute("placeholder");
  await expect(moments(page).getByRole("radio", { name: "Temps libre 15:00 – 18:30" })).toHaveAttribute("aria-checked", "true");

  await sheet(page).getByRole("button", { name: "Voir l'effet" }).click();
  await expect(sheet(page).getByRole("alert").filter({ hasText: "Donne un nom à ce lieu." })).toBeVisible();
  await expect(nameField(page)).toBeFocused();

  // Ni la requête ni un résultat dans l'adresse ou le stockage du navigateur (S2, S3 point 4).
  expect(page.url()).not.toContain("librairie");
  const stockage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stockage).not.toContain("Lieu simulé");
  expect(stockage).not.toContain("librairie");
});

test("ajouter: aperçu, « Appliquer », toast « Lieu ajouté. », « Ajouté par toi. » ; rechargement : l'ajout simulé n'est pas gardé (Q762)", async ({ page }) => {
  await page.goto(AJOUTER_DEBLOQUE);
  const demandes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") demandes.push(request.postData() ?? "");
  });
  await previewAdd(page, "Ma librairie");
  await expect(sheet(page).getByText("15:00 – 16:30")).toBeVisible();
  await expect(sheet(page).getByText("Temps de trajet calculé après l'ajout")).toBeVisible();
  await expect(sheet(page).getByRole("heading", { name: "Ce qui change" })).toBeVisible();

  await sheet(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(page).toHaveURL(JOUR_2_DEBLOQUE);
  await expect(page.getByText("Lieu ajouté.")).toBeVisible();
  const ajoute = listStops(page).filter({ hasText: "Ma librairie" });
  await expect(ajoute).toHaveCount(1);
  // La demande d'ajout ne porte aucun nom ni adresse de résultat (critère 21).
  const corps = demandes.join("\n");
  expect(corps).toContain("Ma librairie");
  expect(corps).not.toContain("Lieu simulé");
  expect(corps).not.toContain("Adresse simulée");

  await ajoute.click();
  await expect(fiche(page).getByText("Ajouté par toi.")).toBeVisible();
  await expect(fiche(page).getByText(/Étape verrouillée/)).toBeVisible();
  await fiche(page).getByRole("button", { name: "Fermer" }).click();

  await page.goto(JOUR_2_DEBLOQUE);
  await expect(listStops(page).filter({ hasText: "Ma librairie" })).toHaveCount(0);
});

test("ajouter: « Annuler » du toast retire le lieu ajouté", async ({ page }) => {
  await page.goto(AJOUTER_DEBLOQUE);
  await previewAdd(page, "Ma librairie");
  await sheet(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(listStops(page).filter({ hasText: "Ma librairie" })).toHaveCount(1);
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(listStops(page).filter({ hasText: "Ma librairie" })).toHaveCount(0);
});

test("ajouter: « Annuler » de l'aperçu et « Retour à la Journée » reviennent à la Journée sans rien changer", async ({ page }) => {
  await page.goto(AJOUTER_DEBLOQUE);
  await previewAdd(page, "Ma librairie");
  await sheet(page).getByRole("button", { name: "Annuler" }).click();
  await expect(page).toHaveURL(JOUR_2_DEBLOQUE);
  await expect(listStops(page).filter({ hasText: "Ma librairie" })).toHaveCount(0);
  await page.goto(`${AJOUTER_DEBLOQUE}?de=99:00&a=18:30`);
  await expect(page).toHaveURL(AJOUTER_DEBLOQUE);
  await sheet(page).getByRole("button", { name: "Retour à la Journée" }).click();
  await expect(page).toHaveURL(JOUR_2_DEBLOQUE);
});

test("ajouter: retour sans application, focus sur l'élément d'origine (F7-PO-8, handover §§ 7 et 11)", async ({ page }) => {
  await page.goto(JOUR_2_DEBLOQUE);
  const entree = sheet(page).getByRole("link", { name: "Ajouter un lieu" });
  await entree.click();
  await expect(addTitle(page)).toBeFocused();
  await sheet(page).getByRole("button", { name: "Retour à la Journée" }).click();
  await expect(page).toHaveURL(JOUR_2_DEBLOQUE);
  await expect(sheet(page).getByRole("link", { name: "Ajouter un lieu" })).toBeFocused();

  // « Annuler » de l'aperçu : même retour.
  await sheet(page).getByRole("link", { name: "Ajouter un lieu" }).click();
  await previewAdd(page, "Ma librairie");
  await sheet(page).getByRole("button", { name: "Annuler" }).click();
  await expect(page).toHaveURL(JOUR_2_DEBLOQUE);
  await expect(sheet(page).getByRole("link", { name: "Ajouter un lieu" })).toBeFocused();
});

test("ajouter: « Ajouter à ma journée » de « Surprends-moi » : « Lieu à ajouter » et nom préremplis par l'idée, aucune recherche avant « Rechercher » (0154 § 6 point 2)", async ({ page }) => {
  await page.goto(JOUR_2_DEBLOQUE);
  await sheet(page).getByRole("button", { name: "Surprends-moi" }).click();
  const lien = sheet(page).getByRole("link", { name: "Ajouter à ma journée" });
  await expect(lien).toHaveAttribute("href", `${AJOUTER_DEBLOQUE}?idee=j2-surprise-circus-lane`);
  // Verdict Sécurité S2 (décision 0155, PR n° 972) : aucune action serveur avant « Rechercher » (en-tête `next-action`),
  // puis une seule, dont le corps ne porte que `tripId`, `day` et `query` égal au champ.
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"] !== undefined) actions.push(request.postData() ?? "");
  });
  await lien.click();
  await expect(addTitle(page)).toBeFocused();
  await expect(searchField(page)).toHaveValue("[Circus Lane]");
  await expect(nameField(page)).toHaveCount(0);
  await searchField(page).focus();
  expect(actions).toEqual([]);
  await searchField(page).press("Enter");
  await expect(sheet(page).locator("[data-part='annonce']")).toHaveText(/résultat/);
  expect(actions).toHaveLength(1);
  expect(JSON.parse(actions[0] ?? "null")).toEqual([{ tripId: "mock_trip_edimbourg_debloque", day: 2, query: "[Circus Lane]" }]);
  await results(page).getByRole("radio").first().click();
  await expect(nameField(page)).toHaveValue("[Circus Lane]");
  await sheet(page).getByRole("button", { name: "Voir l'effet" }).click();
  await expect(sheet(page).getByRole("heading", { level: 2, name: "[Circus Lane]" })).toBeFocused();
  // Verdict Sécurité S2 (décision 0155, PR n° 972) : l'adresse ne porte que l'identifiant de l'idée ; rien dans le stockage.
  expect(new URL(page.url()).search).toBe("?idee=j2-surprise-circus-lane");
  const stockage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stockage).not.toContain("Circus Lane");
  await sheet(page).getByRole("button", { name: "Retour à la Journée" }).click();
  // L'idée est refermée au retour : « Surprends-moi » reprend le focus.
  await expect(sheet(page).getByRole("button", { name: "Surprends-moi" })).toBeFocused();

  // Idée absente du jour : paramètre retiré, écran ordinaire, recherche vide.
  await page.goto(`${AJOUTER_DEBLOQUE}?idee=j4-surprise-dunbars-close`);
  await expect(page).toHaveURL(AJOUTER_DEBLOQUE);
  await expect(searchField(page)).toHaveValue("");
});

test("ajouter: second ajout du même jour sur `mock` : il s'ajoute au premier ; recharger rétablit le jeu simulé (0154 § 3)", async ({ page }) => {
  await page.goto(AJOUTER_DEBLOQUE);
  await previewAdd(page, "Ma librairie");
  await sheet(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(page).toHaveURL(JOUR_2_DEBLOQUE);
  await expect(listStops(page).filter({ hasText: "Ma librairie" })).toHaveCount(1);

  // Navigation dans la page : le premier ajout reste, le temps libre restant est proposé.
  await sheet(page).getByRole("link", { name: "Ajouter un lieu" }).click();
  await expect(addTitle(page)).toBeFocused();
  await search(page, "café");
  await results(page).getByRole("radio").first().click();
  await expect(moments(page).getByRole("radio", { name: "Temps libre 16:30 – 18:30" })).toHaveAttribute("aria-checked", "true");
  await nameField(page).fill("Mon café");
  await sheet(page).getByRole("button", { name: "Voir l'effet" }).click();
  await expect(sheet(page).getByText("16:30 – 18:00")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(page).toHaveURL(JOUR_2_DEBLOQUE);
  await expect(listStops(page).filter({ hasText: "Mon café" })).toHaveCount(1);
  await expect(listStops(page).filter({ hasText: "Ma librairie" })).toHaveCount(1);

  await page.reload();
  await expect(listStops(page).first()).toBeVisible();
  await expect(listStops(page).filter({ hasText: "Ma librairie" })).toHaveCount(0);
  await expect(listStops(page).filter({ hasText: "Mon café" })).toHaveCount(0);
});

test("ajouter: « Choisir » du dîner pas encore choisi : repas présélectionné, aperçu, « Annuler » et « Retour » rendent le focus à « Choisir » ; « Appliquer » remplace le repas (M5d-3)", async ({ page }) => {
  // Jeu de test local de `src/adapters/mock.ts` : Édimbourg débloqué, dîner du J2 (19:00) pas encore choisi.
  const jour2 = "/voyages/mock_trip_edimbourg_repas_libre/jour/2";
  const ajouterDiner = `${jour2}/ajouter?de=19:00&repas=dinner`;
  await page.goto(jour2);
  const choisir = sheet(page).getByRole("link", { name: "Choisir le dîner" });
  await expect(choisir).toHaveText("Choisir");
  await expect(choisir).toHaveAttribute("href", ajouterDiner);
  await choisir.click();
  await expect(page).toHaveURL(ajouterDiner);
  await expect(addTitle(page)).toBeFocused();
  await search(page, "restaurant");
  await results(page).getByRole("radio").first().click();
  await expect(moments(page).getByRole("radio", { name: "Dîner pas encore choisi" })).toHaveAttribute("aria-checked", "true");
  await nameField(page).fill("Mon restaurant");
  await sheet(page).getByRole("button", { name: "Voir l'effet" }).click();
  await expect(sheet(page).getByRole("heading", { level: 2, name: "Mon restaurant" })).toBeFocused();
  await expect(sheet(page).getByText("19:00 – 20:30")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Annuler" }).click();
  await expect(page).toHaveURL(jour2);
  await expect(sheet(page).getByRole("link", { name: "Choisir le dîner" })).toBeFocused();

  await sheet(page).getByRole("link", { name: "Choisir le dîner" }).click();
  await expect(addTitle(page)).toBeFocused();
  await sheet(page).getByRole("button", { name: "Retour à la Journée" }).click();
  await expect(page).toHaveURL(jour2);
  await expect(sheet(page).getByRole("link", { name: "Choisir le dîner" })).toBeFocused();

  // « Appliquer » : le repas devient l'étape ajoutée, « Choisir » disparaît, le focus va sur l'étape.
  await sheet(page).getByRole("link", { name: "Choisir le dîner" }).click();
  await search(page, "restaurant");
  await results(page).getByRole("radio").first().click();
  await nameField(page).fill("Mon restaurant");
  await sheet(page).getByRole("button", { name: "Voir l'effet" }).click();
  await sheet(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(page).toHaveURL(jour2);
  await expect(listStops(page).filter({ hasText: "Mon restaurant" })).toBeFocused();
  await expect(sheet(page).getByRole("link", { name: "Choisir le dîner" })).toHaveCount(0);
});

test("ajouter: après deux ajouts le même jour sur `mock`, « Annuler » retire le second et garde le premier (0154 § 3)", async ({ page }) => {
  await page.goto(AJOUTER_DEBLOQUE);
  await previewAdd(page, "Ma librairie");
  await sheet(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(page).toHaveURL(JOUR_2_DEBLOQUE);
  await sheet(page).getByRole("link", { name: "Ajouter un lieu" }).click();
  await expect(addTitle(page)).toBeFocused();
  await previewAdd(page, "Mon café");
  await sheet(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(listStops(page).filter({ hasText: "Mon café" })).toHaveCount(1);
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(listStops(page).filter({ hasText: "Mon café" })).toHaveCount(0);
  await expect(listStops(page).filter({ hasText: "Ma librairie" })).toHaveCount(1);
});

test("ajouter: jour sans moment libre : « Plus aucun moment libre ce jour-là. », pas de « Voir l'effet »", async ({ page }) => {
  await page.goto("/voyages/mock_trip_edimbourg_debloque/jour/3/ajouter");
  await search(page, "librairie");
  await results(page).getByRole("radio").first().click();
  await expect(sheet(page).getByText("Plus aucun moment libre ce jour-là. Choisis un autre jour, ou remplace une étape.")).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Voir l'effet" })).toHaveCount(0);
});
