import { randomBytes } from "node:crypto";

import {
  CheckoutStartSchema,
  CheckoutStatusSchema,
  OfferSchema,
  fail,
  ok,
  type CheckoutStatus,
  type OfferConfig,
  type Result,
} from "@/contracts";
import type { CheckoutOutcome } from "@/contracts/values";

import {
  MAX_CHECKOUTS_PER_SCOPE,
  MAX_ENTITLEMENTS_PER_SCOPE,
  type CheckoutRecord,
  type PaymentStore,
} from "./simulation";
import type { AdapterContext, PaymentAdapter, PaymentSimulator, TripAdapter } from "./types";

export interface MockPaymentOptions {
  /** Configuration de l'offre, injectée (décision 0020 § 4) : jamais importée par ce module. */
  offer: OfferConfig;
  /** Accès de base aux voyages (pur), pour l'existence et l'organisation du voyage. */
  trips: TripAdapter;
  /** Horloge de la portée : ce module n'appelle jamais l'horloge système (lint). */
  now: () => number;
  /** État de la portée. */
  store: PaymentStore;
  checkoutTtlMs: number;
  confirmationDelayMs: number;
  /** Durée d'un droit simulé (portée par défaut seulement) ; absent : sans expiration. */
  entitlementTtlMs?: number;
  /** Adresse de la page de paiement simulé, construite par le module d'adresses (0020 § 5). */
  simulationPath: (tripId: string, checkoutId: string) => string;
  /** Identifiant aléatoire de 128 bits ; injectable pour les tests. */
  randomId?: () => string;
}

/** `checkoutId` : `crypto.randomBytes(16)` en base64url, 22 caractères (décision 0020 § 1.3). */
export function randomCheckoutId(): string {
  return randomBytes(16).toString("base64url");
}

const entitlementKey = (organizationId: string, tripId: string) => `${organizationId}\u0000${tripId}`;

/**
 * Adaptateur de paiement simulé (décision 0020 § 2.2) : en mémoire de la portée, sans réseau, sans écriture
 * disque, sans journal. Machine d'états `pending` → un seul état final ; chaque transition et l'écriture
 * du droit se font dans le même bloc synchrone, sans `await` entre la lecture et l'écriture.
 */
export function createMockPaymentAdapter(options: MockPaymentOptions): PaymentAdapter & PaymentSimulator {
  const { offer, trips, now, store, checkoutTtlMs, confirmationDelayMs, entitlementTtlMs, simulationPath } = options;
  const randomId = options.randomId ?? randomCheckoutId;

  /** Droit en cours ; un droit de la portée par défaut expire après `entitlementTtlMs`. */
  function entitled(organizationId: string, tripId: string): boolean {
    const key = entitlementKey(organizationId, tripId);
    const entitlement = store.entitlements.get(key);
    if (!entitlement) return false;
    if (entitlementTtlMs !== undefined && now() - entitlement.at >= entitlementTtlMs) {
      store.entitlements.delete(key);
      return false;
    }
    return true;
  }

  function grant(organizationId: string, tripId: string): void {
    store.entitlements.set(entitlementKey(organizationId, tripId), { organizationId, tripId, at: now() });
    while (store.entitlements.size > MAX_ENTITLEMENTS_PER_SCOPE) {
      const oldest = store.entitlements.keys().next().value;
      if (oldest === undefined) break;
      store.entitlements.delete(oldest);
    }
  }

  /** Seule fonction de transition, pour l'application immédiate comme différée. Synchrone. */
  function apply(record: CheckoutRecord, outcome: CheckoutOutcome): void {
    if (record.status !== "pending") return;
    if (outcome === "succeeded") {
      if (entitled(record.organizationId, record.tripId)) {
        record.status = "duplicate";
      } else {
        grant(record.organizationId, record.tripId);
        record.status = "succeeded";
      }
      return;
    }
    record.status = outcome;
  }

  /** Délai et expiration, évalués à la lecture sur l'horloge de la portée. Synchrone. */
  function settle(record: CheckoutRecord): void {
    if (record.status !== "pending") return;
    const t = now();
    if (record.outcome) {
      if (t >= record.outcome.at + confirmationDelayMs) apply(record, record.outcome.outcome);
      return;
    }
    if (t >= record.createdAt + checkoutTtlMs) record.status = "expired";
  }

  function find(ctx: AdapterContext, checkoutId: string): CheckoutRecord | undefined {
    const record = store.checkouts.get(checkoutId);
    return record && record.organizationId === ctx.organizationId ? record : undefined;
  }

  function view(record: CheckoutRecord): CheckoutStatus {
    return CheckoutStatusSchema.parse({
      checkoutId: record.checkoutId,
      tripId: record.tripId,
      method: record.method,
      status: record.status,
      priceVariant: record.priceVariant,
      amount: record.amount,
      currency: record.currency,
    });
  }

  function settleTrip(ctx: AdapterContext, tripId: string): void {
    for (const record of store.checkouts.values()) {
      if (record.organizationId === ctx.organizationId && record.tripId === tripId) settle(record);
    }
  }

  return {
    async getOffer(ctx, tripId) {
      const trip = await trips.getTrip(ctx, tripId);
      if (!trip) return fail("not_found");
      return ok(OfferSchema.parse({ tripId: trip.id, ...offer }));
    },

    async createCheckout(ctx, request) {
      const trip = await trips.getTrip(ctx, request.tripId);
      if (!trip) return fail("not_found");
      // Lecture et écriture dans le même bloc synchrone, après le seul `await`.
      settleTrip(ctx, trip.id);
      if (trip.unlocked || entitled(ctx.organizationId, trip.id)) return fail("already_unlocked");
      const checkoutId = randomId();
      store.checkouts.set(checkoutId, {
        checkoutId,
        organizationId: ctx.organizationId,
        tripId: trip.id,
        method: request.method,
        priceVariant: offer.priceVariant,
        amount: offer.amount,
        currency: offer.currency,
        createdAt: now(),
        status: "pending",
      });
      while (store.checkouts.size > MAX_CHECKOUTS_PER_SCOPE) {
        const oldest = store.checkouts.keys().next().value;
        if (oldest === undefined) break;
        store.checkouts.delete(oldest);
      }
      return ok(CheckoutStartSchema.parse({ checkoutId, redirectUrl: simulationPath(trip.id, checkoutId) }));
    },

    async getCheckoutStatus(ctx, checkoutId): Promise<Result<CheckoutStatus>> {
      const record = find(ctx, checkoutId);
      if (!record) return fail("not_found");
      settle(record);
      return ok(view(record));
    },

    async getEntitlement(ctx, tripId) {
      settleTrip(ctx, tripId);
      return { unlocked: entitled(ctx.organizationId, tripId) };
    },

    async simulateOutcome(ctx, checkoutId, outcome) {
      const record = find(ctx, checkoutId);
      if (!record) return fail("not_found");
      settle(record);
      // Paiement déjà conclu, expiré, ou issue déjà reçue : rien ne change (idempotence).
      if (record.status === "pending" && !record.outcome) {
        record.outcome = { outcome, at: now() };
        settle(record);
      }
      return ok(view(record));
    },
  };
}
