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

/** Natures d'une étape (handover § 9). Source de `StopSchema.kind` (décision 0021 § 1.1). */
export const STOP_KINDS = ["activity", "meal", "event"] as const;
export type StopKind = (typeof STOP_KINDS)[number];

/**
 * Nombre de lignes « À faire » non faites (décision 0021 § 1.1) : seul calcul des « réservations à faire »,
 * pour le résumé de voyage (`TripSummary.toReserveCount`) et, avec F9b, le programme ajusté.
 */
export function countToReserve(checklist: readonly { done: boolean }[]): number {
  return checklist.filter((item) => !item.done).length;
}

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

/** `checkoutId` : 128 bits aléatoires en base64url, 22 caractères (décision 0020 § 1.3). */
export const CHECKOUT_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Identifiant de voyage reçu d'une entrée (règle de 0017 § 1). */
export const TRIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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
/** Villes en tout, destination comprise (provisoire, F8-PO-3). */
export const MAX_CITIES = 4;
/** Engagements déjà pris (provisoire, F8-PO-3). */
export const MAX_COMMITMENTS = 10;
export const ADULTS = { min: 1, max: 9 } as const;
export const CHILDREN = { min: 0, max: 9 } as const;
/** Budget par repas et par personne, entier en CHF. */
export const MEAL_BUDGET_CHF = { min: 5, max: 500 } as const;
export const EMAIL_MAX_LENGTH = 254;
export const OTP_LENGTH = 6;

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
 * Forme d'une adresse email (0017 § 2.1, écran 4) : un seul `@`, partie locale non vide, domaine qui contient
 * un point ni au début ni à la fin, aucun espace, 254 caractères au plus. L'interface et le serveur (par
 * `.refine`) acceptent exactement les mêmes adresses ; seule la réception du code prouve qu'elle existe.
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
