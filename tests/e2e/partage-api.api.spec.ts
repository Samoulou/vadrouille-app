import { randomBytes } from "node:crypto";

import { expect, test as base } from "@playwright/test";

import { JETON_PARTAGE_REVERROUILLE, JETON_PARTAGE_VALIDE } from "../support/bout-en-bout-api";

/**
 * Vue partagée sur l'adaptateur `api` (ticket 1013, M6a ; spécification M6 § 3.3 ; décisions 0157 § 2.1 et 0158 § 3 et
 * § 4.2). Projet `api` : lecture réelle sur la base du job `db`, liens écrits par `tests/db/donnees-bout-en-bout.test.ts`
 * (`tests/support/bout-en-bout-api.ts`), visiteur **sans session**. Le voyage reverrouillé (lien toujours `valid`, droit
 * `tripUnlocked` retiré) répond la même page 404 que le jeton inconnu, le jeton d'une autre forme et le jeton signé du site
 * d'essai ; la vue valide montre le voyage sans carte (Q814). Lecture seule : rien n'est écrit, sauf les lignes du
 * limiteur `partage-vue`. Aucune trace (cookies).
 */
const test = base.extend({
  // Adresse IP de confiance unique à chaque essai (limite `partage-vue` : 60 par minute et par adresse IP).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::6a` });
  },
});

test.describe.configure({ mode: "serial" });

const RP = (jeton: string) => `/p/${jeton}`;
const INVALIDE = "Ce lien de partage n'est pas valide.";

test("partage: api, vue d'un lien valide sans carte ; voyage reverrouillé, jeton inconnu et autres formes : même 404", async ({ page, request }) => {
  // Lien valide : le voyage, en lecture seule, avec l'état de remplacement de la carte.
  const valide = await page.goto(RP(JETON_PARTAGE_VALIDE));
  expect(valide?.status()).toBe(200);
  await expect(page).toHaveTitle("Lyon · Programme partagé");
  await expect(page.getByText("[Vieille ville]").first()).toBeVisible();
  const entetes = valide?.headers() ?? {};
  expect(entetes["cache-control"]).toMatch(/no-store/);
  expect(entetes["x-robots-tag"]).toBe("noindex, nofollow");
  // L'en-tête interne « compté » n'est jamais renvoyé.
  expect(entetes["x-vadrouille-partage-compte"]).toBeUndefined();
  expect(await page.content()).not.toContain("test_place_m6a");
  // Sans carte (Q814) : aucun script de carte chargé.
  expect(await page.locator("script[src*='maps']").count()).toBe(0);

  // Même 404 pour le voyage reverrouillé (0158 § 4.2), le jeton inconnu, le jeton signé et une autre forme.
  const corps: string[] = [];
  for (const jeton of [JETON_PARTAGE_REVERROUILLE, "Q".repeat(43), "v1.eyJ0IjoiMSJ9.c2lnbmF0dXJl", "court"]) {
    const reponse = await page.goto(RP(jeton));
    expect(reponse?.status(), jeton).toBe(404);
    await expect(page.getByText(INVALIDE)).toBeVisible();
    expect(await page.content(), jeton).not.toContain("Marseille");
    expect(reponse?.headers()["x-vadrouille-partage-compte"], jeton).toBeUndefined();
    corps.push((await page.getByRole("main").innerText()).trim());
  }
  expect(new Set(corps).size).toBe(1);

  // Journée du voyage reverrouillé : même 404.
  expect((await page.goto(`${RP(JETON_PARTAGE_REVERROUILLE)}/jour/1`))?.status()).toBe(404);

  // Préchargement du routeur : 204 sans corps, sans lecture.
  const prechargement = await request.get(RP(JETON_PARTAGE_VALIDE), { headers: { "next-router-prefetch": "1" } });
  expect(prechargement.status()).toBe(204);
  expect(await prechargement.text()).toBe("");
  expect(prechargement.headers()["cache-control"]).toBe("private, no-store");
});
