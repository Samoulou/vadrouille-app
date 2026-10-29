import type {
  BriefRequest,
  CheckoutRequest,
  CodeRequest,
  CodeVerification,
  CheckoutStart,
  CheckoutStatus,
  CreatedTrip,
  CreatedShareLink,
  Day,
  DayMap,
  DeckSession,
  FullTripStatus,
  GenerationStatus,
  InferredBrief,
  LodgingRequest,
  LodgingSuggestion,
  Offer,
  PreviewSlot,
  Proposal,
  ReplacementOffer,
  ReplacementWrite,
  Result,
  RetryGenerationRequest,
  Session,
  ShareStatus,
  SharedDayView,
  SharedTripView,
  Trip,
  TripRequest,
  TripSummary,
} from "@/contracts";
import type { AuthMode, CheckoutOutcome } from "@/contracts/values";

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
  /**
   * État du tri enregistré (spécification B10, B10a point 5 ; décision 0112 § 4 point 1). `mock` et `prototype` :
   * toujours `null` (l'écran garde la session en mémoire de F6, B10-PO-18). `api` : un `DeckSession` pour tout voyage
   * de l'organisation, même sans carte ; `null` pour un voyage inconnu ou d'une autre organisation, et tant que la
   * migration du tri enregistré n'est pas appliquée à la base (repli journalisé, amendement 1 de la décision 0112).
   */
  getDeckSession(ctx: AdapterContext, tripId: string): Promise<DeckSession | null>;
  /**
   * Voyage d'essai (spécification E2E-essai, lot 1 ; décision 0124 § 4) : `true` seulement pour un voyage de
   * l'organisation qui suit le parcours d'essai (tri sans question, choix sans effet sur le programme, journées
   * « À débloquer »). Facultatif : absent (`mock`, `api`), il vaut `false` ; lu par `isTrialTrip` de `@/adapters`.
   */
  isTrialTrip?(ctx: AdapterContext, tripId: string): Promise<boolean>;
  /**
   * Remplacer une étape (écran 14 ; tâche M1g, ticket 869) par une autre proposition déjà vérifiée du voyage, en une
   * nouvelle version annulable. Facultatif : présent sur `api` seulement (`mock` sert son jeu simulé de révision,
   * `getRevisionFixtures` ; `prototype` n'en a pas). Entrées reçues en `unknown`, revalidées par le cas d'usage.
   */
  readonly revision?: RevisionAdapter;
}

/**
 * Révision enregistrée d'un voyage (M1g) : cas d'usage de `src/server/versions/remplacement.ts`, dans le cadre commun des
 * actions sur un voyage. Le contexte est celui **de la session** (jamais une valeur de l'entrée) ; `null` : sans session.
 */
export interface RevisionAdapter {
  /** Version courante du voyage, base de la première demande d'aperçu ; `not_found` hors organisation. */
  currentVersion(ctx: AdapterContext | null, input: unknown): Promise<Result<number>>;
  previewReplacement(ctx: AdapterContext | null, input: unknown): Promise<Result<ReplacementOffer>>;
  applyReplacement(ctx: AdapterContext | null, input: unknown): Promise<Result<ReplacementWrite>>;
  undoReplacement(ctx: AdapterContext | null, input: unknown): Promise<Result<ReplacementWrite>>;
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
  /**
   * Écran 3 (F8b) : quartier conseillé et jusqu'à 3 logements pour la ville `request.city`, ou `no_option`.
   * Anonyme. Calculé par le moteur avec B9 (0017 § 3.6) ; noms et raisons maison. Sortie revalidée par l'action.
   */
  suggestLodging(request: LodgingRequest): Promise<Result<LodgingSuggestion>>;
  /**
   * Lancement (F8c) : crée le voyage de l'organisation `ctx` (celle de la session, jamais une valeur du navigateur),
   * idempotent par (organisation, `requestId`) ; `active_preview_exists` (avec le voyage en préparation) si une
   * génération de l'organisation n'est pas finie. Sortie revalidée par l'action.
   */
  createTrip(ctx: AdapterContext, request: TripRequest): Promise<Result<CreatedTrip>>;
  /**
   * Écran 5 (F8c) : avancement de la génération du voyage, sans nom de lieu ; `not_found` pour un voyage inconnu ou
   * d'une autre organisation (contrôle d'appartenance repris par B3 et B9, 0017 § 3.6).
   */
  getGenerationStatus(ctx: AdapterContext, tripId: string): Promise<Result<GenerationStatus>>;
  /**
   * Nouvel essai de l'écran 5 (B9b, B9-PO-9 ; 0081 B9-TL-11) : nouvelle exécution `preview` du même voyage si et
   * seulement si la dernière est `failed` et `retryable` ; idempotent par (organisation, `requestId`) ; refus sans
   * écriture : `validation_failed` (rien à relancer ; toujours pour `kind: "full"` avant B9d), `active_preview_exists`
   * (autre génération de l'organisation en cours), `not_found`. Sortie revalidée par l'action.
   */
  retryGeneration(ctx: AdapterContext, request: RetryGenerationRequest): Promise<Result<CreatedTrip>>;
  /**
   * Séjour et 6b (0087 § 1.5) : état du voyage complet, source des deux bandeaux `error` (`none`, `preparing`,
   * `ready`, `incomplete`, `failed` avec `retryable`), sans nom de lieu, raison d'échec ni reprises restantes ;
   * `not_found` pour un voyage inconnu ou d'une autre organisation. Cas d'usage de B9d (expiration et réconciliation
   * de `getGenerationStatus`, jamais de relance d'une ligne `failed`). Sortie revalidée par l'action.
   */
  getFullTripStatus(ctx: AdapterContext, tripId: string): Promise<Result<FullTripStatus>>;
}

