-- 0001_securite — RLS forcée, droits par rôle, déclencheurs, fonctions SECURITY DEFINER et vues partagées
-- (spécification B1 ; décision 0007 ; handover § 6 et § 12). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, juste après 0000_socle. Retour arrière : irréversible
-- (voir `db/README.md`, « Retour arrière des migrations »).
--
-- Plan :
--   1. fonctions de contexte (échec fermé sans contexte) ;
--   2. RLS activée et forcée sur toutes les tables du schéma public ;
--   3. déclencheurs : ajout seulement, TRUNCATE refusé, session de paiement écrite une fois, un propriétaire ;
--   4. droits par rôle (tableaux de 0007) ;
--   5. politiques (politique type pour vadrouille_app ; politiques étroites des autres rôles) ;
--   6. fonctions SECURITY DEFINER et vues partagées (liste blanche de l'instantané) ;
--   7. transfert de propriété vers les rôles vadrouille_fn_* (sous vadrouille_migrator, même transaction).

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Fonctions de contexte (décision 0007, « RLS »). Sans contexte, elles renvoient NULL : aucune ligne n'est lue
-- ni écrite. Exécutables par tous : elles servent aux politiques, évaluées sous le rôle qui interroge.
CREATE FUNCTION public.app_current_org() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$ SELECT NULLIF(pg_catalog.current_setting('app.organization_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION public.app_current_user() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$ SELECT NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION public.app_share_token_hash() RETURNS bytea
  LANGUAGE sql STABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$ SELECT pg_catalog.decode(NULLIF(pg_catalog.current_setting('app.share_token_hash', true), ''), 'hex') $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_current_org(), public.app_current_user(), public.app_share_token_hash() TO PUBLIC;
--> statement-breakpoint
-- Fonction pure du CHECK de candidates.sources (0000_socle) : appelée sous le rôle qui écrit.
GRANT EXECUTE ON FUNCTION public.jsonb_sources_valid(jsonb, text[]) TO PUBLIC;
--> statement-breakpoint

-- 2. RLS activée ET forcée sur toutes les tables du schéma public (test « schéma: RLS activée et forcée
-- partout »). FORCE soumet aussi le propriétaire : aucune politique ne vise vadrouille_owner, il ne lit rien.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_catalog.pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END
$$;
--> statement-breakpoint

-- 3. Déclencheurs.
-- 3.1 Ajout seulement (décision 0007, « Ajout seulement ») : trip_versions, billing, usage_ledger refusent UPDATE
-- et DELETE, sauf un DELETE sur trip_versions par la fonction de purge (current_user = vadrouille_fn_purge, rôle
-- sans appartenance avec SET ni INHERIT, décision 0036 : critère non falsifiable, un set_config ne le lève pas). Tant que Q48 est ouverte, DELETE sur
-- billing et usage_ledger est refusé à tous.
CREATE FUNCTION public.forbid_update_delete() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'trip_versions' AND current_user = 'vadrouille_fn_purge' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'table % en ajout seulement : % refusé', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.forbid_truncate() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'table % en ajout seulement : TRUNCATE refusé', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER trip_versions_append_only BEFORE UPDATE OR DELETE ON public.trip_versions FOR EACH ROW EXECUTE FUNCTION public.forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER billing_append_only BEFORE UPDATE OR DELETE ON public.billing FOR EACH ROW EXECUTE FUNCTION public.forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER usage_ledger_append_only BEFORE UPDATE OR DELETE ON public.usage_ledger FOR EACH ROW EXECUTE FUNCTION public.forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER trip_versions_no_truncate BEFORE TRUNCATE ON public.trip_versions FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
--> statement-breakpoint
CREATE TRIGGER billing_no_truncate BEFORE TRUNCATE ON public.billing FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
--> statement-breakpoint
CREATE TRIGGER usage_ledger_no_truncate BEFORE TRUNCATE ON public.usage_ledger FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
--> statement-breakpoint

-- 3.2 checkouts.stripe_checkout_session_id écrit une seule fois (décision 0007, droits de vadrouille_app).
CREATE FUNCTION public.checkouts_session_once() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.stripe_checkout_session_id IS NOT NULL
     AND NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id THEN
    RAISE EXCEPTION 'checkouts : stripe_checkout_session_id déjà écrit' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER checkouts_session_once BEFORE UPDATE ON public.checkouts FOR EACH ROW EXECUTE FUNCTION public.checkouts_session_once();
--> statement-breakpoint

-- 3.3 Exactement un propriétaire (décision 0007, handover § 7) : à la validation de la transaction, toute
-- organisation qui existe et dont deletion_requested_at est nul a exactement une adhésion owner. Déclencheur
-- contraint différé, exécuté sous le rôle qui écrit (vadrouille_auth, seul rôle qui écrit dans memberships et
-- organizations ; sa politique USING (true) lui montre toutes les lignes). L'index unique partiel
-- memberships_one_owner_idx (0000_socle) refuse déjà un second owner, même en suppression.
CREATE FUNCTION public.check_one_owner() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_orgs uuid[];
  v_org uuid;
  v_owners bigint;
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    v_orgs := ARRAY[NEW.id];
  ELSIF TG_OP = 'INSERT' THEN
    v_orgs := ARRAY[NEW.organization_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_orgs := ARRAY[OLD.organization_id];
  ELSE
    v_orgs := ARRAY[OLD.organization_id, NEW.organization_id];
  END IF;
  FOREACH v_org IN ARRAY v_orgs LOOP
    IF EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_org AND o.deletion_requested_at IS NULL) THEN
      SELECT count(*) INTO v_owners FROM public.memberships m WHERE m.organization_id = v_org AND m.role = 'owner';
      IF v_owners <> 1 THEN
        RAISE EXCEPTION 'organisation sans propriétaire unique (% adhésion(s) owner)', v_owners
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER memberships_one_owner AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_one_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER organizations_one_owner AFTER INSERT ON public.organizations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_one_owner();
--> statement-breakpoint

-- 4. Droits (décision 0007). Aucun rôle applicatif n'a TRUNCATE, ni UPDATE ni DELETE sur trip_versions, billing,
-- usage_ledger. Tout droit absent de cette liste est refusé.
-- 4.1 vadrouille_app (« Droits de vadrouille_app par table »).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items, public.preferences, public.stays TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.trips, public.briefs, public.generation_runs, public.research_runs,
  public.candidates, public.event_occurrences, public.feedback, public.preference_signals, public.share_links TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.checkouts TO vadrouille_app;
--> statement-breakpoint
GRANT UPDATE (stripe_checkout_session_id) ON public.checkouts TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.trip_versions, public.usage_ledger, public.proposals TO vadrouille_app;
--> statement-breakpoint
GRANT SELECT ON public.billing, public.entitlements, public.organizations, public.memberships, public.users TO vadrouille_app;
--> statement-breakpoint
-- 4.2 vadrouille_auth (« Droits de vadrouille_auth par table ») : aucune table métier.
GRANT SELECT, INSERT, DELETE ON public.users TO vadrouille_auth;
--> statement-breakpoint
GRANT UPDATE (email_verified, updated_at) ON public.users TO vadrouille_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions, public.verifications TO vadrouille_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.accounts TO vadrouille_auth;
--> statement-breakpoint
GRANT SELECT, DELETE ON public.organizations TO vadrouille_auth;
--> statement-breakpoint
-- Par colonnes : jamais deletion_requested_at, qui reste nul à la création (déclencheur « un propriétaire »).
GRANT INSERT (id, name, slug, kind, created_at) ON public.organizations TO vadrouille_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.memberships TO vadrouille_auth;
--> statement-breakpoint
-- 4.3 vadrouille_webhook (pris par SET LOCAL ROLE depuis vadrouille_app, sans héritage).
GRANT SELECT ON public.checkouts, public.trips, public.entitlements TO vadrouille_webhook;
--> statement-breakpoint
GRANT SELECT (id, stripe_event_id, checkout_id, outcome) ON public.billing TO vadrouille_webhook;
--> statement-breakpoint
GRANT UPDATE (status, updated_at) ON public.checkouts TO vadrouille_webhook;
--> statement-breakpoint
GRANT INSERT ON public.billing, public.entitlements TO vadrouille_webhook;
--> statement-breakpoint
-- 4.4 vadrouille_limiter : action_rate_limits seulement.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_rate_limits TO vadrouille_limiter;
--> statement-breakpoint
-- 4.5 vadrouille_share : rien sur les tables ; SELECT sur les vues partagées (section 6).
-- 4.6 Propriétaires de fonctions et de vues : droits par colonne, sur leurs seules tables.
GRANT SELECT (token_hash, organization_id, trip_id, expires_at, revoked_at) ON public.share_links TO vadrouille_fn_share;
--> statement-breakpoint
GRANT SELECT (token_hash, organization_id, trip_id, expires_at, revoked_at) ON public.share_links TO vadrouille_fn_share_views;
--> statement-breakpoint
GRANT SELECT (id, organization_id, destination, start_date, end_date, travellers_adults, travellers_children, time_zone, current_version)
  ON public.trips TO vadrouille_fn_share_views;
--> statement-breakpoint
GRANT SELECT (organization_id, trip_id, version, snapshot, created_at) ON public.trip_versions TO vadrouille_fn_share_views;
--> statement-breakpoint
GRANT SELECT (id, organization_id, trip_id, stop_id, kind, label, moment, booking_url, sponsored, done)
  ON public.checklist_items TO vadrouille_fn_share_views;
--> statement-breakpoint
GRANT SELECT (stripe_checkout_session_id, organization_id) ON public.checkouts TO vadrouille_fn_checkout;
--> statement-breakpoint
GRANT SELECT (organization_id, user_id, role) ON public.memberships TO vadrouille_fn_purge;
--> statement-breakpoint
GRANT SELECT (id, deletion_requested_at) ON public.organizations TO vadrouille_fn_purge;
--> statement-breakpoint
GRANT UPDATE (deletion_requested_at) ON public.organizations TO vadrouille_fn_purge;
--> statement-breakpoint
-- Tables métier purgées, sauf billing et usage_ledger tant que Q48 est ouverte ; place_coordinates : B8.
GRANT SELECT (organization_id), DELETE ON public.proposals, public.preference_signals, public.event_occurrences,
  public.candidates, public.research_runs, public.generation_runs, public.feedback, public.checklist_items,
  public.share_links, public.entitlements, public.checkouts, public.trip_versions, public.briefs, public.stays,
  public.preferences, public.trips TO vadrouille_fn_purge;
--> statement-breakpoint
-- vadrouille_fn_coords : aucun droit avant B8 (décision 0011 point 6).

-- 5. Politiques.
-- 5.1 Politique type pour vadrouille_app (organisation de la transaction, en lecture et en écriture), et pour
-- vadrouille_webhook sur ses quatre tables ; politiques de purge limitées à l'organisation de la transaction.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trips', 'briefs', 'stays', 'trip_versions', 'generation_runs', 'proposals', 'research_runs',
    'candidates', 'event_occurrences', 'feedback', 'preference_signals', 'preferences', 'checklist_items', 'share_links',
    'usage_ledger', 'checkouts', 'billing', 'entitlements', 'memberships'] LOOP
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO vadrouille_app '
      'USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org())',
      t || '_app', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['checkouts', 'trips', 'entitlements', 'billing'] LOOP
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO vadrouille_webhook '
      'USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org())',
      t || '_webhook', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['proposals', 'preference_signals', 'event_occurrences', 'candidates', 'research_runs',
    'generation_runs', 'feedback', 'checklist_items', 'share_links', 'entitlements', 'checkouts', 'trip_versions',
    'briefs', 'stays', 'preferences', 'trips'] LOOP
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO vadrouille_fn_purge '
      'USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org())',
      t || '_fn_purge', t);
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE POLICY organizations_app ON public.organizations FOR SELECT TO vadrouille_app USING (id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY users_app ON public.users FOR SELECT TO vadrouille_app USING (id = public.app_current_user());
--> statement-breakpoint
CREATE POLICY memberships_fn_purge ON public.memberships FOR SELECT TO vadrouille_fn_purge
  USING (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY organizations_fn_purge ON public.organizations FOR ALL TO vadrouille_fn_purge
  USING (id = public.app_current_org()) WITH CHECK (id = public.app_current_org());
--> statement-breakpoint
-- 5.2 Liste fermée des politiques USING (true) (test « vues partagées: lecture seulement avec un jeton valide ») :
-- tables d'authentification, organizations et memberships pour vadrouille_auth ; action_rate_limits pour
-- vadrouille_limiter ; checkouts pour vadrouille_fn_checkout (bornée par ses droits de colonne et par la seule
-- fonction checkout_organization).
CREATE POLICY users_auth ON public.users FOR ALL TO vadrouille_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY sessions_auth ON public.sessions FOR ALL TO vadrouille_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY accounts_auth ON public.accounts FOR ALL TO vadrouille_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY verifications_auth ON public.verifications FOR ALL TO vadrouille_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY organizations_auth ON public.organizations FOR ALL TO vadrouille_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY memberships_auth ON public.memberships FOR ALL TO vadrouille_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY action_rate_limits_limiter ON public.action_rate_limits FOR ALL TO vadrouille_limiter USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY checkouts_fn_checkout ON public.checkouts FOR SELECT TO vadrouille_fn_checkout USING (true);
--> statement-breakpoint
-- 5.3 Lien privé : jamais USING (true) sur share_links ; chaque propriétaire ne voit que la ligne du jeton de la
-- transaction, et, sur les tables partagées, que le voyage d'un lien valide.
CREATE POLICY share_links_fn_share ON public.share_links FOR SELECT TO vadrouille_fn_share
  USING (token_hash = public.app_share_token_hash());
--> statement-breakpoint
CREATE POLICY share_links_fn_share_views ON public.share_links FOR SELECT TO vadrouille_fn_share_views
  USING (token_hash = public.app_share_token_hash());
--> statement-breakpoint
CREATE POLICY trips_fn_share_views ON public.trips FOR SELECT TO vadrouille_fn_share_views
  USING (EXISTS (
    SELECT 1 FROM public.share_links s
    WHERE s.organization_id = trips.organization_id AND s.trip_id = trips.id
      AND s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()));
--> statement-breakpoint
CREATE POLICY trip_versions_fn_share_views ON public.trip_versions FOR SELECT TO vadrouille_fn_share_views
  USING (EXISTS (
    SELECT 1 FROM public.share_links s
    WHERE s.organization_id = trip_versions.organization_id AND s.trip_id = trip_versions.trip_id
      AND s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()));
--> statement-breakpoint
CREATE POLICY checklist_items_fn_share_views ON public.checklist_items FOR SELECT TO vadrouille_fn_share_views
  USING (EXISTS (
    SELECT 1 FROM public.share_links s
    WHERE s.organization_id = checklist_items.organization_id AND s.trip_id = checklist_items.trip_id
      AND s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now()));
--> statement-breakpoint

-- 6. Fonctions SECURITY DEFINER (décision 0007, règles communes) : propriétaire vadrouille_fn_* dédié (section 7),
-- search_path fixé, objets nommés avec leur schéma, aucun SQL dynamique, EXECUTE nominatif.
-- 6.1 Lien privé : pose le hachage du jeton dans la transaction, puis renvoie l'état du lien.
CREATE FUNCTION public.resolve_share_link(p_token_hash bytea)
  RETURNS TABLE (organization_id uuid, trip_id uuid, state text)
  LANGUAGE plpgsql STRICT SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.share_token_hash', pg_catalog.encode(p_token_hash, 'hex'), true);
  RETURN QUERY
    SELECT s.organization_id, s.trip_id,
           CASE
             WHEN s.revoked_at IS NOT NULL THEN 'revoked'
             WHEN s.expires_at <= pg_catalog.now() THEN 'expired'
             ELSE 'valid'
           END
    FROM public.share_links AS s
    WHERE s.token_hash = p_token_hash;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_share_link(bytea) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_share_link(bytea) TO vadrouille_app;
--> statement-breakpoint
-- 6.2 Webhook : organisation enregistrée à la création du paiement (les métadonnées de l'événement ne suffisent pas).
CREATE FUNCTION public.checkout_organization(p_stripe_checkout_session_id text) RETURNS uuid
  LANGUAGE sql STABLE STRICT SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c.organization_id FROM public.checkouts AS c WHERE c.stripe_checkout_session_id = p_stripe_checkout_session_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.checkout_organization(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.checkout_organization(text) TO vadrouille_webhook;
--> statement-breakpoint
-- 6.3 Suppression de compte (handover § 12, étape 1) : refusée si l'organisation n'est pas celle de la transaction,
-- sans utilisateur, si l'appelant n'est pas owner ou si elle a un autre membre. Pose deletion_requested_at puis
-- supprime les lignes métier de cette organisation seulement, sauf billing et usage_ledger (Q48). Rejouée, elle
-- ne lève pas d'erreur. B8 l'étend à place_coordinates.
CREATE FUNCTION public.purge_organization_data(p_organization_id uuid) RETURNS void
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
  DELETE FROM public.preferences AS x WHERE x.organization_id = v_org;
  DELETE FROM public.trips AS x WHERE x.organization_id = v_org;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_organization_data(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_organization_data(uuid) TO vadrouille_account_admin;
--> statement-breakpoint

-- 6.4 Projection en liste blanche de l'instantané partagé (décision 0007, handover § 12) : jamais la colonne
-- snapshot telle quelle ; ni patch, ni étiquette de logement des terminus tant que Q50 n'est pas tranchée. Une clé
-- n'apparaît dans shared_trip_version que si elle est nommée ici ; seules les valeurs scalaires des feuilles passent.
-- Fonctions pures, exécutées sous vadrouille_share (les fonctions d'une vue s'exécutent sous le rôle qui la lit).
CREATE FUNCTION public.shared_scalar(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$ SELECT CASE WHEN pg_catalog.jsonb_typeof(p) IN ('string', 'number', 'boolean') THEN p END $$;
--> statement-breakpoint
CREATE FUNCTION public.shared_source(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  -- url : seulement une chaîne en https:// (le lien privé la rend en href, sans compte) ; javascript:, http:, data:
  -- ou une valeur non textuelle sont retirés, comme sur les autres chemins (CHECK de candidates.sources).
  SELECT CASE WHEN pg_catalog.jsonb_typeof(p) = 'object' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'label', public.shared_scalar(p -> 'label'),
    'url', CASE WHEN pg_catalog.jsonb_typeof(p -> 'url') = 'string' AND pg_catalog.left(p ->> 'url', 8) = 'https://'
      THEN p -> 'url' END)) END
$$;
--> statement-breakpoint
CREATE FUNCTION public.shared_facts(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN pg_catalog.jsonb_typeof(p) = 'object' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'durationMinutes', public.shared_scalar(p -> 'durationMinutes'),
    'costPerPerson', public.shared_scalar(p -> 'costPerPerson'),
    'area', public.shared_scalar(p -> 'area'))) END
$$;
--> statement-breakpoint
-- Stop.exceptions de l'instantané (décision 0011, point 5) : toReserve et unconfirmed seulement, sans doublon,
-- au plus 2, dans l'ordre de leur première apparition ; toConfirm (tiré d'horaires Google) et toute autre valeur
-- sont retirés.
CREATE FUNCTION public.shared_exceptions(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN pg_catalog.jsonb_typeof(p) = 'array' THEN (
    SELECT COALESCE(pg_catalog.jsonb_agg(f.v ORDER BY f.n), '[]'::jsonb)
    FROM (
      SELECT e.v, pg_catalog.min(e.n) AS n FROM pg_catalog.jsonb_array_elements(p) WITH ORDINALITY AS e(v, n)
      WHERE pg_catalog.jsonb_typeof(e.v) = 'string' AND e.v #>> '{}' IN ('toReserve', 'unconfirmed')
      GROUP BY e.v ORDER BY pg_catalog.min(e.n) LIMIT 2) AS f) END
$$;
--> statement-breakpoint
CREATE FUNCTION public.shared_stop(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN pg_catalog.jsonb_typeof(p) = 'object' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', public.shared_scalar(p -> 'id'),
    'kind', public.shared_scalar(p -> 'kind'),
    'placeId', public.shared_scalar(p -> 'placeId'),
    'name', public.shared_scalar(p -> 'name'),
    'start', public.shared_scalar(p -> 'start'),
    'end', public.shared_scalar(p -> 'end'),
    'facts', public.shared_facts(p -> 'facts'),
    'reason', public.shared_scalar(p -> 'reason'),
    'source', public.shared_source(p -> 'source'),
    'exceptions', public.shared_exceptions(p -> 'exceptions'),
    'locked', public.shared_scalar(p -> 'locked'),
    'commitment', public.shared_scalar(p -> 'commitment'))) END
$$;
--> statement-breakpoint
CREATE FUNCTION public.shared_surprise(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN pg_catalog.jsonb_typeof(p) = 'object' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', public.shared_scalar(p -> 'id'),
    'placeId', public.shared_scalar(p -> 'placeId'),
    'name', public.shared_scalar(p -> 'name'),
    'facts', public.shared_facts(p -> 'facts'),
    'reason', public.shared_scalar(p -> 'reason'),
    'source', public.shared_source(p -> 'source'))) END
$$;
--> statement-breakpoint
CREATE FUNCTION public.shared_line_item(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN pg_catalog.jsonb_typeof(p) = 'object' THEN
    CASE p ->> 'type'
      -- Q50 : ni label ni autre information de logement dans un terminus.
      WHEN 'terminus' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'type', 'terminus', 'role', public.shared_scalar(p -> 'role'), 'time', public.shared_scalar(p -> 'time')))
      WHEN 'stop' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'type', 'stop', 'stop', public.shared_stop(p -> 'stop')))
      WHEN 'segment' THEN pg_catalog.jsonb_build_object('type', 'segment', 'segment',
        CASE WHEN pg_catalog.jsonb_typeof(p -> 'segment') = 'object' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'mode', public.shared_scalar(p -> 'segment' -> 'mode'),
          'estimated', public.shared_scalar(p -> 'segment' -> 'estimated'))) ELSE '{}'::jsonb END)
      WHEN 'free' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'type', 'free', 'from', public.shared_scalar(p -> 'from'), 'to', public.shared_scalar(p -> 'to')))
      WHEN 'openMeal' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'type', 'openMeal', 'time', public.shared_scalar(p -> 'time'), 'meal', public.shared_scalar(p -> 'meal')))
    END
  END
