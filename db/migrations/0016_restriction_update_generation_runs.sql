-- 0016_restriction_update_generation_runs — `UPDATE` de `vadrouille_app` sur `generation_runs` restreint aux colonnes
-- que le code écrit (décision 0120 § 8, S8, points 1 à 3 ; question 1 de 0120 au Tech Lead, Q585 ; question Q586 ;
-- ticket #672). Écrite à la main (`pnpm db:generate --custom`, droits seulement : aucun changement de `db/schema/`, le
-- cliché `meta/0016_snapshot.json` est celui de 0015). Exécutée par `vadrouille_migrator` dans une transaction, après
-- 0015_recalcul_lot, seulement par le workflow `db-migrate` après l'`owner-approved` de Samuel sur la ligne de
-- MIGRATIONS_APPROUVEES (0035, 0056 § 3), ajoutée par une PR de workflow à part (0120 § 8 point 4).
-- Retour arrière : `0016_restriction_update_generation_runs.down.sql` (voir `db/README.md`).
--
-- Pourquoi (0120 S8) : `base_version` et `deck_closure_id` d'une ligne `batch` ne doivent jamais changer après son
-- écriture (une valeur changée ferait recalculer d'autres jours, ou rattacherait le recalcul à un autre tri), comme les
-- colonnes d'un signal (0112 § 3.1, migration 0014). Défense en profondeur : aucune requête de `src/` ne les écrit.
--
-- Colonnes accordées : exactement celles que les `UPDATE public.generation_runs` de `src/` écrivent (relevé sur `main`
-- `507d36a`, listé dans la PR et vérifié par `tests/unit/db/migration-restriction-update.test.ts`) :
-- `workflow_run_id`, `phase`, `stop_reason`, `last_version`, `updated_at`, `finished_at`, `step`, `step_seq`,
-- `person_retry_request_ids`, `studio_retries`.
-- Colonnes **exclues** (jamais écrites après l'insertion) : `base_version` et `deck_closure_id` (0120 S8, exigé) ;
-- `kind`, `organization_id`, `trip_id`, `request_id`, `started_at` (recommandation de la Sécurité, Q585, appliquée par
-- défaut, au Tech Lead à la relecture) ; `id` (clé primaire).
--
-- Aucune ligne n'est lue, modifiée ni supprimée ; la RLS de `generation_runs` est inchangée ; `SELECT` et `INSERT` de
-- `vadrouille_app` restent des droits de table (l'insertion d'une ligne `batch` écrit ses deux colonnes une fois).
-- `REVOKE UPDATE` de table retire aussi tout droit `UPDATE` par colonne (aucun n'existait) : l'ordre est donc retrait,
-- puis droit par colonnes. Aucun nom, aucune donnée Google.

SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE UPDATE ON public.generation_runs FROM vadrouille_app;
--> statement-breakpoint
GRANT UPDATE (workflow_run_id, phase, stop_reason, last_version, updated_at, finished_at, step, step_seq, person_retry_request_ids, studio_retries) ON public.generation_runs TO vadrouille_app;
--> statement-breakpoint
RESET ROLE;
