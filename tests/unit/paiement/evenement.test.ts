// @vitest-environment node
import { describe, expect, it } from "vitest";

import { analyserEvenement } from "@/server/payment/evenement";

/** Analyse d'un événement du prestataire en `PaymentEvent` (spécification B4, B4a point 1). */

const CHECKOUT = "0b6f3c7e-6a1e-4c55-9f2d-3c1a2b4d5e6f";
const session = (type: string, objet: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: "evt_sim_0123456789abcdef0123456789abcdef",
  type,
  livemode: false,
  created: 1_800_000_000,
  data: { object: { id: "cs_sim_AAAAAAAAAAAAAAAAAAAAAA", payment_status: "paid", amount_total: 900, currency: "chf", metadata: { checkoutId: CHECKOUT }, ...objet } },
  ...extra,
});

describe("paiement: analyse des événements", () => {
  it("session payée : tous les champs lus, devise en majuscules", () => {
    expect(analyserEvenement(session("checkout.session.completed"))).toEqual({
      eventId: "evt_sim_0123456789abcdef0123456789abcdef",
      type: "checkoutCompleted",
      livemode: false,
      createdAt: 1_800_000_000,
      checkoutSessionId: "cs_sim_AAAAAAAAAAAAAAAAAAAAAA",
      paymentStatus: "paid",
      amount: 900,
      currency: "CHF",
      checkoutId: CHECKOUT,
    });
  });

  it.each([
    ["checkout.session.completed", "checkoutCompleted"],
    ["checkout.session.async_payment_succeeded", "asyncPaymentSucceeded"],
    ["checkout.session.async_payment_failed", "asyncPaymentFailed"],
    ["checkout.session.expired", "checkoutExpired"],
    ["charge.refunded", "refund"],
    ["refund.created", "refund"],
    ["charge.dispute.created", "dispute"],
    ["customer.created", "other"],
    ["checkout.session.inconnu", "other"],
  ])("%s → %s", (type, attendu) => {
    expect(analyserEvenement(session(type))?.type).toBe(attendu);
  });

  it("statuts de paiement : `unpaid`, `no_payment_required` ; statut inconnu absent, jamais inventé", () => {
    expect(analyserEvenement(session("checkout.session.completed", { payment_status: "unpaid" }))?.paymentStatus).toBe("unpaid");
    expect(analyserEvenement(session("checkout.session.completed", { payment_status: "no_payment_required" }))?.paymentStatus).toBe("noPaymentRequired");
    const inconnu = analyserEvenement(session("checkout.session.completed", { payment_status: "PAID" }));
    expect(inconnu).not.toBeNull();
    expect(inconnu).not.toHaveProperty("paymentStatus");
  });

  it("champs absents ou mal typés : absents du résultat ; aucune donnée de session lue hors `checkout.session.*`", () => {
    const vide = analyserEvenement({ id: "evt_sim_0123456789abcdef0123456789abcdef", type: "checkout.session.expired", livemode: true });
    expect(vide).toEqual({ eventId: "evt_sim_0123456789abcdef0123456789abcdef", type: "checkoutExpired", livemode: true });
    const mal = analyserEvenement(session("checkout.session.completed", { amount_total: -1, currency: "chfr", metadata: { checkoutId: 3 }, id: 4 }, { created: "x" }));
    for (const champ of ["amount", "currency", "checkoutId", "checkoutSessionId", "createdAt"]) expect(mal).not.toHaveProperty(champ);
    const remboursement = analyserEvenement(session("charge.refunded"));
    for (const champ of ["amount", "currency", "checkoutId", "checkoutSessionId", "paymentStatus"]) expect(remboursement).not.toHaveProperty(champ);
  });

  it("non analysable → `null` (identifiant, type ou mode absent ou mal typé, non-objet)", () => {
    for (const brut of [null, [], "x", 1, {}, { id: "evt_1", livemode: false }, { type: "x", livemode: false }, { id: "evt_1", type: "x" }, { id: "evt_1", type: "x", livemode: "false" }, { id: "", type: "x", livemode: false }]) {
      expect(analyserEvenement(brut)).toBeNull();
    }
    // Un `checkoutId` qui n'est pas un uuid reste analysable : il est refusé par les contrôles du webhook (`checkout_mismatch`).
    expect(analyserEvenement(session("checkout.session.completed", { metadata: { checkoutId: "pas-un-uuid" } }))?.checkoutId).toBe("pas-un-uuid");
  });

  it("aucune donnée de la personne n'est reprise (`customer_details`, e-mail)", () => {
    const resultat = analyserEvenement(session("checkout.session.completed", { customer_details: { email: "personne@exemple.test" }, customer_email: "personne@exemple.test" }));
    expect(JSON.stringify(resultat)).not.toContain("exemple.test");
  });
});
