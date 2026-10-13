-- 0000_socle — tables, contraintes et index du MVP (spécification B1, handover § 6).
-- Généré par `drizzle-kit generate` depuis `db/schema/`, puis complété à la main : en-tête (rôle propriétaire,
-- privilèges par défaut), fonction `jsonb_sources_valid` (utilisée par le CHECK de `candidates.sources`) et
-- `RESET ROLE` final. RLS, droits, fonctions, vues et déclencheurs : `0001_securite.sql`, appliquée dans la foulée.
-- Exécutée par `vadrouille_migrator` (`pnpm db:migrate`), dans une transaction. Retour arrière : irréversible
-- (voir `db/README.md`, « Retour arrière des migrations »).

-- Tous les objets appartiennent à vadrouille_owner (décision 0007), jamais au rôle de connexion des migrations.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
-- Décision 0007, règle commune 3 : aucune fonction créée par vadrouille_owner n'est exécutable par PUBLIC.
ALTER DEFAULT PRIVILEGES FOR ROLE vadrouille_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE vadrouille_owner REVOKE ALL ON TABLES FROM PUBLIC;
--> statement-breakpoint
-- CHECK de candidates.sources (handover § 6) : chaque élément est un objet sans clé hors de p_keys, avec une
-- url en https://. Les clés viennent de db/jsonb-keys.ts (décision B1-PO-5).
CREATE FUNCTION public.jsonb_sources_valid(p_sources jsonb, p_keys text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.jsonb_typeof(p_sources) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_sources) AS e(item)
      WHERE pg_catalog.jsonb_typeof(e.item) IS DISTINCT FROM 'object'
         OR (e.item OPERATOR(pg_catalog.-) p_keys) IS DISTINCT FROM '{}'::jsonb
         OR pg_catalog.jsonb_typeof(e.item -> 'url') IS DISTINCT FROM 'string'
         OR pg_catalog.left(e.item ->> 'url', 8) IS DISTINCT FROM 'https://'
    )
