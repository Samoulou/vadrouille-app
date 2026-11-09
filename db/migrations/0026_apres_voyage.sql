-- 0026_apres_voyage — avis rapide après le voyage et goûts retenus (plan du MVP, étape 8, tâche M8-D, ticket 1055 ;
-- décision 0160 § 1.1 (T1), § 1.3 (T3), § 2.1 (S1, proposition du Tech Lead, **verdict de la Sécurité attendu**) et
-- § 3.2 ; spécification `specs/M8-apres-le-voyage-api.md` § 3.3, § 5.2, § 5.3 et § 6.2). **Seule migration de M8.**
-- Générée par `pnpm db:generate` depuis `db/schema/business.ts` (table, colonnes, clés, `CHECK`, index), puis complétée
-- à la main (garde de table vide, liste de colonnes de `ON DELETE SET NULL`, RLS, politiques, droits, purge). Exécutée
-- par `vadrouille_migrator` dans une transaction, après 0025_recu_stripe, seulement par le workflow `db-migrate` après
-- l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0035, 0056 § 3), ajoutée par une PR de workflow
-- à part.
-- Retour arrière : `0026_apres_voyage.down.sql` (refusé dès qu'une ligne existe dans l'une des deux tables, voir
-- `db/README.md`).
--
-- Aucune ligne existante n'est lue, modifiée ni supprimée : `stop_reviews` est nouvelle, et `preferences` est vide
-- partout (aucun code de `src/` ne l'écrit ni ne la lit, 0160 § 1.3) ; la garde du point 2 refuse la migration entière
-- si ce n'était pas le cas. Aucun code de `src/` ne nomme encore `stop_reviews` (M8a sera le premier) ni les nouvelles
-- colonnes de `preferences` (M8c-1).
--
-- Plan :
--   1. `stop_reviews` (0160 § 1.1) : une ligne par étape et par lieu pour le voyage, index unique
--      `(organization_id, trip_id, stop_id, COALESCE(place_id, ''))` (cible de l'`INSERT … ON CONFLICT` de l'avis) ;
--      valeur fermée `opinion` (valeurs de `STOP_RATINGS` ; le nom `rating` du § 1.1 point 1 serait refusé par le test
--      « schéma : aucune colonne de contenu Google », question au Tech Lead dans la PR) ; aucune colonne de texte
--      libre ni de nom ; clés vers `organizations`, `users` (`created_by`) et `trips (organization_id, id)`, toutes en
--      `NO ACTION` : les lignes partent par `purge_organization_data` (point 5) ;
--   2. `preferences` durcie en place (0160 § 1.3) : garde de table vide ; `value` supprimée, `category` rendue
--      nullable, `consented_at` posée par la base (`DEFAULT now()`), `subject_kind`, `direction`, `origin` et
--      `source_trip_id` ajoutées ; cinq `CHECK` (nature du sujet, forme du sujet, catégorie de `CATEGORIES`, sens,
--      origine) ; unicité du sujet par personne et par organisation ; clé `(organization_id, user_id)` vers
--      `memberships` (`NO ACTION`) ; clé `(organization_id, source_trip_id)` vers `trips` en
--      `ON DELETE SET NULL ("source_trip_id")` : un goût survit à son voyage d'origine, `organization_id` reste intact ;
--   3. RLS (proposition de 0160 § 2.1, S1) : `stop_reviews` activée et forcée, lecture dans l'organisation de la
--      transaction, insertion, mise à jour et suppression seulement pour la personne de la transaction
--      (`created_by = app_current_user()`), modèle de `reminder_consents_app_*` (0024) ; `preferences` (déjà activée
--      et forcée par 0001) : la politique type `preferences_app` est remplacée par trois politiques qui exigent aussi
--      `user_id = app_current_user()`, en lecture comme en écriture ; politiques de purge bornées à l'organisation ;
--   4. droits (S1) : `vadrouille_app` : `stop_reviews` `SELECT`, `INSERT (organization_id, trip_id, stop_id,
--      place_id, opinion, created_by, request_id)`, `UPDATE (opinion, request_id, updated_at)`, `DELETE` ;
--      `preferences` `SELECT`, `INSERT (organization_id, user_id, subject_kind, category, direction, origin,
--      source_trip_id)`, `DELETE` (ni `UPDATE` : un goût ne se modifie jamais ; ni `id`, `consented_at` ou
--      `created_at` à l'insertion). Ni `TRUNCATE` ni `REFERENCES`. `vadrouille_fn_purge` : `SELECT (organization_id)`,
--      `DELETE` sur `stop_reviews` ; inchangé sur `preferences` (0001) ;
--   5. `purge_organization_data` recréée sous son propriétaire `vadrouille_fn_purge` (même forme que 0024, point 6) :
--      avis supprimés en premier (clés `NO ACTION` vers `trips`), le reste à l'identique de 0024 (`preferences`
--      gardée avant `trips`) ; appartenance temporaire de `vadrouille_migrator` retirée.
--
-- Aucune donnée Google hors de `stop_reviews.place_id` (identifiant de lieu, 0011) ; aucun texte, aucun nom, aucune
-- destination recopiée. Table d'événements de l'accord (0160 § 2.2, S2, option (b)) : non créée ; M8-D ne l'attend que
-- si la Sécurité retient (b) (0160 § 3.2), et une migration suivante l'ajouterait alors.
-- Conséquence signalée (0160, « Quand revoir ») : un voyage qui a un avis ne peut plus être supprimé hors de la purge du
-- compte (`23503`), comme un voyage qui a un accord de rappel (0024) ; un goût, lui, ne bloque pas la suppression.

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Avis (0160 § 1.1).
CREATE TABLE "stop_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" text NOT NULL,
	"place_id" text,
	"opinion" text NOT NULL,
	"created_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stop_reviews_opinion_check" CHECK ("stop_reviews"."opinion" IN ('liked', 'disliked', 'notDone'))
);
--> statement-breakpoint
ALTER TABLE "stop_reviews" ADD CONSTRAINT "stop_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stop_reviews" ADD CONSTRAINT "stop_reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stop_reviews" ADD CONSTRAINT "stop_reviews_trip_fk" FOREIGN KEY ("organization_id","trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Une ligne par étape et par lieu pour le voyage (les identifiants d'étape sont réutilisés d'une version à l'autre,
-- 0142 § 5.1) ; l'index commence par `organization_id`.
CREATE UNIQUE INDEX "stop_reviews_stop_place_idx" ON "stop_reviews" USING btree ("organization_id","trip_id","stop_id",COALESCE("place_id", ''));
--> statement-breakpoint

