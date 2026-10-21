import "server-only";

import { MAX_REPRISES_PERSONNE } from "@/server/config/generation";
import { logEvent } from "@/server/log";

import { estBloquee, type EchecComplet } from "./voyage-complet";

/**
 * Écrivain unique de `generation.full_stuck` (spécification B9, B9d point 7, B9-PO-17 points 3 et 4 ; décision 0087 § 1.4
 * point 2). Appelé **seulement** par l'appelant dont l'écriture conditionnelle a passé la ligne `full` en `failed` (fin d'une
 * étape en échec, clôture d'une erreur inattendue, expiration `step_expired`), sur la ligne rendue par `RETURNING`, **après**
 * la validation de sa transaction : deux écrivains concurrents, un seul touche la ligne, un seul événement. Rend vrai si
 * l'événement a été écrit.
 */
export function signalerSiBloquee(organizationId: string, ligne: EchecComplet, maximum: number = MAX_REPRISES_PERSONNE): boolean {
  if (!estBloquee({ phase: "failed", stopReason: ligne.stopReason, reprisesPersonne: ligne.reprisesPersonne, reprisesStudio: ligne.reprisesStudio }, maximum)) return false;
  logEvent(
    "generation.full_stuck",
    { tripId: ligne.tripId, organizationId, generationRunId: ligne.id, ...(ligne.stopReason === null ? {} : { stopReason: ligne.stopReason }) },
    "warn",
  );
  return true;
}
