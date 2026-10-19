import "server-only";

import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  CANDIDATE_SOURCE_KEYS,
  CHECKLIST_MOMENT_VARIANTS,
  PROPOSAL_RECORD_KEYS,
  STOP_FACTS_KEYS,
  sqlTextArray,
} from "../jsonb-keys.ts";
import { organizations, users } from "./auth.ts";
import { uniqueKeyName } from "./naming.ts";

/**
 * Tables métier (handover § 6, « Partie Q5 » § 6, décisions 0007, 0010 et 0011).
 *
 * Règles communes : `organization_id uuid NOT NULL` vers `organizations`, au moins un index qui commence par
 * `organization_id`, clés étrangères composites `(organization_id, trip_id)` vers `trips` (et de même vers les
 * autres tables métier : une ligne ne peut pas pointer vers la donnée d'une autre organisation). Aucune colonne de
 * contenu Google ni dérivée de Google : seul `place_id` (identifiant de lieu) est stocké. `place_coordinates` est
 * créée par B8 (décision 0011 point 6, décision B1-PO-3). RLS, droits, déclencheurs : `0001_securite.sql`.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const organizationId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Heure locale de la destination « HH:MM ». */
const hhmm = (column: AnyPgColumn): SQL => sql`${column} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`;
/** Adresse issue du web : `https://` seulement (handover § 12). */
const https = (column: AnyPgColumn): SQL => sql`left(${column}, 8) = 'https://'`;
/** Valeur dans une liste fermée. */
const oneOf = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} IN (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;
/** Objet JSONB sans clé hors de la liste (premier niveau). */
const closedObject = (column: AnyPgColumn, keys: readonly string[]): SQL =>
  sql`jsonb_typeof(${column}) = 'object' AND (${column} - ${sql.raw(sqlTextArray(keys))}) = '{}'::jsonb`;

/** Clé étrangère composite vers `trips` : une ligne ne pointe jamais vers le voyage d'une autre organisation. */
function tripFk(name: string, table: { organizationId: AnyPgColumn; tripId: AnyPgColumn }) {
  return foreignKey({ name, columns: [table.organizationId, table.tripId], foreignColumns: [trips.organizationId, trips.id] });
}

export const trips = pgTable(
  "trips",
  {
    id: id(),
    organizationId: organizationId(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    requestId: uuid("request_id").notNull(),
    destination: text("destination").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    travellersAdults: smallint("travellers_adults").notNull(),
    travellersChildren: smallint("travellers_children").notNull().default(0),
    currentVersion: integer("current_version"),
    /** `active` ou `archived` : aucune valeur de déblocage (`Trip.unlocked` se calcule depuis `entitlements`). */
    status: text("status").notNull().default("active"),
    /** Identifiant IANA (évolution E11), jamais tiré d'une réponse Google. */
    timeZone: text("time_zone"),
    createdAt: createdAt(),
  },
  (t) => [
    unique(uniqueKeyName("trips_organization_id_id")).on(t.organizationId, t.id),
    unique(uniqueKeyName("trips_organization_id_request_id")).on(t.organizationId, t.requestId),
    index("trips_organization_id_start_date_idx").on(t.organizationId, t.startDate),
    check("trips_status_check", oneOf(t.status, ["active", "archived"])),
    check("trips_dates_check", sql`${t.endDate} >= ${t.startDate}`),
    check("trips_travellers_check", sql`${t.travellersAdults} >= 0 AND ${t.travellersChildren} >= 0`),
    // B9b (0081 B9-TL-6 (d)) : `NOT VALID` dans la migration 0012 (lignes antérieures non vérifiées, toute écriture l'est).
    check("trips_time_zone_check", sql`${t.timeZone} IS NOT NULL`),
  ],
);

/** Brief du voyage, une ligne par version (ajout seulement en pratique). */
export const briefs = pgTable(
  "briefs",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    version: integer("version").notNull(),
    story: text("story"),
    pace: text("pace"),
    /** Ancienne colonne (`text`) : plus écrite depuis B9b (0081 B9-TL-6 (e)), retirée par une migration ultérieure. */
    mobility: text("mobility"),
    /** Modes de `Brief.mobility` dans l'ordre reçu (B9b, 0081 B9-TL-6 (e)) ; nul pour les lignes antérieures. */
    mobilityModes: text("mobility_modes").array(),
    /** Codes `Category`. */
    wishes: text("wishes").array().notNull().default(sql`'{}'::text[]`),
    limits: text("limits"),
    /** Codes `Category` de `Brief.limits`, dans l'ordre reçu (B9b) ; nul pour les lignes antérieures. */
    limitCategories: text("limit_categories").array(),
    mealBudget: text("meal_budget"),
    inferredFields: text("inferred_fields").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    tripFk("briefs_trip_fk", t),
    unique(uniqueKeyName("briefs_organization_id_trip_id_version")).on(t.organizationId, t.tripId, t.version),
    check("briefs_mobility_modes_check", sql`${t.mobilityModes} IS NULL OR ${t.mobilityModes} <@ ARRAY['walk', 'transit', 'car']::text[]`),
  ],
);

/** Logement ou quartier ; aucune vue partagée tant que Q50 n'est pas tranchée. */
export const stays = pgTable(
  "stays",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    kind: text("kind").notNull(),
    placeId: text("place_id"),
    label: text("label").notNull(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    arrivalTime: text("arrival_time"),
    departureTime: text("departure_time"),
    luggage: text("luggage"),
    /** B9b (0081 B9-TL-6 (a)) : libellé de la ville du `TripDraft` ; nul pour les lignes antérieures. */
    city: text("city"),
    /** B9b (0081 B9-TL-6 (c)) : type de logement d'origine (`LODGING_KINDS`) ; nul pour les lignes antérieures. */
    lodgingKind: text("lodging_kind"),
    /** Identifiant maison de la suggestion retenue (`lodgingId` ou `areaId`, B9-TL-5) ; jamais un identifiant Google. */
    suggestionId: text("suggestion_id"),
    /** Centre et rayon d'une zone maison (`suggestedArea`, sortie du modèle) : jamais des coordonnées Google (0011, 0027). */
    areaCenterLat: doublePrecision("area_center_lat"),
    areaCenterLng: doublePrecision("area_center_lng"),
    areaRadiusM: integer("area_radius_m"),
  },
  (t) => [
    tripFk("stays_trip_fk", t),
    index("stays_organization_id_trip_id_from_date_idx").on(t.organizationId, t.tripId, t.fromDate),
    check("stays_kind_check", oneOf(t.kind, ["lodging", "neighbourhood", "none"])),
    check("stays_dates_check", sql`${t.toDate} >= ${t.fromDate}`),
    // B9b (0081 B9-TL-6 (f)) : borne de fin exclusive ; `NOT VALID` dans la migration 0012.
    check("stays_to_date_exclusive_check", sql`${t.toDate} > ${t.fromDate}`),
    check(
      "stays_lodging_kind_check",
      sql`${t.lodgingKind} IS NULL OR ${oneOf(t.lodgingKind, ["known", "area", "none", "suggestedLodging", "suggestedArea"])}`,
    ),
    check(
      "stays_area_center_check",
      sql`(${t.areaCenterLat} IS NULL AND ${t.areaCenterLng} IS NULL AND ${t.areaRadiusM} IS NULL) OR (${t.areaCenterLat} BETWEEN -90 AND 90 AND ${t.areaCenterLng} BETWEEN -180 AND 180 AND ${t.areaRadiusM} BETWEEN 50 AND 20000)`,
    ),
    check("stays_arrival_time_check", sql`${t.arrivalTime} IS NULL OR ${hhmm(t.arrivalTime)}`),
    check("stays_departure_time_check", sql`${t.departureTime} IS NULL OR ${hhmm(t.departureTime)}`),
  ],
);

/**
 * Engagements de l'écran 1 (`TripCommitment`, B9b ; 0081 B9-TL-6 (b)) : vol, réservation ou billet, relus par les
 * workflows 1 et 4 et posés comme étapes verrouillées (`Stop.commitment`). Même modèle de RLS que `stays`.
 */
export const tripCommitments = pgTable(
  "trip_commitments",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    /** Rang dans `TripDraft.commitments` (0 pour le premier). */
    rank: smallint("rank").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    date: date("date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time"),
    createdAt: createdAt(),
  },
  (t) => [
    tripFk("trip_commitments_trip_fk", t),
    unique(uniqueKeyName("trip_commitments_organization_id_trip_id_rank")).on(t.organizationId, t.tripId, t.rank),
    check("trip_commitments_kind_check", oneOf(t.kind, ["flight", "booking", "ticket"])),
    check("trip_commitments_rank_check", sql`${t.rank} >= 0`),
    check("trip_commitments_start_time_check", hhmm(t.startTime)),
    check("trip_commitments_end_time_check", sql`${t.endTime} IS NULL OR (${hhmm(t.endTime)} AND ${t.endTime} > ${t.startTime})`),
  ],
);

