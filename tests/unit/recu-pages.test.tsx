// @vitest-environment node
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { brancherLectureVoyages, debrancherLectureVoyagesPourTests } from "@/adapters/api-instance";
import { mockTripAdapter } from "@/adapters/mock";
import { brancherPaiementSimule, debrancherPaiementSimulePourTests } from "@/adapters/simulated-payment-instance";
import type { PaymentAdapter, PaymentSimulator } from "@/adapters/types";
import { fail, ok, type Receipt } from "@/contracts";
import DebloquerPage from "@/app/voyages/[id]/debloquer/page";
import RecuPage, { dynamic, generateMetadata } from "@/app/voyages/[id]/debloquer/recu/page";
import MesVoyagesPage from "@/app/voyages/page";
import type { TripsScreenProps } from "@/features/compte/TripsScreen";
import type { OfferScreenProps } from "@/features/presentation/OfferScreen";
import type { ReceiptScreenProps } from "@/features/presentation/ReceiptScreen";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

const session = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
 * Reçu (B4d, PR 878) : lien « Voir le reçu » de `R9` débloqué et de « Mes voyages », page `R9-recu`. Adaptateur
 * `simulated` espion branché (garde ouverte : `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth`, `VADROUILLE_ENV=ci`,
 * webhook simulé ouvert), lecture des voyages par l'adaptateur `mock` branché comme `api`. La lecture du reçu en base
 * est éprouvée par `pnpm test:db` (`tests/db/paiement.test.ts`), le parcours par le projet `api`.
 */

const PAYE = "mock_trip_edimbourg_debloque";
const NON_PAYE = "mock_trip_edimbourg";
const notFound = { digest: expect.stringContaining("404") };
const RECU: Receipt = {
  kind: "simulated",
  checkoutId: "nVpPQ49PSzmdDjwLT1srEQ",
  tripId: PAYE,
  method: "twint",
  amount: 2900,
  currency: "CHF",
  paidAt: "2026-10-29T13:05:42.250Z",
};

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

/** Adaptateur `simulated` espion : un reçu pour le voyage payé seulement. */
function adaptateurEspion(options: { recus?: readonly Receipt[]; panne?: boolean } = {}) {
  const recus = options.recus ?? [RECU];
  return {
    getOffer: vi.fn(async () => ok({ amount: 2900, currency: "CHF", priceVariant: "chf_29", methods: ["twint", "card"], includes: [], accessDaysAfterReturn: 30 })),
    createCheckout: vi.fn(),
    getCheckoutStatus: vi.fn(async () => fail("not_found")),
    getEntitlement: vi.fn(async () => ({ unlocked: true })),
    simulateOutcome: vi.fn(),
    getReceipt: vi.fn(async (_ctx: unknown, tripId: string) => {
      if (options.panne) throw new Error("panne");
      const recu = recus.find((r) => r.tripId === tripId);
      return recu ? ok(recu) : fail("not_found");
    }),
    listReceipts: vi.fn(async () => (options.panne ? { ok: false as const, error: { code: "provider_error" as const, retryable: true } } : ok(recus))),
  };
}

function brancher(espion: ReturnType<typeof adaptateurEspion>) {
  brancherPaiementSimule(() => espion as unknown as PaymentAdapter & PaymentSimulator);
  return espion;
}

async function r9(id: string): Promise<OfferScreenProps> {
  const element = (await DebloquerPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })) as ReactElement<OfferScreenProps>;
  return element.props;
}

async function recu(id: string): Promise<ReceiptScreenProps> {
  const element = (await RecuPage({ params: Promise.resolve({ id }) })) as ReactElement<ReceiptScreenProps>;
  return element.props;
}

async function mesVoyages(): Promise<TripsScreenProps> {
  return ((await MesVoyagesPage()) as ReactElement<TripsScreenProps>).props;
}

beforeEach(() => {
  session.value = { organizationId: MOCK_ORGANIZATION_ID, userId: "user_b4d", role: "owner" };
  ouvrirGarde();
  brancherLectureVoyages(() => mockTripAdapter);
});

afterEach(() => {
  debrancherPaiementSimulePourTests();
  debrancherLectureVoyagesPourTests();
  vi.unstubAllEnvs();
});

describe("R9 débloqué : lien du reçu (PR 878)", () => {
  it("voyage payé par la personne : receiptHref vers R9-recu, reçu lu avec le contexte de la session", async () => {
    const espion = brancher(adaptateurEspion());
    const props = await r9(PAYE);
    expect(props.offer).toBeNull();
    expect(props.receiptHref).toBe(`/voyages/${PAYE}/debloquer/recu`);
    expect(espion.getReceipt).toHaveBeenCalledWith(session.value, PAYE);
  });

  it("sans reçu (not_found), reçu d'un autre voyage, ou lecture qui lève : aucun lien, la page s'affiche", async () => {
    brancher(adaptateurEspion({ recus: [] }));
    expect((await r9(PAYE)).receiptHref).toBeNull();
    debrancherPaiementSimulePourTests();
    brancher(adaptateurEspion({ recus: [{ ...RECU, tripId: NON_PAYE }] }));
    expect((await r9(PAYE)).receiptHref).toBeNull();
    debrancherPaiementSimulePourTests();
    brancher(adaptateurEspion({ panne: true }));
    expect((await r9(PAYE)).receiptHref).toBeNull();
  });

  it("voyage non débloqué : offre, aucun lien et aucune lecture du reçu", async () => {
    const espion = brancher(adaptateurEspion());
    const props = await r9(NON_PAYE);
    expect(props.offer).not.toBeNull();
    expect(props.receiptHref).toBeNull();
    expect(espion.getReceipt).not.toHaveBeenCalled();
  });

  it("adaptateur mock (sans reçu) : aucun lien", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VADROUILLE_ENV", undefined);
    vi.stubEnv("AUTH_ADAPTER", undefined);
    expect((await r9(PAYE)).receiptHref).toBeNull();
  });
});