-- 2. Goûts retenus (0160 § 1.3). Garde : la table doit être vide. Un `SELECT count(*)` ne verrait rien sous
-- `vadrouille_owner` (RLS forcée, aucune organisation dans la transaction) ; une `CHECK (false)` est validée sur toutes
-- les lignes de la table, sans égard à la RLS : elle échoue dès qu'une ligne existe, et la migration entière est
-- annulée sans rien modifier.
DO $$
BEGIN
  ALTER TABLE public.preferences ADD CONSTRAINT preferences_vide_0026_check CHECK (false);
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION '0026_apres_voyage refusée : preferences contient des lignes (table supposée vide, décision 0160 § 1.3)'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END
$$;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_vide_0026_check;
--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "value";
--> statement-breakpoint
ALTER TABLE "preferences" ALTER COLUMN "category" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "preferences" ALTER COLUMN "consented_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "subject_kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "direction" text;
--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "origin" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "source_trip_id" uuid;
--> statement-breakpoint
-- Cible : la contrainte unique `(organization_id, user_id)` de `memberships` (0000_socle), comme `reminder_consents`.
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Écrite à la main (0160 § 1.3 point 4) : liste de colonnes de `SET NULL` (Postgres 15 et suivants), que Drizzle ne sait
-- pas écrire (il génère `ON DELETE set null`, qui mettrait aussi `organization_id` à nul et échouerait sur son
-- `NOT NULL`). L'instantané de `meta/` garde `set null` sans la liste : ce texte fait foi.
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_source_trip_fk" FOREIGN KEY ("organization_id","source_trip_id") REFERENCES "public"."trips"("organization_id","id") ON DELETE SET NULL ("source_trip_id") ON UPDATE no action;
--> statement-breakpoint
-- Un sujet (`preferenceKey`) au plus une fois par personne et par organisation (F11-PO-12).
CREATE UNIQUE INDEX "preferences_subject_idx" ON "preferences" USING btree ("organization_id","user_id","subject_kind",COALESCE("category", ''),COALESCE("direction", ''));
--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_subject_kind_check" CHECK ("preferences"."subject_kind" IN ('category', 'distance'));
--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_subject_check" CHECK ((("preferences"."subject_kind" = 'category') = ("preferences"."category" IS NOT NULL AND "preferences"."direction" IS NOT NULL)) AND ("preferences"."subject_kind" <> 'distance' OR ("preferences"."category" IS NULL AND "preferences"."direction" IS NULL)));
--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_category_check" CHECK ("preferences"."category" IS NULL OR "preferences"."category" IN ('museum', 'walk', 'nature', 'tasting', 'restaurant', 'heritage', 'market', 'nightlife'));
--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_direction_check" CHECK ("preferences"."direction" IS NULL OR "preferences"."direction" IN ('more', 'less'));
--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_origin_check" CHECK ("preferences"."origin" IN ('confirmed', 'inferred'));
--> statement-breakpoint

