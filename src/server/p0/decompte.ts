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
 * - **Exécutions exclues** (`EXECUTIONS_EXCLUES`) : liste fermée d'exécutions réelles arrêtées que Samuel avait retirées
 *   du décompte par une décision écrite (0070, 0089, 0091). Elles restent valables, mais la règle générale de 0093 les
 *   couvre : une exécution arrêtée ne compte plus, listée ou non.
 */

/** Exécutions comptées au plus, par brief, selon la variante (P0a2). */
export const COMPTEES_MAX = { A: 1, B: 2 } as const;
/** Relances au plus, par brief et variante (P0S2-PO-13) : sans effet depuis 0093 (aucune exécution arrêtée ne compte). */
export const RELANCES_MAX = 1;

/**
 * Codes d'arrêt externes, qui ouvrent la relance : égaux à `CODES_EXTERNES` de `src/prototype/arret.ts` (test
 * d'égalité ; l'application n'importe pas `src/prototype`, 0048 § 1).
 */
export const CODES_EXTERNES_SUIVI: readonly string[] = ["upstream_unavailable", "upstream_redirect", "usage_unavailable"];

/**
 * Exécution réelle exclue du décompte, désignée par ses champs de `prototype.runs`. Depuis la décision 0071, plusieurs
 * exécutions peuvent partager un jour de quota (index `runs_one_per_quota_day_idx` supprimé par la migration
 * 0007_essais_sans_limite) : le tuple ne désigne plus une seule ligne par construction. Il la désigne encore pour
 * l'entrée de 0070 : le déploiement `d61e9fa` refusait lui-même une seconde exécution du jour, et aucun autre
 * déploiement ne porte ce commit. Pour les entrées de 0089, une autre exécution réelle de rome-1/B arrêtée en
 * `pipeline_failed` le même jour sur le même commit répondrait au même tuple : c'est pourquoi `decompte()` n'exclut
 * **qu'une exécution au plus par entrée** (décision 0089, § « Mise en œuvre ») ; une seconde exécution qui répond au
 * même tuple compte. Il en va de même pour l'entrée de 0091 (commit `0d0bbaa`).
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
  // Décision 0089 : `wrun_41M57JCM3G50T1SSVCX1XG7HRT` (lancée vers 13:14 UTC), arrêtée par un défaut du studio
  // (lecture des trajets Routes de l'étape finale).
  {
    decision: "0089",
    brief: "rome-1.json",
    variante: "B",
    jourQuota: "2026-10-18",
    codeArret: "pipeline_failed",
    commitSha: "cfca0b58ccf67e4d10196adea296045ec98fdb61",
  },
  // Décision 0089 : `wrun_41M57JWPHV50HNB1M3TH4D2140` (lancée vers 13:23 UTC), même défaut.
  {
    decision: "0089",
    brief: "rome-1.json",
    variante: "B",
    jourQuota: "2026-10-18",
    codeArret: "pipeline_failed",
    commitSha: "efc0994f3e4e8eb5eb081c84b754797b980cf166",
  },
  // Décision 0091 : `wrun_41M57YCVXJ50T41W3BH260MEP2` (le soir), arrêtée par la limite quotidienne de Google Routes
  // (`upstream_rate_limited` dans le journal, plafond de la console de Samuel), pas par un défaut du programme.
  {
    decision: "0091",
    brief: "rome-1.json",
    variante: "B",
    jourQuota: "2026-10-18",
    codeArret: "pipeline_failed",
    commitSha: "0d0bbaa36536cf0d26d1d3b55218d9183375b92f",
  },
];

/** Vrai si l'exécution est une exécution réelle, arrêtée, qui répond exactement à l'entrée donnée. */
function repondA(execution: ExecutionSuivie, exclue: ExecutionExclue): boolean {
  return (
    execution.mode === "reel" &&
    execution.statut === "arretee" &&
    exclue.brief === execution.brief &&
    exclue.variante === execution.variante &&
    exclue.jourQuota === execution.jourQuota &&
    exclue.codeArret === execution.codeArret &&
    exclue.commitSha === execution.commitSha
  );
}

/** Vrai si l'exécution est une exécution réelle, arrêtée, qui répond exactement à une entrée de la liste. */
export function estExclue(execution: ExecutionSuivie, exclues: readonly ExecutionExclue[] = EXECUTIONS_EXCLUES): boolean {
  return exclues.some((exclue) => repondA(execution, exclue));
}

export type Decompte = { readonly comptees: number; readonly relances: number };

/**
 * Décompte d'un brief et d'une variante, à partir des exécutions réelles (`mode = reel`) seulement. Une exécution
 * arrêtée (aucun programme écrit) ne compte jamais (décision 0093, point 2) ; `EXECUTIONS_EXCLUES` n'a donc plus
 * d'effet sur le total (toute exécution qui répond à une entrée est arrêtée).
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
