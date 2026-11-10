"use server";

import { avisEnregistres } from "@/adapters";
import { fail, type Result, type StopReview } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Action serveur de l'avis rapide (M8a, ticket 1062 ; décision 0160 § 1.5 point 5 ; spécification M8 § 3.2). Le contexte
 * vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et revalidée par le cœur
 * (`src/server/avis/avis.ts`), qui fixe l'ordre des contrôles.
 *
 * `rateStop` (`StopReviewRequest` → `StopReview`, ou `null` quand l'avis est effacé). Erreurs : `unauthenticated`,
 * `validation_failed` (entrée ; étape qui n'est pas à évaluer : `field: "stopId"`), `not_found` (voyage inconnu, d'une
 * autre organisation, non débloqué, personne non propriétaire, avant le dernier jour ou en lecture seule), `rate_limited`
 * (règle `avis`), `internal` ; hors adaptateur `api`, `internal` sans rien lire (sur `mock`, l'écran garde ses avis dans la
 * mémoire de l'onglet).
 */
export async function rateStop(input: unknown): Promise<Result<StopReview | null>> {
  const avis = avisEnregistres();
  return avis === null ? fail("internal") : avis.rateStop(await contexteFacultatif(), input);
}
