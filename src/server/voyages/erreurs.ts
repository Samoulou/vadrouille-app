import "server-only";

import { logEvent } from "@/server/log";

/**
 * Erreur fermée de la lecture des voyages (spécification B6, B6a point 10 et B6-PO-10 ; décision 0086 § 4 point 2) :
 * propre à la lecture, ce n'est **pas** une `ApiError` (les méthodes de `TripAdapter` ne rendent pas de `Result`).
 * Son message ne contient que la raison, jamais un identifiant ni une donnée. L'adaptateur `api` la laisse remonter ;
 * une page la reçoit par la limite d'erreur existante (`src/app/error.tsx`, écran 18, sans message ni pile affichés).
 */

/** Raisons de la lecture (liste fermée ; copie dans `LOG_READ_REASONS` de `src/server/log.ts`, égalité testée). */
export const RAISONS_LECTURE = [
  "time_zone_missing",
  "snapshot_invalid",
  "checklist_orphan",
  "proposal_invalid",
  "proposal_day_missing",
  "stay_missing",
  "mobility_invalid",
  "travel_unknown",
  "output_invalid",
  "quota_reached",
  "unavailable",
] as const;
export type RaisonLecture = (typeof RAISONS_LECTURE)[number];

export class LectureVoyageError extends Error {
  override name = "LectureVoyageError";

  constructor(readonly reason: RaisonLecture) {
    super(reason);
  }
}

/** Identifiants internes d'un échec (jamais un nom, un instantané, un `placeId`, une coordonnée ni une durée). */
export type ContexteEchec = { readonly tripId?: string; readonly version?: number; readonly dayIndex?: number };

/**
 * Journalise puis rend l'erreur fermée. Refus du port (`quota_reached`, `unavailable`) : `voyages.relecture_refused`,
 * une fois par lecture, par le cas d'usage seul (0086 § 4 point 2 (b)) ; toute autre raison, et `unavailable` d'une
 * erreur de la base (`origine: "base"`, revue du head 7402324, mineur 8) : `voyages.read_failed`.
 */
export function echec(reason: RaisonLecture, contexte: ContexteEchec = {}, origine: "port" | "base" = "port"): LectureVoyageError {
  const refus = origine === "port" && (reason === "quota_reached" || reason === "unavailable");
  logEvent(refus ? "voyages.relecture_refused" : "voyages.read_failed", { reason, ...contexte }, refus ? "warn" : "error");
  return new LectureVoyageError(reason);
}
