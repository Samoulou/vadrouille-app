-- 0003_prototype — schéma `prototype` du prototype de recherche (décision 0046 : D13, D15, D16, D24, exigences S1 à
-- S4 et S8 ; spécification `specs/P0-suite-2.md`, P0r2). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, APRÈS 0002_place_coordinates (ordre de 0046 D17 point 1).
-- Retour arrière : irréversible (voir `db/README.md`, « Retour arrière des migrations ») ; la suppression du schéma à
-- la fin de la phase 0 sera une migration corrective décidée par écrit (0046 D17 point 5).
--
-- Identifiants fixes (0046 D15 point 4), égaux aux constantes du code (`PROTOTYPE_ORG_ID`, `PROTOTYPE_USER_ID`) :
--   org_prototype                5e1f0000-0000-4000-8000-000000000001
--   utilisateur technique        5e1f0000-0000-4000-8000-000000000002
--
-- Plan :
--   1. org_prototype, son utilisateur technique et leur adhésion owner (politique temporaire migration_0003) ;
--      suppression et modification refusées pour tout rôle (S3) ;
--   2. garde de usage_ledger jusqu'au verdict de B7 (0046 D13 point 7) ;
--   3. schéma prototype, jour de quota Google posé par la base (S1, D20) ;
--   4. tables (D15 point 3, D24), valeurs posées par la base (S1), invariants de runs (D24), une exécution par jour ;
--   5. droits et politiques : vadrouille_prototype (uuid fixe, S2), vadrouille_fn_prototype_purge (lignes expirées) ;
--   6. fonction de purge prototype.purge_expired() (D16), EXECUTE au seul vadrouille_prototype_purge ;
--   7. transfert de propriété vers vadrouille_fn_prototype_purge (sous vadrouille_migrator, même transaction).
--
-- Aucune position n'est écrite ici, et rien n'accorde EXECUTE sur public.store_prototype_coordinates (verrou S8 ;
-- déverrouillage : décision 0052). Aucune donnée n'est supprimée.

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. org_prototype et son utilisateur technique (0046 D15 point 4). vadrouille_owner ne lit ni n'écrit aucune ligne
-- (RLS forcée) : la règle de 0007 (ligne vadrouille_migrator) ajoute une politique temporaire nommée migration_0003,
-- limitée aux identifiants fixes, et la retire dans cette même migration. Adresse du domaine réservé .invalid
-- (RFC 2606), sans ligne accounts ni sessions : aucune donnée personnelle.
CREATE POLICY migration_0003 ON public.users FOR INSERT TO vadrouille_owner
  WITH CHECK (id = '5e1f0000-0000-4000-8000-000000000002'::uuid);
