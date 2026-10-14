-- 0005_prototype_coordinates_run — migration de remplacement de `store_prototype_coordinates` (décision 0052 § 1.7
-- et § 1.9, « Conséquences » ; 0055, section 8, ligne P0r3c). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, après 0004_rate_limit_expires_at.
-- Retour arrière : irréversible (voir `db/README.md`, « Retour arrière des migrations ») ; correction vers l'avant.
--
-- **Verrou S8 inchangé** (0052 § 3, 0056 § 4) : la fonction est recréée SANS aucun EXECUTE hors de son propriétaire,
-- ni pour vadrouille_prototype, ni pour PUBLIC. Le déverrouillage est une migration distincte (0056 § 4.3). Cette
-- migration n'est appliquée à la base réelle que par le workflow `db-migrate`, après l'`owner-approved` de Samuel sur
-- son lot (0056 § 3 ; Q408) : jusque-là, la CI seule l'applique.
--
-- Compatibilité avec la version précédente du code : aucun module de `main` n'appelle la forme à trois paramètres
-- (règle S6 de 0046, test `S6 : store_prototype_coordinates n'est nommée que par db/ et les tests de la base`).
--
-- Rectification du commentaire de 0003_prototype (section 4.6, `prototype.run_candidates`) : « place_id pour un
-- candidat compatible seulement » se lit, pour l'exécution `p0Run`, « place_id pour un candidat résolu dans la zone
-- du séjour » (décision 0055, section 6 point 3, qui amende 0011 § 2 pour `p0Run` : le statut de fermeture est
-- vérifié à l'étape finale). 0003_prototype n'est pas modifiée : son empreinte est au journal.
--
-- Plan :
--   1. suppression de la forme à trois paramètres (sous son propriétaire vadrouille_fn_coords) ;
--   2. droits de vadrouille_fn_coords sur le schéma prototype (0052 § 1.9) : USAGE, SELECT de quatre colonnes de
--      prototype.runs, politique de lecture des seules exécutions en cours d'org_prototype ;
--   3. fonction à quatre paramètres (0052 § 1.7), REVOKE ALL … FROM PUBLIC, aucun GRANT ;
--   4. transfert de propriété vers vadrouille_fn_coords (même forme que 0002_place_coordinates, section 4).

-- 1. Suppression de l'ancienne forme. Son propriétaire est vadrouille_fn_coords : vadrouille_migrator prend ce rôle
-- le temps de la suppression et du transfert (option ADMIN de l'amorçage ; appartenance retirée en fin de migration).
GRANT vadrouille_fn_coords TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_coords;
--> statement-breakpoint
DROP FUNCTION public.store_prototype_coordinates(text, double precision, double precision);
--> statement-breakpoint
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 2. Droits de vadrouille_fn_coords dans le schéma prototype (0052 § 1.9) : rien d'autre. `runs` ne porte aucune
-- donnée Google ni personnelle (0046, D24) ; ces droits ne sont exerçables que par les fonctions du rôle (NOLOGIN,
-- aucune appartenance avec SET ni INHERIT hors migration).
GRANT USAGE ON SCHEMA prototype TO vadrouille_fn_coords;
--> statement-breakpoint
GRANT SELECT (id, organization_id, status, started_at) ON prototype.runs TO vadrouille_fn_coords;
--> statement-breakpoint
CREATE POLICY runs_fn_coords_select ON prototype.runs FOR SELECT TO vadrouille_fn_coords
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND status = 'en_cours');
--> statement-breakpoint

-- 3. Écriture d'une position d'org_prototype liée à une exécution en cours (0052 § 1.7). Sans paramètre
-- d'organisation ni d'heure : fetched_at = started_at de l'exécution, expires_at = started_at + 29 jours, posés ici
-- (S1, S4) ; une ligne vivante d'expiration égale ou plus tardive (exécution commencée plus tard) n'est ni remplacée
-- ni raccourcie. Les messages d'erreur ne citent aucun paramètre (0052 § 1.8).
CREATE FUNCTION public.store_prototype_coordinates(p_run_id uuid, p_place_id text, p_lat double precision, p_lng double precision) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_debut timestamp with time zone;
  v_expiration timestamp with time zone;
BEGIN
  PERFORM pg_catalog.set_config('app.organization_id', '5e1f0000-0000-4000-8000-000000000001', true);
  -- started_at est NOT NULL : une valeur nulle dit qu'aucune exécution en cours d'org_prototype ne porte ce nom.
  v_debut := (SELECT r.started_at FROM prototype.runs AS r
    WHERE r.id = p_run_id AND r.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND r.status = 'en_cours');
  IF v_debut IS NULL THEN
    RAISE EXCEPTION 'coordonnées refusées : aucune exécution en cours de ce nom' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Même forme que PLACE_ID_GOOGLE (`src/grounding`) ; longueur à part (répétition bornée à 255 par Postgres).
  IF p_place_id IS NULL OR p_place_id !~ '^[A-Za-z0-9_-]+$' OR pg_catalog.char_length(p_place_id) > 256 THEN
    RAISE EXCEPTION 'coordonnées refusées : identifiant de lieu hors forme' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- NaN est plus grand que tout nombre pour Postgres : refusé par la borne haute, comme les infinis.
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'coordonnées refusées : position hors bornes' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_expiration := v_debut + interval '29 days';
  IF NOT EXISTS (
    SELECT 1 FROM public.place_coordinates AS c
    WHERE c.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND c.place_id = p_place_id
      AND c.expires_at > pg_catalog.now() AND c.expires_at >= v_expiration
  ) THEN
    DELETE FROM public.place_coordinates AS c
    WHERE c.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND c.place_id = p_place_id;
    INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at)
      VALUES ('5e1f0000-0000-4000-8000-000000000001'::uuid, p_place_id, p_lat, p_lng, v_debut, v_expiration);
  END IF;
  DELETE FROM public.place_coordinates AS c
  WHERE (c.organization_id, c.place_id) IN (
    SELECT x.organization_id, x.place_id FROM public.place_coordinates AS x
    WHERE x.expires_at <= pg_catalog.now() LIMIT 500);
END
$$;
--> statement-breakpoint
-- Verrou S8 (0046, 0052 § 3) : aucun EXECUTE, PUBLIC compris. Seul le propriétaire vadrouille_fn_coords l'a, de
-- droit. Le déverrouillage relève de la décision 0056 (§ 4.3), par une migration distincte.
REVOKE ALL ON FUNCTION public.store_prototype_coordinates(uuid, text, double precision, double precision) FROM PUBLIC;
--> statement-breakpoint

-- 4. Transfert de propriété (0007 ; même forme que 0002_place_coordinates, section 4).
RESET ROLE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_coords;
--> statement-breakpoint
ALTER FUNCTION public.store_prototype_coordinates(uuid, text, double precision, double precision) OWNER TO vadrouille_fn_coords;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_coords;
--> statement-breakpoint
REVOKE vadrouille_fn_coords FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
