-- 0014_tri_enregistre — tri enregistré de B10a : rattachement d'une décision à sa proposition, annulation par les
-- seules colonnes d'annulation, ordre des signaux, clôtures d'un tri et questions posées (spécification
-- `specs/B10-propositions-preferences.md`, B10a ; décision 0112 § 3.1 à § 3.7, B10-TL-3). Générée par
-- `pnpm db:generate` depuis `db/schema/business.ts`, puis réordonnée (contraintes uniques avant les clés étrangères qui
-- les visent) et complétée à la main (RLS, politiques, droits, purge). Exécutée par `vadrouille_migrator` dans une
-- transaction, après 0013_secteurs_prototype, seulement par le workflow `db-migrate` après l'`owner-approved` de Samuel
-- sur la ligne de MIGRATIONS_APPROUVEES (0035, 0056 § 3), ajoutée par une PR de workflow à part (0112 § 3.7).
-- Retour arrière : `0014_tri_enregistre.down.sql` (partielle, voir `db/README.md`).
--
-- Migration **additive** (0112 § 3.7) : deux tables, des colonnes nulles ou générées, des contraintes, des index ; la RLS
-- reste la même dans son principe (organisation de la transaction). Aucune ligne n'est modifiée ni supprimée. Aucune
-- version du code ne lit ni n'écrit encore `preference_signals` (B10a est la première) : les `CHECK` sont posées
-- valides ; si une ligne existante les contredisait, la migration échouerait sans rien changer.
--
-- Plan :
--   1. `proposals` : contrainte unique `(organization_id, id)` (cible de la clé étrangère du point 2) ;
--   2. `preference_signals` : colonnes `proposal_id` (§ 3.2), `previous_status`, `cancelled_at`, `cancel_request_id`
--      (§ 3.1) et `seq` (identité générée, § 3.6) ; contrainte unique `(organization_id, id)` ; clé étrangère composée
--      vers `proposals` ; `CHECK` des colonnes d'annulation (§ 3.1) et des formes d'un signal (§ 3.3) ; index unique
--      partiel « une décision active par proposition » (§ 3.6) ;
--   3. `deck_closures` (§ 3.4) : table, clés étrangères composées, RLS activée et forcée, politiques de `vadrouille_app`
--      et de `vadrouille_fn_purge` (même modèle que `trip_commitments`, 0012), `SELECT, INSERT` à `vadrouille_app` ;
--   4. `preference_prompts` (§ 3.5) : table, clés étrangères composées, index uniques partiels, RLS et politiques comme
--      au point 3, `SELECT, INSERT, UPDATE (state, answer_signal_id, updated_at)` à `vadrouille_app` ;
--   5. droits de `vadrouille_app` sur `preference_signals` : `UPDATE` de table retiré, `UPDATE` des quatre colonnes
--      d'annulation accordé (§ 3.1) ; droits de `vadrouille_fn_purge` sur les deux nouvelles tables ;
--   6. `purge_organization_data` recréée sous son propriétaire `vadrouille_fn_purge` (même forme que 0012, section 7) :
--      questions puis clôtures, puis signaux **avant** propositions (nouvelle clé étrangère du point 2), le reste à
--      l'identique de 0012 ; appartenance temporaire de `vadrouille_migrator` retirée.
--
-- Aucun nom, aucune donnée Google : `place_id` (identifiant de lieu, seule donnée Google stockée) n'est admis que sur une
-- décision de carte ; ni les clôtures ni les questions n'ont de colonne de lieu ou de texte libre.

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Propositions (0112 § 3.2) : contrainte additive, vraie de toute ligne existante (`id` est la clé primaire).
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_organization_id_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint

