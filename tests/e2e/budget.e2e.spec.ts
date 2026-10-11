import { expect, test } from "@playwright/test";

import { INITIAL_JS_BUDGET_BYTES, formatInitialJavaScript, measureInitialJavaScript } from "./budget-helpers";
import { blockGoogle } from "./carte-helpers";

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