-- 3. RLS (0001_securite, 5.1 ; proposition de 0160 § 2.1, S1 ; modèle de `reminder_consents`, 0024).
ALTER TABLE public.stop_reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.stop_reviews FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Lecture dans l'organisation ; écriture seulement pour la personne de la transaction (l'avis est le sien).
CREATE POLICY stop_reviews_app_select ON public.stop_reviews AS PERMISSIVE FOR SELECT TO vadrouille_app
  USING (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY stop_reviews_app_insert ON public.stop_reviews AS PERMISSIVE FOR INSERT TO vadrouille_app
  WITH CHECK (organization_id = public.app_current_org() AND created_by = public.app_current_user());
--> statement-breakpoint
CREATE POLICY stop_reviews_app_update ON public.stop_reviews AS PERMISSIVE FOR UPDATE TO vadrouille_app
  USING (organization_id = public.app_current_org() AND created_by = public.app_current_user())
  WITH CHECK (organization_id = public.app_current_org() AND created_by = public.app_current_user());
--> statement-breakpoint
CREATE POLICY stop_reviews_app_delete ON public.stop_reviews AS PERMISSIVE FOR DELETE TO vadrouille_app
  USING (organization_id = public.app_current_org() AND created_by = public.app_current_user());
--> statement-breakpoint
CREATE POLICY stop_reviews_fn_purge ON public.stop_reviews AS PERMISSIVE FOR ALL TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
-- Un goût appartient à la personne (spécification § 5.2 point 2) : un autre membre ne le lit ni ne le retire.
-- `preferences_fn_purge` (0001) reste.
DROP POLICY preferences_app ON public.preferences;
--> statement-breakpoint
CREATE POLICY preferences_app_select ON public.preferences AS PERMISSIVE FOR SELECT TO vadrouille_app
  USING (organization_id = public.app_current_org() AND user_id = public.app_current_user());
--> statement-breakpoint
CREATE POLICY preferences_app_insert ON public.preferences AS PERMISSIVE FOR INSERT TO vadrouille_app
  WITH CHECK (organization_id = public.app_current_org() AND user_id = public.app_current_user());
--> statement-breakpoint
CREATE POLICY preferences_app_delete ON public.preferences AS PERMISSIVE FOR DELETE TO vadrouille_app
  USING (organization_id = public.app_current_org() AND user_id = public.app_current_user());
--> statement-breakpoint

-- 4. Droits (proposition de 0160 § 2.1, S1). `id`, `created_at`, `updated_at` (à l'insertion) et `consented_at` viennent
-- de la base ; un avis se modifie par sa valeur et son dernier geste ; un goût ne se modifie jamais.
GRANT SELECT, DELETE ON public.stop_reviews TO vadrouille_app;
--> statement-breakpoint
GRANT INSERT (organization_id, trip_id, stop_id, place_id, opinion, created_by, request_id),
  UPDATE (opinion, request_id, updated_at) ON public.stop_reviews TO vadrouille_app;
--> statement-breakpoint
REVOKE INSERT, UPDATE ON public.preferences FROM vadrouille_app;
--> statement-breakpoint
GRANT INSERT (organization_id, user_id, subject_kind, category, direction, origin, source_trip_id) ON public.preferences TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT (organization_id), DELETE ON public.stop_reviews TO vadrouille_fn_purge;
--> statement-breakpoint

-- 5. Purge de compte (0001_securite, 6.3 ; 0160 § 3.2). Recréation sous le propriétaire (même forme que 0024, point 6) ;
-- corps identique à 0024 hors des avis, supprimés d'abord (ils visent les voyages). Droits d'exécution réécrits.
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

  DELETE FROM public.stop_reviews AS x WHERE x.organization_id = v_org;
  DELETE FROM public.reminder_sends AS x WHERE x.organization_id = v_org;
  DELETE FROM public.reminder_consents AS x WHERE x.organization_id = v_org;
  DELETE FROM public.preference_prompts AS x WHERE x.organization_id = v_org;
  DELETE FROM public.preference_signals AS x WHERE x.organization_id = v_org;
  DELETE FROM public.proposals AS x WHERE x.organization_id = v_org;
  DELETE FROM public.event_occurrences AS x WHERE x.organization_id = v_org;
  DELETE FROM public.candidates AS x WHERE x.organization_id = v_org;
  DELETE FROM public.research_runs AS x WHERE x.organization_id = v_org;
  DELETE FROM public.generation_runs AS x WHERE x.organization_id = v_org AND x.kind = 'batch';
  DELETE FROM public.deck_closures AS x WHERE x.organization_id = v_org;
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
