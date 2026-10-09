import { headers } from "next/headers";

import type { CheckoutOutcome, CheckoutStatusCode, Currency, PaymentMethod, PriceVariant } from "@/contracts/values";
import { devPagesEnabled, isProductionDeployment } from "@/dev/flags";

/**
 * Portée et horloge des simulations côté serveur (décision 0017 § 10, créée par F9a sans la partie
 * `auth` selon 0020 § 6). Module serveur : `getSimulationScope()` lit `headers()` de Next.js.
 *
 * - La portée par défaut suit l'horloge réelle ; tous les visiteurs d'une instance la partagent.
 * - Une portée explicite (tests) a une horloge manuelle, fixée par `reset` et avancée par `advanceClock` :
 *   entre deux avances, le temps du serveur ne bouge pas.
 * - L'état vit en mémoire du processus, sur `globalThis` pour survivre au rechargement à chaud. Les
 *   instances ne partagent rien (décision 0002 : aucun stockage propre à Vercel).
 */

export const SIMULATION_HEADER = "x-vadrouille-simulation";
const SCOPE_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED = new Set(["default", "__proto__", "constructor", "prototype"]);

/** Bornes (0017 § 10.4 et 0020 § 6). */
export const MAX_SCOPES = 1000;
export const MAX_CHECKOUTS_PER_SCOPE = 50;
export const MAX_ENTITLEMENTS_PER_SCOPE = 20;

export interface Clock {
  now(): number;
}

/** Un paiement simulé : identifiant, organisation, voyage, moyen, instantané du prix, instants. Rien d'autre. */
export interface CheckoutRecord {
  checkoutId: string;
  organizationId: string;
  tripId: string;
  method: PaymentMethod;
  priceVariant: PriceVariant;
  amount: number;
  currency: Currency;
  createdAt: number;
  status: CheckoutStatusCode;
  /** Issue reçue (rôle du webhook du prestataire) et son instant ; appliquée après `confirmationDelayMs`. */
  outcome?: { outcome: CheckoutOutcome; at: number };
}

/** Droit « voyage débloqué » acquis par un paiement simulé. */
export interface EntitlementRecord {
  organizationId: string;
  tripId: string;
  at: number;
}

export interface PaymentStore {
  checkouts: Map<string, CheckoutRecord>;
  /** Clé : `${organizationId}\u0000${tripId}`. */
  entitlements: Map<string, EntitlementRecord>;
  /** Délai de confirmation simulé, réglé par `R-sim` (`configurePayment`) dans une portée explicite. */
  confirmationDelayMs: number;
}

export interface SimulationScope {
  name: string;
  explicit: boolean;
  clock: Clock;
  payment: PaymentStore;
}

interface ManualClock extends Clock {
  set(ms: number): void;
  advance(ms: number): void;
}

function manualClock(start: number): ManualClock {
  let current = start;
  return {
    now: () => current,
    set: (ms) => {
      current = ms;
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

function emptyPaymentStore(): PaymentStore {
  return { checkouts: new Map(), entitlements: new Map(), confirmationDelayMs: 0 };
}

interface Registry {
  defaultScope: SimulationScope;
  explicit: Map<string, SimulationScope & { clock: ManualClock }>;
}

const REGISTRY_KEY = Symbol.for("vadrouille.simulation");

function registry(): Registry {
  const holder = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  holder[REGISTRY_KEY] ??= {
    defaultScope: { name: "default", explicit: false, clock: { now: () => Date.now() }, payment: emptyPaymentStore() },
    explicit: new Map(),
  };
  return holder[REGISTRY_KEY];
}

/** Nom de portée explicite valide : motif, et ni `default` ni un nom réservé de JavaScript. */
export function isScopeName(value: string | null | undefined): value is string {
  return typeof value === "string" && SCOPE_NAME.test(value) && !RESERVED.has(value);
}

export function defaultScope(): SimulationScope {
  return registry().defaultScope;
}

/** Portée explicite, créée au premier usage (horloge figée à l'instant de création), la plus ancienne retirée au-delà de 1 000. */
export function explicitScope(name: string): SimulationScope & { clock: ManualClock } {
  if (!isScopeName(name)) throw new Error("nom de portée invalide");
  const scopes = registry().explicit;
  let scope = scopes.get(name);
  if (scope) {
    // Plus récemment utilisée : replacée en fin d'ordre d'insertion.
    scopes.delete(name);
  } else {
    scope = { name, explicit: true, clock: manualClock(Date.now()), payment: emptyPaymentStore() };
  }
  scopes.set(name, scope);
  while (scopes.size > MAX_SCOPES) {
    const oldest = scopes.keys().next().value;
    if (oldest === undefined) break;
    scopes.delete(oldest);
  }
  return scope;
}

/** Vide paiements et droits de la portée, remet le délai de confirmation à 0 et fixe l'horloge. */
export function resetScope(name: string, now: number): void {
  const scope = explicitScope(name);
  scope.payment = emptyPaymentStore();
  scope.clock.set(now);
}

export function advanceClock(name: string, ms: number): void {
  explicitScope(name).clock.advance(ms);
}

export function configurePayment(name: string, confirmationDelayMs: number): void {
  explicitScope(name).payment.confirmationDelayMs = confirmationDelayMs;
}

/** Portée explicite lue par l'en-tête seulement si les pages de développement sont actives, hors production. */
export function simulationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return devPagesEnabled(env) && !isProductionDeployment(env);
}

/**
 * Portée de la requête : l'en-tête `x-vadrouille-simulation`, posé par les tests vers l'origine de
 * l'application seulement (0017 § 10.3), n'a d'effet que si `simulationEnabled()`. Valeur invalide ou
 * absente : portée par défaut, sans erreur. Hors requête (tests unitaires) : portée par défaut.
 */
export async function getSimulationScope(): Promise<SimulationScope> {
  if (!simulationEnabled()) return defaultScope();
  let value: string | null = null;
  try {
    value = (await headers()).get(SIMULATION_HEADER);
  } catch (error) {
    // Erreurs internes de Next.js (rendu dynamique, `notFound`…) : elles portent un `digest` et sont relancées.
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return defaultScope();
  }
  return isScopeName(value) ? explicitScope(value) : defaultScope();
}
