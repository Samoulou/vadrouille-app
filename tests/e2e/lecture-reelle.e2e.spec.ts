import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { expect, test } from "@playwright/test";

import { PROTOTYPE_PORT_OFFSET } from "../../scripts/e2e-port.mjs";
import { serverLogPath } from "../../scripts/e2e-server-log.mjs";

import { blockGoogle } from "./carte-helpers";
import { PROTOTYPE_TRIP, PROTOTYPE_URL } from "./prototype-helpers";

/**
 * Décisions 0074 et 0079 (P0r4) sur le build de production : troisième serveur de `playwright.config.ts`, adaptateur `prototype` sans
 * dossier de programmes. `instrumentation.ts` y branche la barrière de lecture des programmes réels (chargement de
 * `next/headers`, `server-only` et de la garde dans la couche d'instrumentation) ; la garde du mode réel est fermée
 * (`CI=true`, aucune base) : « Mes voyages » est vide, un voyage est introuvable, aucune connexion n'est tentée (sans
 * base configurée, une tentative rendrait l'état d'erreur, pas une liste vide), aucun appel Google.
 */

/** Port du troisième serveur : celui du serveur prototype, décalé encore de `PROTOTYPE_PORT_OFFSET`. */
const PORT = Number(new URL(PROTOTYPE_URL).port) + PROTOTYPE_PORT_OFFSET;

test.use({ baseURL: `http://127.0.0.1:${PORT}` });

test("p0: lecture sans barrière : refus et aucun appel Routes — « Mes voyages » vide, voyage et Journée introuvables, branchement sans échec", async ({ page }) => {
  const google = await blockGoogle(page);
  const reponse = await page.goto("/voyages");
  expect(reponse?.status()).toBe(200);
  // Page dynamique (`force-dynamic`, cookie lu) : jamais gardée par un cache partagé.
  expect(reponse?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(`a[href^="/voyages/${PROTOTYPE_TRIP}"]`)).toHaveCount(0);
  await expect(page.locator('a[href^="/voyages/proto_"]')).toHaveCount(0);

  const introuvable = await page.goto(`/voyages/${PROTOTYPE_TRIP}`);
  expect(introuvable?.status()).toBe(404);
  // Journée (relecture Routes, P0r4) : sans barrière, aucune lecture, donc aucune relecture ni position servie.
  const journee = await page.goto(`/voyages/${PROTOTYPE_TRIP}/jour/1`);
  expect(journee?.status()).toBe(404);
  expect(google).toEqual([]);

  const journal = readFileSync(serverLogPath({ port: PORT, tmpDir: tmpdir() }), "utf8");
  expect(journal).not.toContain("p0.read_unavailable");
  expect(journal).not.toContain("config_invalid");
});
