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

describe("paymentAvailable avec l'adaptateur prototype (spécification E2E-essai, lot 1)", () => {
  it.each([
    [{ DATA_ADAPTER: "prototype", VERCEL_ENV: "preview", NODE_ENV: "production" }],
    [{ DATA_ADAPTER: "prototype", NODE_ENV: "test" }],
    [{ DATA_ADAPTER: "prototype", NODE_ENV: "production", VADROUILLE_PROTOTYPE: "1", CI: "true", VADROUILLE_ENV: "ci" }],
  ] as [NodeJS.ProcessEnv][])("vrai dans la liste blanche de prototype, sans drapeau de démonstration : %j", (env) => {
    expect(paymentAvailable(env)).toBe(true);
  });

  it.each([
    // Production : toujours fermé, quels que soient les autres drapeaux.
    [{ DATA_ADAPTER: "prototype", VERCEL_ENV: "production", NODE_ENV: "test", VADROUILLE_DEMO_PAYMENT: "1" }],
    [{ DATA_ADAPTER: "prototype", VADROUILLE_ENV: "production", NODE_ENV: "test" }],
    [{ DATA_ADAPTER: "prototype", VERCEL_ENV: " Production ", NODE_ENV: "development" }],
    // Hors liste blanche de prototype (le drapeau de démonstration n'ouvre que `mock`).
    [{ DATA_ADAPTER: "prototype", NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "1" }],
    [{ DATA_ADAPTER: "prototype", NODE_ENV: "production", VADROUILLE_PROTOTYPE: "1" }],
    [{ DATA_ADAPTER: "prototype", VADROUILLE_ENV: "staging", NODE_ENV: "test" }],
    // Vrai prestataire : jamais.
    [{ DATA_ADAPTER: "prototype", PAYMENT_ADAPTER: "stripe", NODE_ENV: "test" }],
    // Production pour mock aussi (inchangé).
    [{ NODE_ENV: "test", VERCEL_ENV: "production" }],
  ] as [NodeJS.ProcessEnv][])("faux : %j", (env) => {
    expect(paymentAvailable(env)).toBe(false);
  });
});

describe("paymentAvailable avec l'adaptateur simulated (spécification B4, critère B4 ; amendement B4-TL-14 de 0020 § 2.3)", () => {
  const OUVERT = {
    PAYMENT_ADAPTER: "simulated",
    DATA_ADAPTER: "api",
    AUTH_ADAPTER: "better-auth",
    SIMULATED_WEBHOOK_ENABLED: "true",
    VADROUILLE_ENV: "ci",
  } as const;

  it.each([
    [{ ...OUVERT, NODE_ENV: "test" }],
    [{ ...OUVERT, NODE_ENV: "development", VADROUILLE_ENV: "local" }],
    // Application construite du job de bout en bout : `NODE_ENV=production`, ouverte par `VADROUILLE_DEMO_PAYMENT=1`.
    [{ ...OUVERT, NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "1" }],
    [{ ...OUVERT, NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "1", VERCEL_ENV: "development" }],
  ] as [NodeJS.ProcessEnv][])("vrai : %j", (env) => {
    expect(paymentAvailable(env)).toBe(true);
  });

  it.each([
    // Paiement simulé non autorisé.
    [{ ...OUVERT, NODE_ENV: "production" }],
    [{ ...OUVERT, NODE_ENV: "production", VADROUILLE_DEMO_PAYMENT: "true" }],
    // Autre adaptateur de données.
    [{ ...OUVERT, NODE_ENV: "test", DATA_ADAPTER: "mock" }],
    [{ ...OUVERT, NODE_ENV: "test", DATA_ADAPTER: "" }],
    [{ ...OUVERT, NODE_ENV: "test", DATA_ADAPTER: "prototype", VADROUILLE_PROTOTYPE: "1", CI: "true" }],
    // Autre adaptateur de connexion.
    [{ ...OUVERT, NODE_ENV: "test", AUTH_ADAPTER: "mock" }],
    [{ ...OUVERT, NODE_ENV: "test", AUTH_ADAPTER: undefined }],
    // Webhook simulé fermé : drapeau absent ou autre que `true`, ou environnement hors `local` et `ci`.
    [{ ...OUVERT, NODE_ENV: "test", SIMULATED_WEBHOOK_ENABLED: undefined }],
    [{ ...OUVERT, NODE_ENV: "test", SIMULATED_WEBHOOK_ENABLED: "1" }],
    [{ ...OUVERT, NODE_ENV: "test", SIMULATED_WEBHOOK_ENABLED: "TRUE" }],
    [{ ...OUVERT, NODE_ENV: "test", VADROUILLE_ENV: undefined }],
    [{ ...OUVERT, NODE_ENV: "test", VADROUILLE_ENV: "staging" }],
    [{ ...OUVERT, NODE_ENV: "test", VERCEL_ENV: "preview" }],
    // Déploiement de production : toujours fermé, quelles que soient les variables.
    [{ ...OUVERT, NODE_ENV: "test", VADROUILLE_DEMO_PAYMENT: "1", VERCEL_ENV: "production" }],
    [{ ...OUVERT, NODE_ENV: "development", VADROUILLE_ENV: "production" }],
    [{ ...OUVERT, NODE_ENV: "test", VADROUILLE_ENV: " Production " }],
  ] as [NodeJS.ProcessEnv][])("faux : %j", (env) => {
    expect(paymentAvailable(env)).toBe(false);
  });
});

