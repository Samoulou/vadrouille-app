// @vitest-environment node
import { describe, expect, it } from "vitest";

import { OfferConfigSchema, OFFER_INCLUSIONS } from "@/contracts";

import { OFFER_CONFIG } from "./offer";

describe("configuration de l'offre (décision 0020 § 4)", () => {
  it("passe le schéma strict", () => {
    expect(OfferConfigSchema.parse(OFFER_CONFIG)).toEqual(OFFER_CONFIG);
  });

  it("reprend Q2 et le cadrage § 4 : 29 CHF, chf_29, 7 inclusions dans l'ordre, accès 30 jours, sans plafond de remplacements", () => {
    expect(OFFER_CONFIG).toEqual({
      amount: 2900,
      currency: "CHF",
      priceVariant: "chf_29",
      methods: ["twint", "card"],
      includes: [...OFFER_INCLUSIONS],
      accessDaysAfterReturn: 30,
    });
    expect(OFFER_CONFIG.replacementLimit).toBeUndefined();
  });
});
