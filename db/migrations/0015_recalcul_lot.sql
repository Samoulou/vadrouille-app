-- 0015_recalcul_lot — ligne d'exécution du recalcul par lot de B10b (workflow 5 `batchRecompute`) : version de base et
-- rattachement au tri clos, unicités, ordre de la purge du compte (spécification `specs/B10-propositions-preferences.md`,
-- B10b ; décision 0119 § 1.1, § 1.2, § 5.1 et § 5.2, PR « B10b-migration »). Générée par `pnpm db:generate` depuis
-- `db/schema/business.ts`, puis réordonnée (contrainte unique avant la clé étrangère qui la vise) et complétée à la main
-- (droit de lecture de `kind` pour la purge, purge). Exécutée par `vadrouille_migrator` dans une transaction, après
-- 0014_tri_enregistre, seulement par le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de
-- MIGRATIONS_APPROUVEES (0035, 0056 § 3), ajoutée par une PR de workflow à part (0119 § 5.2).
-- Retour arrière : `0015_recalcul_lot.down.sql` (partielle, voir `db/README.md`).
--
-- Migration **additive** : deux colonnes nulles, une contrainte unique, une clé étrangère, une `CHECK`, deux index
-- uniques partiels. Aucune ligne n'est modifiée ni supprimée ; la RLS de `generation_runs` et de `deck_closures` est
-- inchangée (organisation de la transaction) ; aucun droit de `vadrouille_app` ne change (`SELECT, INSERT, UPDATE` de
-- table sur `generation_runs` depuis 0001_securite, colonnes nouvelles comprises). Aucune version du code n'écrit
-- encore de ligne `batch` (B10b-serveur sera la première, 0119 § 5.1) : la `CHECK` est posée valide ; si une ligne
-- existante la contredisait, la migration échouerait sans rien changer.
--
-- Plan :
--   1. `deck_closures` : contrainte unique `(organization_id, id)` (cible de la clé étrangère du point 2, 0119 § 1.1) ;
--   2. `generation_runs` : colonnes `base_version` (`integer`, comme `trips.current_version`) et `deck_closure_id`
--      (`uuid`) ; clé étrangère composée vers `deck_closures` ; `CHECK` « non nulles si et seulement si
--      `kind = 'batch'` » (§ 1.1 point 1) ; deux index uniques partiels (§ 1.2 point 1) ;
--   3. `SELECT (kind)` de `generation_runs` à `vadrouille_fn_purge` (filtre des lignes `batch` du point 4) ;
--   4. `purge_organization_data` recréée sous son propriétaire `vadrouille_fn_purge` (même forme que 0014, section 6) :
--      les lignes `batch` de `generation_runs` sont supprimées **avant** `deck_closures` (une ligne `batch` vise une
--      clôture), puis les clôtures, puis les autres exécutions (une clôture vise l'exécution `preview`) (0119 § 5.2) ;
--      le reste à l'identique de 0014 ; appartenance temporaire de `vadrouille_migrator` retirée.
--
-- Aucun nom, aucune donnée Google : un numéro de version et un identifiant interne de clôture.

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Clôtures (0119 § 1.1 point 1) : contrainte additive, vraie de toute ligne existante (`id` est la clé primaire).
ALTER TABLE "deck_closures" ADD CONSTRAINT "deck_closures_organization_id_id_unique" UNIQUE("organization_id","id");
--> statement-breakpoint

-- 2. Exécutions (0119 § 1.1 et § 1.2).
-- Version de base : `trips.current_version` lue dans la transaction qui crée la ligne `batch` (§ 1.1 point 2).
ALTER TABLE "generation_runs" ADD COLUMN "base_version" integer;
--> statement-breakpoint
-- Clôture du tri qui a déclenché le recalcul (§ 1.1 point 3).
ALTER TABLE "generation_runs" ADD COLUMN "deck_closure_id" uuid;
--> statement-breakpoint
-- Clé étrangère composée : une ligne ne vise jamais la clôture d'une autre organisation.
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_deck_closure_fk" FOREIGN KEY ("organization_id","deck_closure_id") REFERENCES "public"."deck_closures"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- § 1.1 point 1 : les deux colonnes sont non nulles si et seulement si la ligne est un recalcul (`kind = 'batch'`).
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_batch_check" CHECK (("generation_runs"."kind" = 'batch') = ("generation_runs"."base_version" IS NOT NULL) AND ("generation_runs"."kind" = 'batch') = ("generation_runs"."deck_closure_id" IS NOT NULL));
--> statement-breakpoint
-- § 1.2 point 1 : au plus un recalcul par tri clos (filet sous le verrou du tri ; création par
-- `INSERT … ON CONFLICT DO NOTHING`, puis relecture de la ligne).
CREATE UNIQUE INDEX "generation_runs_organization_id_trip_id_deck_closure_id_idx" ON "generation_runs" USING btree ("organization_id","trip_id","deck_closure_id") WHERE "generation_runs"."kind" = 'batch';
--> statement-breakpoint
-- § 1.2 point 1 : au plus un recalcul en cours par voyage.
CREATE UNIQUE INDEX "generation_runs_organization_id_trip_id_batch_active_idx" ON "generation_runs" USING btree ("organization_id","trip_id") WHERE "generation_runs"."kind" = 'batch' AND "generation_runs"."finished_at" IS NULL;
--> statement-breakpoint

-- 3. Droit de la purge (0001_securite, 6.3) : lecture de `kind`, seule colonne de plus que `organization_id`.
GRANT SELECT (kind) ON public.generation_runs TO vadrouille_fn_purge;
--> statement-breakpoint

-- 4. Purge de compte (0001_securite, 6.3 ; 0119 § 5.2). Recréation sous le propriétaire (même forme que 0014, section
-- 6) ; corps identique à 0014 hors de la place des exécutions : lignes `batch` après les tables qui visent une
-- exécution (propositions, occurrences, candidats, recherches) et avant les clôtures, puis les clôtures, puis les
-- autres exécutions. Droits d'exécution réécrits.
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
