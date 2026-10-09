import { unlockRoutes } from "@/features/presentation/routes";
import { OFFER_CONFIG } from "@/server/config/offer";

import { counterpartOf, mockTripAdapter } from "./mock";
import { createMockPaymentAdapter } from "./mock-payment";
import { withSimulatedUnlock } from "./mock-unlock";
import { adapterChoice, paymentAvailable } from "./payment-guard";
import { defaultScope, getSimulationScope, type SimulationScope } from "./simulation";
import type { PaymentAdapter, PaymentSimulator, TripAdapter } from "./types";

export type { AdapterContext, PaymentAdapter, PaymentSimulator, TripAdapter } from "./types";
export { MOCK_DEMO_TRIP, MOCK_DEMO_UNLOCKED_TRIP } from "./mock";
export { getRequestContext } from "./context";
export { paymentAvailable, paymentDemoAllowed } from "./payment-guard";
export { getSimulationScope, type SimulationScope } from "./simulation";

/**
 * Vrai quand l'adaptateur de données est `mock` (`DATA_ADAPTER` absent, vide ou `mock`), faux pour
 * toute autre valeur, sans lever d'erreur (spécification D1, D1-PO-1). Ne dépend ni de `NODE_ENV`
 * ni des pages de développement.
 */
export function isMockAdapter(value: string | undefined = process.env.DATA_ADAPTER): boolean {
  return adapterChoice(value) === "mock";
}

/**
 * Choisit l'adaptateur selon la variable serveur `DATA_ADAPTER`
 * (`mock` par défaut). Sans préfixe `NEXT_PUBLIC_`, elle n'est jamais
 * exposée au navigateur.
 */
export function getTripAdapter(value: string | undefined = process.env.DATA_ADAPTER): TripAdapter {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock":
      return mockTripAdapter;
    case "api":
      throw new Error("adaptateur api non implémenté");
    default:
      throw new Error(`DATA_ADAPTER inconnu : « ${choice} » (valeurs : mock, api)`);
  }
}

/** Durées de la simulation de paiement (décision 0020 § 6). */
export const CHECKOUT_TTL_MS = 30 * 60_000;
export const DEMO_UNLOCK_TTL_MS = 30 * 60_000;

function paymentAdapterChoice(value: string | undefined = process.env.PAYMENT_ADAPTER): "mock" {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock":
      return "mock";
    case "stripe":
      throw new Error("adaptateur de paiement stripe non implémenté (tâche de paiement réel, après G0 et Q26)");
    default:
      throw new Error(`PAYMENT_ADAPTER inconnu : « ${choice} » (valeurs : mock, stripe)`);
  }
}

function mockPaymentFor(scope: SimulationScope): PaymentAdapter & PaymentSimulator {
  return createMockPaymentAdapter({
    offer: OFFER_CONFIG,
    trips: getTripAdapter(),
    now: () => scope.clock.now(),
    store: scope.payment,
    checkoutTtlMs: CHECKOUT_TTL_MS,
    confirmationDelayMs: scope.payment.confirmationDelayMs,
    // Portée par défaut, partagée par les visiteurs d'une instance : un droit simulé y expire après 30 min.
    entitlementTtlMs: scope.explicit ? undefined : DEMO_UNLOCK_TTL_MS,
    simulationPath: (tripId, checkoutId) => unlockRoutes(tripId).paiementSimule(checkoutId),
  });
}

/**
 * Adaptateur de paiement (variable serveur `PAYMENT_ADAPTER`, `mock` par défaut). **Filet de sécurité** :
 * lève une erreur si `paymentAvailable()` est faux ; les pages et les actions consultent la garde avant
 * et ne l'atteignent jamais dans ce cas.
 */
export function getPaymentAdapter(options: { scope?: SimulationScope } = {}): PaymentAdapter {
  if (!paymentAvailable()) {
    throw new Error("paiement indisponible : paymentAvailable() est faux (décision 0020 § 2.3)");
  }
  paymentAdapterChoice();
  return mockPaymentFor(options.scope ?? defaultScope());
}

/** Simulation des issues : `null` hors adaptateur simulé autorisé (décision 0020 § 2.3). */
export function getPaymentSimulator(options: { scope?: SimulationScope } = {}): PaymentSimulator | null {
  if (!paymentAvailable()) return null;
  return mockPaymentFor(options.scope ?? defaultScope());
}

/**
 * Lecture des voyages par les pages du voyage (décision 0020 § 3, forme B) : l'adaptateur de base tel quel
 * sans paiement simulé disponible ; sinon, le décorateur qui sert un voyage débloqué par un droit de la
 * portée (lue à chaque appel, par `getSimulationScope()` si `options.scope` est absent).
 */
export function getTripReader(options: { scope?: SimulationScope } = {}): TripAdapter {
  const base = getTripAdapter();
  if (!paymentAvailable()) return base;
  return withSimulatedUnlock(
    base,
    async (ctx, tripId) => mockPaymentFor(options.scope ?? (await getSimulationScope())).getEntitlement(ctx, tripId),
    counterpartOf,
  );
}
