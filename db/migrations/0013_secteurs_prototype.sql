-- 0013_secteurs_prototype — candidat enrichi et plan de secteurs d'une exécution du prototype (décision 0094 § 1 point 5
-- et § 2 point 1 ; verdict de la Sécurité 0103, question 1, conditions 1 à 10). Écrite à la main
-- (`drizzle-kit generate --custom`). Exécutée par `vadrouille_migrator` dans une transaction, après 0012_creation_voyage,
-- seulement par le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES
-- (0035, 0056 § 3), ajoutée par une PR de workflow à part (0094 § 1 point 5).
--
-- Plan :
--   1. `run_candidates_candidat_check` remplacée : les quinze clés de `CandidatSchema` (`src/prototype/candidat.ts`), les
--      dix d'avant et `secteur`, `incontournable`, `prix`, `horaires`, `conseil` (contenu maison de notre recherche web,
--      jamais une donnée Google) ; aucune note, aucun verdict, aucun compteur ;
--   2. table `prototype.run_secteurs` (nom sans plan, work ni scratch : la garde `schéma: aucune table de plan de
--      travail` reste inchangée) : une ligne par exécution, `{ "secteurs": [{ "nom", "voisins", "incontournables" }] }`,
--      9 secteurs au plus, clés fermées **à chaque niveau**, types et longueurs bornés, taille bornée ; ni raison, ni
--      requête, ni jour, rang, ordre, horaire, position, identifiant de lieu ou compteur ; 24 h, comme `run_candidates` ;
--   3. déclencheur BEFORE INSERT qui écrase id, organization_id et expires_at (S1) ;
--   4. RLS activée et forcée ; vadrouille_prototype : SELECT (org_prototype, non expirées), INSERT par colonnes
--      (`run_id`, `secteurs`) et DELETE (org_prototype, non expirées), aucun UPDATE ; vadrouille_fn_prototype_purge :
--      SELECT (expires_at) et DELETE des lignes expirées ; aucun autre rôle, rien pour PUBLIC ;
--   5. `prototype.purge_expired()` remplacée sous son propriétaire `vadrouille_fn_prototype_purge` (même signature, même
--      `search_path`, mêmes droits) : les plans expirés sont supprimés comme les candidats, le reste à l'identique de
--      0011_trajets_prototype ;
--   6. appartenance temporaire de vadrouille_migrator retirée (même forme que 0003_prototype, section 7).
--
-- Compatibilité avec la version précédente du code : elle ne nomme pas la table, n'écrit que dix clés de candidat
-- (admises par la nouvelle contrainte) ; la purge reste la même fonction. La nouvelle version du code avant cette
-- migration lit `to_regclass('prototype.run_secteurs')` et, la table absente, ne supprime aucun plan et retire du candidat
-- les cinq clés que l'ancienne contrainte refuse (`src/adapters/prototype-travail.ts`). Aucune ligne existante n'est
-- modifiée ni supprimée : la nouvelle contrainte n'admet que plus de clés, les lignes existantes la respectent.
-- Retour arrière : `0013_secteurs_prototype.down.sql` (voir `db/README.md`).
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Clés du candidat enrichi (0094 § 1 points 1 et 5) : égales à `CandidatSchema` (test d'égalité de
-- `tests/db/prototype.test.ts`). La contrainte reste une différence de clés de premier niveau, comme en 0003.
ALTER TABLE prototype.run_candidates DROP CONSTRAINT run_candidates_candidat_check;
--> statement-breakpoint
ALTER TABLE prototype.run_candidates ADD CONSTRAINT run_candidates_candidat_check CHECK (pg_catalog.jsonb_typeof(candidat) = 'object'
  AND (candidat OPERATOR(pg_catalog.-) ARRAY['id', 'nom', 'resume', 'categorie', 'typeEtape', 'source', 'evenement',
    'aReserver', 'prixParPersonne', 'dureeMinutes', 'secteur', 'incontournable', 'prix', 'horaires', 'conseil']) = '{}'::jsonb);
--> statement-breakpoint

