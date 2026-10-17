import "server-only";

import type { CodeErreurIa } from "@/ai/erreurs";
import type { ApiErrorCode } from "@/contracts";

/**
 * Classification unique des codes de la couche IA (décision 0077 § 3 point 4) et conversion vers `ApiError` (§ 3
 * point 5). Module voisin de `erreurs.ts`, qui n'importe que `@/ai/erreurs` et `@/contracts` ; **pas** exempté des tests
 * de frontière : seuls les modules serveur qui en ont besoin l'importent. La conversion vers la raison d'échec de
 * `GenerationStatus` revient à B9 (§ 3 point 6), construite sur `natureEchec`.
 */

export const NATURES_ECHEC = ["no_option", "quota", "plafond", "entree", "serveur", "fournisseur"] as const;
export type NatureEchec = (typeof NATURES_ECHEC)[number];

/**
 * Table fermée et exhaustive : aucune branche « tout autre code » ; un code ajouté à `CODES_ERREUR_IA` sans nature fait
 * échouer la compilation (`satisfies Record<CodeErreurIa, NatureEchec>`).
 * - `serveur` : erreur de notre serveur ou de sa configuration, jamais du fournisseur (`usage_unavailable` est
 *   l'indisponibilité de notre registre d'usage, échec fermé de D13) ;
 * - `fournisseur` : erreur du fournisseur de modèles, ou sortie illisible.
 */
const TABLE_NATURES = {
  no_option: "no_option",
  daily_quota_insufficient: "quota",
  cap_reached: "plafond",
  envelope_reached: "plafond",
  invalid_input: "entree",
  production_refused: "serveur",
  proxy_env_refused: "serveur",
  tls_env_refused: "serveur",
  missing_key: "serveur",
  data_collection_missing: "serveur",
  model_id_invalid: "serveur",
  invalid_request: "serveur",
  usage_unavailable: "serveur",
  upstream_redirect: "fournisseur",
  upstream_unavailable: "fournisseur",
  upstream_timeout: "fournisseur",
  upstream_error: "fournisseur",
  model_unavailable: "fournisseur",
  model_error: "fournisseur",
  model_output_invalid: "fournisseur",
} as const satisfies Record<CodeErreurIa, NatureEchec>;

const NATURES_PAR_CODE: ReadonlyMap<string, NatureEchec> = new Map(Object.entries(TABLE_NATURES));

/** Nature d'un code de la couche IA. Un code hors de `CODES_ERREUR_IA` est un défaut de programmation : il lève. */
export function natureEchec(code: CodeErreurIa): NatureEchec {
  const nature = NATURES_PAR_CODE.get(code);
  if (nature === undefined) throw new RangeError("natureEchec : code hors de CODES_ERREUR_IA");
  return nature;
}

/**
 * Code d'`ApiError` d'un code de la couche IA (actions `structureBrief` et `suggestLodging` de B9) : `no_option` →
 * `no_option` ; `quota` et `plafond` → `cost_cap_reached` ; `entree` → `validation_failed` ; `serveur` et `fournisseur`
 * → `provider_error`. Pour `serveur` : le navigateur n'a rien à corriger, et le code ne doit pas révéler l'état de la
 * configuration du serveur ; le journal serveur garde le code fermé d'origine. `quota_reached` n'est pas un code
 * d'`ApiError`.
 */
export function versCodeApi(code: CodeErreurIa): ApiErrorCode {
  switch (natureEchec(code)) {
    case "no_option":
      return "no_option";
    case "quota":
    case "plafond":
      return "cost_cap_reached";
    case "entree":
      return "validation_failed";
    case "serveur":
    case "fournisseur":
      return "provider_error";
  }
}
