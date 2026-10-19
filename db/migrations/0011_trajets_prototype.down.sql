-- Migration inverse de 0011_trajets_prototype (décision 0092 § 3) : rétablit `prototype.purge_expired()` de
-- 0003_prototype (section 6) à l'identique, sous son propriétaire, puis supprime `prototype.trajets` et son
-- déclencheur. Exception à la règle « aucune suppression de données », acceptée par écrit (décision 0092, amendement 1 ;
-- voir `db/README.md`), limitée à la seule table `prototype.trajets` : la table ne porte
-- que des temps de trajet Routes, donnée Google conservée par exception (0092 § 1) et qui doit être supprimée avec son
-- programme ; la garder sans la purge qui la supprime enfreindrait 0092 § 1 point 2 et bloquerait la purge des
-- programmes (clé étrangère composite). Aucune autre ligne n'est touchée ; les programmes restent et sont relus par
-- Routes comme avant 0092.
-- À jouer hors de toute exécution `p0Run` : le `DROP TABLE` prend un verrou exclusif, et un `INSERT` concurrent de
-- l'étape finale (`ecrireProgramme`) échouerait (`42P01`), ce qui annulerait l'écriture du programme.
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_prototype_purge TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
GRANT CREATE ON SCHEMA prototype TO vadrouille_fn_prototype_purge;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_prototype_purge;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prototype.purge_expired() RETURNS void
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
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA prototype FROM vadrouille_fn_prototype_purge;
--> statement-breakpoint
REVOKE vadrouille_fn_prototype_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DROP TABLE prototype.trajets;
--> statement-breakpoint
DROP FUNCTION prototype.trajets_set_values();
--> statement-breakpoint
RESET ROLE;
