import { expect, test } from "@playwright/test";

import { CHATEAU, ED_OK, INSTANTS, R16, choice, group, openReview, scopeAt } from "./apres-voyage-helpers";
import { openToday, setClock as setTodayClock } from "./aujourdhui-helpers";
import { openTrips, setClock } from "./mes-voyages-helpers";

/**
 * Écran 16 « Après le voyage » sur `mock` (M8a, ticket 1062 ; spécification M8 § 6.3, critères 1, 3, 7, 11 et 13) :
 * accès calculé par le serveur à l'horloge de la portée, mémoire de l'onglet (choix gardé à la navigation côté client,
 * perdu au rechargement, mention de démonstration), liens « Donner ton avis » de « Mes voyages » et de l'écran 15.
 */

test.use({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/London" });

test("apres-voyage: le 2026-09-02 à 23:59 (Londres), seulement « Ton voyage n'est pas terminé… » ; à 00:00 le 3, écran complet", async ({ page, baseURL }) => {
  const scope = await scopeAt(page, baseURL ?? "", INSTANTS.veilleDernierJour);
  await openReview(page);
  await expect(page.getByRole("heading", { level: 1, name: "Après le voyage" })).toBeVisible();
  await expect(page.getByText("Ton voyage n'est pas terminé. Tu pourras donner ton avis à partir du jeudi 3 septembre.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir le séjour", exact: true })).toHaveAttribute("href", `/voyages/${ED_OK}`);
  await expect(page.getByRole("group")).toHaveCount(0);

  await scope.control({ action: "reset", now: INSTANTS.dernierJour });
  await openReview(page);
  await expect(page.getByRole("heading", { level: 1, name: "Ton avis sur Édimbourg" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Tes étapes" })).toBeVisible();
  await expect(group(page, CHATEAU)).toBeVisible();
  await expect(page.getByText("Démonstration : tes avis ne sont pas conservés après un rechargement de la page.")).toBeVisible();
});

test("apres-voyage: mock : le choix est gardé à la navigation côté client, perdu au rechargement ; changer, effacer", async ({ page, baseURL }) => {
  await scopeAt(page, baseURL ?? "", INSTANTS.dernierJourModifiable);
  await openReview(page);
  await choice(page, CHATEAU, "J'ai aimé").click();
  await expect(choice(page, CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "true");
  await choice(page, CHATEAU, "Pas pour moi").click();
  await expect(choice(page, CHATEAU, "Pas pour moi")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "false");

  // Navigation côté client vers le Séjour et retour : la mémoire de l'onglet garde le choix.
  await page.getByRole("link", { name: "Retour", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === `/voyages/${ED_OK}`);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === R16);
  await expect(choice(page, CHATEAU, "Pas pour moi")).toHaveAttribute("aria-pressed", "true");

  // Toucher le choix actif l'efface.
  await choice(page, CHATEAU, "Pas pour moi").click();
  await expect(choice(page, CHATEAU, "Pas pour moi")).toHaveAttribute("aria-pressed", "false");
  await choice(page, CHATEAU, "Pas fait").click();
  await expect(choice(page, CHATEAU, "Pas fait")).toHaveAttribute("aria-pressed", "true");

  // Rechargement : démonstration, rien n'est conservé ; rien dans l'adresse ni le stockage du navigateur (critère 9).
  await page.reload();
  for (const bouton of await group(page, CHATEAU).getByRole("button").all()) await expect(bouton).toHaveAttribute("aria-pressed", "false");
  expect(decodeURIComponent(page.url())).not.toContain("Château");
  const stockage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stockage).not.toContain("Château");
});

test("apres-voyage: le 2026-10-04 (Londres), lecture seule : texte du § 7, aucun bouton d'écriture", async ({ page, baseURL }) => {
  await scopeAt(page, baseURL ?? "", INSTANTS.lectureSeule);
  await openReview(page);
  await expect(page.getByRole("heading", { level: 1, name: "Ton avis sur Édimbourg" })).toBeVisible();
  await expect(page.getByText("Ton voyage est terminé depuis plus de 30 jours. Tes avis restent visibles, mais ne se modifient plus.")).toBeVisible();
  await expect(page.getByRole("group")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});

test("apres-voyage: voyage non débloqué, 404", async ({ page, baseURL }) => {
  await scopeAt(page, baseURL ?? "", INSTANTS.dernierJour);
  const response = await page.goto("/voyages/mock_trip_edimbourg/retour");
  expect(response?.status()).toBe(404);
});

test("apres-voyage: « Donner ton avis » dans Mes voyages à partir du dernier jour, jamais avant (critère 11)", async ({ page }) => {
  await setClock(page, "2026-09-02T12:00:00+01:00");
  await openTrips(page);
  await expect(page.locator("[data-part='avis']")).toHaveCount(0);

  await page.clock.setSystemTime(new Date("2026-09-03T12:00:00+01:00"));
  await page.reload();
  await openTrips(page);
  const lien = page.getByRole("link", { name: "Donner ton avis (Édimbourg)", exact: true });
  await expect(lien).toHaveCount(1);
  await expect(lien).toHaveAttribute("href", R16);
});

test("apres-voyage: écran 15 à l'état « terminé » : « Donner ton avis » vers l'écran 16 (critère 11)", async ({ page }) => {
  await setTodayClock(page, "2026-09-04T12:00:00+01:00");
  await openToday(page, `/voyages/${ED_OK}/aujourdhui`);
  await expect(page.getByRole("link", { name: "Donner ton avis", exact: true })).toHaveAttribute("href", R16);
});
