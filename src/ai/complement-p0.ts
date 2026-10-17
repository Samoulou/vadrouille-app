import "server-only";

/**
 * Récit et logements du brief de P0 (décision 0077 § 1 point 5 ; B7-PO-1 : envoyés **pour P0 seulement**, jusqu'à la
 * fin des exécutions de G0, pour que ses mesures restent comparables). Type seul.
 *
 * - Jamais un champ d'`EntreeModeles`, de `CandidatPourModele` ni d'une entrée de `creerCoucheIa` : c'est un argument
 *   **distinct et facultatif** des seuls constructeurs de `src/ai/requetes.ts` qui l'utilisent pour P0
 *   (`briefPourModele`, `briefPourRecherche` et leurs appelants).
 * - Construit par `src/server/p0/vers-couche-ia.ts` seul ; transmis seulement par les appels directs de `pnpm p0`
 *   (`scripts/p0`) et de `p0Run` (`src/workflows/p0-run.ts`, `src/server/composition/p0-reel.ts`).
 * - Importable seulement depuis `src/ai/requetes.ts`, `src/server/p0/**`, `scripts/p0/**`, `src/workflows/p0-run.ts`,
 *   `src/server/composition/p0-reel.ts` et les tests (règle ESLint de B7a, `tests/unit/lint/ia-recherche-lint.test.ts`).
 */
export type ComplementP0 = {
  /** Récit libre du brief de P0 (Q197), absent si le brief n'en a pas. */
  readonly recit?: string;
  /** Textes des logements du brief de P0, dans l'ordre du brief. */
  readonly logements: readonly string[];
};
