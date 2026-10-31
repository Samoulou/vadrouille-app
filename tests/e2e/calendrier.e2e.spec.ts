import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { edimbourgDebloque } from "../../src/mocks/edimbourg";

import { calendrier, ED, ED_OK, evenementsIcs, expectFichierIcs, lienCalendrier, texteIcs } from "./calendrier-helpers";
import { blockGoogle } from "./carte-helpers";
import { openTrip, sheet } from "./sejour-helpers";

/**
 * « Ajouter au calendrier » sur l'adaptateur `mock` (spécification M6 § 4 et § 6.2 ; décision 0157 § 1.6 et § 2.5 ;
 * ticket 1005, M6b) : bouton du Séjour d'un voyage débloqué, téléchargement et contenu du fichier, voyage non débloqué,
 * hors ligne. Le contenu détaillé (échappement, pliage, fuseaux, données Google) est couvert par les tests unitaires de
 * `src/server/calendrier/ics.ts`.
 */

let googleRequests: string[] = [];
test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});
test.afterEach(() => {
  expect(googleRequests).toEqual([]);
});

/**
 * Étapes attendues : journées servies (hors J6 en préparation), hors engagements. Oracle écrit à part, volontairement
 * indépendant du code (la parité entre `entreesDuCalendrier` et `etapesACalendrier` est vérifiée par `ics.test.ts`).
 */
const ETAPES = edimbourgDebloque.days
  .filter((day) => !day.generating)
  .flatMap((day) => day.items.flatMap((item) => (item.type === "stop" && item.stop.commitment === undefined ? [item.stop.name] : [])));

test("calendrier: voyage débloqué, bouton du Séjour, téléchargement d'une entrée par étape", async ({ page }) => {
  await openTrip(page, `/voyages/${ED_OK}`);
  const lien = lienCalendrier(page);
  await expect(lien).toBeVisible();
  await expect(lien).toHaveAttribute("href", calendrier(ED_OK));
  await expect(lien).not.toHaveAttribute("aria-disabled", /.*/);
  const zone = sheet(page).locator("[data-part='calendrier']");
  await expect(zone).toContainText("Un fichier pour ton agenda, avec une entrée par étape. Si ton programme change, ajoute-le à nouveau.");
  await expect(zone).toContainText("Les journées encore en préparation n'y sont pas.");
  const boite = await lien.boundingBox();
  expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(boite?.width ?? 0).toBeGreaterThanOrEqual(44);

  // Le lien télécharge `programme.ics` (Content-Disposition: attachment).
  const [telechargement] = await Promise.all([page.waitForEvent("download"), lien.click()]);
  expect(telechargement.suggestedFilename()).toBe("programme.ics");
  const contenu = await readFile((await telechargement.path()) as string, "utf8");
  expect(contenu.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);

  // Même adresse, lue directement : en-têtes et contenu (critères 3 à 5, 8 et 10).
  const texte = await expectFichierIcs(await page.request.get(calendrier(ED_OK)));
  expect(texte).toContain("\r\nX-WR-CALNAME:Édimbourg · Programme\r\n");
  const evenements = evenementsIcs(texte);
  expect(evenements.map((e) => texteIcs(e.SUMMARY?.[0] ?? ""))).toEqual(ETAPES);
  const par = (nom: string) => evenements.find((e) => texteIcs(e.SUMMARY?.[0] ?? "") === nom);
  expect(par("[Bonne table de New Town]")?.DTSTART).toEqual(["20260830T180000Z"]);
  expect(par("[Petite adresse du Grassmarket]")?.DTSTART).toEqual(["20260829T114500Z"]);
  expect(texteIcs(par("[Bonne table de New Town]")?.DESCRIPTION?.[0] ?? "")).toMatch(/^À réserver\./);
  for (const e of evenements) {
    expect(e.UID?.[0]).toMatch(/^[A-Za-z0-9_-]{22}@vadrouille\.invalid$/);
    expect(e.SEQUENCE).toHaveLength(1);
  }
  // Un second téléchargement garde les mêmes UID (critère 9).
  const second = evenementsIcs(await (await page.request.get(calendrier(ED_OK))).text());
  expect(second.map((e) => e.UID?.[0])).toEqual(evenements.map((e) => e.UID?.[0]));
});

test("calendrier: voyage non débloqué, pas de bouton, et l'adresse du fichier répond 404", async ({ page }) => {
  await openTrip(page, `/voyages/${ED}`);
  await expect(sheet(page).getByRole("heading", { name: "Jour par jour" })).toBeVisible();
  await expect(lienCalendrier(page)).toHaveCount(0);
  for (const id of [ED, "mock_trip_inconnu", "a%2Fb"]) {
    const reponse = await page.request.get(calendrier(id));
    expect(reponse.status(), id).toBe(404);
    expect(await reponse.text(), id).not.toContain("BEGIN:VCALENDAR");
    expect(reponse.headers()["content-disposition"], id).toBeUndefined();
  }
});

test("calendrier: hors ligne, bouton inactif (aria-disabled) et explication ; aucun téléchargement", async ({ page, context }) => {
  await openTrip(page, `/voyages/${ED_OK}`);
  const lien = lienCalendrier(page);
  await expect(lien).toBeVisible();
  await context.setOffline(true);
  const message = "Tu es hors ligne. Ajouter au calendrier demande une connexion.";
  await expect(lien).toHaveAttribute("aria-disabled", "true");
  await expect(lien).toHaveAccessibleDescription(message);
  await expect(sheet(page).getByRole("status").filter({ hasText: message })).toBeVisible();
  let telecharge = false;
  page.on("download", () => {
    telecharge = true;
  });
  // `aria-disabled` : Playwright refuse le clic ordinaire ; le clic forcé vérifie que le lien n'a aucun effet.
  await lien.click({ force: true });
  await lien.focus();
  await page.keyboard.press("Enter");
  await expect(lien).toBeFocused();
  expect(telecharge).toBe(false);
  await context.setOffline(false);
  await expect(lien).not.toHaveAttribute("aria-disabled", /.*/);
  await expect(sheet(page).getByText(message)).toHaveCount(0);
});
