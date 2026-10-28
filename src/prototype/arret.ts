/**
 * Codes d'arrêt et phases écrits dans `prototype.runs` (décision 0046, D24, exigence Sécurité S4). Énumérations
 * fermées, égales aux `CHECK` de `db/migrations/0003_prototype.sql` (test `p0: stop_code et phase selon S4`).
 *
 * Principe (S4) : après la fin d'une exécution, aucune valeur conservée ne dépend de son déroulement au-delà de son
 * issue. Le code précis d'un arrêt `pipeline_failed` ne sort pas de l'étape qui le lève : seul le code persisté
 * (`codePersiste`) la quitte, sans message.
 *
 * Module pur, sans import : importable par l'application, les étapes de `p0Run` (P0r3) et les tests.
 */

/** Phases d'une exécution en cours ; remise à nul dès que `status` quitte `en_cours`. */
export const PHASES = ["recherche", "ancrage", "notation", "planification", "raisons", "validation", "ecriture"] as const;
export type Phase = (typeof PHASES)[number];

/** Codes levés **avant tout appel payant** par la première étape. */
export const CODES_AVANT_APPEL = [
  "production_refused",
  "real_mode_unavailable",
  "brief_invalid",
  "config_invalid",
  "data_collection_missing",
  "model_id_invalid",
] as const;

/** Codes **externes**, qui ouvrent la relance (P0S2-PO-13) ; ils ne disent ni l'étape ni le fournisseur. */
export const CODES_EXTERNES = ["upstream_unavailable", "upstream_redirect", "usage_unavailable"] as const;

/** Énumération fermée de `prototype.runs.stop_code`. */
export const CODES_ARRET = [...CODES_AVANT_APPEL, ...CODES_EXTERNES, "pipeline_failed"] as const;
export type CodeArret = (typeof CODES_ARRET)[number];

/**
 * Correspondance des codes du journal (`scripts/p0/journal.ts`) qui ne sont pas eux-mêmes des codes persistés
 * (D24) : `brief_not_found` et `brief_name_invalid` deviennent `brief_invalid` ; `upstream_rate_limited` (code d'un
 * client Google) devient `upstream_unavailable` (ticket #826, décision 0136). Tout autre code absent de `CODES_ARRET` devient
 * `pipeline_failed` (repli par défaut).
 */
const ALIAS: ReadonlyMap<string, CodeArret> = new Map([
  ["brief_not_found", "brief_invalid"],
  ["brief_name_invalid", "brief_invalid"],
  // Ticket #826, décision 0136 § 1 (verdict Sécurité du 2026-10-28, S4) : un refus de Google pour limite de débit (429)
  // est un arrêt externe, comme une indisponibilité (5xx) ; écrit `upstream_unavailable`, qui ne dit ni l'étape ni le
  // fournisseur. `upstream_timeout` et `upstream_error` restent `pipeline_failed` (0136 § 4).
  ["upstream_rate_limited", "upstream_unavailable"],
]);

/**
 * Codes qui refusent le lancement **avant** toute écriture (D24) : ils n'apparaissent jamais dans `runs`. Les passer
 * ici est une erreur de programmation.
 */
export const CODES_REFUS_LANCEMENT = ["envelope_reached", "daily_quota_insufficient", "run_quota_reached"] as const;

/**
 * Code écrit en base pour un code levé par une étape.
 * - `apresAppelPayant` : un code « avant tout appel payant » levé après le premier appel payant devient
 *   `pipeline_failed` (D24) ;
 * - codes externes : eux-mêmes ;
 * - tout le reste (ancrage, planification, plafonds, délai, modèles, erreurs internes, codes inconnus) :
 *   `pipeline_failed`.
 */
export function codePersiste(code: unknown, apresAppelPayant: boolean): CodeArret {
  if (typeof code !== "string") return "pipeline_failed";
  if ((CODES_REFUS_LANCEMENT as readonly string[]).includes(code)) {
    throw new Error("arret: un refus de lancement n'est jamais écrit dans runs");
  }
  const normalise = ALIAS.get(code) ?? code;
  if ((CODES_EXTERNES as readonly string[]).includes(normalise)) return normalise as CodeArret;
  if ((CODES_AVANT_APPEL as readonly string[]).includes(normalise)) return apresAppelPayant ? "pipeline_failed" : (normalise as CodeArret);
  return "pipeline_failed";
}