/**
 * Versions du programme : ajout seulement (droits et déclencheur ; seule exception, `DELETE` par
 * `purge_organization_data`). Aucune colonne `validation_report` (décision 0011 point 5).
 */
export const tripVersions = pgTable(
  "trip_versions",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    version: integer("version").notNull(),
    parentVersion: integer("parent_version"),
    requestId: uuid("request_id").notNull(),
    /** `TripSnapshot` validé par le schéma Zod strict avant écriture ; lu par `shared_trip_version` en liste blanche. */
    snapshot: jsonb("snapshot").notNull(),
    /** `TripPatch`, nul pour la version 1. */
    patch: jsonb("patch"),
    authorKind: text("author_kind").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    tripFk("trip_versions_trip_fk", t),
    unique(uniqueKeyName("trip_versions_organization_id_trip_id_version")).on(t.organizationId, t.tripId, t.version),
    unique(uniqueKeyName("trip_versions_organization_id_trip_id_request_id")).on(t.organizationId, t.tripId, t.requestId),
    check("trip_versions_version_check", sql`${t.version} >= 1`),
    check("trip_versions_author_kind_check", oneOf(t.authorKind, ["user", "engine", "workflow"])),
    check("trip_versions_snapshot_check", sql`jsonb_typeof(${t.snapshot}) = 'object'`),
  ],
);

