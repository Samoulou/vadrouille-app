/**
 * Valeurs des contrats lues par l'interface, sans import de `zod` (décision 0016 § 3.1, règle 1) :
 * les schémas de `src/contracts` en dérivent, il n'y a donc pas de seconde copie. Le code client lit
 * ces valeurs ici (`@/contracts/values`) et les types depuis `@/contracts` par `import type`.
 *
 * Créé par F9a avec les seules valeurs du paiement (décision 0020 § 1.1) ; T4 y ajoute celles de la carte,
 * de la présentation et de la mesure ; F8a le complète sans renommer.
 *
 * Seuls des `import type` sont permis ici : ils disparaissent à la compilation.
 */
import type { MapPointRef } from "./map";

/**
 * Catégories d'une proposition et vocabulaire des envies du brief (décision 0013 § 3.1 ; codes provisoires de
 * F6-PO-10, complétés par F8a selon 0017 § 8 : `heritage`, `market`, `nightlife`). Source de `CategorySchema`.
 */
export const CATEGORIES = ["museum", "walk", "nature", "tasting", "restaurant", "heritage", "market", "nightlife"] as const;

/**
 * Codes de raison de B0, dans l'ordre d'affichage : Pas mon style, Trop chargé, Trop cher, Trop loin,
 * Autre raison. Source de `PreferenceReasonSchema`.
 */
export const PREFERENCE_REASONS = ["notMyStyle", "tooBusy", "tooExpensive", "tooFar", "other"] as const;

/**
 * Décisions sur une carte de la présentation (B10-PO-2 point 1 ; décision 0112 § 1.1) : « J'aime », « Pas pour moi »,
 * et pour un repas « Je choisis », « Option suivante ». Source de `DeckDecisionSchema.decision`.
 */
export const DECK_DECISIONS = ["like", "dislike", "choose", "nextOption"] as const;
export type DeckDecisionKind = (typeof DECK_DECISIONS)[number];

/**
 * Signaux de `preference_signals.signal` (handover back-end § 6), dans l'ordre de la contrainte `CHECK` de
 * `0000_socle.sql` : les quatre décisions de carte, puis les réponses (`answerYes`, `answerNo`) et la réduction de
 * trajet. Source de `PreferenceSignalSchema.signal` (décision 0112 § 1.5).
 */
export const PREFERENCE_SIGNALS = [...DECK_DECISIONS, "answerYes", "answerNo", "travelReduction"] as const;
export type PreferenceSignalKind = (typeof PREFERENCE_SIGNALS)[number];

/** Origines de `preference_signals.origin` (handover § 6). B10 n'écrit jamais `brief` (spécification B10). */
export const PREFERENCE_SIGNAL_ORIGINS = ["gesture", "question", "brief"] as const;
export type PreferenceSignalOrigin = (typeof PREFERENCE_SIGNAL_ORIGINS)[number];

/** Statuts de `preference_signals.status` (handover § 6) : seuls `confirmed` et `inferred` produisent une préférence. */
export const PREFERENCE_SIGNAL_STATUSES = ["confirmed", "inferred", "cancelled"] as const;
export type PreferenceSignalStatus = (typeof PREFERENCE_SIGNAL_STATUSES)[number];

/** Natures d'une étape (handover § 9). Source de `StopSchema.kind` (décision 0021 § 1.1). */
export const STOP_KINDS = ["activity", "meal", "event"] as const;
export type StopKind = (typeof STOP_KINDS)[number];

/**
 * Sortes d'une ligne « À faire » (décision 0147 § 6.2, T8) : réservation à faire (« Réserver : {nom} », comptée),
 * billet ou engagement déjà pris (`ticket`), bon plan ou autre (`other`). Égale, dans cet ordre, au `CHECK` de
 * `checklist_items.kind` (`db/schema/business.ts`), égalité testée. Source de `ChecklistItemSchema.kind`.
 */
export const CHECKLIST_KINDS = ["reservation", "ticket", "other"] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

/**
 * Nombre de réservations à faire (décision 0021 § 1.1, amendée par 0147 § 6.2) : lignes « À faire » de sorte
 * `reservation` non faites, et elles seules (ni bons plans, ni engagements). Seul calcul des « réservations à faire »,
 * pour le résumé de voyage (`TripSummary.toReserveCount`) et le programme ajusté.
 */
