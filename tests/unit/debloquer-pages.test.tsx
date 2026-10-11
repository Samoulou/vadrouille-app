// @vitest-environment node
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OFFER_INCLUSIONS, type OfferConfig } from "@/contracts";
import { createMockTripAdapter } from "@/adapters/mock";
import { createMockPaymentAdapter } from "@/adapters/mock-payment";
import type { PaymentStore } from "@/adapters/simulation";
import ConfirmationPage, { dynamic as confirmationDynamic } from "@/app/voyages/[id]/debloquer/confirmation/page";
import PaiementSimulePage from "@/app/voyages/[id]/debloquer/paiement-simule/[paiementId]/page";
import DebloquerPage, { dynamic, generateMetadata } from "@/app/voyages/[id]/debloquer/page";
import type { OfferScreenProps } from "@/features/presentation/OfferScreen";
import { loadUnlockPage } from "@/features/presentation/unlock-load";
import { edimbourg, MOCK_ORGANIZATION_ID, propositions } from "@/mocks/edimbourg";
import { startCheckout, simulateCheckoutOutcome } from "@/server/actions/paiement";

const scopeName = vi.hoisted(() => ({ value: "pages-1" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vadrouille-simulation": scopeName.value }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const contextMock = vi.hoisted(() => ({ organizationId: "mock_org_personnelle" }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getRequestContext: () => ({ ...contextMock }) };
});

/** Pages `R9`, `R9-sim`, `R9-retour` (F9a) et paramètre `paiement` (F9-PO-20). */

const TRIP = "mock_trip_edimbourg";
const UNKNOWN = "AAAAAAAAAAAAAAAAAAAAAA";
const notFound = { digest: expect.stringContaining("404") };

let serial = 0;
beforeEach(() => {
  serial += 1;
  scopeName.value = `pages-${serial}`;
  contextMock.organizationId = MOCK_ORGANIZATION_ID;
});

async function r9(paiement?: string | string[]): Promise<OfferScreenProps> {
  const element = (await DebloquerPage({
    params: Promise.resolve({ id: TRIP }),
    searchParams: Promise.resolve(paiement === undefined ? {} : { paiement }),
  })) as ReactElement<OfferScreenProps>;
  return element.props;
}

async function checkout(outcome?: "succeeded" | "declined" | "cancelled") {
  const start = await startCheckout({ tripId: TRIP, method: "card" });
  if (!start.ok) throw new Error(start.error.code);
  if (outcome) await simulateCheckoutOutcome({ checkoutId: start.value.checkoutId, outcome });
  return start.value.checkoutId;
}

describe("R9 : écran 9", () => {
  it("voyage non débloqué : offre de la configuration, plaque et Séjour", async () => {
    const props = await r9();
    expect(props.offer).toMatchObject({ tripId: TRIP, amount: 2900, currency: "CHF", priceVariant: "chf_29", start: "2026-08-29", end: "2026-09-03" });
    expect(props.offer?.includes).toEqual([...OFFER_INCLUSIONS]);
    expect(props.plateMeta).toBe("sam. 29.08 – jeu. 03.09 · 2 adultes");
    expect(props.programmeHref).toBe(`/voyages/${TRIP}`);
    expect(props.failure).toBeNull();
    expect(props.simulated).toBe(true);
    expect(dynamic).toBe("force-dynamic");
    expect(confirmationDynamic).toBe("force-dynamic");
  });

  it("titre du document « {destination} · Débloquer »", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ id: TRIP }) })).toMatchObject({ title: "Édimbourg · Débloquer" });
  });

  it("voyage inconnu ou d'une autre organisation : 404", async () => {
    await expect(DebloquerPage({ params: Promise.resolve({ id: "inconnu" }), searchParams: Promise.resolve({}) })).rejects.toMatchObject(notFound);
    contextMock.organizationId = "mock_org_autre";
    await expect(DebloquerPage({ params: Promise.resolve({ id: TRIP }), searchParams: Promise.resolve({}) })).rejects.toMatchObject(notFound);
  });

  it("voyage déjà débloqué : ni offre ni bandeau, même avec un paiement en échec", async () => {
    const failed = await checkout("declined");
    await checkout("succeeded");
    const props = await r9(failed);
    expect(props.offer).toBeNull();
    expect(props.failure).toBeNull();
  });
});

