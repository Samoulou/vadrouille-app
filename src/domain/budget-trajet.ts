import type { Pace } from "@/contracts";

import type { ConfigurationMoteur } from "@/domain/configuration";
import { lire } from "@/domain/tables";

/**
 * Budget de trajet du jour (PO-1, B5-PO-2, B5-PO-3 ; décision 0045 § 10). Le budget n'est pas une contrainte dure :
 * un dépassement n'est pas une violation (B5-PO-2). La réduction porte sur tous les jours du voyage et n'est
 * appliquée qu'une fois : le moteur reçoit l'état « déjà réduit » en entrée (instantané de base) et ne le stocke pas.
 */

/** Réduction d'un quart : plus grand multiple de 5 qui ne dépasse pas les trois quarts (60 → 45, 90 → 65, 150 → 110). */
export function reduireBudget(minutes: number): number {
  return Math.floor((minutes * 3) / 4 / 5) * 5;
}

/** Budget du jour selon le rythme, lu dans la configuration, réduit une seule fois si le voyage l'est déjà. */
export function budgetTrajetDuJour(pace: Pace, configuration: ConfigurationMoteur, reduit: boolean): number {
  const base = lire(configuration.budgetTrajetParRythme, pace);
  return reduit ? reduireBudget(base) : base;
}

/** Budgets de tous les jours du voyage (B5-PO-3 : la réduction porte sur tous les jours). */
export function budgetsDuVoyage(
  nombreDeJours: number,
  pace: Pace,
  configuration: ConfigurationMoteur,
  reduit: boolean,
): number[] {
  return Array.from({ length: nombreDeJours }, () => budgetTrajetDuJour(pace, configuration, reduit));
}

/**
 * Demande de réduction : renvoie le nouvel état « réduit », ou `sans_effet` si le voyage l'est déjà (une seconde
 * réponse oui ne réduit pas une seconde fois ; 0045 § 10.2, code `no_effect` de B5c).
 */
export function demanderReduction(dejaReduit: boolean): { reduit: true } | "sans_effet" {
  return dejaReduit ? "sans_effet" : { reduit: true };
}
