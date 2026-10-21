import type { Category, PreferenceAnswer, PreferencePrompt, Proposal } from "@/contracts";
import { questionApres, questionDeDistance, type SignalLu } from "@/domain/preferences";

import { emptySession, type Decision, type PreferenceSession } from "./deck";

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
  /**
   * Repas : la carte est la dernière option de son créneau (« Pas pour moi » plutôt qu'« Option suivante », F6-PO-7).
   * Lu par l'implémentation serveur pour choisir `dislike` ou `nextOption` (B10-PO-2 point 1) ; ignoré en local.
   */
  lastOption?: boolean;
}

export interface DeckActions {
  /** Enregistre la décision et renvoie la question de préférence éventuelle. */
  decide(input: DeckDecisionInput): Promise<{ prompt: PreferencePrompt | null }>;
  /** Annule la dernière décision, y compris la réponse à la question qu'elle a déclenchée. */
  undo(input: { proposalId: string }): Promise<void>;
  /** Enregistre la réponse et renvoie la question suivante éventuelle (distance). */
  answerPrompt(prompt: PreferencePrompt, answer: PreferenceAnswer): Promise<{ next: PreferencePrompt | null }>;
  /**
   * Clôt le tri (« Passer » ou fin du paquet, B10-PO-4 point 3). Absente en local : la session en mémoire n'a pas de
   * tri à clore (F6-PO-15) ; l'implémentation serveur appelle `completeDeck` (B10a, décision 0112 § 1.4).
   */
  complete?(): Promise<void>;
}

/** Signaux de la session locale, sous la forme que lisent les règles de `@/domain/preferences`. */
function signauxDe(session: PreferenceSession): SignalLu[] {
  return session.dislikes.map((dislike) => ({
    signal: "dislike",
    kind: "activity",
    category: dislike.category,
    origin: "gesture",
    status: "confirmed",
    proposalId: dislike.proposalId,
  }));
}

/** Questions déjà posées dans la session locale. */
function questionsDe(session: PreferenceSession): PreferencePrompt[] {
  return [
    ...session.askedCategories.map((category): PreferencePrompt => ({ kind: "category", category })),
    ...(session.distanceAsked ? [{ kind: "distance" } as const] : []),
  ];
}

/**
 * Implémentation locale, en mémoire (`mock`, `prototype` : session de F6, B10-PO-18) : la règle de la question est
 * celle de `@/domain/preferences` (`questionApres`, `questionDeDistance`), la même que le serveur (décision 0112 § 2).
 * Une seule décision annulable.
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
      const signaux = signauxDe(session);
      const decision = signaux[signaux.length - 1];
      const prompt = decision === undefined ? null : questionApres(signaux, questionsDe(session), decision);
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
      const next = questionDeDistance(
        session.dislikes.map((dislike) => dislike.reason),
        questionsDe(session),
      );
      if (next) {
        session = { ...session, distanceAsked: true };
      }
      return { next };
    },
  };
}
