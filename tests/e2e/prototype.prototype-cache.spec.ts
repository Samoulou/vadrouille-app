import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { PROTOTYPE_TRIP, PROTOTYPE_URL, relectures } from "./prototype-helpers";

/**
 * « Prototype sans cache » (spécification P0, P0b1 ; décision 0032 § A6.6), dans le projet Playwright
 * `prototype-cache` de `playwright.config.ts` : sans parallélisme, lancé après `e2e` et `a11y`, et dans
 * `pnpm verify` par une invocation à part (`pnpm test:prototype-cache`, `--no-deps`). Aucun autre test ne charge
 * de page du serveur prototype pendant ce test : le compteur du relecteur simulé ne bouge que par les deux
 * chargements ci-dessous.
 *
 * Les chargements passent par `request` et non par une page : un navigateur précharge les liens visibles
 * (`next/link`) après le chargement, et ces requêtes de rendu pourraient relire des journées à un moment
 * quelconque entre deux lectures du compteur.
 */

const JOURNEE = `${PROTOTYPE_URL}/voyages/${PROTOTYPE_TRIP}/jour/1`;

/** Journées du programme de test : la mise en page du voyage les relit toutes à chaque chargement (`getTrip`). */
const JOURS = (
  JSON.parse(readFileSync(join(__dirname, "..", "..", "prototype", "programmes-test", `${PROTOTYPE_TRIP}.json`), "utf8")) as {
    trip: { days: unknown[] };
  }
).trip.days.length;

test("prototype sans cache : deux chargements de la Journée relisent autant de journées chacun", async ({ request }) => {
  const avant = await relectures(request);
  const premiere = await request.get(JOURNEE);
  expect(premiere.status()).toBe(200);
  const apresPremier = await relectures(request);
  const seconde = await request.get(JOURNEE);
  expect(seconde.status()).toBe(200);
  const apresSecond = await relectures(request);

  // Chaque chargement relit au moins toutes les journées du programme ; un cache laisserait le second delta à
  // zéro, ou plus petit que le premier s'il ne servait qu'une partie des journées.
  expect(JOURS).toBeGreaterThanOrEqual(1);
  const premierDelta = apresPremier - avant;
  expect(premierDelta).toBeGreaterThanOrEqual(JOURS);
  expect(apresSecond - apresPremier).toBe(premierDelta);

  for (const response of [premiere, seconde]) {
    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
    expect(cacheControl).not.toMatch(/public|s-maxage|stale-while-revalidate/);
  }
});
