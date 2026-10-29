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
  type PgTableExtraConfigValue,
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
    /**
     * B10b (décision 0119 § 1.1, migration 0015) : `trips.current_version` lue dans la transaction qui crée la ligne
     * `batch` ; non nulle si et seulement si `kind = 'batch'`.
     */
    baseVersion: integer("base_version"),
    /** B10b (0119 § 1.1) : clôture du tri qui a déclenché le recalcul ; non nulle si et seulement si `kind = 'batch'`. */
    deckClosureId: uuid("deck_closure_id"),
  },
  // Type de retour écrit : sans lui, la référence circulaire à `deckClosures` rendrait les deux tables `any` (TS7022).
  (t): PgTableExtraConfigValue[] => [
    tripFk("generation_runs_trip_fk", t),
    // B10b (0119 § 1.1) : clé étrangère composée vers `deck_closures (organization_id, id)`. Référence circulaire
    // (une clôture vise une exécution) : résolue à la lecture du schéma, `deckClosures` étant déclarée plus bas.
    foreignKey({
      name: "generation_runs_deck_closure_fk",
      columns: [t.organizationId, t.deckClosureId],
      foreignColumns: [deckClosures.organizationId, deckClosures.id],
    }),
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
    // B10b (0119 § 1.1 point 1) : version de base et clôture présentes si et seulement si la ligne est un recalcul.
    check(
      "generation_runs_batch_check",
      sql`(${t.kind} = 'batch') = (${t.baseVersion} IS NOT NULL) AND (${t.kind} = 'batch') = (${t.deckClosureId} IS NOT NULL)`,
    ),
    // B10b (0119 § 1.2 point 1) : au plus un recalcul par tri clos ; au plus un recalcul en cours par voyage.
    uniqueIndex("generation_runs_organization_id_trip_id_deck_closure_id_idx")
      .on(t.organizationId, t.tripId, t.deckClosureId)
      .where(sql`${t.kind} = 'batch'`),
    uniqueIndex("generation_runs_organization_id_trip_id_batch_active_idx")
      .on(t.organizationId, t.tripId)
      .where(sql`${t.kind} = 'batch' AND ${t.finishedAt} IS NULL`),
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
    // B10a (décision 0112 § 3.2, migration 0014_tri_enregistre) : cible de la clé étrangère de `preference_signals`.
    unique(uniqueKeyName("proposals_organization_id_id")).on(t.organizationId, t.id),
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

/**
 * Motifs d'un signalement : valeurs de `STOP_REPORT_REASONS` (décision 0147 § 1 point 1, contrat de M5-C), dans le même
 * ordre ; comparées à la migration 0022 par `tests/unit/db/migration-feedback.test.ts`.
 */
const FEEDBACK_REASONS = ["closed", "hours", "wrongPlace", "price", "other"] as const;

/**
 * Signalements d'une étape (décision 0147 § 2, migration 0022_feedback_signalements) : un motif fermé, **aucun texte**
 * (`text` reste pour la purge, toujours nulle), idempotence par `request_id`, une seule ligne par motif, étape et lieu
 * (`place_id` dans la clé : les identifiants d'étape sont réutilisés d'une version à l'autre, 0142 § 5.1). Jamais
 * modifiée : `vadrouille_app` n'a que `SELECT, INSERT` (`REVOKE UPDATE` de 0022).
 */
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
    // 0147 § 2 point 1 : nullable pour la forme, toujours écrite par `reportStop`.
    requestId: uuid("request_id"),
  },
  (t) => [
    tripFk("feedback_trip_fk", t),
    index("feedback_organization_id_trip_id_idx").on(t.organizationId, t.tripId),
    uniqueIndex("feedback_organization_id_trip_id_request_id_idx")
      .on(t.organizationId, t.tripId, t.requestId)
      .where(sql`${t.requestId} IS NOT NULL`),
    uniqueIndex("feedback_stop_dedup_idx")
      .on(t.organizationId, t.tripId, t.targetStopId, t.reason, sql`COALESCE(${t.placeId}, '')`)
      .where(sql`${t.scope} = 'stop'`),
    check("feedback_scope_check", oneOf(t.scope, ["stop", "trip"])),
    check("feedback_reason_check", oneOf(t.reason, FEEDBACK_REASONS)),
    check("feedback_text_check", sql`${t.text} IS NULL`),
    check("feedback_target_stop_check", sql`${t.scope} <> 'stop' OR ${t.targetStopId} IS NOT NULL`),
  ],
);

