"use server";

import type { ChecklistItem, Result } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";
import { basculerAFaire } from "@/server/voyages/a-faire";

/**
 * Actions serveur de l'écran 11 « Séjour » (spécification B6, B6b point 3 ; décision 0086 § 2.2 point 4). Le contexte
 * vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et revalidée par le
 * cadre commun des actions sur un voyage (`src/server/voyages/actions.ts`).
 *
 * `toggleChecklistItem` (`ChecklistUpdate` → `ChecklistItem`) : état final, idempotent ; erreurs `unauthenticated`,
 * `validation_failed`, `not_found` (voyage ou ligne inconnus, ou d'une autre organisation), `internal`. **Non branchée
 * sur l'écran 11** (B6-PO-14) : B11 la branche avec les verrous et l'annulation.
 */
export async function toggleChecklistItem(input: unknown): Promise<Result<ChecklistItem>> {
  return basculerAFaire({ contexte: contexteFacultatif }, input);
}