export function countToReserve(checklist: readonly { done: boolean; kind: ChecklistKind }[]): number {
  return checklist.filter((item) => item.kind === "reservation" && !item.done).length;
}

/**
 * Motifs d'un signalement d'erreur sur une étape (décision 0147 § 1, M5-PO-8), dans l'ordre de la feuille : fermé ou
 * n'existe plus, horaires faux, mauvais lieu ou mauvaise adresse, prix faux, autre erreur. Liste fermée, sans texte
 * libre (M5-PO-9) ; égale au `CHECK` de `feedback.reason` posé par la migration M5-D. Source de
 * `StopReportSchema.reason` et du champ `reason` de l'événement de journal `voyages.stop_reported`.
 */
export const STOP_REPORT_REASONS = ["closed", "hours", "wrongPlace", "price", "other"] as const;
export type StopReportReason = (typeof STOP_REPORT_REASONS)[number];

/**
 * Sortes d'une version dans la liste « Versions du programme » (décision 0147 § 5.3 point 1) : version écrite par
 * l'exécution `preview` (`prepared`), révision après le tri (`adjusted`, M1b), voyage complet (`complete`, M1c), puis
 * les retouches de la personne, lues sur la première opération de `trip_versions.patch` (`[add, lock]` donne `added`).
 * Source de `TripVersionSummarySchema.kind` ; le libellé est composé par l'écran, jamais stocké.
 */
export const TRIP_VERSION_KINDS = [
  "prepared",
  "adjusted",
  "complete",
  "replaced",
  "added",
  "moved",
  "locked",
  "unlocked",
  "reverted",
] as const;
export type TripVersionKind = (typeof TRIP_VERSION_KINDS)[number];

/** Versions par page de la liste « Versions du programme » (décision 0147 § 5.3 point 2). */
export const TRIP_VERSIONS_PAGE_SIZE = 20;

/**
 * Texte saisi de la recherche d'un lieu à soi (« Lieu à ajouter », décision 0147 § 3 point 3 ; F7-PO-9) : 2 à 80
 * caractères après retrait des espaces aux extrémités, aucune recherche à la frappe.
 */
export const PLACE_SEARCH_QUERY_LENGTH = { min: 2, max: 80 } as const;
/** Résultats d'une recherche de lieu à soi, au plus (décision 0147 § 3 point 1 : `pageSize: 5`). */
export const PLACE_SEARCH_MAX_RESULTS = 5;
/** Longueur maximale d'un nom ou d'une adresse Google affichés dans un résultat de recherche (décision 0147 § 3 point 3). */
export const GOOGLE_PLACE_LABEL_MAX = 200;

/** Jours de la semaine abrégés, du lundi au dimanche (handover § 9). Source de `WeekdaySchema`. */
export const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."] as const;

/**
 * Jour de la semaine abrégé d'une date ISO « AAAA-MM-JJ » (« 2026-08-29 » → « sam. »), calculé en UTC, sans fuseau
 * horaire (évolution E1 de B2 : `Day` ne porte plus `weekday`). `null` si la date est illisible : chaque appelant
 * choisit sa dégradation. Seul calcul de la règle, pour le moteur, la forme réduite du prototype et l'interface.
 */
export function weekdayOf(date: string): (typeof WEEKDAYS)[number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rang = new Date(`${date}T00:00:00Z`).getUTCDay();
  return Number.isNaN(rang) ? null : (WEEKDAYS.at((rang + 6) % 7) ?? null);
}

/** `weekdayOf` pour une date déjà validée (moteur, forme réduite) : une date illisible est une erreur de programmation. */
export function requireWeekday(date: string): (typeof WEEKDAYS)[number] {
  const jour = weekdayOf(date);
  if (jour === null) throw new RangeError(`date illisible : ${date}`);
  return jour;
}

/**
 * Souhait facultatif de l'écran 14 « Remplacer une étape » : 200 caractères au plus (F7-PO-3). Source de
 * `ReplacementRequestSchema.wish` et du compteur « {n} sur 200 caractères » (décision 0018).
 */
export const WISH_MAX_LENGTH = 200;

