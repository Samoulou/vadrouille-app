// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AppPathSchema,
  CheckoutRequestSchema,
  CheckoutStartSchema,
  CheckoutStatusSchema,
  OfferConfigSchema,
  OfferSchema,
  PriceVariantSchema,
} from "./index";
import { CHECKOUT_ID_PATTERN, OFFER_INCLUSIONS, PRICE_VARIANTS, isCheckoutFailure } from "./values";

/** Contrats de paiement (décision 0020 § 1). */

const CHECKOUT_ID = "AAAAAAAAAAAAAAAAAAAAAA";

const offerConfig = {
  amount: 2900,
  currency: "CHF",
  priceVariant: "chf_29",
  methods: ["twint", "card"],
  includes: [...OFFER_INCLUSIONS],
  accessDaysAfterReturn: 30,
} as const;

describe("valeurs", () => {
  it("PriceVariantSchema dérive de PRICE_VARIANTS", () => {
    expect(PriceVariantSchema.options).toEqual([...PRICE_VARIANTS]);
    expect(PriceVariantSchema.safeParse("chf_19").success).toBe(false);
  });

  it("CHECKOUT_ID_PATTERN : 22 caractères base64url", () => {
    expect(CHECKOUT_ID_PATTERN.test(CHECKOUT_ID)).toBe(true);
    expect(CHECKOUT_ID_PATTERN.test("A".repeat(21))).toBe(false);
    expect(CHECKOUT_ID_PATTERN.test("A".repeat(23))).toBe(false);
    expect(CHECKOUT_ID_PATTERN.test(`${"A".repeat(21)}=`)).toBe(false);
  });

  it("isCheckoutFailure", () => {
    expect(["declined", "cancelled", "expired"].every(isCheckoutFailure)).toBe(true);
    expect(["pending", "succeeded", "duplicate"].some(isCheckoutFailure)).toBe(false);
  });
});

describe("OfferSchema", () => {
  it("accepte l'offre de phase 0, avec ou sans replacementLimit", () => {
    expect(OfferConfigSchema.parse(offerConfig)).toEqual(offerConfig);
    expect(OfferSchema.safeParse({ tripId: "t1", ...offerConfig, replacementLimit: 10 }).success).toBe(true);
  });

  it.each([
    ["montant nul", { amount: 0 }],
    ["montant décimal", { amount: 29.5 }],
    ["devise inconnue", { currency: "EUR" }],
    ["variante hors liste", { priceVariant: "chf_39" }],
    ["moyen en double", { methods: ["twint", "twint"] }],
    ["aucun moyen", { methods: [] }],
    ["inclusion en double", { includes: ["access", "access"] }],
    ["inclusion inconnue", { includes: ["premium"] }],
    ["accès au-delà de 365 jours", { accessDaysAfterReturn: 366 }],
    ["champ inconnu", { label: "29 CHF" }],
  ])("refuse : %s", (_, patch) => {
    expect(OfferConfigSchema.safeParse({ ...offerConfig, ...patch }).success).toBe(false);
  });
});

describe("CheckoutRequestSchema", () => {
  it("accepte { tripId, method }", () => {
    expect(CheckoutRequestSchema.safeParse({ tripId: "mock_trip_edimbourg", method: "twint" }).success).toBe(true);
  });

  it.each([
    ["moyen inconnu", { tripId: "t1", method: "paypal" }],
    ["montant envoyé par le navigateur", { tripId: "t1", method: "card", amount: 1 }],
    ["tripId vide", { tripId: "", method: "card" }],
    ["tripId hors motif", { tripId: "../t1", method: "card" }],
  ])("refuse : %s", (_, input) => {
    expect(CheckoutRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe("redirectUrl : chemin de l'application seulement", () => {
  it.each(["/voyages/t1/debloquer/paiement-simule/x"])("accepte %s", (path) => {
    expect(AppPathSchema.safeParse(path).success).toBe(true);
    expect(CheckoutStartSchema.safeParse({ checkoutId: CHECKOUT_ID, redirectUrl: path }).success).toBe(true);
  });

  it.each(["//evil.example", "/\\evil", "https://evil.example/", "voyages/t1", ""])("refuse %s", (path) => {
    expect(AppPathSchema.safeParse(path).success).toBe(false);
  });
});

describe("CheckoutStatusSchema", () => {
  const status = {
    checkoutId: CHECKOUT_ID,
    tripId: "t1",
    method: "card",
    status: "pending",
    priceVariant: "chf_29",
    amount: 2900,
    currency: "CHF",
  };

  it("accepte chaque état", () => {
    for (const code of ["pending", "succeeded", "duplicate", "declined", "cancelled", "expired"]) {
      expect(CheckoutStatusSchema.safeParse({ ...status, status: code }).success).toBe(true);
    }
  });

  it("refuse un état inconnu ou un identifiant mal formé", () => {
    expect(CheckoutStatusSchema.safeParse({ ...status, status: "refunded" }).success).toBe(false);
    expect(CheckoutStatusSchema.safeParse({ ...status, checkoutId: "court" }).success).toBe(false);
  });
});