export const generationRuns = pgTable(
  "generation_runs",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    workflowRunId: text("workflow_run_id"),
    kind: text("kind").notNull(),
    phase: text("phase").notNull(),
    stopReason: text("stop_reason"),
    lastVersion: integer("last_version"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** B9b (0081 B9-TL-3 et B9-TL-6 (h), 0087 § 2) : étape en cours (observation), nulle avant la première étape. */
    step: text("step"),
    /** Rang de la dernière étape commencée (garde d'idempotence), 0 à la réservation. */
    stepSeq: integer("step_seq").notNull().default(0),
    /** `requestId` de `createTrip` ou de `retryGeneration` (aperçu) ; nul pour une ligne `full` (0087 § 1.2). */
    requestId: uuid("request_id"),
    /** `requestId` des reprises acceptées de la personne (ligne `full` seulement, 0087 § 1.2) : compteur et idempotence. */
    personRetryRequestIds: uuid("person_retry_request_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** Reprises par le studio (ligne `full` seulement, 0087 § 1.2). */
    studioRetries: integer("studio_retries").notNull().default(0),
  },
  (t) => [
    tripFk("generation_runs_trip_fk", t),
    unique(uniqueKeyName("generation_runs_organization_id_id")).on(t.organizationId, t.id),
    index("generation_runs_organization_id_trip_id_started_at_idx").on(t.organizationId, t.tripId, t.startedAt),
    uniqueIndex("generation_runs_organization_id_trip_id_request_id_idx")
      .on(t.organizationId, t.tripId, t.requestId)
      .where(sql`${t.requestId} IS NOT NULL`),
    uniqueIndex("generation_runs_organization_id_trip_id_full_idx").on(t.organizationId, t.tripId).where(sql`${t.kind} = 'full'`),
    check("generation_runs_kind_check", oneOf(t.kind, ["preview", "full", "batch", "mini"])),
    // `NOT VALID` dans la migration 0012 pour `phase` et `stop_reason` (lignes antérieures non vérifiées).
    check("generation_runs_phase_check", oneOf(t.phase, ["queued", "preparing", "ready", "incomplete", "failed"])),
    // `generation_runs_stop_reason_check` (codes fermés de la couche IA et de l'ancrage, `step_expired`) : posée par la
    // migration 0012 seule, comparée aux listes de code par `tests/unit/db/migration-creation.test.ts`.
    check("generation_runs_step_check", sql`${t.step} IS NULL OR ${oneOf(t.step, ["a", "l", "b", "c", "d", "e"])}`),
    check("generation_runs_step_seq_check", sql`${t.stepSeq} >= 0`),
    check("generation_runs_studio_retries_check", sql`${t.studioRetries} >= 0`),
    check(
      "generation_runs_retries_full_check",
      sql`${t.kind} = 'full' OR (cardinality(${t.personRetryRequestIds}) = 0 AND ${t.studioRetries} = 0)`,
    ),
  ],
);

/**
 * Recherches web. Aucun compteur de candidats trouvés, ancrés ou retenus (décision 0011 point 2, question S4).
 * `errors` : codes d'une énumération fermée, jamais un message de fournisseur.
 */
export const researchRuns = pgTable(
  "research_runs",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    generationRunId: uuid("generation_run_id"),
    queries: text("queries").array().notNull().default(sql`'{}'::text[]`),
    pagesRead: integer("pages_read").notNull().default(0),
    durationMs: integer("duration_ms"),
    costEstimateMicros: bigint("cost_estimate_micros", { mode: "number" }),
    errors: text("errors").array().notNull().default(sql`'{}'::text[]`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    tripFk("research_runs_trip_fk", t),
    foreignKey({
      name: "research_runs_generation_run_fk",
      columns: [t.organizationId, t.generationRunId],
      foreignColumns: [generationRuns.organizationId, generationRuns.id],
    }),
    unique(uniqueKeyName("research_runs_organization_id_id")).on(t.organizationId, t.id),
    index("research_runs_organization_id_trip_id_idx").on(t.organizationId, t.tripId),
  ],
);

/**
 * Candidats trouvés par la recherche web : contenu maison. `place_id` écrit par l'ancrage pour un candidat
 * `compatible` seulement ; aucun verdict, motif d'écart ni date de contrôle (« Partie Q5 »). Notes du Decider :
 * données maison tirées de nos descriptions (décision 0027).
 */
export const candidates = pgTable(
  "candidates",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    researchRunId: uuid("research_run_id"),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    category: text("category"),
    facts: jsonb("facts").notNull().default(sql`'{}'::jsonb`),
    sources: jsonb("sources").notNull().default(sql`'[]'::jsonb`),
    confidence: text("confidence"),
    placeId: text("place_id"),
    fit: boolean("fit"),
    notForMeRisk: smallint("not_for_me_risk"),
    mustSee: boolean("must_see"),
    slotFit: text("slot_fit").array(),
    /** B9b (0081 B9-TL-6 (g), question 13 (a) de B7) : type d'étape (`activity`, `meal`, `event`), rempli par `versLignes`. */
    stopKind: text("stop_kind"),
    /** « À réserver » (question 13 (a) de B7), rempli par `versLignes`. */
    toReserve: boolean("to_reserve"),
    createdAt: createdAt(),
  },
  (t) => [
    tripFk("candidates_trip_fk", t),
    foreignKey({
      name: "candidates_research_run_fk",
      columns: [t.organizationId, t.researchRunId],
      foreignColumns: [researchRuns.organizationId, researchRuns.id],
    }),
    unique(uniqueKeyName("candidates_organization_id_id")).on(t.organizationId, t.id),
    index("candidates_organization_id_trip_id_place_id_idx").on(t.organizationId, t.tripId, t.placeId),
    check("candidates_kind_check", oneOf(t.kind, ["place", "event"])),
    check("candidates_confidence_check", sql`${t.confidence} IS NULL OR ${oneOf(t.confidence, ["low", "medium", "high"])}`),
    check("candidates_not_for_me_risk_check", sql`${t.notForMeRisk} IS NULL OR ${t.notForMeRisk} BETWEEN 1 AND 10`),
    check("candidates_stop_kind_check", sql`${t.stopKind} IS NULL OR ${oneOf(t.stopKind, ["activity", "meal", "event"])}`),
    check("candidates_slot_fit_check", sql`${t.slotFit} IS NULL OR ${t.slotFit} <@ ARRAY['activity', 'meal', 'evening']::text[]`),
    check("candidates_facts_check", closedObject(t.facts, STOP_FACTS_KEYS)),
    check(
      "candidates_sources_check",
      sql`public.jsonb_sources_valid(${t.sources}, ${sql.raw(sqlTextArray(CANDIDATE_SOURCE_KEYS))})`,
    ),
  ],
);

