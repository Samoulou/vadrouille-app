-- Migration inverse de 0011_arret_limite_google : rétablit `runs_stop_code_values_check` de 0003_prototype (section
-- 4.1), à l'identique. Aucune ligne n'est modifiée ni supprimée : si une exécution porte déjà `upstream_rate_limited`,
-- la création échoue (SQLSTATE 23514) et la transaction est annulée ; revenir en arrière exige alors une décision sur
-- ces lignes, jamais leur suppression.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
ALTER TABLE prototype.runs DROP CONSTRAINT runs_stop_code_values_check;
--> statement-breakpoint
ALTER TABLE prototype.runs ADD CONSTRAINT runs_stop_code_values_check CHECK (stop_code IN (
    'production_refused', 'real_mode_unavailable', 'brief_invalid', 'config_invalid', 'data_collection_missing',
    'model_id_invalid', 'upstream_unavailable', 'upstream_redirect', 'usage_unavailable', 'pipeline_failed'));
--> statement-breakpoint
RESET ROLE;