-- 2. Plan de secteurs d'une exécution (0094 § 2 point 1 ; 0103, question 1). Contenu maison écrit pendant la phase
-- `recherche`, avant tout ancrage, fonction de la sortie de l'agent seule ; aucune position. Contrôles du contenu :
--   - premier niveau : un objet dont la seule clé est `secteurs`, tableau de 1 à 9 éléments (`SECTEURS_MAX`) ;
--   - chaque secteur : un objet de clés exactement `nom`, `voisins`, `incontournables` ; `nom` texte non vide de 60
--     caractères au plus ; `voisins` tableau de 8 textes au plus, 60 caractères chacun ; `incontournables` tableau de 62
--     textes au plus (`INCONTOURNABLES_SCHEMA_MAX`), 80 caractères chacun (`LONGUEURS_TEXTE`) ;
--   - taille stockée de 32 Kio au plus : un plan admis par l'étape tient en 9 × (60 + 8 × 60) + 30 × 80 = 7 260 unités
--     UTF-16 au plus (30 incontournables : 2 × 15 jours, `reglePlanManquee`), soit moins de 22 Kio en UTF-8.
-- Les chemins `strict` rendent NULL sur une erreur de structure (`silent`) : NULL est compté comme un refus (COALESCE).
-- Une chaîne admise par l'étape (60 unités UTF-16 au plus) a au plus 60 caractères : la base n'est jamais plus stricte.
CREATE TABLE prototype.run_secteurs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  run_id uuid NOT NULL,
  secteurs jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT run_secteurs_run_id_key UNIQUE (run_id),
  CONSTRAINT run_secteurs_run_fk FOREIGN KEY (organization_id, run_id) REFERENCES prototype.runs (organization_id, id),
  CONSTRAINT run_secteurs_secteurs_check CHECK (CASE
    WHEN pg_catalog.jsonb_typeof(secteurs) = 'object' AND pg_catalog.jsonb_typeof(secteurs OPERATOR(pg_catalog.->) 'secteurs') = 'array' THEN
      (secteurs OPERATOR(pg_catalog.-) 'secteurs'::text) = '{}'::jsonb
      AND pg_catalog.jsonb_array_length(secteurs OPERATOR(pg_catalog.->) 'secteurs') BETWEEN 1 AND 9
      AND pg_catalog.pg_column_size(secteurs) <= 32768
      AND NOT COALESCE(pg_catalog.jsonb_path_exists(secteurs, 'strict $.secteurs[*] ? (@.type() != "object")', '{}', true), true)
      AND NOT COALESCE(pg_catalog.jsonb_path_exists(secteurs, 'lax $.secteurs[*] ? (!exists(@.nom) || !exists(@.voisins) || !exists(@.incontournables))', '{}', true), true)
      AND NOT COALESCE(pg_catalog.jsonb_path_exists(secteurs, 'strict $.secteurs[*].keyvalue() ? (@.key != "nom" && @.key != "voisins" && @.key != "incontournables")', '{}', true), true)
      AND NOT COALESCE(pg_catalog.jsonb_path_exists(secteurs, 'strict $.secteurs[*] ? (@.nom.type() != "string" || @.voisins.type() != "array" || @.incontournables.type() != "array")', '{}', true), true)
      AND NOT COALESCE(pg_catalog.jsonb_path_exists(secteurs, 'strict $.secteurs[*] ? (@.nom == "" || @.nom like_regex "^.{61}" flag "s" || @.voisins.size() > 8 || @.incontournables.size() > 62)', '{}', true), true)
      AND NOT COALESCE(pg_catalog.jsonb_path_exists(secteurs, 'strict $.secteurs[*].voisins[*] ? (@.type() != "string" || @ == "" || @ like_regex "^.{61}" flag "s")', '{}', true), true)
      AND NOT COALESCE(pg_catalog.jsonb_path_exists(secteurs, 'strict $.secteurs[*].incontournables[*] ? (@.type() != "string" || @ == "" || @ like_regex "^.{81}" flag "s")', '{}', true), true)
    ELSE false
  END)
);
--> statement-breakpoint
CREATE INDEX run_secteurs_expires_at_idx ON prototype.run_secteurs (expires_at);
--> statement-breakpoint
ALTER TABLE prototype.run_secteurs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prototype.run_secteurs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 3. Valeurs posées par la base (S1, comme `run_candidates_set_values`) : toute valeur fournie est écrasée. La clé
-- étrangère composite (exécution d'org_prototype) refuse une exécution inconnue.
CREATE FUNCTION prototype.run_secteurs_set_values() RETURNS trigger
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
CREATE TRIGGER run_secteurs_set_values BEFORE INSERT ON prototype.run_secteurs FOR EACH ROW EXECUTE FUNCTION prototype.run_secteurs_set_values();
--> statement-breakpoint
REVOKE ALL ON FUNCTION prototype.run_secteurs_set_values() FROM PUBLIC;
--> statement-breakpoint

-- 4. Droits et politiques (0103, question 1, conditions 4 et 5), comparés à l'uuid fixe d'org_prototype, jamais à
-- app_current_org(). Aucun UPDATE : un remplacement est une suppression suivie d'une insertion dans une transaction.
GRANT SELECT ON prototype.run_secteurs TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (run_id, secteurs), DELETE ON prototype.run_secteurs TO vadrouille_prototype;
--> statement-breakpoint
CREATE POLICY run_secteurs_prototype_select ON prototype.run_secteurs FOR SELECT TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND expires_at > pg_catalog.now());
--> statement-breakpoint
CREATE POLICY run_secteurs_prototype_insert ON prototype.run_secteurs FOR INSERT TO vadrouille_prototype
  WITH CHECK (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
CREATE POLICY run_secteurs_prototype_delete ON prototype.run_secteurs FOR DELETE TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND expires_at > pg_catalog.now());
--> statement-breakpoint
GRANT SELECT (expires_at), DELETE ON prototype.run_secteurs TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
CREATE POLICY run_secteurs_fn_prototype_purge_select ON prototype.run_secteurs FOR SELECT TO vadrouille_fn_prototype_purge
  USING (expires_at <= pg_catalog.now());
