-- 0002_place_coordinates — cache des coordonnées `place_coordinates` et ses trois fonctions (décision 0011 § 6,
-- amendée par 0046 : D15 point 2, exigences S2 et S8). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, après 0001_securite et AVANT 0003_prototype (ordre de
-- 0046 D17 point 1). Retour arrière : irréversible (voir `db/README.md`, « Retour arrière des migrations »).
--
-- `org_prototype` (organisation technique du prototype, créée par 0003_prototype) a l'identifiant fixe
-- 5e1f0000-0000-4000-8000-000000000001, égal à `PROTOTYPE_ORG_ID` (`src/prototype/programme-reduit.ts` ; test
-- `base: uuid d'org_prototype et de l'utilisateur technique égaux dans le code et la migration`).
--
-- Plan :
--   1. table, contraintes (dont le CHECK de 30 jours), RLS activée et forcée ;
--   2. droits et politiques : vadrouille_app (lecture de son organisation, jamais org_prototype : S2),
--      vadrouille_fn_coords (politiques de 0011 § 6, inchangées), vadrouille_prototype (lecture d'org_prototype) ;
--   3. fonctions SECURITY DEFINER : store_place_coordinates (refuse org_prototype : S2),
--      store_prototype_coordinates (29 jours, SANS EXECUTE pour personne hors son propriétaire : verrou S8),
--      purge_expired_coordinates ;
--   4. transfert de propriété vers vadrouille_fn_coords (sous vadrouille_migrator, même transaction).

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Table (0011 § 6) : une ligne par (organisation, placeId) ; jamais modifiée, remplacée par suppression puis
-- insertion ; fetched_at et expires_at posés par les fonctions, jamais par l'appelant.
CREATE TABLE public.place_coordinates (
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  place_id text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  fetched_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT place_coordinates_pkey PRIMARY KEY (organization_id, place_id),
  CONSTRAINT place_coordinates_expires_at_check CHECK (expires_at <= fetched_at + interval '30 days'),
  CONSTRAINT place_coordinates_expires_after_fetch_check CHECK (expires_at > fetched_at),
  -- Forme de PLACE_ID_PATTERN (`src/prototype/programme-reduit.ts`) ; longueur à part : les expressions régulières de
  -- Postgres bornent une répétition à 255.
  CONSTRAINT place_coordinates_place_id_check CHECK (place_id ~ '^[A-Za-z0-9_-]+$' AND pg_catalog.char_length(place_id) <= 256),
  CONSTRAINT place_coordinates_lat_check CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT place_coordinates_lng_check CHECK (lng BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE INDEX place_coordinates_expires_at_idx ON public.place_coordinates (expires_at);
--> statement-breakpoint
ALTER TABLE public.place_coordinates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.place_coordinates FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Droits et politiques.
-- 2.1 vadrouille_app : SELECT seulement (ni INSERT, ni UPDATE, ni DELETE) ; organisation courante, lignes non
-- expirées, jamais org_prototype (S2 : même avec app.organization_id = org_prototype, aucune ligne).
GRANT SELECT ON public.place_coordinates TO vadrouille_app;
--> statement-breakpoint
CREATE POLICY place_coordinates_app ON public.place_coordinates FOR SELECT TO vadrouille_app
  USING (organization_id = public.app_current_org()
    AND organization_id <> '5e1f0000-0000-4000-8000-000000000001'::uuid
    AND expires_at > pg_catalog.now());
--> statement-breakpoint
-- 2.2 vadrouille_fn_coords (0011 § 6, inchangé par 0046) : SELECT des trois colonnes de ses clauses USING, INSERT,
-- DELETE ; aucun UPDATE. Remplacement dans l'organisation courante, purge des lignes expirées de toute organisation.
GRANT SELECT (organization_id, place_id, expires_at) ON public.place_coordinates TO vadrouille_fn_coords;
--> statement-breakpoint
GRANT INSERT, DELETE ON public.place_coordinates TO vadrouille_fn_coords;
--> statement-breakpoint
CREATE POLICY place_coordinates_fn_coords_select_org ON public.place_coordinates FOR SELECT TO vadrouille_fn_coords
  USING (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY place_coordinates_fn_coords_delete_org ON public.place_coordinates FOR DELETE TO vadrouille_fn_coords
  USING (organization_id = public.app_current_org());
--> statement-breakpoint
CREATE POLICY place_coordinates_fn_coords_select_expired ON public.place_coordinates FOR SELECT TO vadrouille_fn_coords
  USING (expires_at <= pg_catalog.now());
--> statement-breakpoint
CREATE POLICY place_coordinates_fn_coords_delete_expired ON public.place_coordinates FOR DELETE TO vadrouille_fn_coords
  USING (expires_at <= pg_catalog.now());
--> statement-breakpoint
CREATE POLICY place_coordinates_fn_coords_insert ON public.place_coordinates FOR INSERT TO vadrouille_fn_coords
  WITH CHECK (organization_id = public.app_current_org());
--> statement-breakpoint
-- 2.3 vadrouille_prototype (0046 D15 point 6, S2) : SELECT seulement, comparé à l'uuid fixe, jamais à
-- app_current_org() (que ce rôle peut poser lui-même) ; lignes non expirées. Aucune écriture directe.
GRANT SELECT ON public.place_coordinates TO vadrouille_prototype;
--> statement-breakpoint
CREATE POLICY place_coordinates_prototype ON public.place_coordinates FOR SELECT TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND expires_at > pg_catalog.now());
--> statement-breakpoint

-- 3. Fonctions SECURITY DEFINER (règles communes de 0007) : propriétaire vadrouille_fn_coords (section 4),
-- search_path fixé, objets nommés avec leur schéma, aucun SQL dynamique.
-- 3.1 Écriture d'une coordonnée dans l'organisation courante, juste après une réponse de Google (0011 § 6) :
-- refusée sans organisation et pour org_prototype (S2 : org_prototype n'est écrite que par la fonction dédiée).
CREATE FUNCTION public.store_place_coordinates(p_place_id text, p_lat double precision, p_lng double precision) RETURNS void
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
    VALUES (v_org, p_place_id, p_lat, p_lng, pg_catalog.now(), pg_catalog.now() + interval '30 days');
  DELETE FROM public.place_coordinates AS c
  WHERE (c.organization_id, c.place_id) IN (
    SELECT x.organization_id, x.place_id FROM public.place_coordinates AS x
    WHERE x.expires_at <= pg_catalog.now() LIMIT 500);
END
$$;
--> statement-breakpoint
-- 3.2 Écriture d'une coordonnée d'org_prototype (0046 S2, S8) : sans paramètre d'organisation ; pose elle-même
-- app.organization_id à l'uuid fixe (les politiques de vadrouille_fn_coords, inchangées, s'appliquent), puis fait ce
-- que fait store_place_coordinates, avec une expiration à 29 jours (S8 : marge sur les 30 jours).
CREATE FUNCTION public.store_prototype_coordinates(p_place_id text, p_lat double precision, p_lng double precision) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.set_config('app.organization_id', '5e1f0000-0000-4000-8000-000000000001', true);
  DELETE FROM public.place_coordinates AS c
  WHERE c.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND c.place_id = p_place_id;
  INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at)
    VALUES ('5e1f0000-0000-4000-8000-000000000001'::uuid, p_place_id, p_lat, p_lng, pg_catalog.now(), pg_catalog.now() + interval '29 days');
  DELETE FROM public.place_coordinates AS c
  WHERE (c.organization_id, c.place_id) IN (
    SELECT x.organization_id, x.place_id FROM public.place_coordinates AS x
    WHERE x.expires_at <= pg_catalog.now() LIMIT 500);
END
$$;
--> statement-breakpoint
-- 3.3 Purge des seules lignes expirées, de toutes les organisations (0011 § 6). Sans paramètre ; ne rend rien.
CREATE FUNCTION public.purge_expired_coordinates() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM public.place_coordinates AS c WHERE c.expires_at <= pg_catalog.now();
END
$$;
--> statement-breakpoint
-- Droits d'exécution (0007, règle commune 3 ; 0011 § 6). Le REVOKE explicite ne s'en remet pas aux seuls
-- privilèges par défaut de 0000_socle.
REVOKE ALL ON FUNCTION public.store_place_coordinates(text, double precision, double precision) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_expired_coordinates() FROM PUBLIC;
--> statement-breakpoint
-- Verrou S8 (0046) : store_prototype_coordinates est créée SANS aucun GRANT EXECUTE. Seul son propriétaire
-- vadrouille_fn_coords (NOLOGIN, sans appartenance avec SET ni INHERIT) l'a, de droit. Le déverrouillage relève de la
-- décision 0052, par une migration ultérieure ; aucune autre ligne de ce dépôt ne l'accorde.
REVOKE ALL ON FUNCTION public.store_prototype_coordinates(text, double precision, double precision) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.store_place_coordinates(text, double precision, double precision) TO vadrouille_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_expired_coordinates() TO vadrouille_app;
--> statement-breakpoint
-- Amendement de 0011 § 6 par 0046 (D16 point 3) : la fonction de purge du prototype (prototype.purge_expired, créée
-- par 0003_prototype) appelle aussi cette purge, sous son propriétaire vadrouille_fn_prototype_purge.
GRANT EXECUTE ON FUNCTION public.purge_expired_coordinates() TO vadrouille_fn_prototype_purge;
--> statement-breakpoint

-- 4. Transfert de propriété (décision 0007, « Transfert de propriété » ; même forme que 0001_securite, section 7).
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_coords TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO vadrouille_fn_coords;
--> statement-breakpoint
ALTER FUNCTION public.store_place_coordinates(text, double precision, double precision) OWNER TO vadrouille_fn_coords;
--> statement-breakpoint
ALTER FUNCTION public.store_prototype_coordinates(text, double precision, double precision) OWNER TO vadrouille_fn_coords;
--> statement-breakpoint
ALTER FUNCTION public.purge_expired_coordinates() OWNER TO vadrouille_fn_coords;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_coords;
--> statement-breakpoint
REVOKE vadrouille_fn_coords FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
