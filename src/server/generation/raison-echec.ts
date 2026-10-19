import "server-only";

import { CODES_ERREUR_IA, type CodeErreurIa } from "@/ai/erreurs";
import { natureEchec, type NatureEchec } from "@/ai/natures";
import type { GenerationFailureReason } from "@/contracts/values";

/**
 * Conversion unique de `generation_runs.stop_reason` vers la raison d'échec de `GenerationStatus` et `retryable`
 * (spécification B9, B9b point 6 et B9-PO-9 ; décision 0081 B9-TL-6 (h) ; 0077 § 3 point 6). Construite sur
 * `natureEchec` de la couche IA (0077 § 3 point 4) : `quota` → `quota_reached` ; `plafond` → `cost_cap_reached` ;
 * `entree`, `serveur`, `fournisseur`, `lodging_unresolved` et `step_expired` → `provider_error`. `no_option` n'est
 * **jamais** une raison d'échec (une case `noOption`, l'exécution finit `incomplete`, PO-6) : aucune entrée pour lui.
 * `retryable` vrai seulement pour `upstream_unavailable`, `upstream_timeout` et `step_expired`.
 *
 * Les codes propres à l'ancrage (`src/grounding`, que le graphe de l'application n'atteint jamais, 0048 § 1) sont
 * recopiés ici en littéral ; leur égalité avec `CODES_ANCRAGE` est vérifiée par le test de ce module. Ils n'ont pas de
 * nature dans `natures.ts` (table des seuls codes de la couche IA) : ceux qui sont aussi des codes de la couche IA
 * prennent leur nature, les autres sont des erreurs du fournisseur ou d'un lieu non résolu (`provider_error`).
 */

/** Natures qui peuvent arrêter une génération : toutes sauf `no_option`. */
export type NatureArret = Exclude<NatureEchec, "no_option">;

/** Table fermée : une nature ajoutée à `NATURES_ECHEC` sans raison fait échouer la compilation. */
const RAISON_PAR_NATURE = {
  quota: "quota_reached",
  plafond: "cost_cap_reached",
  entree: "provider_error",
  serveur: "provider_error",
  fournisseur: "provider_error",
} as const satisfies Record<NatureArret, GenerationFailureReason>;

/** Raison d'échec d'une nature d'arrêt (B9-PO-9). */
export function raisonDeNature(nature: NatureArret): GenerationFailureReason {
  return RAISON_PAR_NATURE[nature];
}

/** Codes de l'ancrage absents de `CODES_ERREUR_IA` (`CODES_ERREUR_GOOGLE` ∪ `CODES_ERREUR_ANCRAGE`, 0085 § 1.2). */
export const CODES_ANCRAGE_SEULS = [
  "upstream_rate_limited",
  "invalid_response",
  "upstream_not_found",
  "place_not_found",
  "routes_unavailable",
  "lodging_unresolved",
] as const;

/** Échéance d'une étape (B9-TL-3 point 5) : seul code propre à la génération. */
export const CODE_ETAPE_EXPIREE = "step_expired";

/** Codes fermés de `generation_runs.stop_reason` (même liste que le `CHECK` de la migration 0012). */
export const CODES_ARRET = [...CODES_ERREUR_IA, ...CODES_ANCRAGE_SEULS, CODE_ETAPE_EXPIREE] as const;
export type CodeArret = (typeof CODES_ARRET)[number];

const CODES_IA: ReadonlySet<string> = new Set(CODES_ERREUR_IA);
const REESSAYABLES: ReadonlySet<string> = new Set(["upstream_unavailable", "upstream_timeout", CODE_ETAPE_EXPIREE]);

const estCodeIa = (code: string): code is CodeErreurIa => CODES_IA.has(code);

/** Raison d'échec et `retryable` d'une exécution `failed`. */
export interface Echec {
  readonly reason: GenerationFailureReason;
  readonly retryable: boolean;
}

/**
 * Échec d'une exécution `failed` depuis son `stop_reason`. Échec fermé : un code nul, inconnu (ligne antérieure au
 * `CHECK`) ou `no_option` (jamais une raison d'arrêt) donne `provider_error`, non réessayable.
 */
export function echecDeCode(code: string | null): Echec {
  if (code === null) return { reason: "provider_error", retryable: false };
  const retryable = REESSAYABLES.has(code);
  if (estCodeIa(code)) {
    const nature = natureEchec(code);
    return { reason: nature === "no_option" ? "provider_error" : raisonDeNature(nature), retryable: nature === "no_option" ? false : retryable };
  }
  return { reason: "provider_error", retryable };
}

/** Vrai si l'exécution `failed` de ce code peut être relancée par la personne (`retryGeneration`, B9-PO-9). */
export function relancable(code: string | null): boolean {
  return echecDeCode(code).retryable;
}
