"use server";

import { fail, type ReplacementOffer, type ReplacementWrite, type Result } from "@/contracts";
import { revisionEnregistree } from "@/adapters";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Actions serveur de l'écran 14 « Remplacer une étape » sur l'adaptateur `api` (tâche M1g, ticket 869). Le contexte vient
 * de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et revalidée par le cas
 * d'usage (`src/server/versions/remplacement.ts`, cadre commun des actions sur un voyage). Erreurs : `unauthenticated`,
 * `validation_failed`, `not_found`, `generation_in_progress` (écritures seulement), `internal` ; hors adaptateur `api`,
 * `internal` sans rien lire (l'écran ne les appelle pas : il garde son implémentation en mémoire). Seul module de
 * `src/server` que l'écran 14 importe (`src/features/sejour/revision-serveur.ts`).
 */

/** Proposition de remplacement de l'étape (`tripId`, `stopId`, `reason`, `wish` facultatif, `baseVersion`) ; rien n'est écrit. */
export async function previewReplacement(input: unknown): Promise<Result<ReplacementOffer>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.previewReplacement(await contexteFacultatif(), input);
}

/** Applique la proposition (`tripId`, `requestId`, `stopId`, `proposalId`, `baseVersion`) : nouvelle version. */
export async function applyReplacement(input: unknown): Promise<Result<ReplacementWrite>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.applyReplacement(await contexteFacultatif(), input);
}

/** Annule le remplacement (`tripId`, `requestId`, `version`) : une version de plus, identique à sa version de base. */
export async function undoReplacement(input: unknown): Promise<Result<ReplacementWrite>> {
  const revision = revisionEnregistree();
  return revision === null ? fail("internal") : revision.undoReplacement(await contexteFacultatif(), input);
}
