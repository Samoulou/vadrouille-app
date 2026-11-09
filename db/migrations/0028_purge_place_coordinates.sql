-- 0028_purge_place_coordinates — la purge du compte supprime aussi `place_coordinates` (ticket 1091 ; décision 0167,
-- option (a), § « Décision » points 1 à 3 ; droits et politique : proposition du Tech Lead, **verdict de la Sécurité
-- attendu**, questions SP1 à SP3 de 0167). Écrite à la main (`pnpm db:generate --custom --name purge_place_coordinates`) :
-- aucune table ni colonne ne change, le schéma Drizzle et l'instantané du journal restent ceux de 0027. Exécutée par
-- `vadrouille_migrator` dans une transaction, après 0027_rappels_relais, seulement par le workflow `db-migrate` après
-- l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0035, 0056 § 3), ajoutée par une PR de workflow
-- à part.
-- Retour arrière : `0028_purge_place_coordinates.down.sql` (voir `db/README.md`).
--
-- Elle rend vrais 0007 (tableau des rôles), 0011 (§ 6 et « Conséquences » : « `purge_organization_data` étendue à cette
-- table ») et les commentaires de `0001_securite.sql` (droits de `vadrouille_fn_purge` : « place_coordinates : B8 » ;
-- en-tête de la purge : « B8 l'étend à place_coordinates »), que B8 n'avait pas tenus (0167, constat 4). Ces
-- commentaires ne sont pas réécrits : 0001 est appliquée, donc immuable.
--
-- Migration **additive** : un droit et une politique de plus pour `vadrouille_fn_purge`, la purge du compte recréée.
-- Aucune ligne existante n'est lue, modifiée ni supprimée par la migration ; aucune table, colonne, contrainte ni clé
-- ne change.
--
-- Plan :
--   1. droits (0167, Décision 1.1) : `vadrouille_fn_purge` reçoit `SELECT (organization_id)` et `DELETE` sur
--      `place_coordinates`, rien d'autre (ni `INSERT`, ni `UPDATE`, ni lecture de `place_id`, `lat`, `lng`,
--      `fetched_at`, `expires_at` : SP2) ; politique `place_coordinates_fn_purge`, bornée à l'organisation de la
--      transaction (même forme que les politiques `*_fn_purge` de 0001 et de 0012 à 0027). Sous `vadrouille_owner`,
--      propriétaire de la table (0002) ;
--   2. `purge_organization_data` recréée sous son propriétaire `vadrouille_fn_purge` (même cadre que 0027, point 5) :
--      corps de 0027, dernière version sur `main`, avec `place_coordinates` supprimée **en tête** (0167, Décision 1.2 :
--      aucune clé ne pointe vers elle, elle ne dépend d'aucune autre ligne). Les lignes expirées de l'organisation
--      partent avec les vivantes. `org_prototype` n'est jamais visée : la purge exige l'organisation de la transaction
--      et son unique propriétaire, et une purge d'`org_prototype` elle-même échoue sans rien supprimer, sur le
--      déclencheur S3 de 0003 (mise à jour de l'organisation refusée, avant toute suppression) ;
--   3. droits d'exécution réécrits (`REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO vadrouille_account_admin`) ;
--      appartenance temporaire de `vadrouille_migrator` retirée.
--
-- **Rien d'autre ne change** (0167, Décision 2 et 3) : `vadrouille_fn_coords`, ses trois fonctions et ses cinq
-- politiques ; les droits de `vadrouille_app` et de `vadrouille_prototype` ; le déclencheur « ajout seulement » (il ne
-- vise pas `place_coordinates`) ; la clé étrangère vers `organizations`, gardée en `NO ACTION` (avec l'option B de Q48,
-- elle fait échouer la suppression de l'organisation si une ligne a échappé à la purge : comportement voulu).
-- Écriture après la purge (un recalcul qui appelle `store_place_coordinates` juste après) : SP3, traitée par M9b.
--
-- Aucune donnée Google n'est lue : la purge filtre sur `organization_id` seulement.

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Droits et politique de la purge du compte (0167, Décision 1.1 ; SP2). `organization_id` est la seule colonne lue
-- (clause `WHERE` de la purge et `USING` de la politique) ; aucune autre colonne n'est lisible par ce rôle.
GRANT SELECT (organization_id), DELETE ON public.place_coordinates TO vadrouille_fn_purge;
--> statement-breakpoint
CREATE POLICY place_coordinates_fn_purge ON public.place_coordinates AS PERMISSIVE FOR ALL TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint

-- 2. Purge de compte (0001_securite, 6.3 ; 0167, Décision 1.2 et 1.3). Recréation sous le propriétaire (même forme que
-- 0027, point 5) ; corps identique à 0027 hors de la première suppression, celle de `place_coordinates`. Droits
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

  DELETE FROM public.place_coordinates AS x WHERE x.organization_id = v_org;
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
