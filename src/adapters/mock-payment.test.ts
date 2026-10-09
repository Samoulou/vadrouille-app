// @vitest-environment node
import { describe, expect, it } from "vitest";

import { OFFER_INCLUSIONS, type OfferConfig } from "@/contracts";
import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { createMockTripAdapter } from "./mock";
import { createMockPaymentAdapter, randomCheckoutId, type MockPaymentOptions } from "./mock-payment";
import type { PaymentStore } from "./simulation";

/** Adaptateur de paiement simulé (décision 0020 § 2.2), construit avec une configuration injectée (§ 4). */

const ctx = { organizationId: MOCK_ORGANIZATION_ID };
const otherCtx = { organizationId: "mock_org_autre" };
const TTL = 30 * 60_000;

const OFFER: OfferConfig = {
  amount: 3900,
  currency: "CHF",
  priceVariant: "chf_29",
  methods: ["twint", "card"],
  includes: [...OFFER_INCLUSIONS],
  accessDaysAfterReturn: 30,
};

const store = (): PaymentStore => ({ checkouts: new Map(), entitlements: new Map(), confirmationDelayMs: 0 });

function setup(overrides: Partial<MockPaymentOptions> = {}) {
  let t = Date.UTC(2026, 7, 1, 10);
  const state = overrides.store ?? store();
  let serial = 0;
  const adapter = createMockPaymentAdapter({
    offer: OFFER,
    trips: createMockTripAdapter(),
    now: () => t,
    store: state,
    checkoutTtlMs: TTL,
    confirmationDelayMs: 0,
    simulationPath: (tripId, checkoutId) => `/voyages/${tripId}/debloquer/paiement-simule/${checkoutId}`,
    randomId: () => `checkout${String(++serial).padStart(14, "0")}`,
    ...overrides,
  });
  return { adapter, state, advance: (ms: number) => (t += ms) };
}

async function start(adapter: ReturnType<typeof setup>["adapter"], method: "twint" | "card" = "twint") {
  const result = await adapter.createCheckout(ctx, { tripId: EDIMBOURG_TRIP_ID, method });
  if (!result.ok) throw new Error(result.error.code);
  return result.value.checkoutId;
}

