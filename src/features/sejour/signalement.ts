import type { Stop } from "@/contracts";
import type { StopReportReason } from "@/contracts/values";
import { estLieuASoi } from "@/domain/lieu-a-soi";

/**
 * Règles d'écran du signalement d'une erreur (tâche M5c, ticket 904 ; spécification M5 § 5). Le navigateur n'importe pas
 * `src/domain` (décision 0112 § 2) : `etapeSignalableSurFiche` refait `etapeSignalable` de `src/domain/signalement.ts`,
 * équivalence vérifiée par `tests/unit/programme/signalement-regles.test.ts` ; le serveur refait le contrôle
 * (`validation_failed`). Seule exception (M8b, décision 0160 § 1.4 point 2) : le prédicat `estLieuASoi` de
 * `@/domain/lieu-a-soi`, module pur importable par le navigateur, n'est pas recopié.
 */

/** Bouton « Signaler une erreur » : ni engagement, ni lieu à soi ou adresse découverte (un événement n'est pas dans le programme). */
export function etapeSignalableSurFiche(stop: Pick<Stop, "commitment" | "addedBy">): boolean {
  return stop.commitment === undefined && !estLieuASoi(stop);
}

/**
 * Identité de l'étape d'une confirmation : jour, identifiant **et** `placeId`, car les identifiants `j<jour>-<rang>` sont
 * réutilisés d'une version à l'autre (0142 § 5.1) ; une confirmation ne s'affiche jamais pour une autre étape.
 */
export function cleEtapeSignalee(dayIndex: number, stop: Pick<Stop, "id" | "placeId">): string {
  return `${dayIndex}|${stop.id}|${stop.placeId ?? ""}`;
}

/** « Remplacer cette étape » sous la confirmation : motif `closed`, étape non verrouillée, voyage débloqué. */
export function proposeRemplacer(reason: StopReportReason, stop: Pick<Stop, "locked">, tripUnlocked: boolean): boolean {
  return reason === "closed" && !stop.locked && tripUnlocked;
}
