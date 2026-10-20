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
import { PaymentEventSchema } from "./billing";
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
    expect(CheckoutRequestSchema.safeParse({ tripId: "mock_trip_edimbourg", method: "twint", requestId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
  });

  it.each([
    ["moyen inconnu", { tripId: "t1", method: "paypal", requestId: "00000000-0000-4000-8000-000000000001" }],
    ["montant envoyé par le navigateur", { tripId: "t1", method: "card", requestId: "00000000-0000-4000-8000-000000000001", amount: 1 }],
    ["tripId vide", { tripId: "", method: "card", requestId: "00000000-0000-4000-8000-000000000001" }],
    ["tripId hors motif", { tripId: "../t1", method: "card", requestId: "00000000-0000-4000-8000-000000000001" }],
    ["requestId absent (B4-PO-8)", { tripId: "t1", method: "card" }],
    ["requestId hors format uuid", { tripId: "t1", method: "card", requestId: "demande-1" }],
  ])("refuse : %s", (_, input) => {
    expect(CheckoutRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe("redirectUrl : chemin de l'application seulement", () => {
  it.each([
    "/voyages/t1/debloquer/paiement-simule/x",
    "/voyages/mock_trip_edimbourg/debloquer?paiement=chk_0123456789abcdef",
    "/voyages/mock_trip_edimbourg/debloquer/confirmation?paiement=a%20b",
  ])("accepte %s", (path) => {
    expect(AppPathSchema.safeParse(path).success).toBe(true);
    expect(CheckoutStartSchema.safeParse({ checkoutId: CHECKOUT_ID, redirectUrl: path }).success).toBe(true);
  });

  it.each([
    "//evil.example",
    "/\\evil",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/ /evil.example",
    "/\u0000/evil.example",
    "/\u007f/evil.example",
    "/voyages\\evil",
    "https://evil.example/",
    "voyages/t1",
    "",
  ])("refuse %j", (path) => {
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

describe("PaymentEventSchema (contrat interne du serveur, B4a point 1)", () => {
  const base = { eventId: "evt_sim_0123456789abcdef0123456789abcdef", type: "checkoutCompleted", livemode: false };

  it("accepte l'événement minimal et l'événement complet", () => {
    expect(PaymentEventSchema.safeParse(base).success).toBe(true);
    const complet = { ...base, checkoutSessionId: "cs_sim_x", checkoutId: "0b6f3c7e-6a1e-4c55-9f2d-3c1a2b4d5e6f", paymentStatus: "paid", amount: 3900, currency: "CHF", createdAt: 1 };
    expect(PaymentEventSchema.safeParse(complet).success).toBe(true);
  });

  it.each([
    ["type inconnu", { ...base, type: "checkout.session.completed" }],
    ["mode absent", { eventId: base.eventId, type: base.type }],
    ["devise en minuscules", { ...base, currency: "chf" }],
    ["montant négatif", { ...base, amount: -1 }],
    ["montant non entier", { ...base, amount: 1.5 }],
    ["statut inconnu", { ...base, paymentStatus: "no_payment_required" }],
    ["champ en plus (objet strict)", { ...base, email: "personne@exemple.test" }],
    ["identifiant vide", { ...base, eventId: "" }],
  ])("refuse : %s", (_, input) => {
    expect(PaymentEventSchema.safeParse(input).success).toBe(false);
  });
});
