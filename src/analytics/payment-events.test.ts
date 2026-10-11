// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PRICE_VARIANTS } from "@/contracts/values";

import { AnalyticsEventSchema, type AnalyticsEvent } from "./events";

/** Critère F9a : « analytics: événements de paiement sans donnée personnelle » (décision 0020 § 9). */

const VALID: AnalyticsEvent[] = [
  { name: "paywall_viewed", properties: { price_variant: "chf_29" } },
  { name: "payment_started", properties: { method: "twint", price_variant: "chf_29" } },
  { name: "payment_started", properties: { method: "card", price_variant: "chf_29" } },
  { name: "payment_succeeded", properties: { method: "twint", price_variant: "chf_29" } },
  { name: "payment_failed", properties: { method: "card", price_variant: "chf_29", reason: "declined" } },
  { name: "payment_failed", properties: { method: "twint", price_variant: "chf_29", reason: "cancelled" } },
  { name: "payment_failed", properties: { method: "card", price_variant: "chf_29", reason: "expired" } },
];

describe("analytics: événements de paiement sans donnée personnelle", () => {
  it.each(VALID.map((event) => [event.name, event] as const))("accepte %s", (_name, event) => {
    expect(AnalyticsEventSchema.safeParse(event).success).toBe(true);
  });

  it("price_variant suit PRICE_VARIANTS de @/contracts/values", () => {
    for (const variant of PRICE_VARIANTS) {
      expect(AnalyticsEventSchema.safeParse({ name: "paywall_viewed", properties: { price_variant: variant } }).success).toBe(true);
    }
  });

  it.each([
    ["tripId", { tripId: "mock_trip_edimbourg" }],
    ["checkoutId", { checkoutId: "AAAAAAAAAAAAAAAAAAAAAA" }],
    ["amount", { amount: 2900 }],
    ["destination", { destination: "Lisbonne" }],
    ["email", { email: "personne@example.ch" }],
  ])("refuse une propriété %s", (_key, extra) => {
    for (const event of VALID) {
      expect(AnalyticsEventSchema.safeParse({ ...event, properties: { ...event.properties, ...extra } }).success).toBe(false);
    }
  });

  it.each(["chf_19", "chf_39", "29 CHF", "", "2900"])("refuse un price_variant hors liste : %j", (variant) => {
    expect(AnalyticsEventSchema.safeParse({ name: "paywall_viewed", properties: { price_variant: variant } }).success).toBe(false);
    expect(
      AnalyticsEventSchema.safeParse({ name: "payment_started", properties: { method: "twint", price_variant: variant } }).success,
    ).toBe(false);
  });

  it("paywall_viewed n'a pas de method (F9-PO-16)", () => {
    expect(
      AnalyticsEventSchema.safeParse({ name: "paywall_viewed", properties: { price_variant: "chf_29", method: "twint" } }).success,
    ).toBe(false);
  });

  it("texte libre refusé : moyen, raison", () => {
    expect(AnalyticsEventSchema.safeParse({ name: "payment_started", properties: { method: "paypal", price_variant: "chf_29" } }).success).toBe(false);
    expect(
      AnalyticsEventSchema.safeParse({
        name: "payment_failed",
        properties: { method: "card", price_variant: "chf_29", reason: "carte refusée par la banque" },
      }).success,
    ).toBe(false);
    expect(
      AnalyticsEventSchema.safeParse({ name: "payment_failed", properties: { method: "card", price_variant: "chf_29", reason: "succeeded" } })
        .success,
    ).toBe(false);
  });
});
