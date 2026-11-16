import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { AccountExportSchema } from "../../src/contracts/account-export";

import { bouton, deconnecter, exporter, HORS_LIGNE, NOM_EXPORT, openCompte, R_COMPTE, supprimer, titre } from "./compte-helpers";
import { KNOWN_EMAIL } from "./connexion-helpers";
import { expectPath, useScope } from "./debloquer-helpers";
import { openTrips, R17 } from "./mes-voyages-helpers";

/**
 * « Ton compte » sur l'adaptateur `mock` (M9c, ticket 1122 ; spécification M9 § 6.4, critères 1, 2, 3, 7 et 10) : lien
 * depuis « Mes voyages », adresse du compte simulé, export du jeu simulé par le schéma de l'export réel, suppression non
 * proposée, déconnexion, hors ligne. Chaque test a sa portée de simulation (la déconnexion ne touche aucun autre test).
 * Les étapes du code et de la suppression n'existent que sur `api` : `compte-api.api.spec.ts` et les tests unitaires de
 * `AccountScreen`.
 */

test.beforeEach(async ({ context, baseURL }) => {
  await useScope(context, baseURL!);
});

test("compte: lien « Ton compte » de Mes voyages ; adresse, export, déconnexion ; suppression non proposée", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-01T12:00:00+01:00") });
  await openTrips(page);
  const lien = page.getByRole("main").getByRole("link", { name: "Ton compte", exact: true });
  await expect(lien).toHaveAttribute("href", R_COMPTE);
  await lien.click();
  await expectPath(page, R_COMPTE);
  await expect(titre(page)).toBeVisible();
  await expect(page).toHaveTitle("Ton compte · Vadrouille");
  await expect(page.getByText(`Connecté avec ${KNOWN_EMAIL}`, { exact: true })).toBeVisible();
  await expect(exporter(page)).toBeVisible();
  await expect(deconnecter(page)).toBeVisible();
  // `mock` : la suppression n'est pas proposée (critère 10).
  await expect(supprimer(page)).toHaveCount(0);
  await expect(page.getByText("Disponible avec un vrai compte.", { exact: true })).toBeVisible();
  // « Retour » : niveau supérieur, « Mes voyages ».
  await bouton(page, "Retour").click();
  await expectPath(page, R17);
});

test("compte: « Exporter mes données » télécharge le fichier du jeu simulé, valide pour le schéma de l'export", async ({ page }) => {
  await openCompte(page);
  const attente = page.waitForEvent("download");
  await exporter(page).click();
  const telechargement = await attente;
  expect(telechargement.suggestedFilename()).toMatch(NOM_EXPORT);
  const texte = await readFile(await telechargement.path(), "utf8");
  const fichier = AccountExportSchema.parse(JSON.parse(texte));
  expect(fichier.format).toBe("vadrouille-export");
  expect(fichier.account.email).toBe(KNOWN_EMAIL);
  expect(fichier.trips.map((trip) => trip.destination)).toContain("Édimbourg");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Ton fichier est prêt.");
  // Aucune étape de plus : l'écran reste « Ton compte ».
  await expectPath(page, R_COMPTE);
  await expect(titre(page)).toBeVisible();
});

test("compte: « Se déconnecter » mène à l'accueil", async ({ page }) => {
  await openCompte(page);
  await deconnecter(page).click();
  await expectPath(page, "/");
  await expect(page.getByRole("link", { name: "Créer un voyage", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ton compte est supprimé.")).toHaveCount(0);
});

test("compte: hors ligne, bandeau et « Exporter mes données » inactif (aria-disabled) ; aucun téléchargement", async ({ page, context }) => {
  await openCompte(page);
  await context.setOffline(true);
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: HORS_LIGNE })).toBeVisible();
  await expect(exporter(page)).toHaveAttribute("aria-disabled", "true");
  await expect(exporter(page)).toHaveAccessibleDescription(new RegExp(HORS_LIGNE.replaceAll(".", "\\.")));
  let telecharge = false;
  page.on("download", () => {
    telecharge = true;
  });
  // `aria-disabled` : Playwright refuse le clic ordinaire ; le clic forcé vérifie que le bouton n'a aucun effet.
  await exporter(page).click({ force: true });
  await exporter(page).focus();
  await page.keyboard.press("Enter");
  await expect(exporter(page)).toBeFocused();
  expect(telecharge).toBe(false);
  await expect(page.getByText("Ton fichier est prêt.")).toHaveCount(0);
  await context.setOffline(false);
  await expect(exporter(page)).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(page.getByText(HORS_LIGNE)).toHaveCount(0);
});

test("compte: l'accueil annonce « Ton compte est supprimé. » seulement à l'arrivée après une suppression", async ({ page }) => {
  await page.goto("/?compte=supprime");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Ton compte est supprimé.");
  await page.goto("/");
  await expect(page.getByText("Ton compte est supprimé.")).toHaveCount(0);
});