/** Aperçu et suite du tri : une ligne par case, jamais modifiée (les décisions vont dans `preference_signals`). */
export const proposals = pgTable(
  "proposals",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    generationRunId: uuid("generation_run_id").notNull(),
    phase: text("phase").notNull(),
    position: integer("position").notNull(),
    slotType: text("slot_type").notNull(),
    day: integer("day").notNull(),
    time: text("time").notNull(),
    kind: text("kind").notNull(),
    candidateId: uuid("candidate_id"),
    /** `ProposalRecord`, nul pour une case `noOption`. */
    content: jsonb("content"),
    createdAt: createdAt(),
  },
  (t) => [
    tripFk("proposals_trip_fk", t),
    foreignKey({
      name: "proposals_generation_run_fk",
      columns: [t.organizationId, t.generationRunId],
      foreignColumns: [generationRuns.organizationId, generationRuns.id],
    }),
    foreignKey({
      name: "proposals_candidate_fk",
      columns: [t.organizationId, t.candidateId],
      foreignColumns: [candidates.organizationId, candidates.id],
    }),
    unique(uniqueKeyName("proposals_organization_id_trip_id_generation_run_id_phase_position")).on(
      t.organizationId,
      t.tripId,
      t.generationRunId,
      t.phase,
      t.position,
    ),
    index("proposals_organization_id_trip_id_phase_idx").on(t.organizationId, t.tripId, t.phase),
    check("proposals_phase_check", oneOf(t.phase, ["preview", "deck"])),
    check("proposals_slot_type_check", oneOf(t.slotType, ["proposal", "noOption"])),
    check("proposals_kind_check", oneOf(t.kind, ["activity", "meal"])),
    check("proposals_position_check", sql`${t.position} >= 1`),
    check("proposals_day_check", sql`${t.day} >= 1`),
    check("proposals_time_check", hhmm(t.time)),
    check("proposals_content_slot_check", sql`(${t.content} IS NULL) = (${t.slotType} = 'noOption')`),
    check("proposals_content_check", sql`${t.content} IS NULL OR (${closedObject(t.content, PROPOSAL_RECORD_KEYS)})`),
  ],
);

