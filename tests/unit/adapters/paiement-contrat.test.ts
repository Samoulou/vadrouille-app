// @vitest-environment node
import { describe } from "vitest";

import { createMockTripAdapter } from "@/adapters/mock";
import { createMockPaymentAdapter } from "@/adapters/mock-payment";
import { OFFER_INCLUSIONS, type OfferConfig } from "@/contracts";
import { EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { decrireContratPaiement } from "../../support/payment-contract";

/** Suite de contrat paiement (spécification B4, critère A18) sur l'adaptateur `mock`, sans délai de confirmation. */

const OFFRE: OfferConfig = {
  amount: 3900,
  currency: "CHF",
  priceVariant: "chf_29",
  methods: ["twint", "card"],
  includes: [...OFFER_INCLUSIONS],
  accessDaysAfterReturn: 30,
};
const DUREE_VIE = 30 * 60_000;

describe("adaptateurs: mock et simulated passent la même suite de contrat paiement", () => {
  decrireContratPaiement("mock", {
    offre: OFFRE,
    dureeVieMs: DUREE_VIE,
    async nouveau() {
      let t = Date.UTC(2026, 7, 1, 10);
      const adapter = createMockPaymentAdapter({
        offer: OFFRE,
        trips: createMockTripAdapter(),
        now: () => t,
        store: { checkouts: new Map(), entitlements: new Map(), confirmationDelayMs: 0 },
        checkoutTtlMs: DUREE_VIE,
        confirmationDelayMs: 0,
        simulationPath: (tripId, checkoutId) => `/voyages/${tripId}/debloquer/paiement-simule/${checkoutId}`,
      });
      return {
        adapter,
        ctx: { organizationId: MOCK_ORGANIZATION_ID, userId: "user_test", role: "owner" },
        tripId: EDIMBOURG_TRIP_ID,
        autre: { organizationId: "mock_org_autre", userId: "user_autre", role: "owner" },
        avancer: (ms) => {
          t += ms;
        },
      };
    },
  });
});
