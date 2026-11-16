"use server";

import { goutsEnregistres } from "@/adapters";
import { fail, type Result, type RetainedTaste } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Actions serveur des goûts retenus (M8c-1, ticket 1121 ; spécification M8 § 5.2 et § 5.3 ; décision 0160 § 1.5 point 5).
 * Le contexte vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et revalidée
 * par le cœur (`src/server/gouts/gouts.ts`), qui fixe l'ordre des contrôles.
 *
 * - `retainTastes` (`RetainTastesRequest` → goûts nouvellement retenus) : `unauthenticated`, `validation_failed` (entrée ;
 *   clé qui n'est pas un candidat recalculé : `field: "candidateIds"`), `not_found` (voyage inconnu, d'une autre
 *   organisation, non débloqué, personne non propriétaire, avant le dernier jour ou en lecture seule), `rate_limited`
 *   (règle `gouts`), `internal`.
 * - `removeTaste` (`RemoveTasteRequest` → le goût supprimé) et `removeAllTastes` : **jamais refusés par la limite** ;
 *   `not_found` pour un goût absent, d'une autre personne ou d'une autre organisation.
 * - `restoreTaste` (`RestoreTasteRequest`) : « Annuler » un retrait ; `validation_failed` (`field: "taste"`) si le voyage
 *   d'origine n'est pas un voyage de la personne, `rate_limited`.
 *
 * Hors adaptateur `api` : `internal` sans rien lire (sur `mock`, l'écran garde ses goûts dans la mémoire de l'onglet).
 */
export async function retainTastes(input: unknown): Promise<Result<RetainedTaste[]>> {
  const gouts = goutsEnregistres();
  return gouts === null ? fail("internal") : gouts.retainTastes(await contexteFacultatif(), input);
}

export async function removeTaste(input: unknown): Promise<Result<RetainedTaste>> {
  const gouts = goutsEnregistres();
  return gouts === null ? fail("internal") : gouts.removeTaste(await contexteFacultatif(), input);
}

export async function restoreTaste(input: unknown): Promise<Result<void>> {
  const gouts = goutsEnregistres();
  return gouts === null ? fail("internal") : gouts.restoreTaste(await contexteFacultatif(), input);
}

export async function removeAllTastes(input: unknown): Promise<Result<void>> {
  const gouts = goutsEnregistres();
  return gouts === null ? fail("internal") : gouts.removeAllTastes(await contexteFacultatif(), input);
}
