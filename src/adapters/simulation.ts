import { randomBytes } from "node:crypto";

import { headers } from "next/headers";

import type { CheckoutOutcome, CheckoutStatusCode, Currency, PaymentMethod, PriceVariant } from "@/contracts/values";
import { devPagesEnabled, isProductionDeployment } from "@/dev/flags";
import { FIXED_SHARE_LINKS } from "@/mocks/edimbourg-partage";

import { hashShareToken } from "./share-token";

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
/** Liens de partage créés gardés par portée (F10-PO-18) ; au-delà, le plus ancien est retiré et répond 404. */
export const MAX_SHARE_LINKS_PER_SCOPE = 20;
/** Adresses (clés HMAC) gardées par portée pour la connexion simulée (0017 § 10.4) ; au-delà, la plus ancienne est retirée. */
export const MAX_AUTH_ADDRESSES_PER_SCOPE = 50;

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

/**
 * Lien de partage simulé (spécification F10, F10-TL-7) : **empreinte** du jeton, jamais le jeton en clair ; voyage,
 * organisation, personne propriétaire, instants. La date de fin n'est pas gardée : elle se calcule à la lecture.
 */
export interface ShareLinkRecord {
  tokenHash: string;
  tripId: string;
  organizationId: string;
  userId: string;
  createdAt: number;
  revokedAt?: number;
  /** Lien fixe du jeu simulé (`src/mocks/edimbourg-partage.ts`) : jamais retiré par la limite de la portée. */
  fixed: boolean;
}

export interface ShareStore {
  /** Clé : empreinte du jeton. */
  links: Map<string, ShareLinkRecord>;
}

/**
 * Code actif d'une adresse (connexion simulée, 0017 § 3.5) : instants et compteur seulement. Le code n'est pas
 * recopié (il est comparé à la constante du jeu simulé) ; l'adresse n'est jamais gardée en clair.
 */
export interface ActiveCode {
  expiresAt: number;
  attempts: number;
  /** `too_many_attempts` atteint : tout essai suivant le renvoie jusqu'à une nouvelle demande. */
  locked: boolean;
}

/** État d'une adresse, rangé sous le HMAC-SHA-256 de l'adresse normalisée. */
export interface AuthAddressRecord {
  /** Instants des demandes de code retenues dans la fenêtre glissante. */
  requests: number[];
  code: ActiveCode | null;
}

export interface AuthStore {
  /** Clé : HMAC de l'adresse normalisée ; ordre d'insertion = ordre d'usage (la plus ancienne est retirée). */
  addresses: Map<string, AuthAddressRecord>;
  /** Session simulée de la portée (aucun cookie : 0017 § 3.5) ; une connexion vaut pour toute la portée. */
  session: { sessionId: string; userId: string; organizationId: string } | null;
}

export interface SimulationScope {
  name: string;
  explicit: boolean;
  clock: Clock;
  payment: PaymentStore;
  share: ShareStore;
  auth: AuthStore;
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

function emptyAuthStore(): AuthStore {
  return { addresses: new Map(), session: null };
}

function emptyPaymentStore(): PaymentStore {
  return { checkouts: new Map(), entitlements: new Map(), confirmationDelayMs: 0 };
}

/** État initial du partage d'une portée : les deux liens fixes du jeu simulé (F10-PO-18), aucun lien créé. */
export function initialShareStore(): ShareStore {
  const links = new Map<string, ShareLinkRecord>();
  for (const link of FIXED_SHARE_LINKS) {
    const tokenHash = hashShareToken(link.token);
    links.set(tokenHash, {
      tokenHash,
      tripId: link.tripId,
      organizationId: link.organizationId,
      userId: link.userId,
      createdAt: Date.parse(link.createdAt),
      ...(link.revokedAt === undefined ? {} : { revokedAt: Date.parse(link.revokedAt) }),
      fixed: true,
    });
  }
  return { links };
}

interface Registry {
  defaultScope: SimulationScope;
  explicit: Map<string, SimulationScope & { clock: ManualClock }>;
  /**
   * Clé HMAC des adresses de la connexion simulée (0017 § 3.5) : tirée une fois par processus, jamais écrite,
   * gardée ici pour que le rechargement à chaud ne la change pas (compteurs cohérents).
   */
  authKey: Buffer;
}

const REGISTRY_KEY = Symbol.for("vadrouille.simulation");

function registry(): Registry {
  const holder = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  holder[REGISTRY_KEY] ??= {
    defaultScope: {
      name: "default",
      explicit: false,
      clock: { now: () => Date.now() },
      payment: emptyPaymentStore(),
      share: initialShareStore(),
      auth: emptyAuthStore(),
    },
    explicit: new Map(),
    authKey: randomBytes(32),
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
    scope = {
      name,
      explicit: true,
      clock: manualClock(Date.now()),
      payment: emptyPaymentStore(),
      share: initialShareStore(),
      auth: emptyAuthStore(),
    };
  }
  scopes.set(name, scope);
  while (scopes.size > MAX_SCOPES) {
    const oldest = scopes.keys().next().value;
    if (oldest === undefined) break;
    scopes.delete(oldest);
  }
  return scope;
}

/**
 * Vide paiements et droits de la portée, remet le délai de confirmation à 0, efface les liens de partage créés et
 * rétablit les liens fixes (F10-PO-18), vide les codes, compteurs et session de la connexion simulée (F8b), et fixe
 * l'horloge.
 */
export function resetScope(name: string, now: number): void {
  const scope = explicitScope(name);
  scope.payment = emptyPaymentStore();
  scope.share = initialShareStore();
  scope.auth = emptyAuthStore();
  scope.clock.set(now);
}

/** Clé HMAC du processus pour les adresses de la connexion simulée (0017 § 3.5). */
export function authHmacKey(): Buffer {
  return registry().authKey;
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
