import { fail, type CompleteDeckResult, type DeckDecisionResult, type PreferenceAnswerResult, type Result, type UndoDecisionResult } from "@/contracts";

import type { AdapterContext } from "./types";

/**
 * Tri enregistré sur l'adaptateur `api` (spécification B10, B10a points 2 à 4 ; décision 0112 § 2 point 3 ; même modèle que
 * `api-instance.ts` et `api-creation-instance.ts`, décision 0108).
 *
 * **Branchement au démarrage** : ce module n'importe rien de `src/server` (ni les cas d'usage de `src/server/presentation/`,
 * ni `withOrg`, ni la base). Le régime de confinement l'exige : `src/server/actions/presentation.ts` est importé par
 * l'écran (`src/features/presentation/server-actions.ts`), et aucun fichier de `src/app`, `src/features` ou
 * `src/components` ne doit atteindre `src/server/env`, même par un `import()` (test « p0: clé côté serveur seulement »).
 * `src/instrumentation.ts` branche, quand `DATA_ADAPTER` vaut `api`, les quatre cas d'usage de
 * `src/server/presentation/tri.ts`.
 *
 * Non branché (tests, `next build`, `mock`, `prototype`, autre runtime) : chaque action rend `internal` sans rien lire ni
 * écrire (échec fermé). Sur `mock` et `prototype`, l'écran ne les appelle jamais (`getDeckSession` rend `null`).
 *
 * Garde-fou : un second branchement lève `TriDejaBrancheError`, et hors de `tests/` seuls ce module et
 * `src/instrumentation.ts` nomment `brancherTriEnregistre` (`tests/unit/auth/points-injection.test.ts`).
 */

/** Dépendances d'un cas d'usage : le contexte **de la session**, jamais une valeur de l'entrée. */
export type DependancesTri = { readonly contexte: () => Promise<AdapterContext | null> };

type CasDUsage<T> = (dependances: DependancesTri, entree: unknown) => Promise<Result<T>>;

/** Les quatre cas d'usage du tri (`src/server/presentation/tri.ts`). */
export type TriEnregistre = {
  readonly decideCard: CasDUsage<DeckDecisionResult>;
  readonly undoDecision: CasDUsage<UndoDecisionResult>;
  readonly answerPreferencePrompt: CasDUsage<PreferenceAnswerResult>;
  readonly completeDeck: CasDUsage<CompleteDeckResult>;
};

// Sur `globalThis`, comme `api-instance.ts` : Next.js charge une copie du module par route.
const TRI_KEY = Symbol.for("vadrouille.tri-enregistre");
const holder = globalThis as typeof globalThis & { [TRI_KEY]?: TriEnregistre };

/** Second branchement refusé ; ne porte aucune valeur. */
export class TriDejaBrancheError extends Error {
  override name = "TriDejaBrancheError";

  constructor() {
    super("Tri enregistré déjà branché.");
  }
}

/** Branche les cas d'usage du tri (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherTriEnregistre(tri: TriEnregistre): void {
  if (holder[TRI_KEY] !== undefined) throw new TriDejaBrancheError();
  holder[TRI_KEY] = tri;
}

/** Tests seulement : retire les cas d'usage branchés. */
export function debrancherTriEnregistrePourTests(): void {
  delete holder[TRI_KEY];
}

const nonBranche = async (): Promise<Result<never>> => fail("internal");

const NON_BRANCHE: TriEnregistre = { decideCard: nonBranche, undoDecision: nonBranche, answerPreferencePrompt: nonBranche, completeDeck: nonBranche };

/** Cas d'usage du tri d'une requête : ceux branchés au démarrage, sinon un refus `internal` sans lecture. */
export function triEnregistre(): TriEnregistre {
  return holder[TRI_KEY] ?? NON_BRANCHE;
}
