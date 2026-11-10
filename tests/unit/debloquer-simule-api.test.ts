// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { brancherLectureVoyages, debrancherLectureVoyagesPourTests } from "@/adapters/api-instance";
import { mockTripAdapter } from "@/adapters/mock";
import {
  brancherPaiementSimule,
  debrancherPaiementSimulePourTests,
  PaiementSimuleDejaBrancheError,
  paiementSimule,
} from "@/adapters/simulated-payment-instance";
import type { PaymentAdapter, PaymentSimulator, TripAdapter } from "@/adapters/types";
import { ok } from "@/contracts";
import { getCheckoutStatus, simulateCheckoutOutcome, startCheckout } from "@/server/actions/paiement";

const session = vi.hoisted(() => ({ value: { organizationId: "org_b4b", userId: "user_b4b", role: "owner" as const } as unknown }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return {
    ...actual,
    getRequestContext: vi.fn(async () => {
      if (session.value === null) throw new actual.SessionRequiseError();
      return session.value;
    }),
  };
});

/**
 * Branchement des écrans du déblocage sur l'adaptateur `simulated` (spécification B4, B4b points 1 et 3 ; critères B7 et
 * B8 côté actions ; amendement B4-TL-14 de la décision 0020 § 2.3 et § 3). Garde ouverte : `NODE_ENV=test`,
 * `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth`, `VADROUILLE_ENV=ci`, webhook simulé ouvert. Le paiement en base est
 * éprouvé par `pnpm test:db` (`tests/db/paiement.test.ts`) et le bout en bout par le projet `api`
 * (`tests/e2e/debloquer-api.api.spec.ts`).
 */

const TRIP = "0b4b0000-0000-4000-8000-000000000001";
const CHECKOUT = "AAAAAAAAAAAAAAAAAAAAAA";

function ouvrirGarde() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VADROUILLE_DEMO_PAYMENT", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", "ci");
  vi.stubEnv("DATA_ADAPTER", "api");
  vi.stubEnv("AUTH_ADAPTER", "better-auth");
  vi.stubEnv("PAYMENT_ADAPTER", "simulated");
  vi.stubEnv("SIMULATED_WEBHOOK_ENABLED", "true");
}

/** Adaptateur `simulated` espion : chaque méthode rend une valeur fixe. */
function adaptateurEspion() {
  const statut = { checkoutId: CHECKOUT, tripId: TRIP, status: "succeeded" as const, method: "twint" as const, priceVariant: "chf_29", amount: 2900, currency: "CHF" };
  return {
    getOffer: vi.fn(async () => ok({ amount: 2900, currency: "CHF", priceVariant: "chf_29", methods: ["twint", "card"], includes: [], accessDaysAfterReturn: 30 })),
    createCheckout: vi.fn(async () => ok({ checkoutId: CHECKOUT, redirectUrl: `/voyages/${TRIP}/debloquer/paiement-simule/${CHECKOUT}` })),
    getCheckoutStatus: vi.fn(async () => ok(statut)),
    getEntitlement: vi.fn(async () => ({ unlocked: true })),
    simulateOutcome: vi.fn(async () => ok(statut)),
  } as unknown as PaymentAdapter & PaymentSimulator & { [K in keyof (PaymentAdapter & PaymentSimulator)]: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  session.value = { organizationId: "org_b4b", userId: "user_b4b", role: "owner" };
  revalidate.mockClear();
  ouvrirGarde();
});

afterEach(() => {
  debrancherPaiementSimulePourTests();
  debrancherLectureVoyagesPourTests();
  vi.unstubAllEnvs();
});

describe("getTripReader avec PAYMENT_ADAPTER=simulated (B4b point 3, critère B7)", () => {
  it("garde ouverte : l'adaptateur de base tel quel (identité), Trip.unlocked lu depuis entitlements par api", () => {
    const base = { ...mockTripAdapter } as TripAdapter;
    brancherLectureVoyages(() => base);
    expect(adapters.paymentAvailable()).toBe(true);
    expect(adapters.getTripAdapter()).toBe(base);
    expect(adapters.getTripReader()).toBe(base);
  });

  it("avec mock : la composition de 0020 § 3 est inchangée (décorateur, pas l'adaptateur de base)", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VADROUILLE_ENV", undefined);
    expect(adapters.paymentAvailable()).toBe(true);
    expect(adapters.getTripReader()).not.toBe(adapters.getTripAdapter());
  });
});

