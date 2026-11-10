import { expect, type Page } from "@playwright/test";

import { sheet } from "./sejour-helpers";

/**
 * « Ajouter un lieu » (tâche M5d-2, ticket 961 ; spécification M5 § 6), adaptateur `mock` : recherche simulée
 * (`src/adapters/mock-lieux.ts` : « Lieu simulé 1 » à « Lieu simulé 3 », aucun résultat si la requête contient « aucun »),
 * jour 2 d'Édimbourg, temps libre 15:00 – 18:30.
 */
export const JOUR_2_DEBLOQUE = "/voyages/mock_trip_edimbourg_debloque/jour/2";
export const AJOUTER_DEBLOQUE = `${JOUR_2_DEBLOQUE}/ajouter`;
export const AJOUTER_NON_DEBLOQUE = "/voyages/mock_trip_edimbourg/jour/2/ajouter";

export const addTitle = (page: Page) => sheet(page).getByRole("heading", { level: 1, name: "Ajouter un lieu" });
export const searchField = (page: Page) => sheet(page).getByRole("searchbox", { name: "Lieu à ajouter" });
export const results = (page: Page) => sheet(page).getByRole("radiogroup", { name: "Résultats" });
export const nameField = (page: Page) => sheet(page).getByRole("textbox", { name: "Nom dans ton programme" });
export const moments = (page: Page) => sheet(page).getByRole("radiogroup", { name: "Quel moment ?" });

/** Recherche `texte` puis attend l'annonce du nombre de résultats (ou de l'absence de résultat). */
export async function search(page: Page, texte: string) {
  await searchField(page).fill(texte);
  await searchField(page).press("Enter");
  await expect(sheet(page).locator("[data-part='annonce']")).toHaveText(/résultat|Aucun lieu trouvé/);
}

/** Recherche, choisit le premier résultat, saisit `nom` et demande l'effet ; l'aperçu a le focus. */
export async function previewAdd(page: Page, nom: string) {
  await search(page, "librairie");
  await results(page).getByRole("radio").first().click();
  await nameField(page).fill(nom);
  await sheet(page).getByRole("button", { name: "Voir l'effet" }).click();
  await expect(sheet(page).getByRole("heading", { level: 2, name: nom })).toBeFocused();
}