export const eventOccurrences = pgTable(
  "event_occurrences",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    candidateId: uuid("candidate_id"),
    placeId: text("place_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull(),
    category: text("category"),
    /** Texte maison issu de la page de l'événement. */
    priceNote: text("price_note"),
    sourceUrl: text("source_url").notNull(),
    /** Relecture de la page web de l'événement, jamais Google. */
    sourceCheckedAt: timestamp("source_checked_at", { withTimezone: true }),
    status: text("status").notNull(),
  },
  (t) => [
    tripFk("event_occurrences_trip_fk", t),
    foreignKey({
      name: "event_occurrences_candidate_fk",
      columns: [t.organizationId, t.candidateId],
      foreignColumns: [candidates.organizationId, candidates.id],
    }),
    index("event_occurrences_organization_id_trip_id_starts_at_idx").on(t.organizationId, t.tripId, t.startsAt),
    check("event_occurrences_source_url_check", https(t.sourceUrl)),
    check("event_occurrences_status_check", oneOf(t.status, ["confirmed", "unconfirmed"])),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    targetStopId: text("target_stop_id"),
    placeId: text("place_id"),
    reason: text("reason").notNull(),
    text: text("text"),
    scope: text("scope").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    tripFk("feedback_trip_fk", t),
    index("feedback_organization_id_trip_id_idx").on(t.organizationId, t.tripId),
    check("feedback_scope_check", oneOf(t.scope, ["stop", "trip"])),
  ],
);