describe("R9-recu : page du reçu (PR 878)", () => {
  it("reçu de la personne : props du reçu, voyage, dates et Séjour ; rendu à chaque requête ; titre « {destination} · Reçu simulé »", async () => {
    brancher(adaptateurEspion());
    expect(await recu(PAYE)).toEqual({
      receipt: RECU,
      destination: "Édimbourg",
      tripDates: "sam. 29.08 – jeu. 03.09 · 2 adultes",
      programmeHref: `/voyages/${PAYE}`,
    });
    expect(dynamic).toBe("force-dynamic");
    expect(await generateMetadata({ params: Promise.resolve({ id: PAYE }) })).toEqual({ title: "Édimbourg · Reçu simulé", robots: { index: false, follow: false } });
  });

  it("404 : voyage non payé, reçu d'un autre voyage, voyage inconnu ou d'une autre organisation, lecture qui lève", async () => {
    brancher(adaptateurEspion());
    await expect(RecuPage({ params: Promise.resolve({ id: NON_PAYE }) })).rejects.toMatchObject(notFound);
    await expect(RecuPage({ params: Promise.resolve({ id: "inconnu" }) })).rejects.toMatchObject(notFound);
    session.value = { organizationId: "mock_org_autre", userId: "user_b4d", role: "owner" };
    await expect(RecuPage({ params: Promise.resolve({ id: PAYE }) })).rejects.toMatchObject(notFound);
    session.value = { organizationId: MOCK_ORGANIZATION_ID, userId: "user_b4d", role: "owner" };
    debrancherPaiementSimulePourTests();
    brancher(adaptateurEspion({ recus: [{ ...RECU, tripId: NON_PAYE }] }));
    await expect(RecuPage({ params: Promise.resolve({ id: PAYE }) })).rejects.toMatchObject(notFound);
    debrancherPaiementSimulePourTests();
    brancher(adaptateurEspion({ panne: true }));
    await expect(RecuPage({ params: Promise.resolve({ id: PAYE }) })).rejects.toMatchObject(notFound);
  });

  it("sans session : redirection vers l'écran 4, suite « Débloquer » (liste blanche des suites inchangée), sans lecture", async () => {
    const espion = brancher(adaptateurEspion());
    session.value = null;
    await expect(RecuPage({ params: Promise.resolve({ id: PAYE }) })).rejects.toMatchObject({
      digest: expect.stringContaining(`/connexion?suite=${encodeURIComponent(`/voyages/${PAYE}/debloquer`)}`),
    });
    expect(espion.getReceipt).not.toHaveBeenCalled();
    expect(await generateMetadata({ params: Promise.resolve({ id: PAYE }) })).toEqual({ robots: { index: false, follow: false } });
  });

  it("paiement indisponible (garde fermée) ou adaptateur mock : 404, sans contexte ni adaptateur", async () => {
    const espion = brancher(adaptateurEspion());
    vi.stubEnv("SIMULATED_WEBHOOK_ENABLED", undefined);
    expect(adapters.paymentAvailable()).toBe(false);
    vi.mocked(adapters.getRequestContext).mockClear();
    await expect(RecuPage({ params: Promise.resolve({ id: PAYE }) })).rejects.toMatchObject(notFound);
    expect(adapters.getRequestContext).not.toHaveBeenCalled();
    expect(espion.getReceipt).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VADROUILLE_ENV", undefined);
    vi.stubEnv("AUTH_ADAPTER", undefined);
    expect(adapters.paymentAvailable()).toBe(true);
    await expect(RecuPage({ params: Promise.resolve({ id: "mock_trip_edimbourg_debloque" }) })).rejects.toMatchObject(notFound);
  });
});

describe("« Mes voyages » : liens des reçus (PR 878)", () => {
  it("reçus de la personne : voyage → adresse de R9-recu", async () => {
    const espion = brancher(adaptateurEspion());
    const props = await mesVoyages();
    expect(props.receiptHrefs).toEqual({ [PAYE]: `/voyages/${PAYE}/debloquer/recu` });
    expect(espion.listReceipts).toHaveBeenCalledWith(session.value);
    expect(props.trips.map((trip) => trip.id)).toContain(PAYE);
  });

  it("lecture en échec, paiement indisponible ou adaptateur mock : aucun lien, la liste s'affiche", async () => {
    brancher(adaptateurEspion({ panne: true }));
    expect((await mesVoyages()).receiptHrefs).toEqual({});
    vi.stubEnv("SIMULATED_WEBHOOK_ENABLED", undefined);
    const fermee = await mesVoyages();
    expect(fermee.receiptHrefs).toEqual({});
    expect(fermee.trips.length).toBeGreaterThan(0);
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("VADROUILLE_ENV", undefined);
    vi.stubEnv("AUTH_ADAPTER", undefined);
    expect((await mesVoyages()).receiptHrefs).toEqual({});
  });
});
