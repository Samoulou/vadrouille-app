-- 0006_deverrouillage_positions_prototype — levée du verrou S8 (décision 0056 § 4, S11 révisée ; 0052 § 3).
-- Écrite à la main (`drizzle-kit generate --custom`). Exécutée par `vadrouille_migrator` dans une transaction,
-- seulement par le workflow `db-migrate`, après l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES.
--
-- Une seule instruction de droit (0056 § 4.2) : EXECUTE de la fonction d'écriture des positions à quatre paramètres
-- (0005_prototype_coordinates_run) à `vadrouille_prototype`, et à lui seul. Cadre de 0001_securite.sql : son
-- propriétaire est vadrouille_fn_coords ; vadrouille_migrator prend ce rôle le temps de l'instruction (option ADMIN
-- de l'amorçage), puis l'appartenance est révoquée. Rien d'autre : aucun droit à PUBLIC ni à un autre rôle.
--
-- Retour arrière : `0006_deverrouillage_positions_prototype.down.sql`, copie octet pour octet du texte figé
-- `db/reverrouillage/retour-deverrouillage.sql` (REVERROUILLAGE_SHA256 de `db-reverrouillage.yml`). Coupure
-- d'urgence : `db-reverrouillage` (0056 § 4.6 point 1) ; reverrouillage durable : nouvelle migration (point 2).
RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_coords TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_coords;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.store_prototype_coordinates(uuid, text, double precision, double precision) TO vadrouille_prototype;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE vadrouille_fn_coords FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