-- 2. Signaux (0112 § 3.1, § 3.2, § 3.3, § 3.6).
ALTER TABLE "preference_signals" ADD COLUMN "proposal_id" uuid;
--> statement-breakpoint
ALTER TABLE "preference_signals" ADD COLUMN "previous_status" text;
--> statement-breakpoint
ALTER TABLE "preference_signals" ADD COLUMN "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "preference_signals" ADD COLUMN "cancel_request_id" uuid;
--> statement-breakpoint
-- Ordre des décisions (§ 3.6) : attribué à l'insertion, donc après le verrou du tri ; `GENERATED ALWAYS` refuse une
-- valeur fournie sans `OVERRIDING SYSTEM VALUE`.
ALTER TABLE "preference_signals" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "preference_signals_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);
--> statement-breakpoint
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_organization_id_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_proposal_fk" FOREIGN KEY ("organization_id","proposal_id") REFERENCES "public"."proposals"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- § 3.1 : les trois colonnes d'annulation sont présentes si et seulement si le statut est `cancelled` ; le statut
-- d'avant n'est jamais `cancelled`.
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_cancellation_check" CHECK (("preference_signals"."status" = 'cancelled') = ("preference_signals"."previous_status" IS NOT NULL) AND ("preference_signals"."status" = 'cancelled') = ("preference_signals"."cancelled_at" IS NOT NULL) AND ("preference_signals"."status" = 'cancelled') = ("preference_signals"."cancel_request_id" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_previous_status_check" CHECK ("preference_signals"."previous_status" IS NULL OR "preference_signals"."previous_status" IN ('confirmed', 'inferred'));
--> statement-breakpoint
-- § 3.3 : catégories (`CATEGORIES`) et raisons (`PREFERENCE_REASONS`) de `src/contracts/values.ts`, comparées par
-- `tests/unit/db/migration-tri.test.ts`.
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_category_check" CHECK ("preference_signals"."category" IS NULL OR "preference_signals"."category" IN ('museum', 'walk', 'nature', 'tasting', 'restaurant', 'heritage', 'market', 'nightlife'));
--> statement-breakpoint
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_reason_check" CHECK ("preference_signals"."reason" IS NULL OR "preference_signals"."reason" IN ('notMyStyle', 'tooBusy', 'tooExpensive', 'tooFar', 'other'));
--> statement-breakpoint
-- § 3.3, tableau des formes : décision de carte (origine `gesture`, catégorie, proposition, sans raison) ; `answerYes`
-- (origine `question`, catégorie, sans proposition) ; `answerNo` (origine `question`, sans proposition, catégorie nulle
-- pour la distance) ; `travelReduction` (origine `question`, ni catégorie, ni proposition, ni raison). L'origine `brief`
-- n'a encore aucune forme admise (0112 § 1.5 : B12 la fixera) : elle est refusée, comme par `PreferenceSignalSchema`.
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_form_check" CHECK (CASE
        WHEN "preference_signals"."signal" IN ('like', 'dislike', 'choose', 'nextOption') THEN "preference_signals"."origin" = 'gesture' AND "preference_signals"."category" IS NOT NULL AND "preference_signals"."proposal_id" IS NOT NULL AND "preference_signals"."reason" IS NULL
        WHEN "preference_signals"."signal" = 'answerYes' THEN "preference_signals"."origin" = 'question' AND "preference_signals"."category" IS NOT NULL AND "preference_signals"."proposal_id" IS NULL
        WHEN "preference_signals"."signal" = 'answerNo' THEN "preference_signals"."origin" = 'question' AND "preference_signals"."proposal_id" IS NULL
        WHEN "preference_signals"."signal" = 'travelReduction' THEN "preference_signals"."origin" = 'question' AND "preference_signals"."category" IS NULL AND "preference_signals"."proposal_id" IS NULL AND "preference_signals"."reason" IS NULL
        ELSE false
      END);
--> statement-breakpoint
-- § 3.3 : `place_id` nul hors décision de carte ; `candidate_id` aussi (option la plus restrictive, question de la PR).
ALTER TABLE "preference_signals" ADD CONSTRAINT "preference_signals_card_place_check" CHECK ("preference_signals"."signal" IN ('like', 'dislike', 'choose', 'nextOption') OR ("preference_signals"."place_id" IS NULL AND "preference_signals"."candidate_id" IS NULL));
--> statement-breakpoint
-- § 3.6 : une décision active par proposition, filet sous le verrou du tri.
CREATE UNIQUE INDEX "preference_signals_active_decision_idx" ON "preference_signals" USING btree ("organization_id","trip_id","proposal_id") WHERE "preference_signals"."proposal_id" IS NOT NULL AND "preference_signals"."status" <> 'cancelled';
--> statement-breakpoint

