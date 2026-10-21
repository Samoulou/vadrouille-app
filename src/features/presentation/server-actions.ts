import type { PreferencePrompt, Result } from "@/contracts";
import { answerPreferencePrompt, completeDeck, decideCard, undoDecision } from "@/server/actions/presentation";

import type { DeckActions, RefusDuTri } from "./actions";

/**
 * Implémentation serveur de `DeckActions` (spécification B10, B10a point 5 ; décision 0112 § 4 point 3) : choisie par
 * `PresentationScreen` quand la page lui passe un état du tri enregistré (`deck` non nul, adaptateur `api`). N'importe de
 * `src/server` que `@/server/actions/presentation`. Crée un `requestId` par geste (idempotence côté serveur) et garde
 * celui de la dernière décision enregistrée, pour « Annuler ». La décision du serveur est déduite de la carte : activité,
 * `like` ou `dislike` ; repas, « Je choisis » → `choose`, « Option suivante » → `nextOption`, « Pas pour moi » sur la
 * dernière option → `dislike` (B10-PO-2 point 1). Une décision ou une réponse non enregistrée n'est jamais avalée : elle
 * rend son refus (`RefusDuTri`) et l'écran le montre (B10-PO-14 ; revue de la PR 621, bloquant 6). Rien n'est écrit
 * dans le navigateur.
 */

/** Refus d'une action du tri : `generation_in_progress` → `recalcul` ; `validation_failed` → `dejaDecidee` ; sinon `echec`. */
function refusDe(resultat: Result<unknown> | null): RefusDuTri {
  if (resultat === null || resultat.ok) return "echec";
  if (resultat.error.code === "generation_in_progress") return "recalcul";
  return resultat.error.code === "validation_failed" ? "dejaDecidee" : "echec";
}

export function createServerDeckActions(tripId: string): DeckActions {
  let derniere: { proposalId: string; requestId: string } | null = null;
  const nouvelId = () => crypto.randomUUID();

  return {
    async decide(input) {
      const decision =
        input.kind === "activity" ? input.decision : input.decision === "like" ? "choose" : input.lastOption ? "dislike" : "nextOption";
      const requestId = nouvelId();
      derniere = null;
      // Échec réseau (action serveur rejetée) : `null`, rendu `echec`.
      const resultat = await decideCard({ tripId, requestId, proposalId: input.proposalId, decision }).catch(() => null);
      if (resultat === null || !resultat.ok) return { prompt: null, refus: refusDe(resultat) };
      derniere = { proposalId: input.proposalId, requestId };
      return { prompt: resultat.value.prompt };
    },
    async undo({ proposalId }) {
      if (derniere?.proposalId !== proposalId) return;
      const decisionRequestId = derniere.requestId;
      derniere = null;
      await undoDecision({ tripId, requestId: nouvelId(), decisionRequestId }).catch(() => null);
    },
    async answerPrompt(prompt: PreferencePrompt, answer) {
      const entree = { tripId, requestId: nouvelId(), prompt, answer: answer.answer, ...(answer.reason ? { reason: answer.reason } : {}) };
      const resultat = await answerPreferencePrompt(entree).catch(() => null);
      if (resultat === null || !resultat.ok) return { next: null, refus: refusDe(resultat) };
      return { next: resultat.value.next };
    },
    async complete() {
      derniere = null;
      await completeDeck({ tripId, requestId: nouvelId() }).catch(() => null);
    },
  };
}
