-- 0012_trajets_prototype — temps de trajet des programmes du prototype conservés (décision 0092 § 3, décision de Samuel
-- du 2026-10-18 : exception à 0011 § 1 et à 0027 point 4, pour le prototype seulement). Écrite à la main
-- (`drizzle-kit generate --custom`). Exécutée par `vadrouille_migrator` dans une transaction, après
-- 0011_arret_limite_google, seulement par le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de
-- MIGRATIONS_APPROUVEES (0035, 0056 § 3).
--
-- Plan :
--   1. table `prototype.trajets` sur le modèle de `prototype.jugements` (0003_prototype, section 4.4) : minutes entières
--      entre deux lieux consécutifs d'un programme écrit par `p0Run`, par mode ; expiration copiée du programme
--      (début de l'exécution + 29 jours), doublée d'une clé étrangère composite, sans ON DELETE CASCADE ; aucune
--      distance, aucun autre champ de Routes ;
--   2. déclencheur BEFORE INSERT qui pose id, organization_id et expires_at (programme non expiré d'org_prototype,
--      sinon refus `foreign_key_violation`), jamais fournis par l'appelant ;
--   3. RLS activée et forcée ; vadrouille_prototype : INSERT par colonnes et SELECT (org_prototype, non expirés), ni
--      UPDATE ni DELETE ; vadrouille_fn_prototype_purge : SELECT (expires_at) et DELETE des lignes expirées ; aucun
--      autre rôle, rien pour PUBLIC ;
--   4. `prototype.purge_expired()` remplacée sous son propriétaire `vadrouille_fn_prototype_purge` (même signature, mêmes
--      droits) : les temps expirés sont supprimés avant les programmes, le reste à l'identique ;
--   5. appartenance temporaire de vadrouille_migrator retirée (même forme que 0003_prototype, section 7).
--
-- Compatibilité avec la version précédente du code : elle ne nomme pas la table ; la purge reste la même fonction. La
-- nouvelle version du code avant cette migration ne lit ni n'écrit aucun temps (`to_regclass`, 0092 § 5 point 6).
-- Aucune ligne existante n'est lue, modifiée ni supprimée. Retour arrière : `0012_trajets_prototype.down.sql`.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Table (0092 § 3). Nom sans plan, work ni scratch. `origine` et `destination` : forme d'un placeId, comme
-- `run_candidates_place_id_check`.
CREATE TABLE prototype.trajets (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  programme_id uuid NOT NULL,
  mode text NOT NULL,
  origine text NOT NULL,
  destination text NOT NULL,
  minutes integer NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT trajets_programme_mode_origine_destination_key UNIQUE (programme_id, mode, origine, destination),
  CONSTRAINT trajets_programme_fk FOREIGN KEY (programme_id, expires_at) REFERENCES prototype.programmes (id, expires_at),
  CONSTRAINT trajets_mode_check CHECK (mode IN ('walk', 'transit', 'car')),
  CONSTRAINT trajets_origine_check CHECK (origine ~ '^[A-Za-z0-9_-]+$' AND pg_catalog.char_length(origine) <= 256),
  CONSTRAINT trajets_destination_check CHECK (destination ~ '^[A-Za-z0-9_-]+$' AND pg_catalog.char_length(destination) <= 256),
  CONSTRAINT trajets_minutes_check CHECK (minutes BETWEEN 0 AND 1440)
);
--> statement-breakpoint
CREATE INDEX trajets_expires_at_idx ON prototype.trajets (expires_at);
--> statement-breakpoint
ALTER TABLE prototype.trajets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prototype.trajets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Valeurs posées par la base (S1, comme `jugements_set_values`) : exécuté sous le rôle qui insère
-- (vadrouille_prototype), qui lit les programmes par sa propre politique ; un programme d'une autre organisation ou
-- expiré est introuvable et l'insertion échoue.
CREATE FUNCTION prototype.trajets_set_values() RETURNS trigger
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
    RAISE EXCEPTION 'trajet refusé : programme introuvable ou expiré' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.id := pg_catalog.gen_random_uuid();
  NEW.organization_id := '5e1f0000-0000-4000-8000-000000000001'::uuid;
  NEW.expires_at := v_expires;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER trajets_set_values BEFORE INSERT ON prototype.trajets FOR EACH ROW EXECUTE FUNCTION prototype.trajets_set_values();
--> statement-breakpoint
REVOKE ALL ON FUNCTION prototype.trajets_set_values() FROM PUBLIC;
--> statement-breakpoint

-- 3. Droits et politiques (0092 § 3), comparés à l'uuid fixe d'org_prototype, jamais à app_current_org().
GRANT SELECT ON prototype.trajets TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (programme_id, mode, origine, destination, minutes) ON prototype.trajets TO vadrouille_prototype;
--> statement-breakpoint
CREATE POLICY trajets_prototype_select ON prototype.trajets FOR SELECT TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND expires_at > pg_catalog.now());
--> statement-breakpoint
CREATE POLICY trajets_prototype_insert ON prototype.trajets FOR INSERT TO vadrouille_prototype
  WITH CHECK (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
GRANT SELECT (expires_at), DELETE ON prototype.trajets TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
CREATE POLICY trajets_fn_prototype_purge_select ON prototype.trajets FOR SELECT TO vadrouille_fn_prototype_purge
  USING (expires_at <= pg_catalog.now());
--> statement-breakpoint
CREATE POLICY trajets_fn_prototype_purge_delete ON prototype.trajets FOR DELETE TO vadrouille_fn_prototype_purge
  USING (expires_at <= pg_catalog.now());
--> statement-breakpoint

-- 4. Purge remplacée sous son propriétaire. vadrouille_migrator prend vadrouille_fn_prototype_purge le temps de la
-- migration (option ADMIN de l'amorçage ; appartenance retirée en fin de migration) ; CREATE sur prototype, le temps du
-- remplacement. Même signature, même propriétaire : les droits d'exécution (vadrouille_prototype_purge seul) restent.
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_prototype_purge TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA prototype TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_prototype_purge;
--> statement-breakpoint
-- Purge (0046 D16, amendée par 0092 § 1 point 2) : SECURITY DEFINER, sans paramètre, une seule transaction (un échec
-- n'écrit rien). Temps de trajet et jugements avant programmes (clés étrangères composites), puis essais du jeton et
-- table de travail, coordonnées expirées (public.purge_expired_coordinates), date de la purge, et dates de plus de
-- 30 jours. Ne rend rien : aucun compte.
CREATE OR REPLACE FUNCTION prototype.purge_expired() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM prototype.trajets AS t WHERE t.expires_at <= pg_catalog.now();
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

-- 5. Fin de l'appartenance temporaire (même forme que 0003_prototype, section 7).
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA prototype FROM vadrouille_fn_prototype_purge;
--> statement-breakpoint
REVOKE vadrouille_fn_prototype_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
