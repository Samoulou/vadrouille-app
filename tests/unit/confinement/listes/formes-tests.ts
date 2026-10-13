/**
 * Formes nominatives du régime des tests (spécification P0c, section 4), soumises à « ligne inutile ». Propriété du
 * Tech Lead, verdict Sécurité exigé pour toute modification.
 */

export type FormeNominativeTest = {
  readonly fichier: string;
  /**
   * `espion-sans-remplacement` : `vi.spyOn(…, "<valeur>")` sans remplacement ; `stubEnv-table` : `vi.stubEnv(nom, …)`
   * où `nom` est le paramètre d'un `it.each` dont la table littérale vaut exactement `valeur` (noms séparés par `,`).
   */
  readonly forme: "espion-sans-remplacement" | "stubEnv-table";
  readonly valeur: string;
  readonly motif: string;
};

export const FORMES_NOMINATIVES_TESTS = [
  {
    fichier: "src/analytics/events.test.ts",
    forme: "espion-sans-remplacement",
    valeur: "fetch",
    motif: "vérifie qu'aucun appel n'a lieu ; risque accepté par écrit (section 4, forme 1)",
  },
  {
    fichier: "tests/unit/accueil.test.tsx",
    forme: "stubEnv-table",
    valeur: "VERCEL_ENV,VADROUILLE_ENV",
    motif: "section 4, forme 3",
  },
  {
    fichier: "tests/unit/accueil-prototype.test.tsx",
    forme: "stubEnv-table",
    valeur: "VERCEL_ENV,VADROUILLE_ENV",
    motif: "écart : même forme que `accueil.test.tsx`, fichier apparu après `40b6738` (P0b1, PR 208) : ligne ordinaire B, 0040 D4",
  },
] as const satisfies readonly FormeNominativeTest[];
