import "server-only";

/**
 * Codes admis dans le champ `stopReason` du journal (`generation.full_stuck`, B9d ; décision 0113). Module feuille, sans
 * autre import que `server-only` : `src/server/log.ts` le lit sans atteindre `src/server/generation/`
 * (`ligne/creation-imports`), `@/ai/natures` ni l'ancrage.
 *
 * **Copie** de `CODES_ARRET` (`src/server/generation/raison-echec.ts`, même liste que le `CHECK` de la migration 0012),
 * **moins `missing_key`** : ce texte reste écrit une seule fois, dans `src/ai/erreurs.ts` (`CODE_CLE_ABSENTE`, ligne
 * `secret:MISSING_KEY` de `tests/unit/confinement/donnees/lignes-textes.json`), et `log.ts` l'ajoute depuis l'import qu'il a
 * déjà (exemption exacte de 0077 § 3 point 1). L'égalité de cette liste plus `CODE_CLE_ABSENTE` avec `CODES_ARRET` est
 * vérifiée par `tests/unit/server/journal-stop-reason.test.ts` : la copie ne peut pas dériver sans le faire échouer.
 */
export const CODES_ARRET_JOURNAL_SANS_CLE = [
  "production_refused",
  "proxy_env_refused",
  "tls_env_refused",
  "cap_reached",
  "envelope_reached",
  "daily_quota_insufficient",
  "usage_unavailable",
  "data_collection_missing",
  "model_id_invalid",
  "invalid_request",
  "upstream_redirect",
  "upstream_unavailable",
  "upstream_timeout",
  "upstream_error",
  "model_unavailable",
  "model_error",
  "invalid_input",
  "model_output_invalid",
  "no_option",
  "upstream_rate_limited",
  "invalid_response",
  "upstream_not_found",
  "place_not_found",
  "routes_unavailable",
  "lodging_unresolved",
  "step_expired",
] as const;