/**
 * Limites de la connexion par code (spécification F8, écran 4 ; F8-PO-9) : configuration de l'adaptateur, lue
 * par l'interface (« valable 10 minutes ») et par les tests, jamais en dur ailleurs. Valeurs de phase 0 : elles
 * décrivent la simulation et ne fixent pas les seuils réels de B3 (Q86).
 */
export interface AuthConfig {
  codeTtlMs: number;
  maxAttempts: number;
  maxCodeRequests: number;
  codeRequestWindowMs: number;
}

/**
 * Connexion par email et code (décision 0017 § 3.1, F8-TL-3), simulée en phase 0 (`mock-auth.ts`), réelle avec
 * B3. `requestCode` et `verifyCode` sont anonymes et suivent la même machine d'états pour une adresse connue ou
 * inconnue : seules les sessions diffèrent (identifiant de personne), jamais la réponse visible (F8-PO-9, 0017 § 4).
 */
export interface AuthAdapter {
  readonly config: AuthConfig;
  /** `simulated` tant que l'adaptateur est `mock` : l'écran 4 affiche l'avertissement (0017 § 3.5). */
  readonly mode: AuthMode;
  /** Ouvre un code actif (durée `codeTtlMs`, essais à zéro) ; invalide le précédent ; `rate_limited` au-delà de la limite. */
  requestCode(request: CodeRequest): Promise<Result<{ sent: true }>>;
  /** `invalid_code`, `too_many_attempts`, `code_expired` ; la réussite ouvre la session de la portée. */
  verifyCode(request: CodeVerification): Promise<Result<Session>>;
  getSession(): Promise<Session | null>;
  signOut(): Promise<void>;
}

/**
 * Partage (spécification F10, F10-TL-7 ; décision 0039) : un lien privé par voyage débloqué, révocable, valable
 * jusqu'à la fin du partage (`accessUntil(trip.end, accessDaysAfterReturn)`, à l'heure de la destination). Simulé en
 * phase 0 (`mock-share.ts`, état de la portée de simulation) ; B12 le remplace par la table `share_links` sans changer
 * l'interface. Voyage inconnu, d'une autre organisation ou non débloqué : `not_found`, exactement comme un inconnu.
 */
export interface ShareAdapter {
  /** Désactive le lien actif éventuel et en crée un nouveau ; seule réponse qui porte le jeton en clair. */
  createLink(ctx: AdapterContext, tripId: string): Promise<Result<CreatedShareLink>>;
  /** Désactive le lien actif éventuel ; renvoie `{ active: false }`. */
  revokeLink(ctx: AdapterContext, tripId: string): Promise<Result<ShareStatus>>;
  /** État du lien, jamais le jeton. */
  getStatus(ctx: AdapterContext, tripId: string): Promise<Result<ShareStatus>>;
  /**
   * Vue partagée `RP` : projection stricte du voyage et de ses points de carte ; `null` pour un jeton inconnu,
   * désactivé, expiré ou mal formé, sans dire lequel. Une projection non conforme lève une erreur (page d'erreur).
   */
  getSharedTrip(token: string): Promise<SharedTripView | null>;
  /** Vue partagée `RPJ` du jour `index` (1 = J1) ; `null` comme `getSharedTrip`, ou pour un jour hors du voyage. */
  getSharedDay(token: string, index: number): Promise<SharedDayView | null>;
}
