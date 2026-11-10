import type { PreventeProvenance } from "@/contracts/prevente-mesure";

/**
 * Mise en œuvre branchée de la mesure de la prévente (spécification `specs/C2-prevente-mesure.md`, § 2.2 point 6 et
 * § 6.2 ; tâche C2b, ticket 1130 ; même modèle que `api-share-instance.ts`, décisions 0101 § 1 et 0108). Forme
 * confirmée par la décision 0175 (§ 4 point 1).
 *
 * **Branchement au démarrage** : ce module n'importe rien de `src/server/prevente` (base), de `src/server/rate-limit` ni
 * de `src/server/env`. Le régime de confinement l'exige : `@/adapters` ne doit atteindre statiquement ni `db/` ni
 * `src/server/env`. `src/instrumentation.ts` branche, quel que soit l'adaptateur de données, le compteur Postgres
 * (`visitesPrevente`, `src/server/prevente/visites.ts`) et le prédicat « limiteur configuré » (`limiteurConfigure`,
 * `src/server/rate-limit.ts`). Rien n'est lu ni connecté au branchement.
 *
 * Non branchée (tests, `next build`, autre runtime) : le compteur et le questionnaire sont tenus pour indisponibles
 * (échec fermé : rien n'est compté, aucun lien vers le questionnaire) et la page de prévente s'affiche comme sans base.
 *
 * Garde-fou : un second branchement lève `MesurePreventeDejaBrancheeError`, et hors de `tests/` seuls ce module, ses
 * tests colocalisés et `src/instrumentation.ts` nomment `brancherMesurePrevente`
 * (`tests/unit/auth/points-injection.test.ts`).
 */

/** Port de la mesure : une mise en œuvre Postgres (`src/server/prevente/visites.ts`) et une en mémoire (tests). */
export type MesurePrevente = {
  /** Vrai si une écriture peut être tentée. N'ouvre aucune connexion, ne journalise rien. */
  readonly compteurDisponible: () => boolean;
  /** + 1 pour le jour UTC et la provenance. Lève en cas d'échec : l'appelant avale l'erreur. */
  readonly compterVisite: (src: PreventeProvenance) => Promise<void>;
  /** Vrai si les variables que le limiteur exige à l'usage sont là. Ne lève pas, ne lit que la configuration. */
  readonly limiteurConfigure: () => boolean;
  /** Une visite n'a pas pu être écrite : journalise le seul nom de l'erreur (`src/server/prevente/journal.ts`). */
  readonly visitePerdue: (error: unknown) => void;
};

// Sur `globalThis`, comme `api-instance.ts` : Next.js charge une copie du module par route.
const MESURE_KEY = Symbol.for("vadrouille.prevente-mesure");
const holder = globalThis as typeof globalThis & { [MESURE_KEY]?: MesurePrevente };

/** Second branchement refusé ; ne porte aucune valeur. */
export class MesurePreventeDejaBrancheeError extends Error {
  override name = "MesurePreventeDejaBrancheeError";

  constructor() {
    super("Mesure de la prévente déjà branchée.");
  }
}

/** Branche la mise en œuvre de la mesure (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherMesurePrevente(mesure: MesurePrevente): void {
  if (holder[MESURE_KEY] !== undefined) throw new MesurePreventeDejaBrancheeError();
  holder[MESURE_KEY] = mesure;
}

/** Tests seulement : retire la mise en œuvre branchée. */
export function debrancherMesurePreventePourTests(): void {
  delete holder[MESURE_KEY];
}

/** Mise en œuvre branchée, ou `undefined` : rien n'est alors disponible. */
export function mesurePreventeBranchee(): MesurePrevente | undefined {
  return holder[MESURE_KEY];
}
