import { expect } from "vitest";

import type { Category, PreferencePrompt, Proposal } from "@/contracts";
import type { DeckActions } from "@/features/presentation/actions";

/**
 * Suite de contrat commune des actions de tri (spécification B10, critère `présentation: même règle en local et sur le
 * serveur` ; décision 0112 § 4 point 4) : la même suite fabriquée de décisions et de réponses, jouée sur
 * `createLocalDeckActions` (`src/features/presentation/actions.test.ts`, `pnpm test`) et sur l'implémentation serveur
 * (`createServerDeckActions` sur les cas d'usage et la base de test, `tests/db/tri-cas-usage.test.ts`, `pnpm test:db`),
 * donne les mêmes questions. Importée par ses deux fichiers d'exécution seulement.
 *
 * Cas : deux refus d'activités `museum` → question `museum` ; « Non » ; un troisième refus `museum` → aucune question ;
 * deux refus `nature` → question `nature`, fermée sans réponse par la décision suivante ; un « J'aime » ; un repas passé
 * (« Option suivante ») puis refusé sur sa dernière option → aucune question. La question de distance n'en fait pas
 * partie : le serveur ne la pose pas avant B10f (B10-PO-16 point 5), la session locale la pose (F6-PO-9).
 */
export type CarteDuContrat = Pick<Proposal, "id" | "kind" | "category">;

export type BancDeckActions = {
  readonly actions: DeckActions;
  /** Cartes du tri, dans l'ordre du paquet : trois activités `museum`, deux `nature`, une `walk`, deux options d'un repas. */
  readonly cartes: {
    readonly musees: readonly [CarteDuContrat, CarteDuContrat, CarteDuContrat];
    readonly natures: readonly [CarteDuContrat, CarteDuContrat];
    readonly balade: CarteDuContrat;
    readonly repas: readonly [CarteDuContrat, CarteDuContrat];
  };
};

const decider = (actions: DeckActions, carte: CarteDuContrat, decision: "like" | "dislike", lastOption = false) =>
  actions.decide({ proposalId: carte.id, kind: carte.kind, category: carte.category, decision, lastOption });

const question = (category: Category): PreferencePrompt => ({ kind: "category", category });

/** Questions rendues par la suite, dans l'ordre des appels (`null` : aucune). */
export async function executerContratDeckActions(banc: BancDeckActions): Promise<(PreferencePrompt | null)[]> {
  const { actions, cartes } = banc;
  const vues: (PreferencePrompt | null)[] = [];
  const noter = async (promesse: Promise<{ prompt: PreferencePrompt | null }>) => {
    vues.push((await promesse).prompt);
  };

  await noter(decider(actions, cartes.musees[0], "dislike"));
  await noter(decider(actions, cartes.musees[1], "dislike"));
  vues.push((await actions.answerPrompt(question("museum"), { answer: "no", reason: "notMyStyle" })).next);
  await noter(decider(actions, cartes.musees[2], "dislike"));
  await noter(decider(actions, cartes.natures[0], "dislike"));
  await noter(decider(actions, cartes.natures[1], "dislike"));
  // Feuille fermée sans réponse : la décision suivante ferme la question (aucune réponse enregistrée).
  await noter(decider(actions, cartes.balade, "like"));
  await noter(decider(actions, cartes.repas[0], "dislike"));
  await noter(decider(actions, cartes.repas[1], "dislike", true));

  expect(vues).toEqual([null, question("museum"), null, null, null, question("nature"), null, null, null]);
  return vues;
}
