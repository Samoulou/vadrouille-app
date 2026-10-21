"use server";

import type { CompleteDeckResult, DeckDecisionResult, PreferenceAnswerResult, Result, UndoDecisionResult } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";
import { triEnregistre } from "@/adapters/api-tri-instance";

/**
 * Actions serveur du tri enregistré (écrans 6 et 6b ; spécification B10, B10a points 2 à 4 ; décision 0112 § 2 point 3).
 * Le contexte vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et
 * revalidée par le cadre commun des actions sur un voyage (`src/server/voyages/actions.ts`). Erreurs possibles :
 * `unauthenticated`, `validation_failed`, `not_found`, `generation_in_progress` (`retryable` vrai), `internal`
 * (0112 § 1.6). Seul module de `src/server` que l'écran de présentation importe pour le tri
 * (`src/features/presentation/server-actions.ts`). Les cas d'usage (`src/server/presentation/tri.ts`) sont branchés au
 * démarrage sur `@/adapters/api-tri-instance` (confinement : l'écran n'atteint ni la base ni `src/server/env`) ; non
 * branchés (`mock`, `prototype`), chaque action rend `internal` sans rien lire.
 */

/** `DeckDecision` → `DeckDecisionResult` : une décision sur une carte du tri ouvert, idempotente par `requestId`. */
export async function decideCard(input: unknown): Promise<Result<DeckDecisionResult>> {
  return triEnregistre().decideCard({ contexte: contexteFacultatif }, input);
}

/** `UndoDecisionRequest` → `UndoDecisionResult` : annule la dernière décision du tri ouvert et sa réponse. */
export async function undoDecision(input: unknown): Promise<Result<UndoDecisionResult>> {
  return triEnregistre().undoDecision({ contexte: contexteFacultatif }, input);
}

/** `PreferenceAnswerRequest` → `PreferenceAnswerResult` : réponse à la question ouverte posée par le serveur. */
export async function answerPreferencePrompt(input: unknown): Promise<Result<PreferenceAnswerResult>> {
  return triEnregistre().answerPreferencePrompt({ contexte: contexteFacultatif }, input);
}

/** `CompleteDeckRequest` → `CompleteDeckResult` : clôt le tri ouvert (« Passer », fin du paquet) ; aucun recalcul (B10b). */
export async function completeDeck(input: unknown): Promise<Result<CompleteDeckResult>> {
  return triEnregistre().completeDeck({ contexte: contexteFacultatif }, input);
}
