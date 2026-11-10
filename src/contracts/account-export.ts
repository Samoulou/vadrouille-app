import { z } from "zod";

import { CategorySchema } from "./category";
import { DaySnapshotSchema } from "./snapshot";
import { ChecklistMomentSchema, HttpsUrlSchema, IsoDateSchema, TimeSchema } from "./trip";
import {
  CHECKOUT_STATUSES,
  COMMITMENT_KINDS,
  CURRENCIES,
  LODGING_KINDS,
  PAYMENT_METHODS,
  PREFERENCE_DIRECTIONS,
  PREFERENCE_ORIGINS,
  PREFERENCE_SIGNAL_STATUSES,
  PREFERENCE_SIGNALS,
  STOP_RATINGS,
  STOP_REPORT_REASONS,
} from "./values";

/**
 * Contrat « Exporter mes données » (`AccountExport`, handover back-end § 5 ; spécification M9 § 3.2 et § 3.5, M9a ;
 * forme proposée par M9a, **à confirmer par la revue** du Tech Lead, T3). Fichier JSON remis à la personne, construit
 * depuis les tables par `src/server/account/export.ts`, jamais depuis un `Trip` d'écran.
 *
 * **Liste blanche** (modèle de la vue partagée, décision 0007) : tous les objets sont stricts, une clé n'entre dans le
 * fichier que si ce contrat la prévoit. Ce qui n'y est jamais, faute de clé : identifiants techniques (`request_id`,
 * `created_by`, `author_user_id`, `seq`, `suggestion_id`), `patch` des versions, `email_verified`, `token_hash`,
 * identifiants et liens de Stripe (`stripe_checkout_session_id`, `stripe_receipt_url`, S4), `price_variant`, `sponsored`,
 * centre et rayon des zones de logement, données de travail du moteur, sessions, adhésions, organisation, `billing`,
 * `usage_ledger`, `place_coordinates`. **Aucune donnée Google hors `placeId`** (décisions 0011 et 0027 ; Q5 à Samuel) :
 * l'instantané d'une version est le schéma de stockage (`DaySnapshotSchema`, sans `Segment.minutes` ni
 * `Day.travelMinutes`), jamais une donnée relue sur Google.
 *
 * Conventions (§ 3.5 point 1) : dates `AAAA-MM-JJ`, instants ISO 8601 en UTC (`toISOString()`), codes fermés tels quels ;
 * une valeur absente vaut `null` (forme stable d'un export à l'autre). L'ordre des clés du fichier est celui de ce contrat
 * (le fichier est la sortie de `AccountExportSchema.parse`).
 */

/** En-tête du fichier : nom du format et version du contrat (§ 3.5 point 1). */
export const ACCOUNT_EXPORT_FORMAT = "vadrouille-export";
export const ACCOUNT_EXPORT_VERSION = 1;

/** Instant ISO 8601 en UTC, suffixe `Z` (`Date#toISOString()`). */
const InstantSchema = z.iso.datetime();
const TexteSchema = z.string().min(1);
const PlaceIdSchema = TexteSchema.nullable();
const EntierPositif = z.number().int().positive();

/** Compte : l'adresse de connexion et la date de création, rien d'autre de `users`. */
export const AccountExportAccountSchema = z.strictObject({
  email: TexteSchema,
  createdAt: InstantSchema,
});

/** Brief, chaque version saisie (`briefs`) ; `mobility` (ancienne colonne, plus écrite) n'y est pas. */
export const AccountExportBriefSchema = z.strictObject({
  version: z.number().int(),
  story: z.string().nullable(),
  pace: z.string().nullable(),
  mobilityModes: z.array(z.string()).nullable(),
  wishes: z.array(z.string()),
  limitCategories: z.array(z.string()).nullable(),
  limits: z.string().nullable(),
  mealBudget: z.string().nullable(),
  inferredFields: z.array(z.string()),
  createdAt: InstantSchema,
});

/** Logement ou quartier (`stays`) ; ni `suggestion_id` ni centre et rayon de zone (données de travail du moteur). */
export const AccountExportStaySchema = z.strictObject({
  kind: z.enum(["lodging", "neighbourhood", "none"]),
  lodgingKind: z.enum(LODGING_KINDS).nullable(),
  label: TexteSchema,
  city: z.string().nullable(),
  fromDate: IsoDateSchema,
  toDate: IsoDateSchema,
  arrivalTime: TimeSchema.nullable(),
  departureTime: TimeSchema.nullable(),
  luggage: z.string().nullable(),
  placeId: PlaceIdSchema,
});

