import { randomBytes } from "node:crypto";

import { expect, test as base } from "@playwright/test";

/**
 * Projet `auth` (spécification B3, B3c point 7 et critère C7, partie « pages » ; B3-TL-8) : serveur construit avec
 * `AUTH_ADAPTER=better-auth`, sur la base du job `db` (`E2E_AUTH_SERVER=1`, `playwright.config.ts`). Sans session, une
 * page de voyage redirige vers l'écran 4 avec sa suite ; l'écran 4 n'affiche pas l'avertissement du mode simulé (C11).
 *
 * Déterminisme : l'en-tête de confiance `x-vercel-forwarded-for` porte une adresse de documentation **unique à
 * l'essai** (préfixe /64 aléatoire dans `2001:db8::/32`), recalculée à chaque essai, nouvelles tentatives comprises.
 * Aucun test ne s'appuie sur le compartiment commun du limiteur (testé en `pnpm test:db`).
 */
const test = base.extend({
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::1` });
  },
});

const VOYAGE = "/voyages/mock_trip_edimbourg";
const AVERTISSEMENT = /Connexion simulée : aucun email n'est envoyé/;
const versConnexion = (suite: string) => `/connexion?suite=${encodeURIComponent(suite)}`;

test.describe("connexion réelle, sans session", () => {
  for (const chemin of [VOYAGE, `${VOYAGE}/jour/2`, `${VOYAGE}/presentation`, "/voyages"]) {
    test(`auth: ${chemin} redirige vers l'écran 4 avec sa suite`, async ({ page }) => {
      const reponse = await page.goto(chemin);
      expect(reponse?.ok()).toBe(true);
      await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === versConnexion(chemin));
      await expect(page.getByRole("textbox", { name: "Ton adresse email" })).toBeVisible();
      await expect(page.getByText(AVERTISSEMENT)).toHaveCount(0);
    });
  }
});
