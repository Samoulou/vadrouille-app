-- Migration inverse de 0015_recalcul_lot (décision 0119 § 5.2). Règle du rôle `data` : **aucune suppression de
-- données**. Elle retire donc ce que 0015 ajoute **hors des données** : les deux index uniques partiels, la `CHECK`, la
-- clé étrangère composée, la contrainte unique `(organization_id, id)` de `deck_closures` ; elle rétablit la purge du
-- compte de 0014 à l'identique, puis retire à `vadrouille_fn_purge` la lecture de `kind`, dont seule la purge de 0015
-- avait besoin. Aucune ligne n'est lue, modifiée ni supprimée.
--
-- **Restent** : les colonnes `base_version` et `deck_closure_id` de `generation_runs` et leurs valeurs (les supprimer
-- demanderait une exception écrite à la règle du rôle `data`, question de la PR). La version du code d'avant 0015 ne
-- nomme pas ces colonnes et n'écrit aucune ligne `batch` : elle fonctionne sur ce schéma. Ordre : la clé étrangère est
-- retirée **avant** que la purge de 0014 soit rétablie (cette purge vide les clôtures avant les exécutions et
-- échouerait sur la clé étrangère de 0015 dès qu'une ligne `batch` existe).
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DROP INDEX IF EXISTS public.generation_runs_organization_id_trip_id_batch_active_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS public.generation_runs_organization_id_trip_id_deck_closure_id_idx;
--> statement-breakpoint
ALTER TABLE public.generation_runs DROP CONSTRAINT IF EXISTS generation_runs_batch_check;
--> statement-breakpoint
ALTER TABLE public.generation_runs DROP CONSTRAINT IF EXISTS generation_runs_deck_closure_fk;
--> statement-breakpoint
ALTER TABLE public.deck_closures DROP CONSTRAINT IF EXISTS deck_closures_organization_id_id_key;
--> statement-breakpoint

-- Purge de compte de 0014_tri_enregistre (section 6), recopiée à l'identique : clôtures avant exécutions.
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
--> statement-breakpoint
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE SELECT (kind) ON public.generation_runs FROM vadrouille_fn_purge;
--> statement-breakpoint
RESET ROLE;