$$;
--> statement-breakpoint
CREATE FUNCTION public.shared_day(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN pg_catalog.jsonb_typeof(p) = 'object' THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'index', public.shared_scalar(p -> 'index'),
    'date', public.shared_scalar(p -> 'date'),
    'travelBudgetMinutes', public.shared_scalar(p -> 'travelBudgetMinutes'),
    'items', (
      SELECT COALESCE(pg_catalog.jsonb_agg(public.shared_line_item(e.v) ORDER BY e.n)
        FILTER (WHERE public.shared_line_item(e.v) IS NOT NULL), '[]'::jsonb)
      FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(p -> 'items') = 'array' THEN p -> 'items' ELSE '[]'::jsonb END)
        WITH ORDINALITY AS e(v, n)),
    'events', (
      SELECT COALESCE(pg_catalog.jsonb_agg(public.shared_stop(e.v) ORDER BY e.n)
        FILTER (WHERE public.shared_stop(e.v) IS NOT NULL), '[]'::jsonb)
      FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(p -> 'events') = 'array' THEN p -> 'events' ELSE '[]'::jsonb END)
        WITH ORDINALITY AS e(v, n)),
    'surprise', public.shared_surprise(p -> 'surprise'))) END
$$;
--> statement-breakpoint
CREATE FUNCTION public.shared_snapshot(p jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.jsonb_build_object('days', (
    SELECT COALESCE(pg_catalog.jsonb_agg(public.shared_day(e.v) ORDER BY e.n)
      FILTER (WHERE public.shared_day(e.v) IS NOT NULL), '[]'::jsonb)
    FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(p -> 'days') = 'array' THEN p -> 'days' ELSE '[]'::jsonb END)
      WITH ORDINALITY AS e(v, n)))