// B4c (PR 863 ; décision 0140 § 3 point 6 et § 5 point 1, amendement de 0020 § 2.3) : branche `stripe` de la garde,
// jamais vraie sur une cible de production (`isProductionTarget`).
describe("paymentAvailable avec l'adaptateur stripe (spécification B4, B4c ; décision 0140 § 5 point 1)", () => {
  const OUVERT = { PAYMENT_ADAPTER: "stripe", DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth", VADROUILLE_ENV: "ci", NODE_ENV: "test" } as const;

  it.each([[OUVERT], [{ ...OUVERT, VADROUILLE_ENV: "local" }], [{ ...OUVERT, PAYMENT_ADAPTER: " stripe " }], [{ ...OUVERT, NODE_ENV: "production" }]] as [NodeJS.ProcessEnv][])(
    "vrai : %j",
    (env) => {
      expect(paymentAvailable(env)).toBe(true);
    },
  );

  it.each([
    [{ ...OUVERT, DATA_ADAPTER: "mock" }],
    [{ ...OUVERT, DATA_ADAPTER: "prototype", VADROUILLE_PROTOTYPE: "1", CI: "true" }],
    [{ ...OUVERT, AUTH_ADAPTER: "mock" }],
    [{ ...OUVERT, AUTH_ADAPTER: undefined }],
    [{ ...OUVERT, VADROUILLE_ENV: "staging" }],
    [{ ...OUVERT, VADROUILLE_ENV: undefined }],
    [{ ...OUVERT, VERCEL_ENV: "preview" }],
    [{ ...OUVERT, VADROUILLE_ENV: "production" }],
    [{ ...OUVERT, VADROUILLE_ENV: " Production " }],
    [{ ...OUVERT, VERCEL_ENV: "production" }],
    [{ ...OUVERT, VERCEL_TARGET_ENV: "production" }],
    [{ ...OUVERT, VERCEL_TARGET_ENV: " Production " }],
    [{ ...OUVERT, PAYMENT_ADAPTER: "Stripe" }],
  ] as [NodeJS.ProcessEnv][])("faux : %j", (env) => {
    expect(paymentAvailable(env)).toBe(false);
  });

  it("garde ouverte : getPaymentAdapter rend l'adaptateur stripe branché (non branché : provider_error), getPaymentSimulator null, getTripReader disponible", async () => {
    const actual = await vi.importActual<typeof import("@/adapters")>("@/adapters");
    vi.stubEnv("PAYMENT_ADAPTER", OUVERT.PAYMENT_ADAPTER);
    vi.stubEnv("DATA_ADAPTER", OUVERT.DATA_ADAPTER);
    vi.stubEnv("AUTH_ADAPTER", OUVERT.AUTH_ADAPTER);
    vi.stubEnv("VADROUILLE_ENV", OUVERT.VADROUILLE_ENV);
    vi.stubEnv("NODE_ENV", OUVERT.NODE_ENV);
    expect(actual.paymentAvailable()).toBe(true);
    const adapter = actual.getPaymentAdapter();
    expect(await adapter.createCheckout({ organizationId: "o", userId: "u", role: "owner" }, { tripId: TRIP, method: "twint", requestId: crypto.randomUUID() })).toEqual({
      ok: false,
      error: { code: "provider_error", retryable: false },
    });
    expect(await adapter.getEntitlement({ organizationId: "o", userId: "u", role: "owner" }, TRIP)).toEqual({ unlocked: false });
    expect(actual.getPaymentSimulator()).toBeNull();
    // Lecture disponible : adaptateur de `DATA_ADAPTER=api` (le déblocage simulé ne vaut que pour `PAYMENT_ADAPTER=mock`).
    expect(Object.keys(actual.getTripReader()).sort()).toEqual(Object.keys(actual.getTripAdapter()).sort());
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
    expect(await startCheckout({ tripId: TRIP, method: "twint", requestId: crypto.randomUUID() })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await simulateCheckoutOutcome({ checkoutId: ID, outcome: "succeeded" })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await getCheckoutStatus({ checkoutId: ID })).toEqual({ ok: false, error: { code: "not_found" } });
    // Même avec une entrée invalide : la garde passe avant la validation.
    expect(await startCheckout({ tripId: TRIP, method: "paypal", requestId: crypto.randomUUID() })).toEqual({ ok: false, error: { code: "not_found" } });
    for (const spy of spies()) expect(spy).not.toHaveBeenCalled();
  });
});
