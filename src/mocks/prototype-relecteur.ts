import type { PaireRelecture, RaisonRelecture, RelecteurTrajets, ReponseRelecture } from "@/adapters/prototype";

/**
 * Relecteur **simulé** des durées de trajet du prototype (spécification P0, P0b1 ; décision 0032 § A4.1) : aucun
 * appel réseau, aucune clé, aucune donnée Google. Il rend des durées sentinelles, sait simuler un refus (quota
 * atteint, service indisponible) et compte ses appels, pour l'e2e « prototype sans cache » (décision 0032
 * § A6.6). Règle F1 : importé par `src/adapters` et les tests seulement.
 */

/** Durée sentinelle par défaut, en minutes, de chaque trajet relu (sous le seuil de `detour`, 20 min). */
export const DUREE_SENTINELLE_MINUTES = 13;

export interface RelecteurSimule extends RelecteurTrajets {
  /** Nombre de relectures demandées depuis la création (une par journée relue). */
  appels(): number;
}

export interface RelecteurSimuleOptions {
  /** Durée rendue pour chaque paire ; par défaut `DUREE_SENTINELLE_MINUTES`. */
  minutes?: (paire: PaireRelecture) => number;
  /** Refus simulé : chaque relecture échoue avec cette raison. */
  refus?: RaisonRelecture;
}

export function createRelecteurSimule({ minutes = () => DUREE_SENTINELLE_MINUTES, refus }: RelecteurSimuleOptions = {}): RelecteurSimule {
  let appels = 0;
  return {
    async relireJournee(paires): Promise<ReponseRelecture> {
      appels += 1;
      if (refus) return { ok: false, raison: refus };
      return { ok: true, minutes: paires.map((paire) => minutes(paire)) };
    },
    appels: () => appels,
  };
}
