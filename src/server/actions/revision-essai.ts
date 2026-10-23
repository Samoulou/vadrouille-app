"use server";

import { isPrototypeAdapter, reviserProgrammeEssai } from "@/adapters";
import { fail, ok, TrialRevisionRequestSchema, TrialRevisionResultSchema, type Result, type TrialRevisionResult } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";

import { parseInput } from "../parse-input";

/**
 * « Pas pour moi » change le programme (spécification E2E-essai, lot 4 ; décision 0126) : action de la fin du tri d'un
 * voyage d'essai. Fermée hors de l'adaptateur `prototype` (`not_found`, avant toute lecture de l'entrée). Entrée revalidée
 * par `TrialRevisionRequestSchema` (strict) ; contexte de la requête (organisation de l'essai), jamais de l'entrée ; la
 * révision passe par la même garde que le lancement (code d'accès, forfaits, verrou S8). Rend un statut fermé seulement.
 * Aucun journal : ni choix ni identifiant.
 */
export async function reviserVoyageEssai(input: unknown): Promise<Result<TrialRevisionResult>> {
  if (!isPrototypeAdapter()) return fail("not_found");
  const parsed = parseInput(TrialRevisionRequestSchema, input);
  if (!parsed.ok) return parsed;
  let resultat: TrialRevisionResult;
  try {
    const ctx = await contexteFacultatif();
    if (ctx === null) return fail("provider_error");
    resultat = await reviserProgrammeEssai(ctx, parsed.value);
  } catch {
    return fail("provider_error");
  }
  const sortie = TrialRevisionResultSchema.safeParse(resultat);
  return sortie.success ? ok(sortie.data) : fail("provider_error");
}