export const preferenceSignals = pgTable(
  "preference_signals",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    requestId: uuid("request_id").notNull(),
    candidateId: uuid("candidate_id"),
    placeId: text("place_id"),
    category: text("category"),
    signal: text("signal").notNull(),
    reason: text("reason"),
    origin: text("origin").notNull(),
    status: text("status").notNull().default("confirmed"),
    createdAt: createdAt(),
  },
  (t) => [
    tripFk("preference_signals_trip_fk", t),
    foreignKey({
      name: "preference_signals_candidate_fk",
      columns: [t.organizationId, t.candidateId],
      foreignColumns: [candidates.organizationId, candidates.id],
    }),
    unique(uniqueKeyName("preference_signals_organization_id_trip_id_request_id")).on(t.organizationId, t.tripId, t.requestId),
    index("preference_signals_organization_id_trip_id_category_idx").on(t.organizationId, t.tripId, t.category),
    check(
      "preference_signals_signal_check",
      oneOf(t.signal, ["like", "dislike", "choose", "nextOption", "answerYes", "answerNo", "travelReduction"]),
    ),
    check("preference_signals_origin_check", oneOf(t.origin, ["gesture", "question", "brief"])),
    check("preference_signals_status_check", oneOf(t.status, ["confirmed", "inferred", "cancelled"])),
  ],
);

/** Goûts retenus avec l'accord de la personne (« Retenir mes goûts »). */
export const preferences = pgTable(
  "preferences",
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    category: text("category").notNull(),
    value: text("value").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("preferences_organization_id_user_id_idx").on(t.organizationId, t.userId)],
);

/** Liste à réserver ; `moment` est un `ChecklistMoment` (PO-2), jamais un libellé. */
export const checklistItems = pgTable(
  "checklist_items",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    stopId: text("stop_id"),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    moment: jsonb("moment").notNull(),
    bookingUrl: text("booking_url"),
    sponsored: boolean("sponsored").notNull().default(false),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [
    tripFk("checklist_items_trip_fk", t),
    index("checklist_items_organization_id_trip_id_idx").on(t.organizationId, t.tripId),
    check("checklist_items_kind_check", oneOf(t.kind, ["reservation", "ticket", "other"])),
    check("checklist_items_booking_url_check", sql`${t.bookingUrl} IS NULL OR ${https(t.bookingUrl)}`),
    check(
      "checklist_items_moment_check",
      sql.raw(
        `jsonb_typeof(moment) = 'object' AND CASE moment ->> 'type' ` +
          Object.entries(CHECKLIST_MOMENT_VARIANTS)
            .map(([type, keys]) => {
              const required = keys.filter((key) => key !== "type").map((key) => ` AND (moment -> '${key}') IS NOT NULL`);
              return `WHEN '${type}' THEN (moment - ${sqlTextArray(keys)}) = '{}'::jsonb${required.join("")}`;
            })
            .join(" ") +
          " ELSE false END",
      ),
    ),
  ],
);

