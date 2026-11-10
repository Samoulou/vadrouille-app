-- Migration inverse de 0028_purge_place_coordinates (ticket 1091 ; décision 0167, Décision 1.4). Règle du rôle `data` :
-- **aucune suppression de données**. Elle ne lit, ne modifie ni ne supprime aucune ligne : elle défait la migration
-- entière, dans l'ordre inverse.
--   1. `purge_organization_data` rétablie **à l'identique** de 0027 (même cadre de propriétaire : appartenance `SET`
--      temporaire de `vadrouille_migrator`, `CREATE` sur le schéma accordé puis retiré ; droits d'exécution réécrits) :
--      elle ne nomme plus `place_coordinates`, avant que les droits ne lui soient retirés (sinon la purge de 0028
--      échouerait en `42501` et annulerait toute suppression de compte) ;
--   2. politique `place_coordinates_fn_purge` supprimée ;
--   3. droits `SELECT (organization_id)` et `DELETE` de `vadrouille_fn_purge` sur `place_coordinates` retirés.
--
-- **Restent** : la table, toutes ses lignes et ses sept autres politiques, `vadrouille_fn_coords` et ses fonctions. Après
-- la descente, une suppression de compte laisse de nouveau les lignes de `place_coordinates` de l'organisation (écart
-- constaté par 0167, constat 3) : descente d'urgence seulement, hors de tout code M9b déployé qui la suppose. Le texte de
-- 0028 se rejoue après elle sans erreur (test : `tests/db/purge.test.ts`, base jetable), mais le journal de
-- `vadrouille_migrations` garde 0028 appliquée : un retour passe par une migration corrective vers l'avant qui reprend ce
-- texte.
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
  DELETE FROM public.reminder_relays AS x WHERE x.organization_id = v_org;
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
DROP POLICY place_coordinates_fn_purge ON public.place_coordinates;
--> statement-breakpoint
REVOKE SELECT (organization_id), DELETE ON public.place_coordinates FROM vadrouille_fn_purge;
--> statement-breakpoint
RESET ROLE;
