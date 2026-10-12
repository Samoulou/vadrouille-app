import type { Category, PreferenceAnswer, PreferencePrompt, Proposal } from "@/contracts";

import {
  distancePromptFor,
  emptySession,
  preferencePromptFor,
  type Decision,
  type PreferenceSession,
} from "./deck";

/**
 * Actions de décision de la présentation (décision 0013, § 3.2). Noms alignés sur `decideCard`,
 * `undoDecision` et `answerPreferencePrompt` de B0 ; chaque méthode renvoie une `Promise` pour que
 * l'implémentation serveur de B10 (Server Actions derrière `src/adapters`) se branche sans changer
 * l'interface.
 */
export interface DeckDecisionInput {
  proposalId: string;
  kind: Proposal["kind"];
  category: Category;
  decision: Decision;
}

export interface DeckActions {
  /** Enregistre la décision et renvoie la question de préférence éventuelle. */
  decide(input: DeckDecisionInput): Promise<{ prompt: PreferencePrompt | null }>;
  /** Annule la dernière décision, y compris la réponse à la question qu'elle a déclenchée. */
  undo(input: { proposalId: string }): Promise<void>;
  /** Enregistre la réponse et renvoie la question suivante éventuelle (distance). */
  answerPrompt(prompt: PreferencePrompt, answer: PreferenceAnswer): Promise<{ next: PreferencePrompt | null }>;
}

/**
 * Implémentation locale, en mémoire (phase 0, sans serveur) : la règle de la question est calculée
 * par `preferencePromptFor`, qui passera dans `src/domain` avec B10. Une seule décision annulable.
 */
export function createLocalDeckActions(): DeckActions & { session(): PreferenceSession } {
  let session = emptySession();
  let lastDecision: { proposalId: string; before: PreferenceSession } | null = null;

  return {
    session: () => session,
    async decide(input) {
      lastDecision = { proposalId: input.proposalId, before: session };
      if (input.decision !== "dislike" || input.kind !== "activity") {
        return { prompt: null };
      }
      session = {
        ...session,
        dislikes: [...session.dislikes, { proposalId: input.proposalId, category: input.category }],
      };
      const prompt = preferencePromptFor(session, input);
      if (prompt?.kind === "category") {
        // Une question par catégorie, quelle que soit la réponse, même sans réponse.
        session = { ...session, askedCategories: [...session.askedCategories, prompt.category] };
      }
      return { prompt };
    },
    async undo({ proposalId }) {
      if (lastDecision?.proposalId === proposalId) {
        session = lastDecision.before;
        lastDecision = null;
      }
    },
    async answerPrompt(prompt, answer) {
      if (prompt.kind === "category" && answer.reason) {
        // La raison s'applique au refus qui a déclenché la question (F6-PO-9).
        const index = session.dislikes.findLastIndex((dislike) => dislike.category === prompt.category);
        if (index !== -1) {
          const dislikes = session.dislikes.map((dislike, i) => (i === index ? { ...dislike, reason: answer.reason } : dislike));
          session = { ...session, dislikes };
        }
      }
      const next = distancePromptFor(session);
      if (next) {
        session = { ...session, distanceAsked: true };
      }
      return { next };
    },
  };
}