$$;
--> statement-breakpoint
-- Les privilèges par défaut de 0000_socle retirent déjà EXECUTE à PUBLIC ; le REVOKE explicite le garantit quel que
-- soit le rôle qui crée ces fonctions (revue de #188).
REVOKE ALL ON FUNCTION public.shared_scalar(jsonb), public.shared_source(jsonb), public.shared_facts(jsonb),
  public.shared_exceptions(jsonb), public.shared_stop(jsonb), public.shared_surprise(jsonb), public.shared_line_item(jsonb),
  public.shared_day(jsonb), public.shared_snapshot(jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shared_scalar(jsonb), public.shared_source(jsonb), public.shared_facts(jsonb),
  public.shared_exceptions(jsonb), public.shared_stop(jsonb), public.shared_surprise(jsonb), public.shared_line_item(jsonb),
  public.shared_day(jsonb), public.shared_snapshot(jsonb) TO vadrouille_share;
--> statement-breakpoint

-- 6.5 Vues partagées : propriétaire vadrouille_fn_share_views (section 7), security_barrier, sans
-- security_invoker, jointure sur le jeton de la transaction, colonnes nommées. Sans jeton valide : zéro ligne,
-- quel que soit app.organization_id. Aucune vue sur stays (Q50), entitlements, billing, checkouts, briefs,
-- feedback, preferences ni place_coordinates.
CREATE VIEW public.shared_trip WITH (security_barrier = true) AS
  SELECT t.destination, t.start_date, t.end_date, t.travellers_adults, t.travellers_children, t.time_zone
  FROM public.share_links AS s
  JOIN public.trips AS t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now();
--> statement-breakpoint
CREATE VIEW public.shared_trip_version WITH (security_barrier = true) AS
  SELECT v.version, v.created_at, public.shared_snapshot(v.snapshot) AS snapshot
  FROM public.share_links AS s
  JOIN public.trips AS t ON t.organization_id = s.organization_id AND t.id = s.trip_id
  JOIN public.trip_versions AS v ON v.organization_id = t.organization_id AND v.trip_id = t.id AND v.version = t.current_version
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now();
--> statement-breakpoint
CREATE VIEW public.shared_checklist WITH (security_barrier = true) AS
  SELECT c.id, c.stop_id, c.kind, c.label, c.moment, c.booking_url, c.sponsored, c.done
  FROM public.share_links AS s
  JOIN public.checklist_items AS c ON c.organization_id = s.organization_id AND c.trip_id = s.trip_id
  WHERE s.token_hash = public.app_share_token_hash() AND s.revoked_at IS NULL AND s.expires_at > pg_catalog.now();
--> statement-breakpoint
REVOKE ALL ON public.shared_trip, public.shared_trip_version, public.shared_checklist FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON public.shared_trip, public.shared_trip_version, public.shared_checklist TO vadrouille_share;
--> statement-breakpoint

-- 7. Transfert de propriété (décision 0007, « Transfert de propriété ») : sous vadrouille_migrator (qui hérite des
-- droits de vadrouille_owner), dans cette même transaction. Le rôle cible doit pouvoir être pris (appartenance
-- SET accordée puis révoquée par vadrouille_migrator, qui n'a sur les rôles vadrouille_fn_* que l'option ADMIN,
-- sans SET ni INHERIT : décision 0036, B1-TL-2) et doit avoir CREATE sur le schéma (accordé puis révoqué). Les droits accordés
-- plus haut suivent l'objet chez son nouveau propriétaire.
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_share, vadrouille_fn_share_views, vadrouille_fn_checkout, vadrouille_fn_purge
  TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_share, vadrouille_fn_share_views, vadrouille_fn_checkout, vadrouille_fn_purge;
--> statement-breakpoint
ALTER FUNCTION public.resolve_share_link(bytea) OWNER TO vadrouille_fn_share;
--> statement-breakpoint
ALTER FUNCTION public.checkout_organization(text) OWNER TO vadrouille_fn_checkout;
--> statement-breakpoint
ALTER FUNCTION public.purge_organization_data(uuid) OWNER TO vadrouille_fn_purge;
--> statement-breakpoint
ALTER VIEW public.shared_trip OWNER TO vadrouille_fn_share_views;
--> statement-breakpoint
ALTER VIEW public.shared_trip_version OWNER TO vadrouille_fn_share_views;
--> statement-breakpoint
ALTER VIEW public.shared_checklist OWNER TO vadrouille_fn_share_views;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_share, vadrouille_fn_share_views, vadrouille_fn_checkout, vadrouille_fn_purge;
--> statement-breakpoint
REVOKE vadrouille_fn_share, vadrouille_fn_share_views, vadrouille_fn_checkout, vadrouille_fn_purge
  FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
