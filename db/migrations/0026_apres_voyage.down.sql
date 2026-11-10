-- Migration inverse de 0026_apres_voyage (plan du MVP, M8-D, ticket 1055 ; décision 0160 § 1.3 point 8). Règle du rôle
-- `data` : **aucune suppression de données**. La descente **refuse** donc de s'exécuter (exception levée, rien n'est
-- modifié : la transaction entière est annulée) dès qu'une ligne existe dans `stop_reviews` (avis donnés) ou dans
-- `preferences` (goûts retenus avec accord). La garde est une `CHECK (false)` posée puis retirée : elle est validée sur
-- toutes les lignes de la table, sans égard à la RLS (un `SELECT count(*)` sous `vadrouille_owner`, sans organisation
-- dans la transaction, verrait zéro ligne).
--
-- Sur deux tables vides, elle défait la migration entière, dans l'ordre inverse : purge du compte de 0024 rétablie à
-- l'identique (même cadre de propriétaire), `stop_reviews` supprimée (vide : ses politiques, ses droits, son index et ses
-- clés tombent avec elle), puis `preferences` rendue **au plus près** du schéma de B1 (0160 § 1.3 point 8) : politiques
-- par personne retirées et politique type `preferences_app` de 0001 recréée, droits de 0001 rendus à `vadrouille_app`
-- (`INSERT, UPDATE` de table), clés, index, `CHECK` et colonnes ajoutés retirés, `consented_at` sans valeur par défaut,
-- `category NOT NULL`, `value text NOT NULL` recréée (en dernière colonne : seul écart avec B1, sans effet sur le code).
--
-- Elle rouvre ce que la Sécurité aura fermé (S1 : goûts lisibles par tout membre de l'organisation) : descente
-- d'urgence seulement, hors de tout code M8a ou M8c déployé (ils nomment ces tables et colonnes). Après elle, le texte de
-- 0026 se rejoue sans erreur (test : `tests/db/apres-voyage.test.ts`, base jetable), mais le journal de
-- `vadrouille_migrations` garde 0026 appliquée : un retour passe par une migration corrective vers l'avant qui reprend ce
-- texte.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE public.stop_reviews ADD CONSTRAINT stop_reviews_vide_0026_check CHECK (false);
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION '0026_apres_voyage.down refusée : stop_reviews contient des lignes (aucune suppression de données)'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END
$$;
--> statement-breakpoint
ALTER TABLE public.stop_reviews DROP CONSTRAINT stop_reviews_vide_0026_check;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE public.preferences ADD CONSTRAINT preferences_vide_0026_check CHECK (false);
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION '0026_apres_voyage.down refusée : preferences contient des lignes (aucune suppression de données)'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END
$$;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_vide_0026_check;
--> statement-breakpoint
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
--> statement-breakpoint
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DROP TABLE public.stop_reviews;
--> statement-breakpoint
DROP POLICY preferences_app_select ON public.preferences;
--> statement-breakpoint
DROP POLICY preferences_app_insert ON public.preferences;
--> statement-breakpoint
DROP POLICY preferences_app_delete ON public.preferences;
--> statement-breakpoint
CREATE POLICY preferences_app ON public.preferences AS PERMISSIVE FOR ALL TO vadrouille_app
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
REVOKE INSERT (organization_id, user_id, subject_kind, category, direction, origin, source_trip_id) ON public.preferences FROM vadrouille_app;
--> statement-breakpoint
GRANT INSERT, UPDATE ON public.preferences TO vadrouille_app;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_origin_check;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_direction_check;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_category_check;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_subject_check;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_subject_kind_check;
--> statement-breakpoint
DROP INDEX public.preferences_subject_idx;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_source_trip_fk;
--> statement-breakpoint
ALTER TABLE public.preferences DROP CONSTRAINT preferences_membership_fk;
--> statement-breakpoint
ALTER TABLE public.preferences DROP COLUMN source_trip_id;
--> statement-breakpoint
ALTER TABLE public.preferences DROP COLUMN origin;
--> statement-breakpoint
ALTER TABLE public.preferences DROP COLUMN direction;
--> statement-breakpoint
ALTER TABLE public.preferences DROP COLUMN subject_kind;
--> statement-breakpoint
ALTER TABLE public.preferences ALTER COLUMN consented_at DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE public.preferences ALTER COLUMN category SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.preferences ADD COLUMN value text NOT NULL;
--> statement-breakpoint
RESET ROLE;