--> statement-breakpoint
CREATE POLICY migration_0003 ON public.organizations FOR INSERT TO vadrouille_owner
  WITH CHECK (id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
CREATE POLICY migration_0003 ON public.memberships FOR INSERT TO vadrouille_owner
  WITH CHECK (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid
    AND user_id = '5e1f0000-0000-4000-8000-000000000002'::uuid AND role = 'owner');
--> statement-breakpoint
INSERT INTO public.users (id, email, email_verified)
  VALUES ('5e1f0000-0000-4000-8000-000000000002', 'org-prototype@vadrouille.invalid', false);
--> statement-breakpoint
INSERT INTO public.organizations (id, name, slug, kind)
  VALUES ('5e1f0000-0000-4000-8000-000000000001', 'Prototype (organisation technique)', 'org-prototype', 'personal');
--> statement-breakpoint
INSERT INTO public.memberships (organization_id, user_id, role)
  VALUES ('5e1f0000-0000-4000-8000-000000000001', '5e1f0000-0000-4000-8000-000000000002', 'owner');
--> statement-breakpoint
DROP POLICY migration_0003 ON public.users;
--> statement-breakpoint
DROP POLICY migration_0003 ON public.organizations;
--> statement-breakpoint
DROP POLICY migration_0003 ON public.memberships;
--> statement-breakpoint
-- S3 : org_prototype, son utilisateur technique et leur adhésion ne peuvent être ni supprimés ni modifiés, par aucun
-- rôle (vadrouille_auth compris, malgré ses politiques USING (true) ; vadrouille_fn_purge compris : une purge de
-- compte visant org_prototype échoue sans rien supprimer). Seule la migration corrective de fin de phase 0 retire ce
-- déclencheur.
CREATE FUNCTION public.protect_prototype_identities() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF OLD.id = '5e1f0000-0000-4000-8000-000000000002'::uuid THEN
      RAISE EXCEPTION 'utilisateur technique du prototype : % refusé (décision 0046, S3)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'organizations' THEN
    IF OLD.id = '5e1f0000-0000-4000-8000-000000000001'::uuid THEN
      RAISE EXCEPTION 'org_prototype : % refusé (décision 0046, S3)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'memberships' THEN
    IF OLD.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid
       OR OLD.user_id = '5e1f0000-0000-4000-8000-000000000002'::uuid THEN
      RAISE EXCEPTION 'adhésion du prototype : % refusé (décision 0046, S3)', TG_OP USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER users_protect_prototype BEFORE UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_prototype_identities();
--> statement-breakpoint
CREATE TRIGGER organizations_protect_prototype BEFORE UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_prototype_identities();
--> statement-breakpoint
CREATE TRIGGER memberships_protect_prototype BEFORE UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.protect_prototype_identities();
--> statement-breakpoint

-- 2. Garde de usage_ledger jusqu'au verdict de B7 (0046 D13 point 7) : aucune ligne par appel Places ou Routes (SKU
-- de `prototype/config/prix-google.json`, liste égale vérifiée par le test) et aucune ligne par lot de notation du
-- fournisseur de modèles (`modeles`, 0049 C4 ; étape de notation : `d` du workflow 1 ou `notation`). B7 ne les
-- lève qu'avec son verdict Sécurité, par une migration.
ALTER TABLE public.usage_ledger ADD CONSTRAINT usage_ledger_no_google_call_check CHECK (sku <> ALL (ARRAY[
  'places_text_search_essentials_ids_only', 'places_text_search_pro', 'places_details_essentials', 'places_details_pro',
  'places_details_enterprise', 'routes_matrix_essentials', 'routes_matrix_pro', 'routes_matrix_enterprise']));
--> statement-breakpoint
ALTER TABLE public.usage_ledger ADD CONSTRAINT usage_ledger_no_scoring_batch_check
  CHECK (NOT (provider = 'modeles' AND step IN ('d', 'notation')));
--> statement-breakpoint

-- 3. Schéma prototype, propriété de vadrouille_owner ; aucun droit à PUBLIC (les privilèges par défaut de
-- 0000_socle retirent déjà EXECUTE et les droits de table à PUBLIC pour tout objet créé par vadrouille_owner).
CREATE SCHEMA prototype;
--> statement-breakpoint
REVOKE ALL ON SCHEMA prototype FROM PUBLIC;
--> statement-breakpoint
-- Jour de quota Google à minuit heure du Pacifique (0046 D20 point 1 ; S1) : seule source du jour écrit en base et
-- des sommes comparées par le port de consommation ; égal à `src/server/usage/periodes.ts` (test).
CREATE FUNCTION prototype.quota_day_at(p_at timestamp with time zone) RETURNS date
  LANGUAGE sql STABLE STRICT PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$ SELECT (p_at AT TIME ZONE 'America/Los_Angeles')::date $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION prototype.quota_day_at(timestamp with time zone) FROM PUBLIC;
--> statement-breakpoint

