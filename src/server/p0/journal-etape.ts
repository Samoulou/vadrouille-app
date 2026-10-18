import "server-only";

import { errorNameOf, LOG_STEP_FAILURE_CODES, LOG_STEP_PHASES, logEvent, type LogFields, type LogLevel } from "@/server/log";

/**
 * Journal de l'arrêt d'une étape de `p0Run` (ticket 493, décision 0090 ; verdict Sécurité S4 : favorable). Le code
 * persisté reste réduit par `codePersiste` (S4) ; cette ligne de journal dit seulement **où** et **pourquoi** :
 * - `phase` : phase en base de l'étape, ou repère de l'étape finale (`fiches`, `routes`, `moteur`), liste fermée
 *   `LOG_STEP_PHASES` ;
 * - `errorName` : nom de classe de l'erreur (`error.name`, jamais son message ni sa pile), filtré par `NOM_ERREUR` de
 *   `src/server/log.ts` (lettres seulement, 40 au plus ; absent sinon). Le nom vient d'une classe de notre code ou du
 *   moteur JavaScript, pas d'une réponse Google ; sans espace ni chiffre, il ne peut porter ni identifiant de lieu, ni
 *   durée, ni position ;
 * - `failureCode` : code de l'erreur s'il est dans la liste fermée `LOG_STEP_FAILURE_CODES`, sinon `autre`.
 * Aucun message, aucune donnée Google (ni durée, ni position, ni nom), aucun identifiant de lieu ni d'exécution.
 */

/** Phase du journal : dérivée de la liste unique `LOG_STEP_PHASES` (0090 § 3 point 4). */
export type PhaseJournal = (typeof LOG_STEP_PHASES)[number];

/**
 * Arrêts attendus par plafond (0090 § 3 point 7) : journalisés en `warn`, tout autre code en `error`. Pris dans
 * `LOG_STEP_FAILURE_CODES` (vérifié par le test du journal des étapes).
 */
export const CODES_ARRET_PLAFOND: readonly string[] = ["cap_reached", "envelope_reached", "daily_quota_insufficient"];
const PLAFONDS: ReadonlySet<string> = new Set(CODES_ARRET_PLAFOND);

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
    ...((LOG_STEP_PHASES as readonly string[]).includes(phase) ? { phase } : {}),
    ...(errorName === undefined ? {} : { errorName }),
    failureCode: codeFermeDe(erreur),
  };
}

/** Niveau de `p0.step_failed` selon le code fermé : `warn` pour un arrêt attendu par plafond, `error` sinon. */
export function niveauEchecEtape(failureCode: string): LogLevel {
  return PLAFONDS.has(failureCode) ? "warn" : "error";
}

/** Écrit `p0.step_failed` (niveau selon `niveauEchecEtape`). Ne lève jamais. */
export function journaliserEchecEtape(phase: PhaseJournal, erreur: unknown): void {
  try {
    const champs = champsEchecEtape(phase, erreur);
    logEvent("p0.step_failed", champs, niveauEchecEtape(champs.failureCode ?? "autre"));
  } catch {
    // Le journal ne masque jamais l'erreur de l'étape.
  }
}
