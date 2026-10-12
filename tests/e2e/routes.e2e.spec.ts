import { expect, test } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import { ROUTE_STATES } from "./route-states";
import { DEV_ROUTES, ROUTES } from "./routes";

/**
 * Inventaire des routes (F12-PO-13, décision 0022 § 3) : chaque état nommé d'une entrée s'atteint par son action
 * depuis l'adresse de l'entrée. Le balayage d'accessibilité de F12d s'appuie sur ces actions.
 */

for (const route of [...ROUTES, ...DEV_ROUTES]) {
  for (const state of route.states) {
    test(`inventaire: ${route.id} ${state}`, async ({ page }) => {
      const googleRequests = await blockGoogle(page);
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await ROUTE_STATES[state](page);
      expect(googleRequests).toEqual([]);
    });
  }
}
