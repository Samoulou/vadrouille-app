-- 0008_positions_mvp_29_jours — expiration des positions du MVP à 29 jours et droits du rôle de purge du MVP
-- (décision 0060 § 2 et § 3.2, B8-TL-3 ; 0011 § 6 amendée par 0060). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, après 0007_essais_sans_limite. Exige le rôle
-- `vadrouille_coords_purge`, créé par `db/bootstrap/roles.sql` (0060 § 3.2) : l'amorçage est réexécuté sur chaque base
-- avant cette migration (CI : job `db` ; base réelle : avant le lot qui la contient, 0056 § 3), sans quoi elle échoue.
-- Retour arrière : irréversible (voir `db/README.md`, « Retour arrière des migrations ») ; correction vers l'avant.
--
-- Aucune ligne n'est lue, modifiée ni supprimée. Les lignes déjà écrites gardent leur expiration (au plus 30 jours,
-- `CHECK` inchangé) ; constat de la PR de B8c : aucun module de `main` n'appelle `store_place_coordinates` hors des
-- tests, donc la base réelle n'a aucune ligne du MVP (0060 § 2, point 4).
--
-- Compatibilité avec la version précédente du code : même signature, même corps hors de l'expiration ; aucun module
-- de `main` ne l'appelle encore (B8b et B9 le feront par `src/server/positions/cache-positions.ts`).
--
-- Plan :
--   1. `store_place_coordinates` recréée sous son propriétaire `vadrouille_fn_coords`, même signature, mêmes garanties
--      (SECURITY DEFINER, search_path fixé, refus sans organisation et pour org_prototype, purge par lot de 500) ;
--      seule change l'expiration : 29 jours (0060 § 2). Le `CHECK` de 30 jours ne change pas (0027, plafond de la règle) ;
--   2. droits d'exécution réécrits : `store_place_coordinates` à `vadrouille_app` seul, `REVOKE ALL … FROM PUBLIC` ;
--   3. rôle de purge du MVP (0060 § 3.2) : `EXECUTE` sur `purge_expired_coordinates()` et `USAGE` sur le schéma
--      `public`, rien d'autre ;
--   4. appartenance temporaire de `vadrouille_migrator` retirée (même forme que 0005_prototype_coordinates_run).

-- 1. Recréation sous le propriétaire. vadrouille_migrator prend vadrouille_fn_coords le temps de la migration (option
-- ADMIN de l'amorçage ; appartenance retirée en fin de migration) ; CREATE sur public, le temps de la recréation.
GRANT vadrouille_fn_coords TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_coords;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_coords;
--> statement-breakpoint
-- Écriture d'une coordonnée dans l'organisation courante, juste après une réponse de Google (0011 § 6) : refusée sans
-- organisation et pour org_prototype (0046 S2). fetched_at et expires_at posés ici, jamais par l'appelant ; expiration
-- à 29 jours (0060 § 2 : suppression physique au plus tard 30 jours après l'obtention, avec la purge planifiée).
CREATE OR REPLACE FUNCTION public.store_place_coordinates(p_place_id text, p_lat double precision, p_lng double precision) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_org uuid := public.app_current_org();
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'coordonnées refusées : aucune organisation dans le contexte' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_org = '5e1f0000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'coordonnées refusées : org_prototype passe par sa fonction dédiée' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM public.place_coordinates AS c WHERE c.organization_id = v_org AND c.place_id = p_place_id;
  INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at)
    VALUES (v_org, p_place_id, p_lat, p_lng, pg_catalog.now(), pg_catalog.now() + interval '29 days');
  DELETE FROM public.place_coordinates AS c
  WHERE (c.organization_id, c.place_id) IN (
    SELECT x.organization_id, x.place_id FROM public.place_coordinates AS x
    WHERE x.expires_at <= pg_catalog.now() LIMIT 500);
END
$$;
--> statement-breakpoint

-- 2. Droits d'exécution (0007, règle commune 3 ; 0011 § 6) : réécrits, sans s'en remettre à ceux de 0002.
REVOKE ALL ON FUNCTION public.store_place_coordinates(text, double precision, double precision) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.store_place_coordinates(text, double precision, double precision) TO vadrouille_app;
--> statement-breakpoint

-- 3. Rôle de connexion du workflow `coords-purge.yml` (0060 § 3.2) : EXECUTE sur la seule fonction de purge, sans
-- paramètre, qui ne supprime que des lignes expirées, de toutes les organisations. Aucun droit sur une table, une vue,
-- une séquence, ni sur le schéma prototype.
GRANT EXECUTE ON FUNCTION public.purge_expired_coordinates() TO vadrouille_coords_purge;
--> statement-breakpoint

-- 4. Fin de l'appartenance temporaire (même forme que 0005_prototype_coordinates_run, section 4).
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_coords;
--> statement-breakpoint
REVOKE vadrouille_fn_coords FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
--> statement-breakpoint
-- USAGE du schéma public, nommé pour le rôle de purge (0060 § 3.2) ; accordé par vadrouille_owner, qui le tient avec
-- l'option de transmission (amorçage). Le rôle le tient aussi de PUBLIC, que ni l'amorçage ni 0000_socle ne retirent.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO vadrouille_coords_purge;
--> statement-breakpoint
RESET ROLE;
