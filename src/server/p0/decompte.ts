import "server-only";

import type { ExecutionSuivie } from "@/contracts/prototype-suivi";

/**
 * Décompte des exécutions réelles par brief et variante (P0S2-PO-13 ; spécification `specs/P0-suite-2.md`, « P0a2 »).
 * Module pur : aucune base, aucune horloge. **Information seulement** depuis la décision 0071 : le décompte est affiché
 * sur la page des exécutions (tableau par brief et variante) et ne refuse plus aucun lancement (`run_quota_reached`
 * de D24 n'est plus rendu).
 *
 * - **Exécutions comptées** : 2 pour la variante B, 1 pour la variante A, par brief (P0a2 : « 2 de la variante B et
 *   1 de la variante A »).
 * - **Une exécution qui n'écrit aucun programme ne compte jamais** (décision 0093, point 2, confirmée par Samuel sur
 *   #512 le 2026-10-19 : « Je confirme 0093 »), quelle que soit la cause (défaut du code, panne, limite Google, fusible) :
 *   toute exécution `arretee` est ni comptée ni relance. Plus de décision au cas par cas. Seules comptent une exécution
 *   dont le programme est écrit et une exécution en cours (elle finira avec un programme ou ne comptera plus).
 *   Les relances (P0S2-PO-13 avant 0093) n'existent plus : `relances` vaut toujours 0 ; `RELANCES_MAX` ne
 *   sert qu'au contrat de la page (colonne « relances »), jusqu'à son retrait ; `CODES_EXTERNES_SUIVI` n'ouvre plus rien.
 * - Les essais d'intégration (`mode = essai`) ne comptent pas pour G0 (spécification, « Essai d'intégration ») : ils
 *   ne sont pas décomptés.
 */

/** Exécutions comptées au plus, par brief, selon la variante (P0a2). */
export const COMPTEES_MAX = { A: 1, B: 2 } as const;
/** Relances au plus, par brief et variante (P0S2-PO-13) : sans effet depuis 0093 (aucune exécution arrêtée ne compte). */
export const RELANCES_MAX = 1;

/**
 * Codes d'arrêt externes (usage de test seulement depuis 0093 : une exécution arrêtée n'est plus une relance, quel que soit son code) : égaux à `CODES_EXTERNES` de `src/prototype/arret.ts` (test
 * d'égalité ; l'application n'importe pas `src/prototype`, 0048 § 1).
 */
export const CODES_EXTERNES_SUIVI: readonly string[] = ["upstream_unavailable", "upstream_redirect", "usage_unavailable"];

export type Decompte = { readonly comptees: number; readonly relances: number };

/**
 * Décompte d'un brief et d'une variante, à partir des exécutions réelles (`mode = reel`) seulement. Une exécution
 * arrêtée (aucun programme écrit) ne compte jamais (décision 0093, point 2), même au même brief, variante, jour,
 * code d'arrêt et commit qu'une exécution que Samuel avait retirée à la main (0070, 0089, 0091 : historiques).
 */
export function decompte(
  executions: readonly ExecutionSuivie[],
  brief: string,
  variante: "A" | "B",
): Decompte {
  let comptees = 0;
  for (const execution of executions) {
    if (execution.mode !== "reel" || execution.brief !== brief || execution.variante !== variante) continue;
    if (execution.statut === "arretee") continue;
    comptees += 1;
  }
  return { comptees, relances: 0 };
}