--> statement-breakpoint
CREATE POLICY run_secteurs_fn_prototype_purge_delete ON prototype.run_secteurs FOR DELETE TO vadrouille_fn_prototype_purge
  USING (expires_at <= pg_catalog.now());
--> statement-breakpoint

-- 5. Purge remplacée sous son propriétaire (même forme que 0011_trajets_prototype, section 4). vadrouille_migrator prend
-- vadrouille_fn_prototype_purge le temps de la migration ; CREATE sur prototype, le temps du remplacement. Même
-- signature, même propriétaire : les droits d'exécution (vadrouille_prototype_purge seul) restent.
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_prototype_purge TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA prototype TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_prototype_purge;
--> statement-breakpoint
-- Purge (0046 D16, amendée par 0092 § 1 point 2 et par 0103, question 1, condition 6) : SECURITY DEFINER, sans
-- paramètre, une seule transaction (un échec n'écrit rien). Temps de trajet et jugements avant programmes (clés
-- étrangères composites), puis essais du jeton, table de travail et plans de secteurs, coordonnées expirées
-- (public.purge_expired_coordinates), date de la purge, et dates de plus de 30 jours. Ne rend rien : aucun compte.
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
  DELETE FROM prototype.run_secteurs AS s WHERE s.expires_at <= pg_catalog.now();
  PERFORM public.purge_expired_coordinates();
  INSERT INTO prototype.purges (purged_at) VALUES (pg_catalog.now());
  DELETE FROM prototype.purges AS x WHERE x.purged_at < pg_catalog.now() - interval '30 days';
END
$$;
--> statement-breakpoint

-- 6. Fin de l'appartenance temporaire (même forme que 0003_prototype, section 7).
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA prototype FROM vadrouille_fn_prototype_purge;
--> statement-breakpoint
REVOKE vadrouille_fn_prototype_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