-- 3. Clôtures d'un tri (0112 § 3.4) : ajout seulement pour `vadrouille_app`.
CREATE TABLE "deck_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"generation_run_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"through_position" integer NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_closures_organization_id_trip_id_request_id_key" UNIQUE("organization_id","trip_id","request_id"),
	CONSTRAINT "deck_closures_organization_id_trip_id_run_phase_position_key" UNIQUE("organization_id","trip_id","generation_run_id","phase","through_position"),
	CONSTRAINT "deck_closures_phase_check" CHECK ("deck_closures"."phase" IN ('preview', 'deck')),
	CONSTRAINT "deck_closures_through_position_check" CHECK ("deck_closures"."through_position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "deck_closures" ADD CONSTRAINT "deck_closures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deck_closures" ADD CONSTRAINT "deck_closures_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deck_closures" ADD CONSTRAINT "deck_closures_generation_run_fk" FOREIGN KEY ("organization_id","generation_run_id") REFERENCES "public"."generation_runs"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE public.deck_closures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.deck_closures FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY deck_closures_app ON public.deck_closures AS PERMISSIVE FOR ALL TO vadrouille_app
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY deck_closures_fn_purge ON public.deck_closures AS PERMISSIVE FOR ALL TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT ON public.deck_closures TO vadrouille_app;
--> statement-breakpoint

-- 4. Questions posées (0112 § 3.5). Transitions (posée → `open` ; `answered`, `closed`, `withdrawn`) écrites par les cas
-- d'usage du tri dans la transaction de l'action qui les cause ; la base garde les formes et les unicités.
CREATE TABLE "preference_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text,
	"trigger_signal_id" uuid NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"answer_signal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preference_prompts_organization_id_trigger_signal_id_key" UNIQUE("organization_id","trigger_signal_id"),
	CONSTRAINT "preference_prompts_organization_id_answer_signal_id_key" UNIQUE("organization_id","answer_signal_id"),
	CONSTRAINT "preference_prompts_kind_check" CHECK ("preference_prompts"."kind" IN ('category', 'distance')),
	CONSTRAINT "preference_prompts_state_check" CHECK ("preference_prompts"."state" IN ('open', 'answered', 'closed', 'withdrawn')),
	CONSTRAINT "preference_prompts_category_check" CHECK (("preference_prompts"."kind" = 'category') = ("preference_prompts"."category" IS NOT NULL) AND ("preference_prompts"."category" IS NULL OR "preference_prompts"."category" IN ('museum', 'walk', 'nature', 'tasting', 'restaurant', 'heritage', 'market', 'nightlife'))),
	CONSTRAINT "preference_prompts_answer_check" CHECK (("preference_prompts"."state" = 'answered') = ("preference_prompts"."answer_signal_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "preference_prompts" ADD CONSTRAINT "preference_prompts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preference_prompts" ADD CONSTRAINT "preference_prompts_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preference_prompts" ADD CONSTRAINT "preference_prompts_trigger_signal_fk" FOREIGN KEY ("organization_id","trigger_signal_id") REFERENCES "public"."preference_signals"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preference_prompts" ADD CONSTRAINT "preference_prompts_answer_signal_fk" FOREIGN KEY ("organization_id","answer_signal_id") REFERENCES "public"."preference_signals"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- « Une seule fois par catégorie et par voyage » (B10-PO-5 point 1) : une question retirée par une annulation peut être
-- reposée. La règle de la question de distance et son index sont fixés par B10f.
CREATE UNIQUE INDEX "preference_prompts_category_once_idx" ON "preference_prompts" USING btree ("organization_id","trip_id","category") WHERE "preference_prompts"."kind" = 'category' AND "preference_prompts"."state" <> 'withdrawn';
--> statement-breakpoint
-- Au plus une question ouverte par voyage.
CREATE UNIQUE INDEX "preference_prompts_one_open_idx" ON "preference_prompts" USING btree ("organization_id","trip_id") WHERE "preference_prompts"."state" = 'open';
--> statement-breakpoint
ALTER TABLE public.preference_prompts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.preference_prompts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY preference_prompts_app ON public.preference_prompts AS PERMISSIVE FOR ALL TO vadrouille_app
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY preference_prompts_fn_purge ON public.preference_prompts AS PERMISSIVE FOR ALL TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
GRANT SELECT, INSERT ON public.preference_prompts TO vadrouille_app;
--> statement-breakpoint
GRANT UPDATE (state, answer_signal_id, updated_at) ON public.preference_prompts TO vadrouille_app;
--> statement-breakpoint

-- 5. Droits (0112 § 3.1 et § 3.7 points 3 à 5). Aucune autre colonne d'un signal ne change après son écriture.
REVOKE UPDATE ON public.preference_signals FROM vadrouille_app;
--> statement-breakpoint
GRANT UPDATE (status, previous_status, cancelled_at, cancel_request_id) ON public.preference_signals TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT (organization_id), DELETE ON public.deck_closures, public.preference_prompts TO vadrouille_fn_purge;
--> statement-breakpoint

-- 6. Purge de compte (0001_securite, 6.3 ; 0112 § 3.7 point 5). Recréation sous le propriétaire (même forme que 0012,
-- section 7) ; corps identique à 0012 hors des deux nouvelles tables, supprimées d'abord (elles visent les signaux, les
-- exécutions et les voyages), et des signaux supprimés avant les propositions (clé étrangère du point 2). Droits
-- d'exécution réécrits.
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

  DELETE FROM public.preference_prompts AS x WHERE x.organization_id = v_org;
  DELETE FROM public.deck_closures AS x WHERE x.organization_id = v_org;
  DELETE FROM public.preference_signals AS x WHERE x.organization_id = v_org;
  DELETE FROM public.proposals AS x WHERE x.organization_id = v_org;
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
