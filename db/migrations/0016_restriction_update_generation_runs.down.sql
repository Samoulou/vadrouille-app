-- Migration inverse de 0016_restriction_update_generation_runs (décision 0120 § 8 point 3 : « migration inverse qui rend
-- l'`UPDATE` de table »). Droits seulement : aucune ligne n'est lue, modifiée ni supprimée, aucune table, colonne,
-- contrainte ni politique n'est touchée. Elle retire l'`UPDATE` par colonnes accordé par 0016, puis rend à
-- `vadrouille_app` l'`UPDATE` de table de `generation_runs` de 0001_securite (section 4.1), à l'identique.
--
-- Effet : `vadrouille_app` peut de nouveau écrire `base_version` et `deck_closure_id` (et `kind`, `organization_id`,
-- `trip_id`, `request_id`, `started_at`), que la Sécurité veut figés (0120 S8). Descente d'urgence seulement (un défaut
-- de 0016 qui bloquerait une écriture du code) ; la correction durable se fait vers l'avant, par une migration qui
-- repose la restriction avec la liste corrigée : le journal garde 0016 appliquée, `db/migrate.ts` ne la rejoue pas, ce
-- retour vers l'avant passe donc par un nouveau numéro.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
REVOKE UPDATE (workflow_run_id, phase, stop_reason, last_version, updated_at, finished_at, step, step_seq, person_retry_request_ids, studio_retries) ON public.generation_runs FROM vadrouille_app;
--> statement-breakpoint
GRANT UPDATE ON public.generation_runs TO vadrouille_app;
--> statement-breakpoint
RESET ROLE;
