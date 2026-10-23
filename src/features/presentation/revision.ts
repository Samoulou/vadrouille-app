import type { Result, TrialRevisionRequest, TrialRevisionResult } from "@/contracts";
import { reviserVoyageEssai } from "@/server/actions/revision-essai";

/**
 * Révision d'un voyage d'essai à la fin du tri (spécification E2E-essai, lot 4 ; décision 0126) : seul pont de l'écran
 * de présentation vers l'action `reviserVoyageEssai`. Injectable dans `PresentationScreen` (tests).
 */
export type DemanderRevision = (demande: TrialRevisionRequest) => Promise<Result<TrialRevisionResult>>;

export const demanderRevision: DemanderRevision = (demande) => reviserVoyageEssai(demande);

/** Choix du tri en mémoire retenus pour la révision : étapes « Pas pour moi » et « J'aime », sans doublon, dans l'ordre. */
export function choixDuTri(decisions: readonly { readonly proposalId: string; readonly decision: "like" | "dislike" }[]): {
  notForMe: string[];
  liked: string[];
} {
  // La dernière décision d'une carte l'emporte (une carte n'est décidée qu'une fois, sauf annulation).
  const derniere = new Map<string, "like" | "dislike">();
  for (const { proposalId, decision } of decisions) derniere.set(proposalId, decision);
  const notForMe: string[] = [];
  const liked: string[] = [];
  for (const [id, decision] of derniere) (decision === "dislike" ? notForMe : liked).push(id);
  return { notForMe, liked };
}