/** Valeurs de `CATEGORIES` (`src/contracts/values.ts`), comparées par `tests/unit/db/migration-tri.test.ts`. */
const SIGNAL_CATEGORIES = ["museum", "walk", "nature", "tasting", "restaurant", "heritage", "market", "nightlife"] as const;
/** Valeurs de `PREFERENCE_REASONS` (`src/contracts/values.ts`), comparées par le même test. */
const SIGNAL_REASONS = ["notMyStyle", "tooBusy", "tooExpensive", "tooFar", "other"] as const;
/** Décisions de carte (`DECK_DECISIONS`) : les seuls signaux rattachés à une proposition (décision 0112 § 3.3). */
const CARD_SIGNALS = ["like", "dislike", "choose", "nextOption"] as const;

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
    /** B10a (0112 § 3.2) : ligne `proposals` de la carte décidée ; nulle pour une réponse et `travelReduction`. */
    proposalId: uuid("proposal_id"),
    /** B10a (0112 § 3.1) : statut d'avant l'annulation ou le retrait, non nul si et seulement si `cancelled`. */
    previousStatus: text("previous_status"),
    /** Heure de l'annulation (horloge de la base), non nulle si et seulement si `cancelled`. */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** `requestId` de l'annulation ou du retrait, non nul si et seulement si `cancelled`. */
    cancelRequestId: uuid("cancel_request_id"),
    /** Ordre d'insertion (0112 § 3.6), attribué par la base après le verrou du tri. */
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
  },
  (t) => [
    tripFk("preference_signals_trip_fk", t),
    foreignKey({
      name: "preference_signals_candidate_fk",
      columns: [t.organizationId, t.candidateId],
      foreignColumns: [candidates.organizationId, candidates.id],
    }),
    foreignKey({
      name: "preference_signals_proposal_fk",
      columns: [t.organizationId, t.proposalId],
      foreignColumns: [proposals.organizationId, proposals.id],
    }),
    unique(uniqueKeyName("preference_signals_organization_id_trip_id_request_id")).on(t.organizationId, t.tripId, t.requestId),
    unique(uniqueKeyName("preference_signals_organization_id_id")).on(t.organizationId, t.id),
    index("preference_signals_organization_id_trip_id_category_idx").on(t.organizationId, t.tripId, t.category),
    // 0112 § 3.6 : une décision active par proposition (filet sous le verrou du tri).
    uniqueIndex("preference_signals_active_decision_idx")
      .on(t.organizationId, t.tripId, t.proposalId)
      .where(sql`${t.proposalId} IS NOT NULL AND ${t.status} <> 'cancelled'`),
    check(
      "preference_signals_signal_check",
      oneOf(t.signal, ["like", "dislike", "choose", "nextOption", "answerYes", "answerNo", "travelReduction"]),
    ),
    check("preference_signals_origin_check", oneOf(t.origin, ["gesture", "question", "brief"])),
    check("preference_signals_status_check", oneOf(t.status, ["confirmed", "inferred", "cancelled"])),
    // 0112 § 3.1 : colonnes d'annulation, toutes trois présentes si et seulement si le statut est `cancelled`.
    check(
      "preference_signals_cancellation_check",
      sql`(${t.status} = 'cancelled') = (${t.previousStatus} IS NOT NULL) AND (${t.status} = 'cancelled') = (${t.cancelledAt} IS NOT NULL) AND (${t.status} = 'cancelled') = (${t.cancelRequestId} IS NOT NULL)`,
    ),
    check("preference_signals_previous_status_check", sql`${t.previousStatus} IS NULL OR ${oneOf(t.previousStatus, ["confirmed", "inferred"])}`),
    // 0112 § 3.3 : formes admises d'un signal.
    check("preference_signals_category_check", sql`${t.category} IS NULL OR ${oneOf(t.category, SIGNAL_CATEGORIES)}`),
    check("preference_signals_reason_check", sql`${t.reason} IS NULL OR ${oneOf(t.reason, SIGNAL_REASONS)}`),
    check(
      "preference_signals_form_check",
      sql`CASE
        WHEN ${oneOf(t.signal, CARD_SIGNALS)} THEN ${t.origin} = 'gesture' AND ${t.category} IS NOT NULL AND ${t.proposalId} IS NOT NULL AND ${t.reason} IS NULL
        WHEN ${t.signal} = 'answerYes' THEN ${t.origin} = 'question' AND ${t.category} IS NOT NULL AND ${t.proposalId} IS NULL
        WHEN ${t.signal} = 'answerNo' THEN ${t.origin} = 'question' AND ${t.proposalId} IS NULL
        WHEN ${t.signal} = 'travelReduction' THEN ${t.origin} = 'question' AND ${t.category} IS NULL AND ${t.proposalId} IS NULL AND ${t.reason} IS NULL
        ELSE false
      END`,
    ),
    check(
      "preference_signals_card_place_check",
      sql`${oneOf(t.signal, CARD_SIGNALS)} OR (${t.placeId} IS NULL AND ${t.candidateId} IS NULL)`,
    ),
  ],
);

