import "server-only";

import type { LecteurPages } from "@/research/fetch-page";
import type { ClientRechercheWeb } from "@/research/recherche-web";

/**
 * Plafonds de l'agent du mode réel (`p0Run`, décision 0055, section 6 point 5 ; tableau « Plafonds » de la
 * spécification P0 suite 2 : recherches web et pages lues par exécution). Décorateurs posés par l'étape de recherche autour
 * des capacités de la composition : le plafond est vérifié **avant** l'appel, et un dépassement lève `cap_reached`
 * sans appel (même règle que le port de consommation, qui borne le coût). Mode simulé et `scripts/p0` : décorateurs de
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

const plafondValide = (max: number) => {
  if (!Number.isSafeInteger(max) || max < 0) throw new RangeError("plafond de l'agent invalide");
  return max;
};

/** Au plus `max` recherches web ; la `max + 1`-ième lève `cap_reached` sans appel. */
export function bornerRecherche(client: ClientRechercheWeb, max: number): ClientRechercheWeb {
  const plafond = plafondValide(max);
  let faites = 0;
  return {
    async rechercher(requete) {
      if (faites >= plafond) throw new PlafondAgentAtteint();
      faites += 1;
      return client.rechercher(requete);
    },
  };
}

/** Au plus `max` pages lues ; la `max + 1`-ième lève `cap_reached` sans lecture. */
export function bornerLecteur(lecteur: LecteurPages, max: number): LecteurPages {
  const plafond = plafondValide(max);
  let lues = 0;
  return {
    async lire(url, autorisees) {
      if (lues >= plafond) throw new PlafondAgentAtteint();
      lues += 1;
      return lecteur.lire(url, autorisees);
    },
  };
}
