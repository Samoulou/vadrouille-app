import { expect, test as base } from "@playwright/test";

import { field, R1 } from "./creation-helpers";

/**
 * Écran 1 de `api` (décision 0141 § 6.4 et § 10, T21 ; PR 880). Projet `api` : serveur `DATA_ADAPTER=api` du job `db`
 * (`playwright.config.ts`, fichiers `*.api.spec.ts`). Dans le dépôt, `SEUILS_AUTOCOMPLETION_VALIDES` vaut `false` et le
 * crochet `accesReelApi` rend `false` : la page ne monte pas la recherche de ville de `api`. L'e2e ne couvre que cette
 * barrière fermée (comme 0129 § 6 ne couvrait que le repli) : champ texte d'aujourd'hui, aucune liste de suggestions,
 * aucune attribution Google, aucune requête vers une action serveur de recherche. Aucun appel Google.
 */

// Option du projet `api` (`playwright.config.ts`), déclarée comme dans les autres fichiers `*.api.spec.ts`.
const test = base.extend<{ urlMock: string }>({
  urlMock: ["", { option: true }],
});

test.describe("écran 1 api, barrière fermée", () => {
  test("champ des 62 villes, aucune requête vers l'action de recherche", async ({ page }) => {
    const actions: string[] = [];
    page.on("request", (requete) => {
      // Une action serveur part en POST avec l'en-tête `next-action` : aucune ne doit partir de la saisie.
      if (requete.method() === "POST" && requete.headers()["next-action"] !== undefined) actions.push(requete.url());
    });
    await page.goto(R1);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const destination = field(page, "Destination");
    await expect(destination).toBeVisible();
    // Ni combobox, ni aide de la recherche, ni liste.
    await expect(page.getByRole("combobox", { name: "Destination" })).toHaveCount(0);
    await expect(page.getByText("Commence à taper, puis choisis ta ville dans la liste.")).toHaveCount(0);
    await destination.fill("Lisb");
    await destination.fill("Lisbonne");
    await field(page, "Arrivée").focus();
    await expect(destination).toHaveValue("Lisbonne");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByText("Google Maps", { exact: true })).toHaveCount(0);
    expect(actions).toEqual([]);
  });
});
