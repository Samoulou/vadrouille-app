import type {
  CheckoutRequest,
  CheckoutStart,
  CheckoutStatus,
  Day,
  DayMap,
  Offer,
  Proposal,
  Result,
  Trip,
} from "@/contracts";
import type { CheckoutOutcome } from "@/contracts/values";

/**
 * Contexte de chaque appel : toute donnée appartient à une organisation
 * (cadrage § 6.8). Un adaptateur ne renvoie jamais la donnée d'une autre
 * organisation.
 */
export interface AdapterContext {
  organizationId: string;
}

/** Accès aux voyages, simulé (`mock`) ou réel (`api`, avec le back-end). */
export interface TripAdapter {
  getTrip(ctx: AdapterContext, tripId: string): Promise<Trip | null>;
  /** `index` : 1 = J1. */
  getDay(ctx: AdapterContext, tripId: string, index: number): Promise<Day | null>;
  listProposals(ctx: AdapterContext, tripId: string): Promise<Proposal[]>;
  /**
   * Positions d'un jour pour la carte (F4-TL-1), `null` si le jour n'a aucune position.
   * Affichage seulement : jamais persistées côté client (handover § 8).
   */
  getDayMap(ctx: AdapterContext, tripId: string, index: number): Promise<DayMap | null>;
  /** Positions de tous les jours du voyage, pour la vue d'ensemble (écran 11). */
  getTripMap(ctx: AdapterContext, tripId: string): Promise<DayMap[]>;
}

/**
 * Paiement (décision 0020 § 2.1), commun au simulé et au futur réel (Stripe Checkout, après G0 et Q26).
 * Isolation par organisation : un voyage ou un paiement d'une autre organisation donne `not_found`,
 * exactement comme un inconnu.
 */
export interface PaymentAdapter {
  /** Offre du voyage : donnée commerciale, prix de la configuration serveur. */
  getOffer(ctx: AdapterContext, tripId: string): Promise<Result<Offer>>;
  /** `already_unlocked` sans créer de paiement si le voyage est déjà débloqué. */
  createCheckout(ctx: AdapterContext, request: CheckoutRequest): Promise<Result<CheckoutStart>>;
  getCheckoutStatus(ctx: AdapterContext, checkoutId: string): Promise<Result<CheckoutStatus>>;
  /** Droit « voyage débloqué » acquis par paiement, lu par `getTripReader()` (§ 3). */
  getEntitlement(ctx: AdapterContext, tripId: string): Promise<{ unlocked: boolean }>;
}

/**
 * Simulation des issues, implémentée seulement par l'adaptateur simulé : elle joue le rôle du webhook du
 * prestataire. Obtenue par `getPaymentSimulator()`, `null` hors adaptateur simulé autorisé.
 */
export interface PaymentSimulator {
  simulateOutcome(ctx: AdapterContext, checkoutId: string, outcome: CheckoutOutcome): Promise<Result<CheckoutStatus>>;
}
