-- 0017_brief_saisi_prototype — brief saisi dans l'app, lié à une exécution du prototype (spécification
-- `specs/E2E-essai-bout-en-bout.md`, lot 3 ; décision 0125 § 1). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, après 0016_restriction_update_generation_runs, seulement par
-- le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0035, 0056 § 3),
-- ajoutée par une PR de workflow à part (précédent de #675 et #681).
--
-- Plan :
--   1. `runs_brief_check` amendée : une exécution porte un nom de fichier admis (`rome-1.json`) **ou** le marqueur
--      `saisi` (brief saisi dans l'app, sous le code d'accès du site d'essai), jamais autre chose ;
--   2. table `prototype.run_briefs` : une ligne par exécution `saisi`, le brief converti du formulaire (`BriefSchema` de
--      `src/prototype/brief.ts` : clés fermées au premier niveau, taille bornée), la clé d'idempotence du lancement
--      (`request_id`, une par organisation) ; aucune donnée Google (texte maison seulement, 0011) ; expiration = début de
--      l'exécution + 29 jours, celle de son programme (S1) ;
--   3. déclencheur BEFORE INSERT qui écrase id, organization_id et expires_at (S1) et refuse une exécution qui n'est pas
--      `saisi`, ni `en_cours` (jamais un fichier et un brief saisi pour la même exécution) ;
--   4. déclencheur de contrainte différé sur `prototype.runs` : une exécution `saisi` sans brief saisi à la fin de sa
--      transaction est refusée (jamais ni fichier ni brief) ;
--   5. RLS activée et forcée ; vadrouille_prototype : SELECT (org_prototype, non expirées) et INSERT par colonnes
--      (`run_id`, `request_id`, `brief`), ni UPDATE ni DELETE ; vadrouille_fn_prototype_purge : SELECT (expires_at) et
--      DELETE des lignes expirées ; aucun autre rôle, rien pour PUBLIC ;
--   6. `prototype.purge_expired()` remplacée sous son propriétaire `vadrouille_fn_prototype_purge` (même signature, même
--      `search_path`, mêmes droits) : les briefs saisis expirés sont supprimés avec les programmes, le reste à l'identique
--      de 0013_secteurs_prototype ;
--   7. appartenance temporaire de vadrouille_migrator retirée (même forme que 0003_prototype, section 7).
--
-- Compatibilité avec la version précédente du code : elle n'écrit que des noms de fichier (admis par la nouvelle
-- contrainte), ne nomme pas la table et ne lit jamais une exécution `saisi` (aucune n'existe avant la nouvelle version).
-- La nouvelle version du code avant cette migration : un lancement depuis l'app est refusé par la base
-- (`runs_brief_check`, `23514`) dans la transaction de réservation, rien n'est écrit (`usage_unavailable`, échec fermé) ;
-- les lancements de `/prototype/executions` sont inchangés. Aucune ligne existante n'est modifiée ni supprimée.
-- Retour arrière : `0017_brief_saisi_prototype.down.sql` (voir `db/README.md`).
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint

-- 1. Nom de fichier admis ou marqueur `saisi` (décision 0125 § 1).
ALTER TABLE prototype.runs DROP CONSTRAINT runs_brief_check;
--> statement-breakpoint
ALTER TABLE prototype.runs ADD CONSTRAINT runs_brief_check CHECK (brief ~ '^[a-z0-9][a-z0-9-]{0,62}\.json$' OR brief = 'saisi');
--> statement-breakpoint

-- 2. Brief saisi d'une exécution. Clés de premier niveau de `BriefSchema` (`src/prototype/brief.ts`, test d'égalité de
-- `tests/db/brief-saisi-prototype.test.ts`) ; le contenu est validé par le lancement et par l'étape (`BriefSchema`), la
-- base n'en ferme que les clés et la taille : un brief admis tient en moins de 8 Kio (récit de 1 000 caractères, 5
-- logements de 120, 10 engagements de 80), 16 Kio stockés au plus.
CREATE TABLE prototype.run_briefs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT '5e1f0000-0000-4000-8000-000000000001'::uuid REFERENCES public.organizations (id),
  run_id uuid NOT NULL,
  request_id uuid NOT NULL,
  brief jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT run_briefs_run_id_key UNIQUE (run_id),
  CONSTRAINT run_briefs_request_id_key UNIQUE (organization_id, request_id),
  CONSTRAINT run_briefs_run_fk FOREIGN KEY (organization_id, run_id) REFERENCES prototype.runs (organization_id, id),
  CONSTRAINT run_briefs_brief_check CHECK (pg_catalog.jsonb_typeof(brief) = 'object'
    AND (brief OPERATOR(pg_catalog.-) ARRAY['schema', 'destination', 'pays', 'fuseau', 'arrivee', 'depart', 'heureArrivee',
      'heureDepart', 'voyageurs', 'rythme', 'envies', 'deplacements', 'budgetRepas', 'logements', 'engagements', 'recit']) = '{}'::jsonb
    AND pg_catalog.pg_column_size(brief) <= 16384)
);
--> statement-breakpoint
CREATE INDEX run_briefs_expires_at_idx ON prototype.run_briefs (expires_at);
--> statement-breakpoint
ALTER TABLE prototype.run_briefs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prototype.run_briefs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 3. Valeurs posées par la base (S1, comme `programmes_set_values`) : toute valeur fournie est écrasée. Exécuté sous le
-- rôle qui insère (vadrouille_prototype), qui lit `runs` par sa propre politique : une exécution d'une autre
-- organisation, qui n'est pas `saisi` ou qui n'est plus en cours est introuvable et l'insertion échoue.
CREATE FUNCTION prototype.run_briefs_set_values() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_started timestamp with time zone;
BEGIN
  SELECT r.started_at INTO v_started FROM prototype.runs AS r
  WHERE r.id = NEW.run_id AND r.organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid
    AND r.brief = 'saisi' AND r.status = 'en_cours';
  IF v_started IS NULL THEN
    RAISE EXCEPTION 'brief saisi refusé : exécution introuvable, terminée ou avec un fichier' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.id := pg_catalog.gen_random_uuid();
  NEW.organization_id := '5e1f0000-0000-4000-8000-000000000001'::uuid;
  NEW.expires_at := v_started + interval '29 days';
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER run_briefs_set_values BEFORE INSERT ON prototype.run_briefs FOR EACH ROW EXECUTE FUNCTION prototype.run_briefs_set_values();
--> statement-breakpoint
REVOKE ALL ON FUNCTION prototype.run_briefs_set_values() FROM PUBLIC;
--> statement-breakpoint

