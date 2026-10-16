import type { RevisionFixtures, Trip } from "@/contracts";
import { unlockRoutes } from "@/features/presentation/routes";
import { OFFER_CONFIG } from "@/server/config/offer";

import { assertAuthAdapter } from "./auth-guard";
import { counterpartOf, getMockRevisionFixtures, mockTripAdapter } from "./mock";
import { createMockAuthAdapter } from "./mock-auth";
import { createMockCreationAdapter } from "./mock-creation";
import { createMockPaymentAdapter } from "./mock-payment";
import { createMockShareAdapter, shareEnded } from "./mock-share";
import { prototypeTripAdapter } from "./prototype-instance";
import { withSimulatedUnlock } from "./mock-unlock";
import { adapterChoice, paymentAvailable } from "./payment-guard";
import { shareAvailable } from "./share-guard";
import { authHmacKey, defaultScope, getSimulationScope, MAX_AUTH_ADDRESSES_PER_SCOPE, type SimulationScope } from "./simulation";
import type { AdapterContext, AuthAdapter, CreationAdapter, PaymentAdapter, PaymentSimulator, ShareAdapter, TripAdapter } from "./types";

export type {
  AdapterContext,
  AuthAdapter,
  AuthConfig,
  CreationAdapter,
  MemberRole,
  PaymentAdapter,
  PaymentSimulator,
  ShareAdapter,
  TripAdapter,
} from "./types";
export { MOCK_DEMO_TRIP, MOCK_DEMO_UNLOCKED_TRIP } from "./mock";
/**
 * Brouillon de démonstration de `R3-dev` (décision 0017 § 7) : réservé aux pages de développement et aux tests,
 * comme `MOCK_DEMO_TRIP`. Jamais lu par une route produit.
 */
export { MOCK_DEMO_TRIP_DRAFT as MOCK_DEMO_DRAFT } from "@/mocks/creation-edimbourg";
export { authAdapterChoice, mockAuthAllowed } from "./auth-guard";
export { getRequestContext } from "./context";
export { isPrototypeAdapter, paymentAvailable, paymentDemoAllowed } from "./payment-guard";
export { shareAvailable, shareDemoAvailable } from "./share-guard";
export { getSimulationScope, type SimulationScope } from "./simulation";
export { brancherLectureProgrammesReels, prototypeRelectures } from "./prototype-instance";

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
 * exposée au navigateur. `prototype` (décision 0032 § A4) lève une erreur hors de la liste blanche
 * `prototypeAdapterAllowed(env)`.
 */
export function getTripAdapter(value: string | undefined = process.env.DATA_ADAPTER, env: NodeJS.ProcessEnv = process.env): TripAdapter {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock":
      return mockTripAdapter;
    case "api":
      throw new Error("adaptateur api non implémenté");
    case "prototype":
      return prototypeTripAdapter(env);
    default:
      throw new Error(`DATA_ADAPTER inconnu : « ${choice} » (valeurs : mock, api, prototype)`);
  }
}

/**
 * Création du voyage (décision 0017 § 3.1), selon la variable serveur `DATA_ADAPTER` (`mock` par défaut, même
 * normalisation que `getTripAdapter`, erreur pour une valeur inconnue). Sans portée de simulation (§ 10) :
 * `structureBrief` et `suggestLodging` ne gardent rien ; F8c ajoutera la portée pour y ranger son état.
 */
export function getCreationAdapter(value: string | undefined = process.env.DATA_ADAPTER): CreationAdapter {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock":
      return createMockCreationAdapter();
    case "api":
      throw new Error("adaptateur api de création non implémenté (B9)");
    case "prototype":
      throw new Error("création indisponible avec l'adaptateur prototype (spécification P0)");
    default:
      throw new Error(`DATA_ADAPTER inconnu : « ${choice} » (valeurs : mock, api, prototype)`);
  }
}

/**
 * Connexion (décision 0017 § 3.1 et § 11.2), selon la variable serveur `AUTH_ADAPTER` (`mock` par défaut). **Garde
 * fermée par défaut** : lève une erreur à l'appel pour l'adaptateur `mock` sur un déploiement de production ou
 * hors `development`/`test` sans `VADROUILLE_DEMO_AUTH=1`, et pour un adaptateur inconnu ou pas encore livré
 * (`better-auth`, B3). Aucun repli permissif. L'état simulé vit dans la portée `options.scope` (portée par défaut
 * sinon) ; `env` sert aux tests.
 */
export function getAuthAdapter(options: { scope?: SimulationScope; env?: NodeJS.ProcessEnv } = {}): AuthAdapter {
  assertAuthAdapter(options.env);
  const scope = options.scope ?? defaultScope();
  return createMockAuthAdapter({
    now: () => scope.clock.now(),
    store: scope.auth,
    key: authHmacKey(),
    maxAddresses: MAX_AUTH_ADDRESSES_PER_SCOPE,
  });
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

/**
 * Jeu simulé de révision d'un voyage (spécification F7, F7-TL-3 ; décision 0016 § 6) : fonction à part, et non une
 * méthode de `TripAdapter` (l'adaptateur `api` n'aurait rien à y renvoyer ; B11 remplace l'ensemble par les Server
 * Actions). `null` quand l'adaptateur configuré n'est pas `mock`, et pour un voyage inconnu ou d'une autre
 * organisation. Lu par la mise en page du voyage, qui le transmet à `TripShell`.
 */
export async function getRevisionFixtures(
  ctx: AdapterContext,
  tripId: string,
  value: string | undefined = process.env.DATA_ADAPTER,
): Promise<RevisionFixtures | null> {
  if (!isMockAdapter(value)) return null;
  return getMockRevisionFixtures(ctx, tripId);
}

/**
 * Adaptateur de partage (spécification F10, F10-TL-7 ; décision 0039), simulé dans la portée de la requête : liens en
 * mémoire de la portée, voyages lus par `getTripReader()` de la même portée, durée du partage lue dans la
 * configuration serveur. **Filet de sécurité** : lève une erreur si `shareAvailable()` est faux ; les pages et les
 * actions consultent la garde avant et ne l'atteignent jamais dans ce cas.
 */
export function getShareAdapter(options: { scope?: SimulationScope } = {}): ShareAdapter {
  if (!shareAvailable()) {
    throw new Error("partage indisponible : shareAvailable() est faux (spécification F10, F10-TL-7)");
  }
  const scope = options.scope ?? defaultScope();
  return createMockShareAdapter({
    trips: getTripReader({ scope }),
    now: () => scope.clock.now(),
    store: scope.share,
    accessDaysAfterReturn: OFFER_CONFIG.accessDaysAfterReturn,
  });
}

/**
 * Bouton « Partager » du Séjour et de la Journée (F10-PO-13, F10-PO-21) : partage disponible, voyage débloqué et fin
 * du partage pas encore passée à l'horloge de la portée de la requête. Rien n'est lu si la garde est fermée.
 */
export async function shareButtonVisible(trip: Pick<Trip, "unlocked" | "end" | "timeZone">): Promise<boolean> {
  if (!shareAvailable() || !trip.unlocked) return false;
  const scope = await getSimulationScope();
  return !shareEnded(trip, scope.clock.now(), OFFER_CONFIG.accessDaysAfterReturn);
}
