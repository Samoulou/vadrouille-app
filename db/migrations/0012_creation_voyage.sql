-- 0012_creation_voyage — création du voyage par B9b : brouillon et brief écrits sans perte, engagements, état des
-- exécutions de génération (spécification `specs/B9-generation.md`, B9b point 1 ; décisions 0081 B9-TL-6 (a) à (h) et
-- B9-TL-3, 0087 § 1.2 (point (i)) et § 2 (étape `l`)). Générée par `pnpm db:generate` depuis `db/schema/business.ts`,
-- puis complétée à la main (RLS, politiques, droits, purge, `NOT VALID`). Exécutée par `vadrouille_migrator` dans une
-- transaction, après 0010_usage_forfait (le numéro 0011 est pris par la PR ouverte #507, schéma `prototype` : aucun
-- objet commun, l'ordre d'application des deux est indifférent).
-- Retour arrière : irréversible (voir `db/README.md`, « Retour arrière des migrations ») ; correction vers l'avant.
--
-- Migration **additive** : une table, des colonnes nulles ou à valeur par défaut, des contraintes. Aucune ligne n'est lue,
-- modifiée ni supprimée. Les contraintes qui pourraient refuser une ligne existante sont posées `NOT VALID` : elles
-- s'appliquent à toute écriture (`INSERT`, `UPDATE`, lignes anciennes comprises) sans vérifier les lignes déjà là
-- (0081 B9-TL-6 (d) et (f)) ; la version précédente du code n'écrit aucune des colonnes ajoutées.
--
-- Plan :
--   1. `trip_commitments` (engagements de l'écran 1, 0081 B9-TL-6 (b)) : table, RLS activée et forcée, politique de
--      `vadrouille_app` dans l'organisation de la transaction (même modèle que `stays`), droits `SELECT, INSERT,
--      UPDATE, DELETE` à `vadrouille_app` (comme `stays`), `SELECT (organization_id)` et `DELETE` à `vadrouille_fn_purge`
--      avec sa politique (même forme que les tables purgées de 0001_securite) ;
--   2. `stays` : ville (a), type de logement d'origine et valeurs maison de la suggestion retenue (c, B9-TL-5), `kind`
--      `none` ; borne de fin exclusive (f, `NOT VALID`) ;
--   3. `trips.time_zone` obligatoire (d, `NOT VALID`) ;
--   4. `briefs` : `mobility_modes text[]` (e) et `limit_categories text[]` (`Brief.limits` sans perte : `limits` est un
--      `text`) ; l'ancienne colonne `mobility` n'est plus écrite ;
--   5. `candidates` : type d'étape et « à réserver » (g) ;
--   6. `generation_runs` : `step`, `step_seq`, `request_id` et son unicité partielle, unicité partielle de la ligne
--      `full`, `CHECK` de `phase` et de `stop_reason` (`NOT VALID`) (h) ; colonnes de reprise (i, 0087 § 1.2) ;
--   7. `purge_organization_data` recréée sous son propriétaire `vadrouille_fn_purge`, corps de 0001_securite inchangé
--      hors de la suppression des engagements (avant `trips`) ; appartenance temporaire de `vadrouille_migrator`
--      retirée (même forme que 0008_positions_mvp_29_jours).

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Engagements de l'écran 1 (0081 B9-TL-6 (b)). Colonnes égales aux champs de `TripCommitment` (`start` et `end` en
-- `start_time` et `end_time` : `end` est un mot réservé) et rang dans le brouillon.
CREATE TABLE "trip_commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"rank" smallint NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_commitments_organization_id_trip_id_rank_key" UNIQUE("organization_id","trip_id","rank"),
	CONSTRAINT "trip_commitments_kind_check" CHECK ("trip_commitments"."kind" IN ('flight', 'booking', 'ticket')),
	CONSTRAINT "trip_commitments_rank_check" CHECK ("trip_commitments"."rank" >= 0),
	CONSTRAINT "trip_commitments_start_time_check" CHECK ("trip_commitments"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "trip_commitments_end_time_check" CHECK ("trip_commitments"."end_time" IS NULL OR ("trip_commitments"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "trip_commitments"."end_time" > "trip_commitments"."start_time"))
);
--> statement-breakpoint
ALTER TABLE "trip_commitments" ADD CONSTRAINT "trip_commitments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trip_commitments" ADD CONSTRAINT "trip_commitments_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE public.trip_commitments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.trip_commitments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY trip_commitments_app ON public.trip_commitments AS PERMISSIVE FOR ALL TO vadrouille_app
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY trip_commitments_fn_purge ON public.trip_commitments AS PERMISSIVE FOR ALL TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_commitments TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT (organization_id), DELETE ON public.trip_commitments TO vadrouille_fn_purge;
--> statement-breakpoint

-- 2. Logements (0081 B9-TL-6 (a), (c) et (f) ; B9-TL-5). `kind` reçoit `none` (libellé = la ville). Le centre et le rayon
-- d'une zone maison sont une sortie du modèle, jamais une donnée Google (0011, 0027) ; `place_id` reste la seule
-- donnée Google stockée.
ALTER TABLE "stays" DROP CONSTRAINT "stays_kind_check";
--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_kind_check" CHECK ("stays"."kind" IN ('lodging', 'neighbourhood', 'none'));
--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "city" text;
--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "lodging_kind" text;
--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "suggestion_id" text;
--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "area_center_lat" double precision;
--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "area_center_lng" double precision;
--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "area_radius_m" integer;
--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_lodging_kind_check" CHECK ("stays"."lodging_kind" IS NULL OR "stays"."lodging_kind" IN ('known', 'area', 'none', 'suggestedLodging', 'suggestedArea'));
--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_area_center_check" CHECK (("stays"."area_center_lat" IS NULL AND "stays"."area_center_lng" IS NULL AND "stays"."area_radius_m" IS NULL) OR ("stays"."area_center_lat" BETWEEN -90 AND 90 AND "stays"."area_center_lng" BETWEEN -180 AND 180 AND "stays"."area_radius_m" BETWEEN 50 AND 20000));
--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_to_date_exclusive_check" CHECK ("stays"."to_date" > "stays"."from_date") NOT VALID;
--> statement-breakpoint

-- 3. Fuseau obligatoire (0081 B9-TL-6 (d)) : aucune source ne permet de remplir les lignes existantes.
ALTER TABLE "trips" ADD CONSTRAINT "trips_time_zone_check" CHECK ("trips"."time_zone" IS NOT NULL) NOT VALID;
--> statement-breakpoint

-- 4. Brief (0081 B9-TL-6 (e)).
ALTER TABLE "briefs" ADD COLUMN "mobility_modes" text[];
--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "limit_categories" text[];
--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_mobility_modes_check" CHECK ("briefs"."mobility_modes" IS NULL OR "briefs"."mobility_modes" <@ ARRAY['walk', 'transit', 'car']::text[]);
--> statement-breakpoint

-- 5. Candidats (0081 B9-TL-6 (g), question 13 (a) de B7) : remplis par `versLignes` (B9c).
ALTER TABLE "candidates" ADD COLUMN "stop_kind" text;
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "to_reserve" boolean;
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_stop_kind_check" CHECK ("candidates"."stop_kind" IS NULL OR "candidates"."stop_kind" IN ('activity', 'meal', 'event'));
--> statement-breakpoint

-- 6. Exécutions (0081 B9-TL-3 point 1, B9-TL-6 (h), B9-TL-11, B9-TL-12 point 1 ; 0087 § 1.2 et § 2.5). Codes fermés de
-- `stop_reason` : ceux de la couche IA (`CODES_ERREUR_IA`, `src/ai/erreurs.ts`), de l'ancrage (`CODES_ANCRAGE`,
-- `src/grounding/resultat.ts`, dont `lodging_unresolved`) et `step_expired` (B9-TL-3 point 5) ; l'égalité avec ces listes
-- est vérifiée par `tests/unit/db/migration-creation.test.ts`.
ALTER TABLE "generation_runs" ADD COLUMN "step" text;
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "step_seq" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "request_id" uuid;
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "person_retry_request_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "studio_retries" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "generation_runs_organization_id_trip_id_request_id_idx" ON "generation_runs" USING btree ("organization_id","trip_id","request_id") WHERE "generation_runs"."request_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "generation_runs_organization_id_trip_id_full_idx" ON "generation_runs" USING btree ("organization_id","trip_id") WHERE "generation_runs"."kind" = 'full';
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_phase_check" CHECK ("generation_runs"."phase" IN ('queued', 'preparing', 'ready', 'incomplete', 'failed')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_stop_reason_check" CHECK ("generation_runs"."stop_reason" IS NULL OR "generation_runs"."stop_reason" IN (
  'production_refused', 'proxy_env_refused', 'tls_env_refused', 'missing_key', 'cap_reached', 'envelope_reached',
  'daily_quota_insufficient', 'usage_unavailable', 'data_collection_missing', 'model_id_invalid', 'invalid_request',
  'upstream_redirect', 'upstream_unavailable', 'upstream_timeout', 'upstream_error', 'model_unavailable', 'model_error',
  'invalid_input', 'model_output_invalid', 'no_option', 'upstream_rate_limited', 'invalid_response', 'upstream_not_found',
  'place_not_found', 'routes_unavailable', 'lodging_unresolved', 'step_expired')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_step_check" CHECK ("generation_runs"."step" IS NULL OR "generation_runs"."step" IN ('a', 'l', 'b', 'c', 'd', 'e'));
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_step_seq_check" CHECK ("generation_runs"."step_seq" >= 0);
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_studio_retries_check" CHECK ("generation_runs"."studio_retries" >= 0);
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_retries_full_check" CHECK ("generation_runs"."kind" = 'full' OR (cardinality("generation_runs"."person_retry_request_ids") = 0 AND "generation_runs"."studio_retries" = 0));
--> statement-breakpoint

-- 7. Purge de compte (0001_securite, 6.3) : les engagements sont des lignes métier de l'organisation. Recréation sous le
-- propriétaire (même forme que 0008_positions_mvp_29_jours, section 1 : appartenance temporaire de vadrouille_migrator
-- par l'option ADMIN de l'amorçage, CREATE sur public le temps de la recréation) ; corps identique à 0001_securite hors
-- de la ligne `trip_commitments`, placée avant `trips` (clé étrangère composite). Droits d'exécution réécrits.
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_purge TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_purge;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_purge;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.purge_organization_data(p_organization_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org uuid := public.app_current_org();
  v_user uuid := public.app_current_user();
BEGIN
  IF p_organization_id IS NULL OR v_org IS NULL OR p_organization_id <> v_org THEN
    RAISE EXCEPTION 'purge refusée : organisation hors du contexte de la transaction' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'purge refusée : aucun utilisateur dans le contexte' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS m WHERE m.organization_id = v_org AND m.user_id = v_user AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'purge refusée : réservée au propriétaire' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.memberships AS m WHERE m.organization_id = v_org AND m.user_id <> v_user) THEN
    RAISE EXCEPTION 'purge refusée : l''organisation a un autre membre' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.organizations AS o SET deletion_requested_at = pg_catalog.now()
  WHERE o.id = v_org AND o.deletion_requested_at IS NULL;

  DELETE FROM public.proposals AS x WHERE x.organization_id = v_org;
  DELETE FROM public.preference_signals AS x WHERE x.organization_id = v_org;
  DELETE FROM public.event_occurrences AS x WHERE x.organization_id = v_org;
  DELETE FROM public.candidates AS x WHERE x.organization_id = v_org;
  DELETE FROM public.research_runs AS x WHERE x.organization_id = v_org;
  DELETE FROM public.generation_runs AS x WHERE x.organization_id = v_org;
  DELETE FROM public.feedback AS x WHERE x.organization_id = v_org;
  DELETE FROM public.checklist_items AS x WHERE x.organization_id = v_org;
  DELETE FROM public.share_links AS x WHERE x.organization_id = v_org;
  DELETE FROM public.entitlements AS x WHERE x.organization_id = v_org;
  DELETE FROM public.checkouts AS x WHERE x.organization_id = v_org;
  DELETE FROM public.trip_versions AS x WHERE x.organization_id = v_org;
  DELETE FROM public.briefs AS x WHERE x.organization_id = v_org;
  DELETE FROM public.stays AS x WHERE x.organization_id = v_org;
  DELETE FROM public.trip_commitments AS x WHERE x.organization_id = v_org;
  DELETE FROM public.preferences AS x WHERE x.organization_id = v_org;
  DELETE FROM public.trips AS x WHERE x.organization_id = v_org;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_organization_data(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_organization_data(uuid) TO vadrouille_account_admin;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_purge;
--> statement-breakpoint
REVOKE vadrouille_fn_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
