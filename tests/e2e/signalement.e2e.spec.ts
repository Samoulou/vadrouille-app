import { expect, test } from "@playwright/test";

import { fiche } from "./sejour-helpers";
import { FICHE_JARDIN_DEBLOQUE, FICHE_JARDIN_NON_DEBLOQUE, JARDIN, openReportSheet, reasons, reportButton, reportSheet } from "./signalement-helpers";

/**
 * Signaler une erreur sur une étape, adaptateur `mock` (tâche M5c, ticket 904 ; spécification M5 § 5, critères 12, 13 et
 * 18) : cinq motifs fermés sans champ de texte, envoi, confirmation « Merci, c'est noté. » et focus rendu au bouton ; pour
 * `closed` sur un voyage débloqué, « Remplacer cette étape » mène à l'écran 14 ; le programme ne change pas.
 */

test("signalement: motifs fermés, aucun texte ; motif closed propose Remplacer (voyage débloqué)", async ({ page }) => {
  await openReportSheet(page, FICHE_JARDIN_DEBLOQUE);
  await expect(reasons(page).getByRole("radio")).toHaveText([
    "Fermé ou n'existe plus",
    "Horaires faux",
    "Mauvais lieu ou mauvaise adresse",
    "Prix faux",
    "Autre erreur",
  ]);
  await expect(reportSheet(page).locator("textarea, input[type='text'], [contenteditable]")).toHaveCount(0);
  await reasons(page).getByRole("radio", { name: "Fermé ou n'existe plus" }).click();
  await reportSheet(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(reportSheet(page)).toHaveCount(0);
  await expect(fiche(page).getByRole("status").filter({ hasText: "Merci, c'est noté." })).toBeVisible();
  await expect(reportButton(page)).toBeFocused();
  const remplacer = fiche(page).getByRole("link", { name: "Remplacer cette étape" });
  await expect(remplacer).toHaveAttribute("href", new RegExp(`/jour/2/remplacer/${JARDIN}$`));
  await remplacer.click();
  await expect(page).toHaveURL(new RegExp(`/jour/2/remplacer/${JARDIN}$`));
});

test("signalement: voyage non débloqué : confirmation sans « Remplacer » ; Annuler ferme sans rien envoyer", async ({ page }) => {
  await openReportSheet(page, FICHE_JARDIN_NON_DEBLOQUE);
  await reportSheet(page).getByRole("button", { name: "Annuler" }).click();
  await expect(reportSheet(page)).toHaveCount(0);
  await expect(reportButton(page)).toBeFocused();
  await expect(fiche(page).getByText("Merci, c'est noté.")).toHaveCount(0);
  await reportButton(page).click();
  await reasons(page).getByRole("radio", { name: "Fermé ou n'existe plus" }).click();
  await reportSheet(page).getByRole("button", { name: "Envoyer" }).click();
  await expect(fiche(page).getByRole("status").filter({ hasText: "Merci, c'est noté." })).toBeVisible();
  await expect(fiche(page).getByRole("link", { name: "Remplacer cette étape" })).toHaveCount(0);
});
