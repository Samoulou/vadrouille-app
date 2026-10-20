import "server-only";

/**
 * Code d'arrêt de l'agent du mode réel (`p0Run`) : l'échéance de l'étape ne laisse plus le temps d'une lecture de page
 * ou d'un appel (décision 0075). Depuis la décision 0102 (tâche A2 de 0093, point 5), l'agent n'a plus de plafond de
 * recherches web ni de pages lues : la recherche reste bornée par `toursMax` et `totalCandidats` (`recherche*.json`), par le
 * coût des modèles (registre, avant l'appel) et par l'échéance de l'étape. Mode simulé et `scripts/p0` : décorateurs de
 * `scripts/p0/plafonds.ts`, inchangés.
 */

export const CODE_PLAFOND_AGENT = "cap_reached";

export class PlafondAgentAtteint extends Error {
  readonly code = CODE_PLAFOND_AGENT;
  constructor() {
    super(CODE_PLAFOND_AGENT);
    this.name = "PlafondAgentAtteint";
  }
}