describe("getPaymentAdapter et getPaymentSimulator acceptent simulated (B4b point 1)", () => {
  it("rendent l'adaptateur branché au démarrage, construit une seule fois", () => {
    const espion = adaptateurEspion();
    const fabrique = vi.fn(() => espion);
    brancherPaiementSimule(fabrique);
    expect(fabrique).not.toHaveBeenCalled();
    expect(adapters.getPaymentAdapter()).toBe(espion);
    expect(adapters.getPaymentSimulator()).toBe(espion);
    expect(paiementSimule()).toBe(espion);
    expect(fabrique).toHaveBeenCalledTimes(1);
  });

  it("second branchement refusé", () => {
    brancherPaiementSimule(adaptateurEspion);
    expect(() => brancherPaiementSimule(adaptateurEspion)).toThrow(PaiementSimuleDejaBrancheError);
  });

  it("non branché, ou fabrique qui lève : provider_error sans aucun droit, rien n'est retenu", async () => {
    const ctx = { organizationId: "org_b4b", userId: "user_b4b", role: "owner" as const };
    const nonBranche = adapters.getPaymentAdapter();
    expect(await nonBranche.createCheckout(ctx, { tripId: TRIP, method: "twint", requestId: crypto.randomUUID() })).toEqual({
      ok: false,
      error: { code: "provider_error", retryable: false },
    });
    expect(await nonBranche.getEntitlement(ctx, TRIP)).toEqual({ unlocked: false });
    let appels = 0;
    brancherPaiementSimule(() => {
      appels += 1;
      throw new Error("paiement simulé indisponible : webhook simulé fermé");
    });
    expect(await adapters.getPaymentSimulator()?.simulateOutcome(ctx, CHECKOUT, "succeeded")).toEqual({
      ok: false,
      error: { code: "provider_error", retryable: false },
    });
    adapters.getPaymentAdapter();
    expect(appels).toBe(2);
  });

  it("garde fermée (webhook simulé fermé) : getPaymentAdapter lève, getPaymentSimulator rend null, sans construire", () => {
    const fabrique = vi.fn(adaptateurEspion);
    brancherPaiementSimule(fabrique);
    vi.stubEnv("SIMULATED_WEBHOOK_ENABLED", undefined);
    expect(() => adapters.getPaymentAdapter()).toThrow(/paiement indisponible/);
    expect(adapters.getPaymentSimulator()).toBeNull();
    expect(fabrique).not.toHaveBeenCalled();
  });

  // B4c (PR 863 ; décision 0140 § 5 point 1) : `stripe` est implémenté ; sa garde reste fermée sans ses conditions
  // (ici `DATA_ADAPTER=api` mais sans `AUTH_ADAPTER=better-auth`), sans repli vers le simulé ni le `mock`. Les cas
  // ouverts sont dans `tests/unit/paiement-stripe-branchement.test.ts` et `tests/unit/payment-guard.test.ts`.
  it("stripe sans ses conditions : garde fermée, aucun repli (B4c)", () => {
    vi.stubEnv("PAYMENT_ADAPTER", "stripe");
    vi.stubEnv("AUTH_ADAPTER", undefined);
    expect(adapters.paymentAvailable()).toBe(false);
    expect(() => adapters.getPaymentAdapter()).toThrow(/paiement indisponible/);
    expect(adapters.getPaymentSimulator()).toBeNull();
  });
});

describe("actions du paiement sur simulated (B4b point 2, critère B8 côté actions)", () => {
  it("startCheckout, simulateCheckoutOutcome et getCheckoutStatus délèguent à l'adaptateur branché, contexte de la session", async () => {
    const espion = adaptateurEspion();
    brancherPaiementSimule(() => espion);
    const requestId = crypto.randomUUID();
    expect((await startCheckout({ tripId: TRIP, method: "twint", requestId })).ok).toBe(true);
    expect(espion.createCheckout).toHaveBeenCalledWith(session.value, { tripId: TRIP, method: "twint", requestId });
    expect((await simulateCheckoutOutcome({ checkoutId: CHECKOUT, outcome: "succeeded" })).ok).toBe(true);
    expect(espion.simulateOutcome).toHaveBeenCalledWith(session.value, CHECKOUT, "succeeded");
    expect((await getCheckoutStatus({ checkoutId: CHECKOUT })).ok).toBe(true);
    expect(espion.getCheckoutStatus).toHaveBeenCalledWith(session.value, CHECKOUT);
    // Voyage débloqué : le cache du routeur client est invalidé pour toutes ses pages (0020 § 3).
    expect(revalidate).toHaveBeenCalledWith(`/voyages/${TRIP}`, "layout");
  });

  it("sans session : unauthenticated (B3), sans appel à l'adaptateur", async () => {
    const espion = adaptateurEspion();
    brancherPaiementSimule(() => espion);
    session.value = null;
    expect(await startCheckout({ tripId: TRIP, method: "twint", requestId: crypto.randomUUID() })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await simulateCheckoutOutcome({ checkoutId: CHECKOUT, outcome: "succeeded" })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await getCheckoutStatus({ checkoutId: CHECKOUT })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    for (const methode of Object.values(espion)) expect(methode).not.toHaveBeenCalled();
  });

  it("garde fermée (DATA_ADAPTER=mock avec simulated) : not_found, sans contexte ni adaptateur", async () => {
    const espion = adaptateurEspion();
    brancherPaiementSimule(() => espion);
    vi.stubEnv("DATA_ADAPTER", "mock");
    vi.mocked(adapters.getRequestContext).mockClear();
    expect(await startCheckout({ tripId: TRIP, method: "twint", requestId: crypto.randomUUID() })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await simulateCheckoutOutcome({ checkoutId: CHECKOUT, outcome: "succeeded" })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(adapters.getRequestContext).not.toHaveBeenCalled();
    for (const methode of Object.values(espion)) expect(methode).not.toHaveBeenCalled();
  });
});