-- 4. Tables. Toutes : organization_id (clé étrangère, défaut = uuid fixe, écrasé par déclencheur), RLS activée et
-- forcée, sauf prototype.purges (table système, D16 point 6). Aucune colonne de position (Q324 option a), aucune table
-- par appel ni de sommes mensuelles (S4), aucune heure de fin ni durée (S4).
-- 4.1 Registre des exécutions (D24, liste fermée de colonnes ; S4).
CREATE TABLE prototype.runs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  quota_day date NOT NULL,
  mode text NOT NULL,
  brief text NOT NULL,
  variant text NOT NULL,
  status text NOT NULL DEFAULT 'en_cours',
  phase text,
  stop_code text,
  cost_models_micros bigint,
  started_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  canary_ok boolean,
  commit_sha text NOT NULL,
  CONSTRAINT runs_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT runs_mode_check CHECK (mode IN ('reel', 'essai')),
  CONSTRAINT runs_brief_check CHECK (brief ~ '^[a-z0-9][a-z0-9-]{0,62}\.json$'),
  CONSTRAINT runs_variant_check CHECK (variant IN ('A', 'B')),
  CONSTRAINT runs_status_check CHECK (status IN ('en_cours', 'programme_ecrit', 'arretee')),
  CONSTRAINT runs_phase_values_check CHECK (phase IN ('recherche', 'ancrage', 'notation', 'planification', 'raisons', 'validation', 'ecriture')),
  CONSTRAINT runs_stop_code_values_check CHECK (stop_code IN (
    'production_refused', 'real_mode_unavailable', 'brief_invalid', 'config_invalid', 'data_collection_missing',
    'model_id_invalid', 'upstream_unavailable', 'upstream_redirect', 'usage_unavailable', 'pipeline_failed')),
  CONSTRAINT runs_commit_sha_check CHECK (commit_sha ~ '^[0-9a-f]{40}$'),
  -- Invariants de S4, tenus par la base (D24) : phase et coût des modèles nuls dès que l'exécution est finie ; code
  -- d'arrêt si et seulement si elle est arrêtée ; coût arrondi au cent supérieur (multiple de 10 000 micro-USD).
  CONSTRAINT runs_phase_check CHECK (status = 'en_cours' OR phase IS NULL),
  CONSTRAINT runs_stop_code_check CHECK ((stop_code IS NOT NULL) = (status = 'arretee')),
  CONSTRAINT runs_cost_models_check CHECK (
    cost_models_micros IS NULL OR (status = 'en_cours' AND cost_models_micros >= 0 AND cost_models_micros % 10000 = 0))
);
--> statement-breakpoint
-- Une exécution par jour de quota Google (0046 D13 point 3), modes reel et essai.
CREATE UNIQUE INDEX runs_one_per_quota_day_idx ON prototype.runs (organization_id, quota_day) WHERE mode IN ('reel', 'essai');
--> statement-breakpoint
-- 4.2 Forfaits (D13 point 3, S4) : une ligne par exécution ou relecture, fonction de (nature, mode, configuration,
-- jour, exécution) seulement ; écrite une fois, jamais modifiée ni supprimée avant la fin de la phase 0.
CREATE TABLE prototype.forfaits (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  nature text NOT NULL,
  run_id uuid,
  quota_day date NOT NULL,
  text_search_requests integer NOT NULL,
  place_details_requests integer NOT NULL,
  routes_requests integer NOT NULL,
  routes_elements integer NOT NULL,
  google_cost_micros bigint NOT NULL,
  models_cost_micros bigint,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT forfaits_run_id_key UNIQUE (run_id),
  CONSTRAINT forfaits_run_fk FOREIGN KEY (organization_id, run_id) REFERENCES prototype.runs (organization_id, id),
  CONSTRAINT forfaits_nature_check CHECK (nature IN ('execution', 'relecture')),
  CONSTRAINT forfaits_run_id_check CHECK ((run_id IS NOT NULL) = (nature = 'execution')),
  CONSTRAINT forfaits_models_check CHECK ((models_cost_micros IS NULL) = (nature = 'relecture')),
  CONSTRAINT forfaits_units_check CHECK (text_search_requests >= 0 AND place_details_requests >= 0 AND routes_requests >= 0
    AND routes_elements >= 0 AND google_cost_micros >= 0 AND (models_cost_micros IS NULL OR models_cost_micros >= 0))
);
--> statement-breakpoint
CREATE INDEX forfaits_organization_id_quota_day_idx ON prototype.forfaits (organization_id, quota_day);
--> statement-breakpoint
-- 4.3 Programmes réduits SANS positions (Q324, option a) ; expiration = début de l'exécution + 29 jours (S1, S8) ;
-- pas de created_at (S4). Clés de premier niveau de la forme réduite, sans `positions`.
CREATE TABLE prototype.programmes (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  run_id uuid NOT NULL,
  contenu jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT programmes_run_id_key UNIQUE (run_id),
  CONSTRAINT programmes_id_expires_at_key UNIQUE (id, expires_at),
  CONSTRAINT programmes_run_fk FOREIGN KEY (organization_id, run_id) REFERENCES prototype.runs (organization_id, id),
  CONSTRAINT programmes_contenu_check CHECK (pg_catalog.jsonb_typeof(contenu) = 'object'
    AND (contenu OPERATOR(pg_catalog.-) ARRAY['schema', 'trip', 'proposals', 'terminus']) = '{}'::jsonb
    AND NOT (contenu OPERATOR(pg_catalog.?) 'positions'))
);
--> statement-breakpoint
CREATE INDEX programmes_expires_at_idx ON prototype.programmes (expires_at);
--> statement-breakpoint
-- 4.4 Jugements de Samuel (P0b2) : expiration copiée du programme jugé (S1), doublée d'une clé étrangère composite,
-- sans ON DELETE CASCADE (la purge supprime les jugements avant leur programme).
CREATE TABLE prototype.jugements (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  programme_id uuid NOT NULL,
  reponses jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT jugements_programme_fk FOREIGN KEY (programme_id, expires_at) REFERENCES prototype.programmes (id, expires_at),
  CONSTRAINT jugements_reponses_check CHECK (pg_catalog.jsonb_typeof(reponses) = 'object')
);
--> statement-breakpoint
CREATE INDEX jugements_expires_at_idx ON prototype.jugements (expires_at);
--> statement-breakpoint
-- 4.5 Essais du jeton (P0r3) : heure et résultat, aucune adresse IP ; 24 h.
CREATE TABLE prototype.run_attempts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  resultat text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT run_attempts_resultat_check CHECK (resultat IN ('accepte', 'refuse'))
);
--> statement-breakpoint
CREATE INDEX run_attempts_expires_at_idx ON prototype.run_attempts (expires_at);
--> statement-breakpoint
-- 4.6 Table de travail d'une exécution (comme `candidates` du MVP, 0011 § 2) : candidats et résumés de notre recherche,
-- place_id pour un candidat compatible seulement ; jamais de verdict, motif, compteur ni plan. Supprimée à la fin de
-- l'exécution, 24 h au plus. Nom sans « work » (test `schéma: aucune table de plan de travail`).
CREATE TABLE prototype.run_candidates (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  run_id uuid NOT NULL,
  cle text NOT NULL,
  candidat jsonb NOT NULL,
  place_id text,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT run_candidates_run_id_cle_key UNIQUE (run_id, cle),
  CONSTRAINT run_candidates_run_fk FOREIGN KEY (organization_id, run_id) REFERENCES prototype.runs (organization_id, id),
  CONSTRAINT run_candidates_cle_check CHECK (cle ~ '^c_[0-9]{3}$'),
  CONSTRAINT run_candidates_place_id_check CHECK (place_id ~ '^[A-Za-z0-9_-]+$' AND pg_catalog.char_length(place_id) <= 256),
  -- Clés de `CandidatSchema` (`src/prototype/candidat.ts`) seulement : aucune note, aucun verdict (test d'égalité).
  CONSTRAINT run_candidates_candidat_check CHECK (pg_catalog.jsonb_typeof(candidat) = 'object'
    AND (candidat OPERATOR(pg_catalog.-) ARRAY['id', 'nom', 'resume', 'categorie', 'typeEtape', 'source', 'evenement',
      'aReserver', 'prixParPersonne', 'dureeMinutes']) = '{}'::jsonb)
);
--> statement-breakpoint
CREATE INDEX run_candidates_expires_at_idx ON prototype.run_candidates (expires_at);
--> statement-breakpoint
-- 4.7 Dates des purges réussies (D16 point 6) : aucun compte de lignes ; 30 jours ; table système sans organisation.
CREATE TABLE prototype.purges (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  purged_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now()
);
--> statement-breakpoint
CREATE INDEX purges_purged_at_idx ON prototype.purges (purged_at);
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['runs', 'forfaits', 'programmes', 'jugements', 'run_attempts', 'run_candidates', 'purges'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE prototype.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE pg_catalog.format('ALTER TABLE prototype.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- 4.8 Valeurs posées par la base (S1) : un déclencheur BEFORE INSERT écrase toute valeur fournie (id, organisation,
-- jour de quota, heures, expirations). Exécutés sous le rôle qui insère (vadrouille_prototype), qui lit runs et
-- programmes par ses propres politiques : une exécution ou un programme d'une autre organisation, ou expiré, est
-- introuvable et l'insertion échoue.
CREATE FUNCTION prototype.runs_set_values() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.id := pg_catalog.gen_random_uuid();
  NEW.organization_id := '5e1f0000-0000-4000-8000-000000000001'::uuid;
  NEW.started_at := pg_catalog.now();
  NEW.quota_day := prototype.quota_day_at(pg_catalog.now());
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION prototype.forfaits_set_values() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.id := pg_catalog.gen_random_uuid();
  NEW.organization_id := '5e1f0000-0000-4000-8000-000000000001'::uuid;
  NEW.created_at := pg_catalog.now();
  NEW.quota_day := prototype.quota_day_at(pg_catalog.now());
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION prototype.programmes_set_values() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_started timestamp with time zone;
BEGIN
  SELECT r.started_at INTO v_started FROM prototype.runs AS r
  WHERE r.id = NEW.run_id AND r.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid;
  IF v_started IS NULL THEN
    RAISE EXCEPTION 'programme refusé : exécution introuvable' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.id := pg_catalog.gen_random_uuid();
  NEW.organization_id := '5e1f0000-0000-4000-8000-000000000001'::uuid;
  NEW.expires_at := v_started + interval '29 days';
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION prototype.jugements_set_values() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_expires timestamp with time zone;
BEGIN
  SELECT p.expires_at INTO v_expires FROM prototype.programmes AS p
  WHERE p.id = NEW.programme_id AND p.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid
    AND p.expires_at > pg_catalog.now();
  IF v_expires IS NULL THEN
    RAISE EXCEPTION 'jugement refusé : programme introuvable ou expiré' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.id := pg_catalog.gen_random_uuid();
  NEW.organization_id := '5e1f0000-0000-4000-8000-000000000001'::uuid;
  NEW.expires_at := v_expires;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION prototype.run_attempts_set_values() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.id := pg_catalog.gen_random_uuid();
  NEW.organization_id := '5e1f0000-0000-4000-8000-000000000001'::uuid;
  NEW.created_at := pg_catalog.now();
  NEW.expires_at := pg_catalog.now() + interval '24 hours';
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION prototype.run_candidates_set_values() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.id := pg_catalog.gen_random_uuid();
  NEW.organization_id := '5e1f0000-0000-4000-8000-000000000001'::uuid;
  NEW.expires_at := pg_catalog.now() + interval '24 hours';
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER runs_set_values BEFORE INSERT ON prototype.runs FOR EACH ROW EXECUTE FUNCTION prototype.runs_set_values();
--> statement-breakpoint
CREATE TRIGGER forfaits_set_values BEFORE INSERT ON prototype.forfaits FOR EACH ROW EXECUTE FUNCTION prototype.forfaits_set_values();
--> statement-breakpoint
CREATE TRIGGER programmes_set_values BEFORE INSERT ON prototype.programmes FOR EACH ROW EXECUTE FUNCTION prototype.programmes_set_values();
--> statement-breakpoint
CREATE TRIGGER jugements_set_values BEFORE INSERT ON prototype.jugements FOR EACH ROW EXECUTE FUNCTION prototype.jugements_set_values();
--> statement-breakpoint
CREATE TRIGGER run_attempts_set_values BEFORE INSERT ON prototype.run_attempts FOR EACH ROW EXECUTE FUNCTION prototype.run_attempts_set_values();
--> statement-breakpoint
CREATE TRIGGER run_candidates_set_values BEFORE INSERT ON prototype.run_candidates FOR EACH ROW EXECUTE FUNCTION prototype.run_candidates_set_values();
--> statement-breakpoint
-- Forfaits jamais modifiés ni supprimés (D24) : second verrou après les droits (même déclencheur que les registres
-- de 0007, qui refuse tout UPDATE et tout DELETE hors trip_versions).
CREATE TRIGGER forfaits_append_only BEFORE UPDATE OR DELETE ON prototype.forfaits FOR EACH ROW EXECUTE FUNCTION public.forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER forfaits_no_truncate BEFORE TRUNCATE ON prototype.forfaits FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
--> statement-breakpoint
REVOKE ALL ON FUNCTION prototype.runs_set_values(), prototype.forfaits_set_values(), prototype.programmes_set_values(),
  prototype.jugements_set_values(), prototype.run_attempts_set_values(), prototype.run_candidates_set_values() FROM PUBLIC;
--> statement-breakpoint

-- 5. Droits et politiques.
-- 5.1 vadrouille_prototype (D15 point 6, S1, S2) : politiques comparées à l'uuid fixe, jamais à app_current_org() ;
-- lecture bornée par expires_at > now() ; INSERT par colonnes, sans id, organization_id, quota_day, started_at,
-- created_at ni expires_at ; UPDATE par colonnes sur runs seulement ; DELETE sur run_candidates seulement.
GRANT USAGE ON SCHEMA prototype TO vadrouille_prototype;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION prototype.quota_day_at(timestamp with time zone) TO vadrouille_prototype;
--> statement-breakpoint
GRANT SELECT ON prototype.runs, prototype.forfaits, prototype.programmes, prototype.jugements, prototype.run_attempts,
  prototype.run_candidates, prototype.purges TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (mode, brief, variant, status, phase, stop_code, cost_models_micros, canary_ok, commit_sha) ON prototype.runs TO vadrouille_prototype;
--> statement-breakpoint
GRANT UPDATE (status, phase, stop_code, cost_models_micros, canary_ok) ON prototype.runs TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (nature, run_id, text_search_requests, place_details_requests, routes_requests, routes_elements,
  google_cost_micros, models_cost_micros) ON prototype.forfaits TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (run_id, contenu) ON prototype.programmes TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (programme_id, reponses) ON prototype.jugements TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (resultat) ON prototype.run_attempts TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (run_id, cle, candidat, place_id), DELETE ON prototype.run_candidates TO vadrouille_prototype;
--> statement-breakpoint
CREATE POLICY runs_prototype_select ON prototype.runs FOR SELECT TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
CREATE POLICY runs_prototype_insert ON prototype.runs FOR INSERT TO vadrouille_prototype
  WITH CHECK (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
CREATE POLICY runs_prototype_update ON prototype.runs FOR UPDATE TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid)
  WITH CHECK (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
CREATE POLICY forfaits_prototype_select ON prototype.forfaits FOR SELECT TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
CREATE POLICY forfaits_prototype_insert ON prototype.forfaits FOR INSERT TO vadrouille_prototype
  WITH CHECK (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['programmes', 'jugements', 'run_attempts', 'run_candidates'] LOOP
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON prototype.%I FOR SELECT TO vadrouille_prototype '
      'USING (organization_id = ''5e1f0000-0000-4000-8000-000000000001''::uuid AND expires_at > pg_catalog.now())',
      t || '_prototype_select', t);
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON prototype.%I FOR INSERT TO vadrouille_prototype '
      'WITH CHECK (organization_id = ''5e1f0000-0000-4000-8000-000000000001''::uuid)',
      t || '_prototype_insert', t);
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE POLICY run_candidates_prototype_delete ON prototype.run_candidates FOR DELETE TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND expires_at > pg_catalog.now());
--> statement-breakpoint
-- prototype.purges : liste fermée des politiques USING (true) et WITH CHECK (true) de 0007, amendée par 0046 D16
-- point 6 (lecture de la date des purges par vadrouille_prototype ; insertion par la fonction de purge).
CREATE POLICY purges_prototype_select ON prototype.purges FOR SELECT TO vadrouille_prototype USING (true);
--> statement-breakpoint
-- 5.2 vadrouille_fn_prototype_purge (D16 point 3) : lignes expirées seulement, toutes organisations ; aucun droit
-- sur runs ni forfaits (conservés jusqu'à la fin de la phase 0, sans donnée Google ni compteur).
GRANT USAGE ON SCHEMA prototype TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
GRANT SELECT (expires_at), DELETE ON prototype.programmes, prototype.jugements, prototype.run_attempts, prototype.run_candidates
  TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
GRANT INSERT, DELETE ON prototype.purges TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
GRANT SELECT (purged_at) ON prototype.purges TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
-- EXECUTE de public.purge_expired_coordinates() pour ce rôle : accordé par 0002_place_coordinates (la fonction
-- appartient déjà à vadrouille_fn_coords ici).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['programmes', 'jugements', 'run_attempts', 'run_candidates'] LOOP
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON prototype.%I FOR SELECT TO vadrouille_fn_prototype_purge USING (expires_at <= pg_catalog.now())',
      t || '_fn_prototype_purge_select', t);
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON prototype.%I FOR DELETE TO vadrouille_fn_prototype_purge USING (expires_at <= pg_catalog.now())',
      t || '_fn_prototype_purge_delete', t);
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE POLICY purges_fn_prototype_purge_insert ON prototype.purges FOR INSERT TO vadrouille_fn_prototype_purge WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY purges_fn_prototype_purge_select ON prototype.purges FOR SELECT TO vadrouille_fn_prototype_purge
  USING (purged_at < pg_catalog.now() - interval '30 days');