describe("paramètre paiement sur R9 (F9-PO-20)", () => {
  it("mal formé, tableau, inconnu, en cours, autre organisation : rendu identique à la page sans paramètre", async () => {
    const reference = await r9();
    const pending = await checkout();
    for (const paiement of ["court", [UNKNOWN, UNKNOWN], UNKNOWN, pending, `${pending}=`]) {
      expect(await r9(paiement)).toEqual(reference);
    }
    const declined = await checkout("declined");
    contextMock.organizationId = "mock_org_autre";
    // Autre organisation : le voyage lui-même est inconnu (404, comme sans paramètre).
    await expect(DebloquerPage({ params: Promise.resolve({ id: TRIP }), searchParams: Promise.resolve({ paiement: declined }) })).rejects.toMatchObject(
      notFound,
    );
  });

  it.each([
    ["declined", "declined"],
    ["cancelled", "cancelled"],
  ] as const)("%s du même voyage : bandeau correspondant", async (outcome, reason) => {
    const id = await checkout(outcome);
    expect((await r9(id)).failure).toEqual({ reason, checkoutId: id, priceVariant: "chf_29" });
  });

  describe("loadUnlockPage : autre voyage, autre organisation, réussi, expiré", () => {
    const OFFER: OfferConfig = { amount: 2900, currency: "CHF", priceVariant: "chf_29", methods: ["twint", "card"], includes: [], accessDaysAfterReturn: 30 };
    const ctx = { organizationId: MOCK_ORGANIZATION_ID };
    const other = { ...edimbourg, id: "mock_trip_autre" };
    const otherOrg = { ...edimbourg, id: "mock_trip_autre_org", organizationId: "mock_org_autre" };
    let t = 0;
    const trips = createMockTripAdapter([
      { trip: edimbourg, proposals: propositions },
      { trip: other, proposals: [] },
      { trip: otherOrg, proposals: [] },
    ]);
    const store: PaymentStore = { checkouts: new Map(), entitlements: new Map(), confirmationDelayMs: 0 };
    const payment = createMockPaymentAdapter({
      offer: OFFER,
      trips,
      now: () => t,
      store,
      checkoutTtlMs: 1000,
      confirmationDelayMs: 0,
      simulationPath: () => "/x",
    });
    const reference = () => loadUnlockPage(trips, payment, ctx, TRIP, undefined);

    it("paiement d'un autre voyage (même en échec) : ignoré", async () => {
      const start = await payment.createCheckout(ctx, { tripId: other.id, method: "card" });
      if (!start.ok) throw new Error();
      await payment.simulateOutcome(ctx, start.value.checkoutId, "declined");
      expect(await loadUnlockPage(trips, payment, ctx, TRIP, start.value.checkoutId)).toEqual(await reference());
    });

    it("paiement d'une autre organisation : ignoré", async () => {
      const otherCtx = { organizationId: "mock_org_autre" };
      const start = await payment.createCheckout(otherCtx, { tripId: otherOrg.id, method: "card" });
      if (!start.ok) throw new Error();
      await payment.simulateOutcome(otherCtx, start.value.checkoutId, "declined");
      expect(await loadUnlockPage(trips, payment, ctx, TRIP, start.value.checkoutId)).toEqual(await reference());
    });

    it("expiré : bandeau « expired »", async () => {
      const start = await payment.createCheckout(ctx, { tripId: other.id, method: "twint" });
      if (!start.ok) throw new Error();
      t += 1000;
      const data = await loadUnlockPage(trips, payment, ctx, other.id, start.value.checkoutId);
      expect(data?.failure).toEqual({ reason: "expired", checkoutId: start.value.checkoutId, priceVariant: "chf_29" });
    });

    it("réussi : ignoré (le voyage est débloqué : ni offre ni bandeau)", async () => {
      const start = await payment.createCheckout(ctx, { tripId: TRIP, method: "twint" });
      if (!start.ok) throw new Error();
      await payment.simulateOutcome(ctx, start.value.checkoutId, "succeeded");
      const data = await loadUnlockPage(trips, payment, ctx, TRIP, start.value.checkoutId);
      expect(data?.failure).toBeNull();
    });
  });
});

describe("R9-sim et R9-retour : 404", () => {
  it("paiement inconnu, mal formé, d'un autre voyage ou d'une autre organisation", async () => {
    const id = await checkout();
    const sim = (trip: string, paiementId: string) => PaiementSimulePage({ params: Promise.resolve({ id: trip, paiementId }) });
    const retour = (trip: string, paiement?: string) =>
      ConfirmationPage({ params: Promise.resolve({ id: trip }), searchParams: Promise.resolve(paiement ? { paiement } : {}) });
    for (const call of [
      sim(TRIP, UNKNOWN),
      sim(TRIP, "court"),
      sim("mock_trip_edimbourg_debloque", id),
      sim("inconnu", id),
      retour(TRIP, UNKNOWN),
      retour(TRIP, "court"),
      retour(TRIP),
      retour("mock_trip_edimbourg_debloque", id),
    ]) {
      await expect(call).rejects.toMatchObject(notFound);
    }
    contextMock.organizationId = "mock_org_autre";
    await expect(sim(TRIP, id)).rejects.toMatchObject(notFound);
    await expect(retour(TRIP, id)).rejects.toMatchObject(notFound);
  });

  it("R9-sim d'un paiement déjà conclu : redirection vers la confirmation", async () => {
    const id = await checkout("declined");
    await expect(PaiementSimulePage({ params: Promise.resolve({ id: TRIP, paiementId: id }) })).rejects.toMatchObject({
      digest: expect.stringContaining(`/voyages/${TRIP}/debloquer/confirmation?paiement=${id}`),
    });
  });

  it("R9-sim en cours : récapitulatif du paiement (instantané du prix)", async () => {
    const id = await checkout();
    const element = (await PaiementSimulePage({ params: Promise.resolve({ id: TRIP, paiementId: id }) })) as ReactElement<Record<string, unknown>>;
    expect(element.props).toMatchObject({ tripId: TRIP, checkoutId: id, destination: "Édimbourg", amount: 2900, currency: "CHF", method: "card" });
  });

  it("R9-retour : état initial lu côté serveur, cible de réussite R11 (F9a)", async () => {
    const id = await checkout("succeeded");
    const element = (await ConfirmationPage({
      params: Promise.resolve({ id: TRIP }),
      searchParams: Promise.resolve({ paiement: id }),
    })) as ReactElement<Record<string, unknown>>;
    expect(element.props).toMatchObject({
      initialStatus: "succeeded",
      successHref: `/voyages/${TRIP}`,
      presentationHref: `/voyages/${TRIP}/presentation`,
      method: "card",
      priceVariant: "chf_29",
    });
  });
});
