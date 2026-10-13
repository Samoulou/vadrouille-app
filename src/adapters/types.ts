import type {
  BriefRequest,
  CheckoutRequest,
  CheckoutStart,
  CheckoutStatus,
  Day,
  DayMap,
  InferredBrief,
  Offer,
  PreviewSlot,
  Proposal,
  Result,
  Trip,
  TripSummary,
} from "@/contracts";
import type { CheckoutOutcome } from "@/contracts/values";

/** Rôle de la personne dans l'organisation (évolution E6). */
export type MemberRole = "owner" | "member";

/**
 * Contexte de chaque appel : toute donnée appartient à une organisation
 * (cadrage § 6.8). Un adaptateur ne renvoie jamais la donnée d'une autre
 * organisation. `userId` et `role` (évolution E6 de B2) viennent de la session avec B3 ; en phase 0, du
 * contexte simulé.
 */
export interface AdapterContext {
  organizationId: string;
  userId: string;
  role: MemberRole;
}

/** Accès aux voyages, simulé (`mock`) ou réel (`api`, avec le back-end). */
export interface TripAdapter {
  /**
   * Résumés des voyages de l'organisation, pour « Mes voyages » (décision 0021 § 2), **sans ordre garanti** :
   * le classement est fait par l'écran. Autre organisation : liste vide.
   */
  listTrips(ctx: AdapterContext): Promise<TripSummary[]>;
  getTrip(ctx: AdapterContext, tripId: string): Promise<Trip | null>;
  /** `index` : 1 = J1. */
  getDay(ctx: AdapterContext, tripId: string, index: number): Promise<Day | null>;
  listProposals(ctx: AdapterContext, tripId: string): Promise<Proposal[]>;
  /**
   * Aperçu d'un voyage non débloqué (évolution E7, écran 6) : 8 cases au plus, dans l'ordre, validées par
   * `PreviewSlotsSchema`. Voyage inconnu ou d'une autre organisation : liste vide, comme `listProposals`.
   */
  listPreviewSlots(ctx: AdapterContext, tripId: string): Promise<PreviewSlot[]>;
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

/**
 * Création du voyage (décision 0017 § 3.1, F8-TL-3), simulée en phase 0. `structureBrief` est anonyme : il ne
 * prend pas de contexte d'organisation. F8a livre `structureBrief` ; F8b ajoute `suggestLodging`, F8c
 * `createTrip` et `getGenerationStatus`. La sortie est revalidée par l'action (`InferredBriefSchema`).
 */
export interface CreationAdapter {
  /** Seule étape IA des écrans 1 à 4 (0017 § 3.6) : le récit est une donnée, jamais une instruction. */
  structureBrief(request: BriefRequest): Promise<Result<InferredBrief>>;
}