$$;
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "action_rate_limits_count_check" CHECK ("action_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_organization_id_user_id_key" UNIQUE("organization_id","user_id"),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" IN ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_key" UNIQUE("slug"),
	CONSTRAINT "organizations_kind_check" CHECK ("organizations"."kind" IN ('personal', 'agency'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"active_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"livemode" boolean NOT NULL,
	"checkout_id" uuid,
	"amount_cents" integer,
	"currency" text,
	"outcome" text NOT NULL,
	"outcome_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_stripe_event_id_key" UNIQUE("stripe_event_id"),
	CONSTRAINT "billing_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "billing_outcome_check" CHECK ("billing"."outcome" IN ('granted', 'alreadyGranted', 'ignored', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"story" text,
	"pace" text,
	"mobility" text,
	"wishes" text[] DEFAULT '{}'::text[] NOT NULL,
	"limits" text,
	"meal_budget" text,
	"inferred_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefs_organization_id_trip_id_version_key" UNIQUE("organization_id","trip_id","version")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"research_run_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"category" text,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text,
	"place_id" text,
	"fit" boolean,
	"not_for_me_risk" smallint,
	"must_see" boolean,
	"slot_fit" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "candidates_kind_check" CHECK ("candidates"."kind" IN ('place', 'event')),
	CONSTRAINT "candidates_confidence_check" CHECK ("candidates"."confidence" IS NULL OR "candidates"."confidence" IN ('low', 'medium', 'high')),
	CONSTRAINT "candidates_not_for_me_risk_check" CHECK ("candidates"."not_for_me_risk" IS NULL OR "candidates"."not_for_me_risk" BETWEEN 1 AND 10),
	CONSTRAINT "candidates_slot_fit_check" CHECK ("candidates"."slot_fit" IS NULL OR "candidates"."slot_fit" <@ ARRAY['activity', 'meal', 'evening']::text[]),
	CONSTRAINT "candidates_facts_check" CHECK (jsonb_typeof("candidates"."facts") = 'object' AND ("candidates"."facts" - ARRAY['durationMinutes', 'costPerPerson', 'area']::text[]) = '{}'::jsonb),
	CONSTRAINT "candidates_sources_check" CHECK (public.jsonb_sources_valid("candidates"."sources", ARRAY['label', 'url', 'checkedOn']::text[]))
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" text,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"moment" jsonb NOT NULL,
	"booking_url" text,
	"sponsored" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "checklist_items_kind_check" CHECK ("checklist_items"."kind" IN ('reservation', 'ticket', 'other')),
	CONSTRAINT "checklist_items_booking_url_check" CHECK ("checklist_items"."booking_url" IS NULL OR left("checklist_items"."booking_url", 8) = 'https://'),
	CONSTRAINT "checklist_items_moment_check" CHECK (jsonb_typeof(moment) = 'object' AND CASE moment ->> 'type' WHEN 'deadline' THEN (moment - ARRAY['type', 'date']::text[]) = '{}'::jsonb AND (moment -> 'date') IS NOT NULL WHEN 'beforeDeparture' THEN (moment - ARRAY['type']::text[]) = '{}'::jsonb WHEN 'tripDay' THEN (moment - ARRAY['type', 'day']::text[]) = '{}'::jsonb AND (moment -> 'day') IS NOT NULL ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"stripe_checkout_session_id" text,
	"price_variant" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkouts_stripe_checkout_session_id_key" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "checkouts_organization_id_request_id_key" UNIQUE("organization_id","request_id"),
	CONSTRAINT "checkouts_amount_cents_check" CHECK ("checkouts"."amount_cents" >= 0),
	CONSTRAINT "checkouts_currency_check" CHECK ("checkouts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "checkouts_method_check" CHECK ("checkouts"."method" IN ('twint', 'card')),
	CONSTRAINT "checkouts_status_check" CHECK ("checkouts"."status" IN ('pending', 'succeeded', 'duplicate', 'declined', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"billing_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_organization_id_trip_id_kind_key" UNIQUE("organization_id","trip_id","kind"),
	CONSTRAINT "entitlements_kind_check" CHECK ("entitlements"."kind" IN ('preview', 'tripUnlocked'))
);
--> statement-breakpoint
CREATE TABLE "event_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"candidate_id" uuid,
	"place_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"category" text,
	"price_note" text,
	"source_url" text NOT NULL,
	"source_checked_at" timestamp with time zone,
	"status" text NOT NULL,
	CONSTRAINT "event_occurrences_source_url_check" CHECK (left("event_occurrences"."source_url", 8) = 'https://'),
	CONSTRAINT "event_occurrences_status_check" CHECK ("event_occurrences"."status" IN ('confirmed', 'unconfirmed'))
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"target_stop_id" text,
	"place_id" text,
	"reason" text NOT NULL,
	"text" text,
	"scope" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_scope_check" CHECK ("feedback"."scope" IN ('stop', 'trip'))
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"workflow_run_id" text,
	"kind" text NOT NULL,
	"phase" text NOT NULL,
	"stop_reason" text,
	"last_version" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generation_runs_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "generation_runs_kind_check" CHECK ("generation_runs"."kind" IN ('preview', 'full', 'batch', 'mini'))
);
--> statement-breakpoint
CREATE TABLE "preference_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"candidate_id" uuid,
	"place_id" text,
	"category" text,
	"signal" text NOT NULL,
	"reason" text,
	"origin" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preference_signals_organization_id_trip_id_request_id_key" UNIQUE("organization_id","trip_id","request_id"),
	CONSTRAINT "preference_signals_signal_check" CHECK ("preference_signals"."signal" IN ('like', 'dislike', 'choose', 'nextOption', 'answerYes', 'answerNo', 'travelReduction')),
	CONSTRAINT "preference_signals_origin_check" CHECK ("preference_signals"."origin" IN ('gesture', 'question', 'brief')),
	CONSTRAINT "preference_signals_status_check" CHECK ("preference_signals"."status" IN ('confirmed', 'inferred', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"generation_run_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"position" integer NOT NULL,
	"slot_type" text NOT NULL,
	"day" integer NOT NULL,
	"time" text NOT NULL,
	"kind" text NOT NULL,
	"candidate_id" uuid,
	"content" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_organization_id_trip_id_generation_run_id_phase_position_key" UNIQUE("organization_id","trip_id","generation_run_id","phase","position"),
	CONSTRAINT "proposals_phase_check" CHECK ("proposals"."phase" IN ('preview', 'deck')),
	CONSTRAINT "proposals_slot_type_check" CHECK ("proposals"."slot_type" IN ('proposal', 'noOption')),
	CONSTRAINT "proposals_kind_check" CHECK ("proposals"."kind" IN ('activity', 'meal')),
	CONSTRAINT "proposals_position_check" CHECK ("proposals"."position" >= 1),
	CONSTRAINT "proposals_day_check" CHECK ("proposals"."day" >= 1),
	CONSTRAINT "proposals_time_check" CHECK ("proposals"."time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "proposals_content_slot_check" CHECK (("proposals"."content" IS NULL) = ("proposals"."slot_type" = 'noOption')),
	CONSTRAINT "proposals_content_check" CHECK ("proposals"."content" IS NULL OR (jsonb_typeof("proposals"."content") = 'object' AND ("proposals"."content" - ARRAY['id', 'kind', 'day', 'time', 'stop', 'category', 'travelFromPrevious', 'detour']::text[]) = '{}'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"generation_run_id" uuid,
	"queries" text[] DEFAULT '{}'::text[] NOT NULL,
	"pages_read" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"cost_estimate_micros" bigint,
	"errors" text[] DEFAULT '{}'::text[] NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "research_runs_organization_id_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "share_links_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "share_links_token_hash_check" CHECK (octet_length("share_links"."token_hash") = 32)
);
--> statement-breakpoint
CREATE TABLE "stays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"place_id" text,
	"label" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"arrival_time" text,
	"departure_time" text,
	"luggage" text,
	CONSTRAINT "stays_kind_check" CHECK ("stays"."kind" IN ('lodging', 'neighbourhood')),
	CONSTRAINT "stays_dates_check" CHECK ("stays"."to_date" >= "stays"."from_date"),
	CONSTRAINT "stays_arrival_time_check" CHECK ("stays"."arrival_time" IS NULL OR "stays"."arrival_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "stays_departure_time_check" CHECK ("stays"."departure_time" IS NULL OR "stays"."departure_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "trip_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parent_version" integer,
	"request_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"patch" jsonb,
	"author_kind" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_versions_organization_id_trip_id_version_key" UNIQUE("organization_id","trip_id","version"),
	CONSTRAINT "trip_versions_organization_id_trip_id_request_id_key" UNIQUE("organization_id","trip_id","request_id"),
	CONSTRAINT "trip_versions_version_check" CHECK ("trip_versions"."version" >= 1),
	CONSTRAINT "trip_versions_author_kind_check" CHECK ("trip_versions"."author_kind" IN ('user', 'engine', 'workflow')),
	CONSTRAINT "trip_versions_snapshot_check" CHECK (jsonb_typeof("trip_versions"."snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"destination" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"travellers_adults" smallint NOT NULL,
	"travellers_children" smallint DEFAULT 0 NOT NULL,
	"current_version" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"time_zone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "trips_organization_id_request_id_key" UNIQUE("organization_id","request_id"),
	CONSTRAINT "trips_status_check" CHECK ("trips"."status" IN ('active', 'archived')),
	CONSTRAINT "trips_dates_check" CHECK ("trips"."end_date" >= "trips"."start_date"),
	CONSTRAINT "trips_travellers_check" CHECK ("trips"."travellers_adults" >= 0 AND "trips"."travellers_children" >= 0)
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid,
	"generation_run_id" uuid,
	"step" text NOT NULL,
	"provider" text NOT NULL,
	"sku" text NOT NULL,
	"units" bigint NOT NULL,
	"cost_estimate_micros" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_organization_id_organizations_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing" ADD CONSTRAINT "billing_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_research_run_fk" FOREIGN KEY ("organization_id","research_run_id") REFERENCES "public"."research_runs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_billing_fk" FOREIGN KEY ("organization_id","billing_id") REFERENCES "public"."billing"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_occurrences" ADD CONSTRAINT "event_occurrences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_occurrences" ADD CONSTRAINT "event_occurrences_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_occurrences" ADD CONSTRAINT "event_occurrences_candidate_fk" FOREIGN KEY ("organization_id","candidate_id") REFERENCES "public"."candidates"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_candidate_fk" FOREIGN KEY ("organization_id","candidate_id") REFERENCES "public"."candidates"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_generation_run_fk" FOREIGN KEY ("organization_id","generation_run_id") REFERENCES "public"."generation_runs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_candidate_fk" FOREIGN KEY ("organization_id","candidate_id") REFERENCES "public"."candidates"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_generation_run_fk" FOREIGN KEY ("organization_id","generation_run_id") REFERENCES "public"."generation_runs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_versions" ADD CONSTRAINT "trip_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_versions" ADD CONSTRAINT "trip_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_versions" ADD CONSTRAINT "trip_versions_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "action_rate_limits_window_start_idx" ON "action_rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_owner_idx" ON "memberships" USING btree ("organization_id") WHERE "memberships"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verifications_expires_at_idx" ON "verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "candidates_organization_id_trip_id_place_id_idx" ON "candidates" USING btree ("organization_id","trip_id","place_id");--> statement-breakpoint
CREATE INDEX "checklist_items_organization_id_trip_id_idx" ON "checklist_items" USING btree ("organization_id","trip_id");--> statement-breakpoint
CREATE INDEX "event_occurrences_organization_id_trip_id_starts_at_idx" ON "event_occurrences" USING btree ("organization_id","trip_id","starts_at");--> statement-breakpoint
CREATE INDEX "feedback_organization_id_trip_id_idx" ON "feedback" USING btree ("organization_id","trip_id");--> statement-breakpoint
CREATE INDEX "generation_runs_organization_id_trip_id_started_at_idx" ON "generation_runs" USING btree ("organization_id","trip_id","started_at");--> statement-breakpoint
CREATE INDEX "preference_signals_organization_id_trip_id_category_idx" ON "preference_signals" USING btree ("organization_id","trip_id","category");--> statement-breakpoint
CREATE INDEX "preferences_organization_id_user_id_idx" ON "preferences" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "proposals_organization_id_trip_id_phase_idx" ON "proposals" USING btree ("organization_id","trip_id","phase");--> statement-breakpoint
CREATE INDEX "research_runs_organization_id_trip_id_idx" ON "research_runs" USING btree ("organization_id","trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_one_active_idx" ON "share_links" USING btree ("organization_id","trip_id") WHERE "share_links"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "stays_organization_id_trip_id_from_date_idx" ON "stays" USING btree ("organization_id","trip_id","from_date");--> statement-breakpoint
CREATE INDEX "trips_organization_id_start_date_idx" ON "trips" USING btree ("organization_id","start_date");--> statement-breakpoint
CREATE INDEX "usage_ledger_organization_id_created_at_idx" ON "usage_ledger" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_ledger_organization_id_trip_id_idx" ON "usage_ledger" USING btree ("organization_id","trip_id");--> statement-breakpoint
RESET ROLE;
