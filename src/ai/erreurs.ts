/**
 * Codes d'erreur fermés de la couche IA (décision 0077 § 2 point 1 et § 3 point 1, B7-TL-2 et B7-TL-3) : **définition
 * unique** de chaque code que la couche IA compose. Les modules qui les définissaient avant B7a les lisent ici :
 * `openrouter-client.ts` et `client.ts` les importent ; `src/server/env/egress.ts` et `src/server/usage/port.ts` les
 * importent et les exportent sous le même nom, si bien que leurs importateurs ne changent pas.
 *
 * **Module sans aucun import** (ni `server-only`, ni `@/server`, ni `@/contracts`, ni paquet) et sans aucune fonction :
 * seulement des listes littérales et leurs types. C'est la condition de son exemption exacte dans les tests de frontière
 * (`tests/unit/p0/imports.test.ts`, 0077 § 3 point 1) : si ce module reçoit un import, quel qu'il soit, l'exemption
 * tombe. Il ne peut donc pas porter `import "server-only"` : exception nominative de `ligne/require-server-only`
 * (0077 § 3 point 1), avec la justification de `src/server/env/resolve.ts` (aucun import, ne lit ni ne rend aucun
 * secret). `src/ai/client.ts`, chargé par `pnpm p0` sous Node nu, n'en importe que des types.
 */

/** Refus de la barrière de sortie (`src/server/env/egress.ts`). */
export const CODES_REFUS_SORTIE = ["production_refused", "proxy_env_refused", "tls_env_refused"] as const;
export type CodeRefusSortie = (typeof CODES_REFUS_SORTIE)[number];

/**
 * Code fermé « clé absente ou vide » des modules étroits `ai.ts` et `grounding.ts` et des clients réels. Écrit une
 * seule fois ici : son texte finit comme un nom secret (régime de confinement, section 5), d'où une seule ligne.
 */
export const CODE_CLE_ABSENTE = "missing_key";
export type CodeCleAbsente = typeof CODE_CLE_ABSENTE;

/** Refus du port de consommation (`src/server/usage/port.ts`, D13). */
export const CODES_REFUS_USAGE = ["cap_reached", "envelope_reached", "daily_quota_insufficient", "usage_unavailable"] as const;
export type CodeRefusUsage = (typeof CODES_REFUS_USAGE)[number];

/** Codes du client réel de modèles (`openrouter-client.ts`), composés des trois listes ci-dessus. */
export const CODES_ERREUR_OPENROUTER = [
  ...CODES_REFUS_SORTIE,
  CODE_CLE_ABSENTE,
  ...CODES_REFUS_USAGE,
  "data_collection_missing",
  "model_id_invalid",
  "invalid_request",
  "upstream_redirect",
  "upstream_unavailable",
  "upstream_timeout",
  "upstream_error",
] as const;
export type CodeErreurOpenRouter = (typeof CODES_ERREUR_OPENROUTER)[number];

/** Seuls codes réessayables (0077 § 3 point 3) : seule définition, lue par `ErreurOpenRouter` et par la couche IA. */
export const REESSAYABLES = ["upstream_unavailable", "upstream_timeout"] as const satisfies readonly CodeErreurOpenRouter[];

/** Codes du client de modèles (`client.ts` : garde `data_collection` et identifiant de modèle). */
export const CODES_ERREUR_MODELE = ["data_collection_missing", "model_id_invalid", "model_unavailable", "model_error"] as const;
export type CodeErreurModele = (typeof CODES_ERREUR_MODELE)[number];

/**
 * Codes de la couche IA : `CODES_ERREUR_OPENROUTER` ∪ `CODES_ERREUR_MODELE` (doublons retirés) ∪ `invalid_input`
 * (entrée refusée avant toute requête), `model_output_invalid` (sortie illisible), `no_option` (aucune zone proposée).
 * Écrite en littéral (aucune fonction dans ce module) ; l'égalité avec l'union est vérifiée par `tests/unit/ia/`.
 */
export const CODES_ERREUR_IA = [
  ...CODES_ERREUR_OPENROUTER,
  "model_unavailable",
  "model_error",
  "invalid_input",
  "model_output_invalid",
  "no_option",
] as const;
export type CodeErreurIa = (typeof CODES_ERREUR_IA)[number];

/**
 * Résultat de chaque fonction exposée de la couche IA (0077 § 2 point 1) : aucune exception pour une erreur attendue ;
 * un code fermé et `retryable` (vrai seulement pour `REESSAYABLES`). Aucun message, corps ni pile de fournisseur.
 */
export type ResultatIa<T> =
  | { readonly ok: true; readonly valeur: T }
  | { readonly ok: false; readonly code: CodeErreurIa; readonly retryable: boolean };
