"use server";

import { fail, type ChecklistItem, type Result } from "@/contracts";
import { revisionEnregistree } from "@/adapters";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Actions serveur de l'écran 11 « Séjour » (spécification B6, B6b point 3 ; décision 0086 § 2.2 point 4). Le contexte
 * vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et revalidée par le
 * cadre commun des actions sur un voyage (`src/server/voyages/actions.ts`), par l'adaptateur `api` (`RevisionAdapter`).
 *
 * `toggleChecklistItem` (`ChecklistUpdate` → `ChecklistItem`) : état final, idempotent ; erreurs `unauthenticated`,
 * `validation_failed`, `not_found` (voyage ou ligne inconnus, ou d'une autre organisation), `internal` ; hors adaptateur
 * `api`, `internal` sans rien lire (l'écran garde alors son cochage en mémoire). Branchée sur l'écran 11 par M5e
 * (spécification M5 § 7.3 ; `src/features/sejour/revision-serveur.ts`), hors des versions : aucune annulation.
 */
export async function toggleChecklistItem(input: unknown): Promise<Result<ChecklistItem>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.toggleChecklistItem(await contexteFacultatif(), input);
}