/** Engagement saisi à l'écran 1 (`trip_commitments`), dans l'ordre du tableau ; sans `rank`. */
export const AccountExportCommitmentSchema = z.strictObject({
  kind: z.enum(COMMITMENT_KINDS),
  label: TexteSchema,
  date: IsoDateSchema,
  startTime: TimeSchema,
  endTime: TimeSchema.nullable(),
});

/**
 * Version du programme (`trip_versions`, **toutes**) : contenu de l'instantané en liste blanche de clés (schéma de
 * stockage `DaySnapshotSchema`, T3 : celui-ci plutôt que celui de la vue partagée, qui retire `placeId`, les infos
 * pratiques et la liste « À faire ») ; ni `patch`, ni `request_id`, ni `author_user_id`.
 */
export const AccountExportVersionSchema = z.strictObject({
  version: EntierPositif,
  parentVersion: EntierPositif.nullable(),
  authorKind: z.enum(["user", "engine", "workflow"]),
  createdAt: InstantSchema,
  days: z.array(DaySnapshotSchema),
});

/** Proposition montrée (aperçu ou présentation) : jour, heure, nature, nom maison, catégorie, `placeId`. */
export const AccountExportProposalSchema = z.strictObject({
  phase: z.enum(["preview", "deck"]),
  position: EntierPositif,
  day: EntierPositif,
  time: TimeSchema,
  kind: z.enum(["activity", "meal"]),
  name: TexteSchema,
  category: CategorySchema,
  placeId: PlaceIdSchema,
});

/** Geste du tri ou réponse (`preference_signals`) ; ni `seq`, ni `request_id`, ni identifiants de candidat ou de proposition. */
export const AccountExportGestureSchema = z.strictObject({
  signal: z.enum(PREFERENCE_SIGNALS),
  category: CategorySchema.nullable(),
  placeId: PlaceIdSchema,
  status: z.enum(PREFERENCE_SIGNAL_STATUSES),
  createdAt: InstantSchema,
  cancelledAt: InstantSchema.nullable(),
});

/** Fin d'un tri (`deck_closures`) : phase, dernière position triée, instant. */
export const AccountExportDeckClosureSchema = z.strictObject({
  phase: z.enum(["preview", "deck"]),
  throughPosition: EntierPositif,
  createdAt: InstantSchema,
});

export const AccountExportDeckSchema = z.strictObject({
  proposals: z.array(AccountExportProposalSchema),
  gestures: z.array(AccountExportGestureSchema),
  closures: z.array(AccountExportDeckClosureSchema),
});

/** Ligne « À faire » (`checklist_items`) ; sans `sponsored` (interne). */
export const AccountExportChecklistItemSchema = z.strictObject({
  label: TexteSchema,
  moment: ChecklistMomentSchema,
  done: z.boolean(),
  bookingUrl: HttpsUrlSchema.nullable(),
});

/** Signalement d'une erreur (`feedback`) de la personne ; `text` (toujours nul) n'y est pas. */
export const AccountExportReportSchema = z.strictObject({
  stopId: z.string().nullable(),
  placeId: PlaceIdSchema,
  reason: z.enum(STOP_REPORT_REASONS),
  createdAt: InstantSchema,
});

/** Avis de la personne sur une étape (`stop_reviews`) ; sans `request_id`. */
export const AccountExportReviewSchema = z.strictObject({
  stopId: TexteSchema,
  placeId: PlaceIdSchema,
  opinion: z.enum(STOP_RATINGS),
  updatedAt: InstantSchema,
});

/** Accords aux rappels de la personne (`reminder_consents`) et rappels envoyés (`reminder_sends`) ; aucun relais. */
export const AccountExportRemindersSchema = z.strictObject({
  consents: z.array(z.strictObject({ consentedAt: InstantSchema, withdrawnAt: InstantSchema.nullable() })),
  sends: z.array(z.strictObject({ dayIndex: z.number().int().nonnegative(), claimedAt: InstantSchema })),
});

/** Lien privé (`share_links`) : dates seulement, jamais le jeton ni son empreinte. */
export const AccountExportShareLinkSchema = z.strictObject({
  createdAt: InstantSchema,
  expiresAt: InstantSchema,
  revokedAt: InstantSchema.nullable(),
});