/** Au-delà de ce trajet, une proposition doit justifier son détour (cadrage § 3.7). */
export const DETOUR_THRESHOLD_MINUTES = 20;

/** Cases de l'aperçu au plus (évolution E5, `PreviewSlotsSchema`) : les 8 propositions offertes (cadrage § 4). */
export const MAX_PREVIEW_SLOTS = 8;

/** Clé unique d'une référence de point de carte : « stop:<id> » ou « terminus:<role> ». */
export function mapPointKey(ref: MapPointRef): string {
  return ref.type === "stop" ? `stop:${ref.stopId}` : `terminus:${ref.role}`;
}

/**
 * Codes de variante de prix, liste fermée (décision 0020 § 4). Ajouter un code est un changement de
 * contrat qui suit une décision de prix de Samuel (Q2 : 29 CHF pour l'instant).
 */
export const PRICE_VARIANTS = ["chf_29"] as const;
export type PriceVariant = (typeof PRICE_VARIANTS)[number];

export const CURRENCIES = ["CHF"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Moyens de paiement, dans l'ordre d'affichage de l'écran 9 (F9-PO-5). */
export const PAYMENT_METHODS = ["twint", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Codes possibles de « Ce qui est inclus » (écran 9). Ce que l'offre inclut vraiment est dans la
 * configuration serveur et relève de Samuel (Q128) ; les textes sont dans `fr.json`.
 */
export const OFFER_INCLUSIONS = [
  "allDays",
  "mealsAndEvenings",
  "events",
  "replacements",
  "checklist",
  "calendarAndSharing",
  "access",
] as const;
export type OfferInclusion = (typeof OFFER_INCLUSIONS)[number];

/** États d'un paiement : `pending`, puis un seul état final (décision 0020 § 2.2). */
export const CHECKOUT_STATUSES = ["pending", "succeeded", "duplicate", "declined", "cancelled", "expired"] as const;
export type CheckoutStatusCode = (typeof CHECKOUT_STATUSES)[number];

/** États finaux d'échec : bandeau sur l'écran 9 et `payment_failed` (F9-PO-20). */
export const CHECKOUT_FAILURES = ["declined", "cancelled", "expired"] as const;
export type CheckoutFailure = (typeof CHECKOUT_FAILURES)[number];

/** Issues que la page de paiement simulé peut envoyer (rôle du webhook du prestataire). */
export const CHECKOUT_OUTCOMES = ["succeeded", "declined", "cancelled"] as const;
export type CheckoutOutcome = (typeof CHECKOUT_OUTCOMES)[number];

/**
 * `checkoutId` : au moins 122 bits aléatoires en base64url, 22 caractères (décision 0020 § 1.3, amendée par 0097
 * B4-TL-1 point 5 : 128 bits pour l'adaptateur `mock`, `uuid` v4 encodé pour l'adaptateur `simulated`).
 */
export const CHECKOUT_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * Types normalisés d'un événement de paiement (`PaymentEvent`, spécification B4, B4a point 1) : contrat interne du
 * serveur, jamais lu par le client.
 */
export const PAYMENT_EVENT_TYPES = [
  "checkoutCompleted",
  "asyncPaymentSucceeded",
  "asyncPaymentFailed",
  "checkoutExpired",
  "refund",
  "dispute",
  "other",
] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

/** `payment_status` d'une session de paiement, normalisé (B4a point 1). */
export const PAYMENT_EVENT_STATUSES = ["paid", "unpaid", "noPaymentRequired"] as const;
export type PaymentEventStatus = (typeof PAYMENT_EVENT_STATUSES)[number];

/** Identifiant de voyage reçu d'une entrée (règle de 0017 § 1). */
export const TRIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * Identifiant d'un voyage d'essai lancé depuis l'app (spécification E2E-essai, lot 3 ; décision 0125 § 2) :
 * `proto_<slug>_<uuid de l'exécution sans tirets>` ; groupes : slug, puis les 32 chiffres hexadécimaux. Source unique de
 * `lireIdentifiantVoyageSaisi` (`src/domain/identifiant.ts`) et de `voyageEssaiRevisable` (`src/adapters`, décision 0126).
 */
export const APP_TRIAL_TRIP_ID_PATTERN = /^proto_([a-z0-9-]{1,24})_([0-9a-f]{32})$/;

/**
 * Exceptions montrées par la vue partagée (spécification F10, F10-PO-14 ; décision 0039, F10-TL-1) : « À réserver »
 * est une action de la personne qui voyage, jamais montrée au visiteur. Sous-ensemble de `ExceptionSchema` (test).
 */
export const SHARED_EXCEPTIONS = ["toConfirm", "unconfirmed"] as const;
export type SharedException = (typeof SHARED_EXCEPTIONS)[number];

/** Jeton de partage : 32 octets aléatoires en base64url, 43 caractères (F10-TL-7). Seule forme lue par `parseShareToken`. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Jeton de partage **signé, sans stockage** (décision 0135, partage d'un voyage réel du site d'essai) :
 * `v1.<charge>.<mac>`, `charge` = base64url sans remplissage de `voyage~organisation~dernier jour` (14 à 140 octets :
 * deux identifiants de 1 à 64 caractères, deux séparateurs, une date ISO ; soit 19 à 187 caractères), `mac` =
 * HMAC-SHA-256 en base64url (43 caractères) : 234 caractères au plus. Seconde forme lue par `parseShareToken` ; la forme
 * et la signature sont vérifiées par `src/adapters/share-signed-token.ts`, jamais par le navigateur.
 */
export const SIGNED_SHARE_TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]{19,187}\.[A-Za-z0-9_-]{43}$/;

/**
 * Codes d'erreur des actions serveur (format commun de 0017 § 4, `snake_case`). F9a a créé les trois
 * premiers ; F8a ajoute ceux de `structureBrief` (0017 § 4) ; F8b, F8c et B6 l'étendent sans renommer.
 */
export const API_ERROR_CODES = [
  "validation_failed",
  "not_found",
  "already_unlocked",
  "provider_error",
  "rate_limited",
  "cost_cap_reached",
  // B2 (évolution E10, B2-PO-8) : version de base dépassée ; `ApiError.currentVersion` porte la version courante.
  "version_conflict",
  // F8b (décision 0017 § 4) : aucun quartier à proposer (écran 3) ; code de connexion faux, expiré, trop d'essais.
  "no_option",
  "invalid_code",
  "code_expired",
  "too_many_attempts",
  // F8c (décision 0017 § 4) : création du voyage sans session, aperçu déjà en préparation pour l'organisation.
  // `quota_reached` n'est pas un code d'`ApiError` (0077 § 3 point 5) : seulement une raison d'arrêt d'une génération.
  "unauthenticated",
  "active_preview_exists",
  // B6b (décision 0086 § 2.2 point 3) : erreur inattendue d'une action sur un voyage, sans message de la base ; état
  // `error` du handover § 4. Ajouté à la fin, sans renommer ni réordonner.
  "internal",
  // B10a (décision 0112 § 1.6 ; B10-PO-14) : écriture du tri refusée pendant un recalcul du voyage, `retryable` vrai ;
  // état `generating` du handover § 4. Ajouté à la fin, sans renommer ni réordonner.
  "generation_in_progress",
  // B3d (spécification B3d, point 4 ; décision 0138 T4) : plafond global des e-mails du jour atteint, ou quota du
  // fournisseur ; `retryable` faux (la personne réessaie demain). Ajouté à la fin, sans renommer ni réordonner.
  "email_cap_reached",
  // M5 (décision 0147 § 8) : retouche refusée sur un voyage non débloqué (M5-PO-1) ; `retryable` faux. Symétrique
  // d'`already_unlocked`. Ajouté à la fin, sans renommer ni réordonner.
  "not_unlocked",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isCheckoutFailure(status: string): status is CheckoutFailure {
  return (CHECKOUT_FAILURES as readonly string[]).includes(status);
}

/*
 * Création du voyage et brief (décision 0017 § 2.1, F8a) : bornes, en constantes nommées, et énumérations lues
 * par l'interface. Les schémas de `creation.ts` en dérivent ; `src/features/creation/validation.ts` les relit
 * sans charger Zod. Une borne n'est écrite qu'ici.
 */

/** Destination : texte libre, espaces retirés aux extrémités. */
export const DESTINATION_LENGTH = { min: 2, max: 80 } as const;
/**
 * Destination d'une ville choisie hors de la table maison, sur le site d'essai (décision 0129 § 4) : le texte tapé n'atteint
 * le brief, donc le prompt, que s'il ne contient que des lettres (Unicode, marques diacritiques comprises), des espaces,
 * des apostrophes, des tirets et des points, commence par une lettre et compte 80 caractères au plus.
 */
export const DESTINATION_ESSAI_MOTIF = /^\p{L}[\p{L}\p{M} '’.-]{0,79}$/u;
/** Retours à la ligne, tabulations et séparateurs de ligne : refusés **avant** la normalisation des espaces (0129 § 4.3). */
const CONTROLES_DESTINATION = /[\r\n\t\v\f\u0085\u2028\u2029]/u;
/**
 * Texte tapé d'une ville choisie hors de la table, filtré (décision 0129 § 4.3 ; revue du head de4ab92, mineur 15) :
 * `null` s'il contient un retour à la ligne ou une tabulation, sinon le texte aux espaces normalisés s'il suit
 * `DESTINATION_ESSAI_MOTIF`, sinon `null`. Même règle pour l'écran 1 et le serveur.
 */
export function destinationEssaiFiltree(saisie: string): string | null {
  if (CONTROLES_DESTINATION.test(saisie)) return null;
  const filtre = saisie.trim().replace(/ +/gu, " ");
  return DESTINATION_ESSAI_MOTIF.test(filtre) ? filtre : null;
}
/**
 * Identifiant de lieu Google (base64url, 256 caractères au plus) : même forme que `PLACE_ID_GOOGLE` de
 * `src/grounding/enveloppe-google.ts` (égalité gardée par `src/grounding/places-client.test.ts`), lue ici par le contrat,
 * l'écran 1 et la recherche de ville du site d'essai (décision 0129).
 */
export const PLACE_ID_MOTIF = /^[A-Za-z0-9_-]{1,256}$/;
/** Jeton de session Autocomplete (New) de la recherche de ville (décision 0129) : même forme que `JETON_SESSION` du client Places. */
export const JETON_SESSION_MOTIF = /^[A-Za-z0-9_-]{1,36}$/;
/** Nom d'une autre ville. */
export const CITY_NAME_LENGTH = { min: 2, max: 80 } as const;
/** « Oui » : nom ou adresse du logement saisi. */
export const KNOWN_LODGING_LENGTH = { min: 2, max: 120 } as const;
/** « Un quartier » : quartier saisi. */
export const AREA_LENGTH = { min: 2, max: 80 } as const;
/** Libellé d'un engagement déjà pris. */
export const COMMITMENT_LABEL_LENGTH = { min: 2, max: 80 } as const;
/** Récit de l'écran 2 (plafond provisoire, F8-Q9). */
export const STORY_LENGTH = { min: 20, max: 1000 } as const;
/**
 * Séjour d'un brief du prototype, en jours, arrivée et départ compris : `BriefSchema` (`src/prototype/brief.ts`) refuse
 * au-delà, et l'écran 1 du site d'essai le refuse au champ (spécification E2E-essai, lot 2, D1).
 */
export const PROTOTYPE_STAY_DAYS_MAX = 15;
/** Villes en tout, destination comprise (provisoire, F8-PO-3). */
export const MAX_CITIES = 4;
/** Engagements déjà pris (provisoire, F8-PO-3). */
export const MAX_COMMITMENTS = 10;
export const ADULTS = { min: 1, max: 9 } as const;
export const CHILDREN = { min: 0, max: 9 } as const;
/** Budget par repas et par personne, entier en CHF. */
export const MEAL_BUDGET_CHF = { min: 5, max: 500 } as const;
export const EMAIL_MAX_LENGTH = 254;
/** Borne de l'entrée brute d'une adresse, avant retrait des espaces aux extrémités (décision 0084 ; 0051 point 3). */
export const EMAIL_INPUT_MAX_LENGTH = 320;
export const OTP_LENGTH = 6;
/** Code de connexion : exactement `OTP_LENGTH` chiffres ASCII (0017 § 2.4). */
export const OTP_PATTERN = /^[0-9]{6}$/;

/**
 * Mode de la connexion (0017 § 3.5) : `simulated` tant que l'adaptateur `auth` est `mock` (avertissement visible à
 * l'écran 4, piloté par cette valeur serveur, jamais déduit côté client) ; `real` avec B3.
 */
export const AUTH_MODES = ["simulated", "real"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** Écran 3 : logements suggérés dans un quartier, au plus (cadrage § 3.1, écran 3). */
export const MAX_SUGGESTED_LODGINGS = 3;

/**
 * Génération des premières propositions (décision 0017 § 2.4, F8c) : phases de `GenerationStatus`. `preparing` est
 * la seule phase non finale ; `incomplete` = terminée avec moins de propositions que prévu (B0 PO-6).
 */
export const GENERATION_PHASES = ["preparing", "ready", "incomplete", "failed"] as const;
export type GenerationPhase = (typeof GENERATION_PHASES)[number];
/** État d'un jour de la génération. */
export const GENERATION_DAY_STATES = ["preparing", "ready"] as const;
export type GenerationDayState = (typeof GENERATION_DAY_STATES)[number];
/** Raison d'arrêt d'une génération (`failed`, 0017 § 2.4 ; handover back-end § 8, « Arrêt sur plafond ou quota »). */
export const GENERATION_FAILURE_REASONS = ["provider_error", "cost_cap_reached", "quota_reached"] as const;
export type GenerationFailureReason = (typeof GENERATION_FAILURE_REASONS)[number];

/** Phases finales (`ready`, `incomplete`, `failed`) : l'interrogation de l'écran 5 s'y arrête (0017 § 9). */
export function isFinalGenerationPhase(phase: GenerationPhase): boolean {
  return phase !== "preparing";
}

/** Rythme du brief (cadrage § 3.7), dans l'ordre d'affichage. */
export const PACES = ["relaxed", "balanced", "intense"] as const;
export type Pace = (typeof PACES)[number];

/** Déplacements, dans l'ordre d'affichage. */
export const MOBILITY_MODES = ["walk", "transit", "car"] as const;
export type MobilityMode = (typeof MOBILITY_MODES)[number];

/** Les 6 « champs » du brief (F8-PO-15), comptés par `brief_completed`. */
export const BRIEF_FIELDS = ["travellers", "pace", "wishes", "mobility", "limits", "mealBudget"] as const;
export type BriefField = (typeof BRIEF_FIELDS)[number];

/** Type d'un engagement déjà pris : « Vol », « Réservation », « Billet ». */
export const COMMITMENT_KINDS = ["flight", "booking", "ticket"] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

/**
 * Logement d'une ville (0017 § 2.2) : saisi (`known`, `area`), pas encore (`none`), ou suggestion retenue à
 * l'écran 3 (`suggestedLodging`, `suggestedArea`, identifiants seulement).
 */
export const LODGING_KINDS = ["known", "area", "none", "suggestedLodging", "suggestedArea"] as const;
export type LodgingKind = (typeof LODGING_KINDS)[number];

/**
 * Retire les espaces U+0020 aux extrémités, et eux seuls (ni tabulation, ni retour à la ligne, ni autre espace
 * Unicode) : parcours caractère par caractère, sans expression régulière (décision 0084 ; 0051 point 4.3). Seule
 * implémentation du dépôt, appelée par `EmailSchema` (`./auth.ts`) et par `parseEmailAddress` (`src/server/email.ts`).
 */
export function stripEdgeSpaces(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === " ") start += 1;
  while (end > start && value[end - 1] === " ") end -= 1;
  return value.slice(start, end);
}

/**
 * Forme d'une adresse email (0017 § 2.1, écran 4) : un seul `@`, partie locale non vide, domaine qui contient
 * un point ni au début ni à la fin, aucun espace, 254 caractères au plus. Décision 0084 : le contrat tolère les espaces
 * U+0020 aux extrémités (`EmailSchema` applique `isEmailShape(stripEdgeSpaces(v))`) ; l'interface et le serveur
 * acceptent exactement les mêmes adresses une fois ces espaces retirés ; seule la réception du code prouve qu'elle
 * existe.
 */
export function isEmailShape(value: string): boolean {
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH || /\s/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  if (local.length === 0) return false;
  const dot = domain.indexOf(".");
  return dot > 0 && !domain.startsWith(".") && !domain.endsWith(".");
}
