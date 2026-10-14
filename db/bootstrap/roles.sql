-- Amorçage des rôles de la décision 0007 (spécification B1, « Amorçage des rôles »), amendée par la décision 0046
-- (D17 point 2) : 16 rôles, dont les trois du prototype de recherche (P0r2).
--
-- À exécuter UNE FOIS PAR BASE, avant les migrations, par un utilisateur qui peut créer des rôles :
--   - en CI : le superutilisateur du conteneur postgres:17.11 (job `db`) ;
--   - sur la base Neon de staging : l'utilisateur propriétaire de l'intégration, par Samuel, dans l'éditeur SQL
--     de la console Neon (procédure de `db/README.md`, « Passage aux rôles à moindre privilège »).
-- Idempotent : une seconde exécution ne change rien. Il ne contient AUCUN mot de passe : les cinq rôles de
-- connexion (vadrouille_migrator, vadrouille_app, vadrouille_auth, vadrouille_prototype,
-- vadrouille_prototype_purge) reçoivent le leur hors du dépôt (pour les deux derniers : 0046, S5).
-- Aucun rôle n'a SUPERUSER ni BYPASSRLS ; si un rôle existe déjà avec un attribut inattendu, le script s'arrête
-- au lieu de le corriger en silence.

DO $$
DECLARE
  -- nom, connexion autorisée
  roles CONSTANT text[][] := ARRAY[
    ['vadrouille_owner', 'false'],
    ['vadrouille_migrator', 'true'],
    ['vadrouille_app', 'true'],
    ['vadrouille_auth', 'true'],
    ['vadrouille_share', 'false'],
    ['vadrouille_webhook', 'false'],
    ['vadrouille_account_admin', 'false'],
    ['vadrouille_limiter', 'false'],
    ['vadrouille_fn_share', 'false'],
    ['vadrouille_fn_share_views', 'false'],
    ['vadrouille_fn_checkout', 'false'],
    ['vadrouille_fn_coords', 'false'],
    ['vadrouille_fn_purge', 'false'],
    -- Prototype de recherche (décision 0046, D15 point 6 et D16) : connexion de l'adaptateur du prototype, connexion
    -- du job de purge, propriétaire de la fonction de purge.
    ['vadrouille_prototype', 'true'],
    ['vadrouille_prototype_purge', 'true'],
    ['vadrouille_fn_prototype_purge', 'false']
  ];
  i int;
  v_name text;
  v_login boolean;
  r record;
BEGIN
  FOR i IN 1 .. pg_catalog.array_length(roles, 1) LOOP
    v_name := roles[i][1];
    v_login := roles[i][2]::boolean;
    SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolreplication
      INTO r FROM pg_catalog.pg_roles WHERE rolname = v_name;
    IF NOT FOUND THEN
      EXECUTE pg_catalog.format(
        'CREATE ROLE %I %s NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION',
        v_name, CASE WHEN v_login THEN 'LOGIN' ELSE 'NOLOGIN' END);
    ELSIF r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolcanlogin <> v_login THEN
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
  vadrouille_fn_prototype_purge
  TO vadrouille_migrator WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;

-- Schéma public : vadrouille_owner y crée les tables ; l'option de transmission sert à accorder CREATE, le temps
-- du transfert de propriété, aux rôles vadrouille_fn_* (migration 0001). Personne d'autre n'y crée d'objet.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO vadrouille_owner WITH GRANT OPTION;

-- Journal des migrations appliquées, hors du schéma public (aucune donnée métier).
CREATE SCHEMA IF NOT EXISTS vadrouille_migrations;
REVOKE ALL ON SCHEMA vadrouille_migrations FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA vadrouille_migrations TO vadrouille_migrator;

-- Connexion à la base pour les cinq rôles de connexion. CREATE sur la base pour vadrouille_owner seul : la migration
-- 0003_prototype crée le schéma prototype sous ce rôle (décision 0046, D15 point 3 : le schéma lui appartient).
DO $$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT CONNECT ON DATABASE %I TO vadrouille_migrator, vadrouille_app, vadrouille_auth, vadrouille_prototype, vadrouille_prototype_purge',
    pg_catalog.current_database());
  EXECUTE pg_catalog.format('GRANT CREATE ON DATABASE %I TO vadrouille_owner', pg_catalog.current_database());
END
$$;
