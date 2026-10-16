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
 * - **Exécutions exclues** (`EXECUTIONS_EXCLUES`) : liste fermée d'exécutions réelles que Samuel a retirées du décompte
 *   par une décision écrite ; elles ne sont ni comptées ni relances. Le jour de quota qu'elles ont pris reste consommé
 *   (la réservation n'est pas touchée).
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

/**
 * Exécution réelle exclue du décompte, désignée par ses champs de `prototype.runs` : l'index unique
 * `runs_one_per_quota_day_idx` (une exécution `reel` ou `essai` par jour de quota) fait de ce tuple une seule ligne.
 */
export type ExecutionExclue = {
  readonly decision: string;
  readonly brief: string;
  readonly variante: "A" | "B";
  readonly jourQuota: string;
  readonly codeArret: string;
  readonly commitSha: string;
};

/**
 * Liste fermée ; chaque entrée renvoie à sa décision dans `docs/decisions/`. Une entrée de plus exige une nouvelle
 * décision de Samuel.
 */
export const EXECUTIONS_EXCLUES: readonly ExecutionExclue[] = [
  // Décision 0070 : `wrun_41M51Z1RQ450GN2FF85TK80W6Z`, arrêtée par un bug du studio (businessStatus exigé, Q460).
  {
    decision: "0070",
    brief: "edimbourg-1.json",
    variante: "B",
    jourQuota: "2026-10-16",
    codeArret: "pipeline_failed",
    commitSha: "d61e9faefacf568ad39833e8ac611ba717e0fbdd",
  },
];

/** Vrai si l'exécution est une exécution réelle, arrêtée, qui répond exactement à une entrée de la liste. */
export function estExclue(execution: ExecutionSuivie, exclues: readonly ExecutionExclue[] = EXECUTIONS_EXCLUES): boolean {
  return (
    execution.mode === "reel" &&
    execution.statut === "arretee" &&
    exclues.some(
      (exclue) =>
        exclue.brief === execution.brief &&
        exclue.variante === execution.variante &&
        exclue.jourQuota === execution.jourQuota &&
        exclue.codeArret === execution.codeArret &&
        exclue.commitSha === execution.commitSha,
    )
  );
}

export type Decompte = { readonly comptees: number; readonly relances: number };

const estRelancable = (execution: ExecutionSuivie) =>
  execution.statut === "arretee" && execution.codeArret !== null && CODES_EXTERNES_SUIVI.includes(execution.codeArret);

/** Décompte d'un brief et d'une variante, à partir des exécutions réelles (`mode = reel`) non exclues seulement. */
export function decompte(executions: readonly ExecutionSuivie[], brief: string, variante: "A" | "B"): Decompte {
  let comptees = 0;
  let relances = 0;
  for (const execution of executions) {
    if (execution.mode !== "reel" || execution.brief !== brief || execution.variante !== variante) continue;
    if (estExclue(execution)) continue;
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