--> statement-breakpoint
CREATE POLICY purges_fn_prototype_purge_delete ON prototype.purges FOR DELETE TO vadrouille_fn_prototype_purge
  USING (purged_at < pg_catalog.now() - interval '30 days');
--> statement-breakpoint

-- 6. Purge (D16) : SECURITY DEFINER, sans paramètre, une seule transaction (un échec n'écrit rien). Jugements avant
-- programmes (clé étrangère composite de S1), puis essais du jeton et table de travail, coordonnées expirées
-- (public.purge_expired_coordinates), date de la purge, et dates de plus de 30 jours. Ne rend rien : aucun compte.
CREATE FUNCTION prototype.purge_expired() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM prototype.jugements AS j WHERE j.expires_at <= pg_catalog.now();
  DELETE FROM prototype.programmes AS p WHERE p.expires_at <= pg_catalog.now();
  DELETE FROM prototype.run_attempts AS a WHERE a.expires_at <= pg_catalog.now();
  DELETE FROM prototype.run_candidates AS c WHERE c.expires_at <= pg_catalog.now();
  PERFORM public.purge_expired_coordinates();
  INSERT INTO prototype.purges (purged_at) VALUES (pg_catalog.now());
  DELETE FROM prototype.purges AS x WHERE x.purged_at < pg_catalog.now() - interval '30 days';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION prototype.purge_expired() FROM PUBLIC;
--> statement-breakpoint
-- vadrouille_prototype_purge (connexion) : EXECUTE sur cette seule fonction et USAGE sur le schéma prototype ; aucun
-- droit sur une table (D16 point 5).
GRANT USAGE ON SCHEMA prototype TO vadrouille_prototype_purge;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION prototype.purge_expired() TO vadrouille_prototype_purge;
--> statement-breakpoint

-- 7. Transfert de propriété (décision 0007 ; même forme que 0001_securite, section 7) : la fonction de purge passe à
-- vadrouille_fn_prototype_purge, propriétaire d'aucune table.
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_prototype_purge TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA prototype TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
ALTER FUNCTION prototype.purge_expired() OWNER TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA prototype FROM vadrouille_fn_prototype_purge;
--> statement-breakpoint
REVOKE vadrouille_fn_prototype_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