/** Paiement (`checkouts`) ; ni identifiant ni lien de Stripe (S4), ni variante de prix. */
export const AccountExportPaymentSchema = z.strictObject({
  method: z.enum(PAYMENT_METHODS),
  amountCents: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES),
  status: z.enum(CHECKOUT_STATUSES),
  createdAt: InstantSchema,
});

/** Droit accordé au voyage (`entitlements`) ; sans lien vers `billing`. */
export const AccountExportEntitlementSchema = z.strictObject({
  kind: z.enum(["preview", "tripUnlocked"]),
  grantedAt: InstantSchema,
});

/** Voyage (`trips`) et ce qui lui appartient ; ni `request_id` ni `created_by`. */
export const AccountExportTripSchema = z.strictObject({
  id: TexteSchema,
  destination: TexteSchema,
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  timeZone: TexteSchema,
  travellers: z.strictObject({ adults: z.number().int().nonnegative(), children: z.number().int().nonnegative() }),
  status: z.enum(["active", "archived"]),
  createdAt: InstantSchema,
  /** Calculé depuis `entitlements` (droit `tripUnlocked`). */
  unlocked: z.boolean(),
  /** Numéro de la version courante (`trips.current_version`), `null` avant le premier programme. */
  currentVersion: EntierPositif.nullable(),
  briefs: z.array(AccountExportBriefSchema),
  stays: z.array(AccountExportStaySchema),
  commitments: z.array(AccountExportCommitmentSchema),
  versions: z.array(AccountExportVersionSchema),
  deck: AccountExportDeckSchema,
  checklist: z.array(AccountExportChecklistItemSchema),
  reports: z.array(AccountExportReportSchema),
  reviews: z.array(AccountExportReviewSchema),
  reminders: AccountExportRemindersSchema,
  shareLinks: z.array(AccountExportShareLinkSchema),
  payments: z.array(AccountExportPaymentSchema),
  entitlements: z.array(AccountExportEntitlementSchema),
});

/** Goût retenu de la personne (`preferences`). `sourceTripId` : voyage d'origine, nul s'il n'existe plus. */
export const AccountExportTasteSchema = z.strictObject({
  subjectKind: z.enum(["category", "distance"]),
  category: CategorySchema.nullable(),
  direction: z.enum(PREFERENCE_DIRECTIONS).nullable(),
  origin: z.enum(PREFERENCE_ORIGINS),
  sourceTripId: z.string().nullable(),
  consentedAt: InstantSchema,
});

/** Fichier « Exporter mes données ». */
export const AccountExportSchema = z.strictObject({
  format: z.literal(ACCOUNT_EXPORT_FORMAT),
  version: z.literal(ACCOUNT_EXPORT_VERSION),
  exportedAt: InstantSchema,
  /** Texte français : ce que contient le fichier, et que les codes sont ceux de l'application (`src/i18n/fr/compte.json`). */
  notice: TexteSchema,
  account: AccountExportAccountSchema,
  trips: z.array(AccountExportTripSchema),
  tastes: z.array(AccountExportTasteSchema),
});
export type AccountExport = z.infer<typeof AccountExportSchema>;
export type AccountExportTrip = z.infer<typeof AccountExportTripSchema>;

/**
 * Clés qui ne doivent apparaître **à aucun niveau** du fichier (spécification M9 § 6.2, critère 6) : le parcours récursif
 * des tests les cherche ; ce contrat strict ne les nomme nulle part.
 */
export const ACCOUNT_EXPORT_FORBIDDEN_KEYS = [
  "token_hash",
  "tokenHash",
  "stripe_checkout_session_id",
  "stripeCheckoutSessionId",
  "stripe_receipt_url",
  "stripeReceiptUrl",
  "request_id",
  "requestId",
  "patch",
  "email_verified",
  "emailVerified",
  "sessionId",
  "session_id",
  "token",
  "organizationId",
  "organization_id",
  "userId",
  "user_id",
  "createdBy",
  "created_by",
  "authorUserId",
  "author_user_id",
  "minutes",
  "travelMinutes",
  "lat",
  "lng",
] as const;

/** Toutes les clés d'une valeur JSON, à tous les niveaux (parcours récursif, critère 6). */
export function accountExportKeys(valeur: unknown): string[] {
  if (Array.isArray(valeur)) return valeur.flatMap(accountExportKeys);
  if (typeof valeur !== "object" || valeur === null) return [];
  return Object.entries(valeur).flatMap(([cle, enfant]) => [cle, ...accountExportKeys(enfant)]);
}
