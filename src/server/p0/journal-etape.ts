import "server-only";

import { errorNameOf, LOG_STEP_FAILURE_CODES, LOG_STEP_PHASES, logEvent, type LogFields } from "@/server/log";

/**
 * Journal fermé de l'arrêt d'une étape de `p0Run` (ticket 493 ; verdict Sécurité S4 attendu). Le code persisté reste
 * réduit par `codePersiste` (S4) ; cette ligne de journal dit seulement **où** et **pourquoi**, par trois valeurs de
 * listes fermées :
 * - `phase` : phase en base de l'étape, ou repère de l'étape finale (`fiches`, `routes`, `moteur`) ;
 * - `errorName` : nom de la classe de l'erreur (`error.name`, jamais son message ni sa pile) ;
 * - `failureCode` : code de l'erreur s'il est dans `LOG_STEP_FAILURE_CODES`, sinon `autre`.
 * Aucun message, aucune donnée Google (ni durée, ni position, ni nom), aucun identifiant de lieu ni d'exécution.
 */

export type PhaseJournal =
  | "recherche"
  | "ancrage"
  | "notation"
  | "planification"
  | "fiches"
  | "routes"
  | "moteur"
  | "raisons"
  | "validation"
  | "ecriture";

/** Phases du type, pour le test d'égalité avec `LOG_STEP_PHASES`. */
export const PHASES_JOURNAL = [
  "recherche",
  "ancrage",
  "notation",
  "planification",
  "fiches",
  "routes",
  "moteur",
  "raisons",
  "validation",
  "ecriture",
] as const satisfies readonly PhaseJournal[];

/** Code fermé d'une erreur : sa propriété `code` si elle est dans la liste fermée, sinon `autre`. Ne lève jamais. */
export function codeFermeDe(erreur: unknown): string {
  try {
    const code = typeof erreur === "object" && erreur !== null ? (erreur as { code?: unknown }).code : undefined;
    return typeof code === "string" && LOG_STEP_FAILURE_CODES.includes(code) ? code : "autre";
  } catch {
    return "autre";
  }
}

/** Champs de `p0.step_failed` pour une erreur reçue dans la phase donnée. */
export function champsEchecEtape(phase: PhaseJournal, erreur: unknown): LogFields {
  const errorName = errorNameOf(erreur);
  return {
    ...(LOG_STEP_PHASES.includes(phase) ? { phase } : {}),
    ...(errorName === undefined ? {} : { errorName }),
    failureCode: codeFermeDe(erreur),
  };
}

/** Écrit `p0.step_failed` (niveau `error`). Ne lève jamais. */
export function journaliserEchecEtape(phase: PhaseJournal, erreur: unknown): void {
  try {
    logEvent("p0.step_failed", champsEchecEtape(phase, erreur), "error");
  } catch {
    // Le journal ne masque jamais l'erreur de l'étape.
  }
}
