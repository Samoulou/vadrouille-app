-- 0007_essais_sans_limite — levée de la règle « une exécution `reel` ou `essai` par jour de quota » (décision 0071 :
-- Samuel prend la main sur ses essais et ses coûts, 2026-10-16). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, après 0006_deverrouillage_positions_prototype, seulement par
-- le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0056 § 3).
--
-- Une seule instruction : suppression de l'index unique partiel `runs_one_per_quota_day_idx` de `prototype.runs`
-- (0003_prototype, section 4.1 ; 0046 D13 point 3). Aucune ligne, aucune colonne, aucun droit, aucune politique ne
-- change ; les invariants de `runs` (contraintes `CHECK` de D24) et la valeur de `quota_day`, posée par la base (S1),
-- restent. Les plafonds par exécution restent tenus par le code (`prototype/config/plafonds.json`, registre en mémoire).
--
-- Compatibilité avec la version précédente du code : elle refuse elle-même une seconde exécution du jour
-- (`SQL_EXECUTION_DU_JOUR` de `src/server/usage/neon.ts`, avant 0071) ; l'index n'était qu'un filet derrière ce refus.
--
-- Retour arrière : `0007_essais_sans_limite.down.sql` recrée l'index ; il échoue (sans rien supprimer) dès qu'un jour
-- de quota compte plus d'une exécution `reel` ou `essai`.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DROP INDEX prototype.runs_one_per_quota_day_idx;
--> statement-breakpoint
RESET ROLE;
