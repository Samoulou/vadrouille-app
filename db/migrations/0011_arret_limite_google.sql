-- 0011_arret_limite_google — code d'arrêt `upstream_rate_limited` admis dans `prototype.runs.stop_code` (ticket « Arrêt
-- clair quand la limite Google du jour est atteinte »). Écrite à la main (`drizzle-kit generate --custom`).
-- Exécutée par `vadrouille_migrator` dans une transaction, après 0010_usage_forfait, seulement par le workflow
-- `db-migrate` après l'`owner-approved` de Samuel sur la ligne de MIGRATIONS_APPROUVEES (0056 § 3).
--
-- Une seule contrainte change : `runs_stop_code_values_check` (0003_prototype, section 4.1 ; 0046 D24) est remplacée
-- par la même liste fermée, augmentée de `upstream_rate_limited` (refus d'un service externe pour limite d'appels
-- atteinte, HTTP 429), placé après les codes externes de S4 et avant `pipeline_failed`. Aucune ligne, aucune colonne,
-- aucun droit, aucune politique ne change ; les autres invariants de `runs` restent. La nouvelle contrainte vérifie
-- les lignes existantes : toutes portent une valeur de l'ancienne liste, qui y est incluse.
--
-- Compatibilité avec la version précédente du code : elle n'écrit jamais ce code. Avec la nouvelle version du code
-- avant cette migration, l'écriture du code refusée par l'ancienne contrainte est reprise en `pipeline_failed`
-- (`etapeClore`, `src/workflows/p0-run.ts`) : le comportement d'aujourd'hui.
--
-- Retour arrière : `0011_arret_limite_google.down.sql` rétablit l'ancienne liste ; il échoue (sans rien modifier) dès
-- qu'une exécution porte `upstream_rate_limited`.
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
ALTER TABLE prototype.runs DROP CONSTRAINT runs_stop_code_values_check;
--> statement-breakpoint
ALTER TABLE prototype.runs ADD CONSTRAINT runs_stop_code_values_check CHECK (stop_code IN (
    'production_refused', 'real_mode_unavailable', 'brief_invalid', 'config_invalid', 'data_collection_missing',
    'model_id_invalid', 'upstream_unavailable', 'upstream_redirect', 'usage_unavailable', 'upstream_rate_limited',
    'pipeline_failed'));
--> statement-breakpoint
RESET ROLE;