describe("offre", () => {
  it("prix de la configuration injectée", async () => {
    const { adapter } = setup();
    expect(await adapter.getOffer(ctx, EDIMBOURG_TRIP_ID)).toEqual({ ok: true, value: { tripId: EDIMBOURG_TRIP_ID, ...OFFER } });
  });

  it("not_found pour un voyage inconnu ou d'une autre organisation", async () => {
    const { adapter } = setup();
    expect(await adapter.getOffer(otherCtx, EDIMBOURG_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.getOffer(ctx, "inconnu")).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("création", () => {
  it("paiement pending avec l'instantané du prix de la configuration et une adresse de l'application", async () => {
    const { adapter } = setup();
    const created = await adapter.createCheckout(ctx, { tripId: EDIMBOURG_TRIP_ID, method: "card" });
    expect(created).toEqual({
      ok: true,
      value: { checkoutId: "checkout00000000000001", redirectUrl: `/voyages/${EDIMBOURG_TRIP_ID}/debloquer/paiement-simule/checkout00000000000001` },
    });
    expect(await adapter.getCheckoutStatus(ctx, "checkout00000000000001")).toEqual({
      ok: true,
      value: {
        checkoutId: "checkout00000000000001",
        tripId: EDIMBOURG_TRIP_ID,
        method: "card",
        status: "pending",
        priceVariant: "chf_29",
        amount: 3900,
        currency: "CHF",
      },
    });
  });

  it("not_found pour une autre organisation, sans paiement créé", async () => {
    const { adapter, state } = setup();
    expect(await adapter.createCheckout(otherCtx, { tripId: EDIMBOURG_TRIP_ID, method: "card" })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(state.checkouts.size).toBe(0);
  });

  it("already_unlocked pour un voyage débloqué dans les données ou par un droit, sans paiement créé", async () => {
    const { adapter, state } = setup();
    expect(await adapter.createCheckout(ctx, { tripId: EDIMBOURG_DEBLOQUE_TRIP_ID, method: "card" })).toEqual({
      ok: false,
      error: { code: "already_unlocked" },
    });
    const id = await start(adapter);
    await adapter.simulateOutcome(ctx, id, "succeeded");
    const size = state.checkouts.size;
    expect(await adapter.createCheckout(ctx, { tripId: EDIMBOURG_TRIP_ID, method: "card" })).toEqual({
      ok: false,
      error: { code: "already_unlocked" },
    });
    expect(state.checkouts.size).toBe(size);
  });

  it("identifiant aléatoire de 128 bits (22 caractères base64url), jamais dérivé du voyage", () => {
    const ids = new Set(Array.from({ length: 50 }, () => randomCheckoutId()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(Buffer.from(id, "base64url")).toHaveLength(16);
      expect(id).not.toContain("edimbourg");
    }
  });
});

describe("issues", () => {
  it.each([
    ["succeeded", true],
    ["declined", false],
    ["cancelled", false],
  ] as const)("%s", async (outcome, unlocked) => {
    const { adapter } = setup();
    const id = await start(adapter);
    const result = await adapter.simulateOutcome(ctx, id, outcome);
    expect(result.ok && result.value.status).toBe(outcome);
    expect(await adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked });
  });

  it("idempotence : rejouer la même confirmation n'accorde rien de plus et ne change pas l'état", async () => {
    const { adapter, state } = setup();
    const id = await start(adapter);
    await adapter.simulateOutcome(ctx, id, "succeeded");
    const entitlement = [...state.entitlements.values()][0];
    const again = await adapter.simulateOutcome(ctx, id, "succeeded");
    expect(again.ok && again.value.status).toBe("succeeded");
    expect(state.entitlements.size).toBe(1);
    expect([...state.entitlements.values()][0]).toBe(entitlement);
    // Une issue contraire reçue ensuite ne change rien non plus.
    const declined = await adapter.simulateOutcome(ctx, id, "declined");
    expect(declined.ok && declined.value.status).toBe("succeeded");
  });

  it("deux paiements ouverts : le second confirmé est duplicate, sans second droit", async () => {
    const { adapter, state } = setup();
    const first = await start(adapter, "twint");
    const second = await start(adapter, "card");
    expect((await adapter.simulateOutcome(ctx, first, "succeeded")).ok).toBe(true);
    const duplicate = await adapter.simulateOutcome(ctx, second, "succeeded");
    expect(duplicate.ok && duplicate.value.status).toBe("duplicate");
    expect(state.entitlements.size).toBe(1);
  });

  it("not_found pour un paiement d'une autre organisation ou inconnu, sans rien modifier", async () => {
    const { adapter } = setup();
    const id = await start(adapter);
    expect(await adapter.simulateOutcome(otherCtx, id, "succeeded")).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.getCheckoutStatus(otherCtx, id)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.simulateOutcome(ctx, "inconnu000000000000000", "succeeded")).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: false });
    expect(await adapter.getEntitlement(otherCtx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: false });
  });
});

describe("expiration et délai (horloge injectée)", () => {
  it("sans issue à création + checkoutTtlMs : expired, et une confirmation reçue ensuite n'accorde rien", async () => {
    const { adapter, advance } = setup();
    const id = await start(adapter);
    advance(TTL - 1);
    expect(await adapter.getCheckoutStatus(ctx, id)).toMatchObject({ ok: true, value: { status: "pending" } });
    advance(1);
    const late = await adapter.simulateOutcome(ctx, id, "succeeded");
    expect(late).toMatchObject({ ok: true, value: { status: "expired" } });
    expect(await adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: false });
  });

  it("confirmationDelayMs : pending jusqu'à l'échéance, puis l'issue s'applique au premier accès", async () => {
    const { adapter, advance } = setup({ confirmationDelayMs: 60_000 });
    const id = await start(adapter);
    expect(await adapter.simulateOutcome(ctx, id, "succeeded")).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(await adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: false });
    advance(60_000);
    expect(await adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: true });
    expect(await adapter.getCheckoutStatus(ctx, id)).toMatchObject({ ok: true, value: { status: "succeeded" } });
  });

  it("une issue reçue avant l'échéance s'applique même si son délai la dépasse", async () => {
    const { adapter, advance } = setup({ confirmationDelayMs: 60_000 });
    const id = await start(adapter);
    advance(TTL - 1000);
    await adapter.simulateOutcome(ctx, id, "succeeded");
    advance(60_000);
    expect(await adapter.getCheckoutStatus(ctx, id)).toMatchObject({ ok: true, value: { status: "succeeded" } });
  });

  it("droit de la portée par défaut : expire après entitlementTtlMs", async () => {
    const { adapter, advance } = setup({ entitlementTtlMs: 30 * 60_000 });
    const id = await start(adapter);
    await adapter.simulateOutcome(ctx, id, "succeeded");
    advance(30 * 60_000 - 1);
    expect(await adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: true });
    advance(1);
    expect(await adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: false });
  });
});

describe("portées", () => {
  it("deux portées (deux états) sont isolées", async () => {
    const a = setup();
    const b = setup();
    const id = await start(a.adapter);
    await a.adapter.simulateOutcome(ctx, id, "succeeded");
    expect(await a.adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: true });
    expect(await b.adapter.getEntitlement(ctx, EDIMBOURG_TRIP_ID)).toEqual({ unlocked: false });
    expect(await b.adapter.getCheckoutStatus(ctx, id)).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("au-delà de 50 paiements, le plus ancien est retiré (not_found)", async () => {
    const { adapter, state } = setup();
    const first = await start(adapter);
    for (let i = 0; i < 50; i += 1) await start(adapter);
    expect(state.checkouts.size).toBe(50);
    expect(await adapter.getCheckoutStatus(ctx, first)).toEqual({ ok: false, error: { code: "not_found" } });
  });
});