-- 4. Une exécution `saisi` a son brief à la fin de la transaction qui l'écrit (contrainte différée, contrôlée au COMMIT,
-- sous le rôle qui insère). Le brief expiré et purgé ensuite n'est plus exigé : le contrôle ne vaut qu'à l'insertion.
CREATE FUNCTION prototype.runs_brief_saisi_present() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM prototype.run_briefs AS b WHERE b.run_id = NEW.id) THEN
    RAISE EXCEPTION 'exécution refusée : brief saisi absent' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER runs_brief_saisi_present AFTER INSERT ON prototype.runs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.brief = 'saisi') EXECUTE FUNCTION prototype.runs_brief_saisi_present();
--> statement-breakpoint
REVOKE ALL ON FUNCTION prototype.runs_brief_saisi_present() FROM PUBLIC;
--> statement-breakpoint

-- 5. Droits et politiques, comparés à l'uuid fixe d'org_prototype, jamais à app_current_org(). Ni UPDATE ni DELETE pour
-- vadrouille_prototype : le brief est écrit une fois, avec l'exécution, et supprimé par la purge seulement.
GRANT SELECT ON prototype.run_briefs TO vadrouille_prototype;
--> statement-breakpoint
GRANT INSERT (run_id, request_id, brief) ON prototype.run_briefs TO vadrouille_prototype;
--> statement-breakpoint
CREATE POLICY run_briefs_prototype_select ON prototype.run_briefs FOR SELECT TO vadrouille_prototype
  USING (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid AND expires_at > pg_catalog.now());
--> statement-breakpoint
CREATE POLICY run_briefs_prototype_insert ON prototype.run_briefs FOR INSERT TO vadrouille_prototype
  WITH CHECK (organization_id = '5e1f0000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
GRANT SELECT (expires_at), DELETE ON prototype.run_briefs TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
CREATE POLICY run_briefs_fn_prototype_purge_select ON prototype.run_briefs FOR SELECT TO vadrouille_fn_prototype_purge
  USING (expires_at <= pg_catalog.now());
--> statement-breakpoint
CREATE POLICY run_briefs_fn_prototype_purge_delete ON prototype.run_briefs FOR DELETE TO vadrouille_fn_prototype_purge
  USING (expires_at <= pg_catalog.now());
--> statement-breakpoint

-- 6. Purge remplacée sous son propriétaire (même forme que 0013_secteurs_prototype, section 5).
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_prototype_purge TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA prototype TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_prototype_purge;
--> statement-breakpoint
-- Purge (0046 D16, amendée par 0092 § 1 point 2, par 0103, question 1, condition 6, et par 0125 § 1) : SECURITY
-- DEFINER, sans paramètre, une seule transaction (un échec n'écrit rien). Temps de trajet et jugements avant programmes
-- (clés étrangères composites), briefs saisis (même expiration que le programme de leur exécution), puis essais du jeton,
-- table de travail et plans de secteurs, coordonnées expirées (public.purge_expired_coordinates), date de la purge, et
-- dates de plus de 30 jours. Ne rend rien : aucun compte.
CREATE OR REPLACE FUNCTION prototype.purge_expired() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM prototype.trajets AS t WHERE t.expires_at <= pg_catalog.now();
  DELETE FROM prototype.jugements AS j WHERE j.expires_at <= pg_catalog.now();
  DELETE FROM prototype.programmes AS p WHERE p.expires_at <= pg_catalog.now();
  DELETE FROM prototype.run_briefs AS b WHERE b.expires_at <= pg_catalog.now();
  DELETE FROM prototype.run_attempts AS a WHERE a.expires_at <= pg_catalog.now();
  DELETE FROM prototype.run_candidates AS c WHERE c.expires_at <= pg_catalog.now();
  DELETE FROM prototype.run_secteurs AS s WHERE s.expires_at <= pg_catalog.now();
  PERFORM public.purge_expired_coordinates();
  INSERT INTO prototype.purges (purged_at) VALUES (pg_catalog.now());
  DELETE FROM prototype.purges AS x WHERE x.purged_at < pg_catalog.now() - interval '30 days';
END
$$;
--> statement-breakpoint

-- 7. Fin de l'appartenance temporaire (même forme que 0003_prototype, section 7).
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA prototype FROM vadrouille_fn_prototype_purge;
--> statement-breakpoint
REVOKE vadrouille_fn_prototype_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
