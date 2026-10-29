// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { brancherPaiementStripe, debrancherPaiementStripePourTests, PaiementStripeDejaBrancheError, paiementStripe } from "@/adapters/stripe-payment-instance";
import type { PaymentAdapter } from "@/adapters/types";

/**
 * Branchement de l'adaptateur `stripe` (spécification B4, B4c point 2 ; décision 0140 § 5 point 1 ; critère T8), même
 * modèle que le paiement simulé (`tests/unit/debloquer-simule-api.test.ts`) : fabrique branchée au démarrage, construite
 * au premier usage, second branchement refusé, échec fermé sans branchement. Aucune base, aucune clé, aucun réseau.
 */

const TRIP = "3f0b1f0c-5d1e-4e0f-8a0c-1b2c3d4e5f60";
const CTX = { organizationId: "org_b4c", userId: "user_b4c", role: "owner" as const };
const OUVERT = { PAYMENT_ADAPTER: "stripe", DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth", VADROUILLE_ENV: "ci" } as const;

const adaptateurEspion = (): PaymentAdapter => ({
  getOffer: vi.fn(),
  createCheckout: vi.fn(),
  getCheckoutStatus: vi.fn(),
  getEntitlement: vi.fn(async () => ({ unlocked: true })),
});

beforeEach(() => {
  vi.stubEnv("PAYMENT_ADAPTER", OUVERT.PAYMENT_ADAPTER);
  vi.stubEnv("DATA_ADAPTER", OUVERT.DATA_ADAPTER);
  vi.stubEnv("AUTH_ADAPTER", OUVERT.AUTH_ADAPTER);
  vi.stubEnv("VADROUILLE_ENV", OUVERT.VADROUILLE_ENV);
});

afterEach(() => {
  debrancherPaiementStripePourTests();
  vi.unstubAllEnvs();
});

describe("getPaymentAdapter accepte stripe, sans simulateur (B4c point 2)", () => {
  it("rend l'adaptateur branché au démarrage, construit une seule fois ; getPaymentSimulator rend null", () => {
    const espion = adaptateurEspion();
    const fabrique = vi.fn(() => espion);
    brancherPaiementStripe(fabrique);
    expect(fabrique).not.toHaveBeenCalled();
    expect(adapters.getPaymentAdapter()).toBe(espion);
    expect(paiementStripe()).toBe(espion);
    expect(adapters.getPaymentSimulator()).toBeNull();
    expect(fabrique).toHaveBeenCalledTimes(1);
  });

  it("second branchement refusé", () => {
    brancherPaiementStripe(adaptateurEspion);
    expect(() => brancherPaiementStripe(adaptateurEspion)).toThrow(PaiementStripeDejaBrancheError);
  });

  it("non branché, ou fabrique qui lève : provider_error sans aucun droit, rien n'est retenu", async () => {
    const nonBranche = adapters.getPaymentAdapter();
    expect(await nonBranche.createCheckout(CTX, { tripId: TRIP, method: "card", requestId: crypto.randomUUID() })).toEqual({ ok: false, error: { code: "provider_error", retryable: false } });
    expect(await nonBranche.getCheckoutStatus(CTX, "AAAAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, error: { code: "provider_error", retryable: false } });
    expect(await nonBranche.getEntitlement(CTX, TRIP)).toEqual({ unlocked: false });
    let appels = 0;
    brancherPaiementStripe(() => {
      appels += 1;
      throw new Error("paiement Stripe indisponible");
    });
    expect(await adapters.getPaymentAdapter().getEntitlement(CTX, TRIP)).toEqual({ unlocked: false });
    adapters.getPaymentAdapter();
    expect(appels).toBe(2);
  });

  it("garde fermée (cible de production) : getPaymentAdapter lève sans construire", () => {
    const fabrique = vi.fn(adaptateurEspion);
    brancherPaiementStripe(fabrique);
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    expect(() => adapters.getPaymentAdapter()).toThrow(/paiement indisponible/);
    expect(adapters.getPaymentSimulator()).toBeNull();
    expect(fabrique).not.toHaveBeenCalled();
  });
});
