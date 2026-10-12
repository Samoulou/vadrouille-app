import { expect, test } from "@playwright/test";

import { INITIAL_JS_BUDGET_BYTES, formatInitialJavaScript, measureInitialJavaScript } from "./budget-helpers";
import { blockGoogle } from "./carte-helpers";
import { sendScope } from "./debloquer-helpers";
import { ROUTE_PREPARATIONS } from "./route-states";
import { ROUTES } from "./routes";

/**
 * Budget du JavaScript initial de la Journée (handover front § 14, décision 0016 § 3.1 règle 5, Q95), sur le
 * build de production, domaines Google bloqués : la carte est dans son état de remplacement et comptée.
 * Le seuil ne se relève pas sans décision écrite (0016 § 3.1) ; F12a réutilise la mesure (0022 § 4).
 */

const JOURNEE = "/voyages/mock_trip_edimbourg/jour/2";

test("budget: JavaScript initial de la Journée", async ({ page }) => {
  const googleRequests = await blockGoogle(page);

  const measure = await measureInitialJavaScript(page, JOURNEE);
  console.log(formatInitialJavaScript(measure));

  expect(measure.scripts.length).toBeGreaterThan(0);
  expect(measure.totalGzipBytes).toBeLessThan(INITIAL_JS_BUDGET_BYTES);
  expect(googleRequests).toEqual([]);
});

/** Attente maximale de l'inactivité du réseau par route (voir `MeasureOptions.idleTimeoutMs`). */
const IDLE_TIMEOUT_MS = 10_000;

/**
 * Même mesure sur chaque route de l'inventaire (F12-PO-4, critère C7, décision 0022 § 4) : seuil strictement
 * sous 200 000 octets sur les entrées `javascript: "seuil"` (R11, R12, R6), mesure journalisée sur les autres.
 * Une route préparée (paiement) est créée dans un contexte à part, pour que son JavaScript ne soit pas déjà
 * dans le cache du navigateur au moment de la mesure ; la page mesurée envoie la portée de la préparation.
 * Une route dont une requête ne se termine jamais est mesurée après `IDLE_TIMEOUT_MS` et annotée ; le test de T4
 * ci-dessus garde l'attente sans échéance.
 */
test.describe("budget: JavaScript initial par route", () => {
  for (const route of ROUTES) {
    test(`${route.id} ${route.path}`, async ({ page, browser, baseURL, locale, timezoneId }) => {
      let path = route.path;
      if (route.prepare) {
        const setup = await browser.newContext({ baseURL, locale, timezoneId });
        const prepared = await ROUTE_PREPARATIONS[route.prepare](await setup.newPage(), baseURL!);
        await setup.close();
        await sendScope(page.context(), baseURL!, prepared.scope);
        path = prepared.path;
      }
      const googleRequests = await blockGoogle(page);

      const measure = await measureInitialJavaScript(page, path, { expectedStatus: route.status, idleTimeoutMs: IDLE_TIMEOUT_MS });
      console.log(`[${route.id}, ${route.budgets.javascript}] ${formatInitialJavaScript(measure)}`);
      if (!measure.networkIdle) {
        test.info().annotations.push({ type: "réseau jamais inactif", description: `${route.id} mesuré après ${IDLE_TIMEOUT_MS} ms` });
      }

      expect(measure.scripts.length).toBeGreaterThan(0);
      const url = new URL(page.url());
      expect(`${url.pathname}${url.search}`, `${route.id} : page redirigée pendant la mesure`).toBe(path);
      const known = route.knownExceedance;
      if (route.budgets.javascript === "seuil" && known) {
        test.info().annotations.push({ type: "dépassement connu", description: `${route.id} : ${known.reason}` });
        expect(measure.totalGzipBytes, `${route.id} : le dépassement ne doit pas augmenter`).toBeLessThanOrEqual(known.javascriptBytes);
        expect(measure.totalGzipBytes, `${route.id} : sous le seuil, retirer knownExceedance de routes.ts`).toBeGreaterThanOrEqual(
          INITIAL_JS_BUDGET_BYTES,
        );
      } else if (route.budgets.javascript === "seuil") {
        expect(measure.totalGzipBytes).toBeLessThan(INITIAL_JS_BUDGET_BYTES);
      }
      expect(googleRequests).toEqual([]);
    });
  }
});
