-- Amorçage des rôles de la décision 0007 (spécification B1, « Amorçage des rôles »), amendée par la décision 0046
-- (D17 point 2) : 18 rôles, dont les trois du prototype de recherche (P0r2), le rôle de purge du MVP (décision 0060
-- § 3.2, B8c) et le propriétaire de la fonction des sommes de consommation (B7c, migration 0010_usage_forfait).
--
-- À exécuter UNE FOIS PAR BASE, avant les migrations, par un utilisateur qui peut créer des rôles :
--   - en CI : le superutilisateur du conteneur postgres:17.11 (job `db`) ;
--   - sur la base Neon de staging : l'utilisateur propriétaire de l'intégration, par Samuel, dans l'éditeur SQL
--     de la console Neon (procédure de `db/README.md`, « Passage aux rôles à moindre privilège »).
-- Idempotent : une seconde exécution ne change rien. Il ne contient AUCUN mot de passe : les six rôles de
-- connexion (vadrouille_migrator, vadrouille_app, vadrouille_auth, vadrouille_prototype,
-- vadrouille_prototype_purge, vadrouille_coords_purge) reçoivent le leur hors du dépôt (pour les trois derniers :
-- procédure S5 de 0046 ; pour vadrouille_coords_purge, décision 0060 § 3.3).
-- Aucun rôle n'a SUPERUSER ni BYPASSRLS ; si un rôle existe déjà avec un attribut inattendu (limite de connexions
-- comprise), le script s'arrête au lieu de le corriger en silence.

DO $$
DECLARE
  -- nom, connexion autorisée, limite de connexions (-1 : aucune, non vérifiée sur un rôle existant ; sinon posée à la
  -- création et vérifiée ensuite)
  roles CONSTANT text[][] := ARRAY[
    ['vadrouille_owner', 'false', '-1'],
    ['vadrouille_migrator', 'true', '-1'],
    ['vadrouille_app', 'true', '-1'],
    ['vadrouille_auth', 'true', '-1'],
    ['vadrouille_share', 'false', '-1'],
    ['vadrouille_webhook', 'false', '-1'],
    ['vadrouille_account_admin', 'false', '-1'],
    ['vadrouille_limiter', 'false', '-1'],
    ['vadrouille_fn_share', 'false', '-1'],
    ['vadrouille_fn_share_views', 'false', '-1'],
    ['vadrouille_fn_checkout', 'false', '-1'],
    ['vadrouille_fn_coords', 'false', '-1'],
    ['vadrouille_fn_purge', 'false', '-1'],
    -- Prototype de recherche (décision 0046, D15 point 6 et D16) : connexion de l'adaptateur du prototype, connexion
    -- du job de purge, propriétaire de la fonction de purge.
    ['vadrouille_prototype', 'true', '-1'],
    ['vadrouille_prototype_purge', 'true', '-1'],
    ['vadrouille_fn_prototype_purge', 'false', '-1'],
    -- Purge du MVP (décision 0060 § 3.2) : connexion du job coords-purge, deux connexions au plus, aucune appartenance.
    ['vadrouille_coords_purge', 'true', '2'],
    -- Consommation du MVP (B7c, migration 0010_usage_forfait) : propriétaire de public.usage_forfait_totals(), seul
    -- lecteur des sommes globales de usage_ledger ; aucune connexion, aucune appartenance hors ADMIN de vadrouille_migrator.
    ['vadrouille_fn_usage', 'false', '-1']
  ];
  i int;
  v_name text;
  v_login boolean;
  v_limite int;
  r record;
BEGIN
  FOR i IN 1 .. pg_catalog.array_length(roles, 1) LOOP
    v_name := roles[i][1];
    v_login := roles[i][2]::boolean;
    v_limite := roles[i][3]::int;
    SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolreplication, rolconnlimit
      INTO r FROM pg_catalog.pg_roles WHERE rolname = v_name;
    IF NOT FOUND THEN
      EXECUTE pg_catalog.format(
        'CREATE ROLE %I %s NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT %s',
        v_name, CASE WHEN v_login THEN 'LOGIN' ELSE 'NOLOGIN' END, v_limite);
    ELSIF r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolcanlogin <> v_login
      OR (v_limite <> -1 AND r.rolconnlimit <> v_limite) THEN
      RAISE EXCEPTION 'le rôle % existe déjà avec des attributs inattendus : à corriger avant l''amorçage', v_name;
    END IF;
  END LOOP;
END
$$;

-- Les migrations s'exécutent sous vadrouille_migrator, qui crée les objets en prenant vadrouille_owner
-- (SET LOCAL ROLE) et hérite de ses droits pour transférer la propriété des fonctions et des vues.
GRANT vadrouille_owner TO vadrouille_migrator WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;

-- Appartenances sans héritage (décision 0007) : vadrouille_app ne prend ces rôles que par SET LOCAL ROLE.
GRANT vadrouille_share, vadrouille_webhook, vadrouille_account_admin, vadrouille_limiter
  TO vadrouille_app WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;

-- Transfert de propriété (décision 0007) : vadrouille_migrator doit pouvoir accorder, le temps d'une migration,
-- l'appartenance aux rôles vadrouille_fn_* (option ADMIN seule, sans SET ni INHERIT : décision 0036, B1-TL-2).
GRANT vadrouille_fn_share, vadrouille_fn_share_views, vadrouille_fn_checkout, vadrouille_fn_coords, vadrouille_fn_purge,
  vadrouille_fn_prototype_purge, vadrouille_fn_usage
  TO vadrouille_migrator WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;

-- Schéma public : vadrouille_owner y crée les tables ; l'option de transmission sert à accorder CREATE, le temps
-- du transfert de propriété, aux rôles vadrouille_fn_* (migration 0001). Personne d'autre n'y crée d'objet.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO vadrouille_owner WITH GRANT OPTION;

-- Journal des migrations appliquées, hors du schéma public (aucune donnée métier).
CREATE SCHEMA IF NOT EXISTS vadrouille_migrations;
REVOKE ALL ON SCHEMA vadrouille_migrations FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA vadrouille_migrations TO vadrouille_migrator;

-- Connexion à la base pour les six rôles de connexion. CREATE sur la base pour vadrouille_owner seul : la migration
-- 0003_prototype crée le schéma prototype sous ce rôle (décision 0046, D15 point 3 : le schéma lui appartient).
DO $$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT CONNECT ON DATABASE %I TO vadrouille_migrator, vadrouille_app, vadrouille_auth, vadrouille_prototype, vadrouille_prototype_purge, vadrouille_coords_purge',
    pg_catalog.current_database());
  EXECUTE pg_catalog.format('GRANT CREATE ON DATABASE %I TO vadrouille_owner', pg_catalog.current_database());
END
$$;
