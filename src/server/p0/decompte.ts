import "server-only";

import type { ExecutionSuivie } from "@/contracts/prototype-suivi";

/**
 * Décompte des exécutions réelles par brief et variante (P0S2-PO-13 ; spécification `specs/P0-suite-2.md`, « P0a2 » ;
 * décision 0046, D24, `run_quota_reached`). Module pur : aucune base, aucune horloge.
 *
 * - **Exécutions comptées** : 2 pour la variante B, 1 pour la variante A, par brief (P0a2 : « 2 de la variante B et
 *   1 de la variante A »).
 * - **Relance** : une exécution arrêtée par une cause externe (`CODES_EXTERNES_SUIVI`) avant tout programme est relancée
 *   un autre jour, **au plus une fois par brief et variante** ; elle n'est alors pas comptée. Toute autre fin compte,
 *   y compris une exécution en cours (elle finira comptée ou relancée) et un plafond atteint ; une seconde fin externe
 *   compte aussi.
 * - Les essais d'intégration (`mode = essai`) ne comptent pas pour G0 (spécification, « Essai d'intégration ») : ils
 *   ne sont ni décomptés ni bornés ici (une exécution par jour de quota reste la règle de la réservation).
 */

/** Exécutions comptées au plus, par brief, selon la variante (P0a2). */
export const COMPTEES_MAX = { A: 1, B: 2 } as const;
/** Relances au plus, par brief et variante (P0S2-PO-13). */
export const RELANCES_MAX = 1;

/**
 * Codes d'arrêt externes, qui ouvrent la relance : égaux à `CODES_EXTERNES` de `src/prototype/arret.ts` (test
 * d'égalité ; l'application n'importe pas `src/prototype`, 0048 § 1).
 */
export const CODES_EXTERNES_SUIVI: readonly string[] = ["upstream_unavailable", "upstream_redirect", "usage_unavailable"];

export type Decompte = { readonly comptees: number; readonly relances: number };

const estRelancable = (execution: ExecutionSuivie) =>
  execution.statut === "arretee" && execution.codeArret !== null && CODES_EXTERNES_SUIVI.includes(execution.codeArret);

/** Décompte d'un brief et d'une variante, à partir des exécutions réelles (`mode = reel`) seulement. */
export function decompte(executions: readonly ExecutionSuivie[], brief: string, variante: "A" | "B"): Decompte {
  let comptees = 0;
  let relances = 0;
  for (const execution of executions) {
    if (execution.mode !== "reel" || execution.brief !== brief || execution.variante !== variante) continue;
    if (estRelancable(execution) && relances < RELANCES_MAX) relances += 1;
    else comptees += 1;
  }
  return { comptees, relances };
}

/** Vrai si un lancement de ce mode, brief et variante reste dans le décompte ; faux : `run_quota_reached`. */
export function lancementDansLeDecompte(executions: readonly ExecutionSuivie[], mode: "reel" | "essai", brief: string, variante: "A" | "B"): boolean {
  if (mode === "essai") return true;
  return decompte(executions, brief, variante).comptees < COMPTEES_MAX[variante];
}