/** Lien privé : seul le hachage SHA-256 du jeton est stocké ; un lien actif par voyage. */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    tokenHash: bytea("token_hash").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    tripFk("share_links_trip_fk", t),
    unique(uniqueKeyName("share_links_token_hash")).on(t.tokenHash),
    uniqueIndex("share_links_one_active_idx").on(t.organizationId, t.tripId).where(sql`${t.revokedAt} IS NULL`),
    check("share_links_token_hash_check", sql`octet_length(${t.tokenHash}) = 32`),
  ],
);

/**
 * Registre des coûts : ajout seulement. `trip_id` et `generation_run_id` sont des identifiants historiques sans clé
 * étrangère ; `organization_id` en clé étrangère `ON DELETE RESTRICT` (Q48).
 */
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    tripId: uuid("trip_id"),
    generationRunId: uuid("generation_run_id"),
    step: text("step").notNull(),
    provider: text("provider").notNull(),
    sku: text("sku").notNull(),
    units: bigint("units", { mode: "number" }).notNull(),
    costEstimateMicros: bigint("cost_estimate_micros", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("usage_ledger_organization_id_created_at_idx").on(t.organizationId, t.createdAt),
    index("usage_ledger_organization_id_trip_id_idx").on(t.organizationId, t.tripId),
  ],
);

/**
 * Paiements : `vadrouille_app` écrit la ligne et une seule fois `stripe_checkout_session_id` ; le statut et le
 * montant ne sont mis à jour que par `vadrouille_webhook` (décision 0007).
 */
export const checkouts = pgTable(
  "checkouts",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    requestId: uuid("request_id").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    priceVariant: text("price_variant").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("pending"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tripFk("checkouts_trip_fk", t),
    unique(uniqueKeyName("checkouts_stripe_checkout_session_id")).on(t.stripeCheckoutSessionId),
    unique(uniqueKeyName("checkouts_organization_id_request_id")).on(t.organizationId, t.requestId),
    check("checkouts_amount_cents_check", sql`${t.amountCents} >= 0`),
    check("checkouts_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("checkouts_method_check", oneOf(t.method, ["twint", "card"])),
    check(
      "checkouts_status_check",
      oneOf(t.status, ["pending", "succeeded", "duplicate", "declined", "cancelled", "expired"]),
    ),
  ],
);

/**
 * Pièces de paiement : ajout seulement, idempotence par `stripe_event_id`. `checkout_id` est un identifiant
 * historique sans clé étrangère ; `organization_id` en clé étrangère `ON DELETE RESTRICT` (Q48).
 */
export const billing = pgTable(
  "billing",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    stripeEventId: text("stripe_event_id").notNull(),
    type: text("type").notNull(),
    livemode: boolean("livemode").notNull(),
    checkoutId: uuid("checkout_id"),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    outcome: text("outcome").notNull(),
    /** Code d'un refus (`outcome = 'rejected'`). */
    outcomeCode: text("outcome_code"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique(uniqueKeyName("billing_stripe_event_id")).on(t.stripeEventId),
    unique(uniqueKeyName("billing_organization_id_id")).on(t.organizationId, t.id),
    check("billing_outcome_check", oneOf(t.outcome, ["granted", "alreadyGranted", "ignored", "rejected"])),
  ],
);

/** Droits (PO-4) : un seul par voyage et par type ; écrits par `vadrouille_webhook` seulement. */
export const entitlements = pgTable(
  "entitlements",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    kind: text("kind").notNull(),
    billingId: uuid("billing_id"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tripFk("entitlements_trip_fk", t),
    foreignKey({
      name: "entitlements_billing_fk",
      columns: [t.organizationId, t.billingId],
      foreignColumns: [billing.organizationId, billing.id],
    }),
    unique(uniqueKeyName("entitlements_organization_id_trip_id_kind")).on(t.organizationId, t.tripId, t.kind),
    check("entitlements_kind_check", oneOf(t.kind, ["preview", "tripUnlocked"])),
  ],
);
