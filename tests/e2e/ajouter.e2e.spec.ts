import { expect, test } from "@playwright/test";

import { AJOUTER_DEBLOQUE, AJOUTER_NON_DEBLOQUE, JOUR_2_DEBLOQUE, addTitle, moments, nameField, previewAdd, results, search, searchField } from "./ajouter-helpers";
import { fiche, listStops, sheet } from "./sejour-helpers";

/**
 * « Ajouter un lieu », adaptateur `mock` (tâche M5d-2, ticket 961 ; spécification M5 § 6, critères 19, 21, 22, 23, 25 et
 * 26 ; F7, F7-PO-1 et F7-PO-8) : entrée depuis la Journée, recherche simulée, nom toujours vide, moment proposé, aperçu,
 * « Appliquer », toast « Lieu ajouté. » et « Annuler », mention « Ajouté par toi. » sur la fiche. Sur `mock`, l'ajout reste
 * en mémoire de la page (Q762) ; rien de la recherche n'atteint l'adresse ni le stockage du navigateur.
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
