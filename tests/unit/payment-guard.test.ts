// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { paymentAvailable, paymentDemoAllowed } from "@/adapters/payment-guard";
import ConfirmationPage from "@/app/voyages/[id]/debloquer/confirmation/page";
import PaiementSimulePage from "@/app/voyages/[id]/debloquer/paiement-simule/[paiementId]/page";
import DebloquerPage from "@/app/voyages/[id]/debloquer/page";
import { isProductionDeployment } from "@/dev/flags";
import { getCheckoutStatus, simulateCheckoutOutcome, startCheckout } from "@/server/actions/paiement";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return {
    ...actual,
    getPaymentAdapter: vi.fn(actual.getPaymentAdapter),
    getPaymentSimulator: vi.fn(actual.getPaymentSimulator),
    getRequestContext: vi.fn(actual.getRequestContext),
    getSimulationScope: vi.fn(actual.getSimulationScope),
    getTripReader: vi.fn(actual.getTripReader),
  };
});

/** Garde du paiement simulé (décision 0020 § 2.3, F9-PO-19). */

const ID = "AAAAAAAAAAAAAAAAAAAAAA";
const TRIP = "mock_trip_edimbourg";

const spies = () => [
  vi.mocked(adapters.getPaymentAdapter),
  vi.mocked(adapters.getPaymentSimulator),
  vi.mocked(adapters.getRequestContext),
  vi.mocked(adapters.getSimulationScope),
  vi.mocked(adapters.getTripReader),
];

beforeEach(() => {
  for (const spy of spies()) spy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paymentDemoAllowed : fermée par défaut", () => {
  it.each([
    [{}, false],
    [{ NODE_ENV: "" }, false],
    [{ NODE_ENV: "staging" }, false],
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "test" }, true],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "1" }, true],
    [{ VADROUILLE_DEMO_PAYMENT: "1" }, true],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "true" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: " 1" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "1", VERCEL_ENV: "production" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "1", VADROUILLE_ENV: "production" }, false],
    [{ NODE_ENV: "development", VERCEL_ENV: "production" }, false],
    [{ NODE_ENV: "test", VADROUILLE_ENV: "production" }, false],
    [{ NODE_ENV: "development", VADROUILLE_DEMO_PAYMENT: "1", VADROUILLE_ENV: "production" }, false],
    [{ NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "1", VERCEL_ENV: "preview" }, true],
  ] as [NodeJS.ProcessEnv, boolean][])("%j → %s", (env, expected) => {
    expect(paymentDemoAllowed(env)).toBe(expected);
  });

  it("isProductionDeployment ne peut que fermer", () => {
    const env = (value: Record<string, string>) => value as NodeJS.ProcessEnv;
    expect(isProductionDeployment(env({ VADROUILLE_ENV: "production" }))).toBe(true);
    expect(isProductionDeployment(env({ VERCEL_ENV: "production" }))).toBe(true);
    expect(isProductionDeployment(env({ VERCEL_ENV: "preview" }))).toBe(false);
    expect(isProductionDeployment(env({}))).toBe(false);
  });
});

describe("paymentAvailable", () => {
  it("vrai en test avec les adaptateurs mock", () => {
    expect(paymentAvailable({ NODE_ENV: "test" })).toBe(true);
    expect(paymentAvailable({ NODE_ENV: "test", PAYMENT_ADAPTER: " mock ", DATA_ADAPTER: "" })).toBe(true);
  });

  it.each([
    [{ NODE_ENV: "test", DATA_ADAPTER: "api" }],
    [{ NODE_ENV: "test", PAYMENT_ADAPTER: "stripe" }],
    [{ NODE_ENV: "test", PAYMENT_ADAPTER: "autre" }],
    [{ NODE_ENV: "production" }],
  ] as [NodeJS.ProcessEnv][])("faux : %j", (env) => {
    expect(paymentAvailable(env)).toBe(false);
  });
});

describe("filets de sécurité", () => {
  it("getPaymentAdapter lève une erreur si le paiement est indisponible ; getPaymentSimulator renvoie null", async () => {
    const actual = await vi.importActual<typeof import("@/adapters")>("@/adapters");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEMO_PAYMENT", undefined);
    expect(() => actual.getPaymentAdapter()).toThrow(/paiement indisponible/);
    expect(actual.getPaymentSimulator()).toBeNull();
  });

  it("PAYMENT_ADAPTER stripe : paiement indisponible, aucun repli vers mock", async () => {
    const actual = await vi.importActual<typeof import("@/adapters")>("@/adapters");
    vi.stubEnv("PAYMENT_ADAPTER", "stripe");
    expect(actual.paymentAvailable()).toBe(false);
    expect(() => actual.getPaymentAdapter()).toThrow();
    expect(actual.getPaymentSimulator()).toBeNull();
  });
});

describe("sans paiement simulé autorisé (NODE_ENV=production, sans drapeau)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEMO_PAYMENT", undefined);
  });

  const notFound = { digest: expect.stringContaining("404") };

  it("R9, R9-sim et R9-retour appellent notFound() avant toute lecture", async () => {
    await expect(
      DebloquerPage({ params: Promise.resolve({ id: TRIP }), searchParams: Promise.resolve({}) }),
    ).rejects.toMatchObject(notFound);
    await expect(PaiementSimulePage({ params: Promise.resolve({ id: TRIP, paiementId: ID }) })).rejects.toMatchObject(notFound);
    await expect(
      ConfirmationPage({ params: Promise.resolve({ id: TRIP }), searchParams: Promise.resolve({ paiement: ID }) }),
    ).rejects.toMatchObject(notFound);
    for (const spy of spies()) expect(spy).not.toHaveBeenCalled();
  });

  it("les trois actions renvoient not_found sans appeler l'adaptateur ni le contexte", async () => {
    expect(await startCheckout({ tripId: TRIP, method: "twint" })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await simulateCheckoutOutcome({ checkoutId: ID, outcome: "succeeded" })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await getCheckoutStatus({ checkoutId: ID })).toEqual({ ok: false, error: { code: "not_found" } });
    // Même avec une entrée invalide : la garde passe avant la validation.
    expect(await startCheckout({ tripId: TRIP, method: "paypal" })).toEqual({ ok: false, error: { code: "not_found" } });
    for (const spy of spies()) expect(spy).not.toHaveBeenCalled();
  });
});