/**
 * Clôtures d'un tri (B10a, décision 0112 § 3.4) : un tri est l'ensemble des cartes d'une exécution et d'une phase
 * jusqu'à `through_position` ; une carte est dans un tri clos s'il existe une clôture de même exécution et de même
 * phase dont `through_position` est au moins sa position. Ajout seulement pour `vadrouille_app`.
 */
export const deckClosures = pgTable(
  "deck_closures",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    generationRunId: uuid("generation_run_id").notNull(),
    phase: text("phase").notNull(),
    throughPosition: integer("through_position").notNull(),
    requestId: uuid("request_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    tripFk("deck_closures_trip_fk", t),
    foreignKey({
      name: "deck_closures_generation_run_fk",
      columns: [t.organizationId, t.generationRunId],
      foreignColumns: [generationRuns.organizationId, generationRuns.id],
    }),
    // B10b (0119 § 1.1 point 1, migration 0015) : cible de la clé étrangère composée de `generation_runs`. Nom explicite
    // en `_unique` : un nom en `_key` hors de `db/schema/` serait pris pour un nom secret (confinement du dépôt).
    unique("deck_closures_organization_id_id_unique").on(t.organizationId, t.id),
    unique(uniqueKeyName("deck_closures_organization_id_trip_id_request_id")).on(t.organizationId, t.tripId, t.requestId),
    // Nom court : la forme longue dépasserait les 63 caractères d'un identifiant Postgres.
    unique(uniqueKeyName("deck_closures_organization_id_trip_id_run_phase_position")).on(
      t.organizationId,
      t.tripId,
      t.generationRunId,
      t.phase,
      t.throughPosition,
    ),
    check("deck_closures_phase_check", oneOf(t.phase, ["preview", "deck"])),
    check("deck_closures_through_position_check", sql`${t.throughPosition} >= 1`),
  ],
);

/**
 * Questions posées pendant le tri (B10a, décision 0112 § 3.5) : une par décision déclenchante ; une question de
 * catégorie non retirée par voyage et par catégorie ; au plus une question ouverte par voyage.
 */
export const preferencePrompts = pgTable(
  "preference_prompts",
  {
    id: id(),
    organizationId: organizationId(),
    tripId: uuid("trip_id").notNull(),
    kind: text("kind").notNull(),
    category: text("category"),
    triggerSignalId: uuid("trigger_signal_id").notNull(),
    state: text("state").notNull().default("open"),
    answerSignalId: uuid("answer_signal_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tripFk("preference_prompts_trip_fk", t),
    foreignKey({
      name: "preference_prompts_trigger_signal_fk",
      columns: [t.organizationId, t.triggerSignalId],
      foreignColumns: [preferenceSignals.organizationId, preferenceSignals.id],
    }),
    foreignKey({
      name: "preference_prompts_answer_signal_fk",
      columns: [t.organizationId, t.answerSignalId],
      foreignColumns: [preferenceSignals.organizationId, preferenceSignals.id],
    }),
    unique(uniqueKeyName("preference_prompts_organization_id_trigger_signal_id")).on(t.organizationId, t.triggerSignalId),
    unique(uniqueKeyName("preference_prompts_organization_id_answer_signal_id")).on(t.organizationId, t.answerSignalId),
    uniqueIndex("preference_prompts_category_once_idx")
      .on(t.organizationId, t.tripId, t.category)
      .where(sql`${t.kind} = 'category' AND ${t.state} <> 'withdrawn'`),
    uniqueIndex("preference_prompts_one_open_idx").on(t.organizationId, t.tripId).where(sql`${t.state} = 'open'`),
    check("preference_prompts_kind_check", oneOf(t.kind, ["category", "distance"])),
    check("preference_prompts_state_check", oneOf(t.state, ["open", "answered", "closed", "withdrawn"])),
    check(
      "preference_prompts_category_check",
      sql`(${t.kind} = 'category') = (${t.category} IS NOT NULL) AND (${t.category} IS NULL OR ${oneOf(t.category, SIGNAL_CATEGORIES)})`,
    ),
    check("preference_prompts_answer_check", sql`(${t.state} = 'answered') = (${t.answerSignalId} IS NOT NULL)`),
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
