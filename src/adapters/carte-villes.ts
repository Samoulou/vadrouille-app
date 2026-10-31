import type { DayMap, Trip } from "@/contracts";
import { CARTE_VILLES } from "@/mocks/carte-villes";

/**
 * Jeux simulés de la carte à plusieurs villes (décision 0150, critère 19 de M4-suite), lus par la seule page de
 * développement `/dev/carte/villes/[jeu]` (carte simulée) : jamais par une route produit, ni par l'adaptateur `mock`.
 * `null` pour un jeu inconnu.
 */
export function jeuCarteVilles(jeu: string): { trip: Trip; maps: DayMap[] } | null {
  return Object.hasOwn(CARTE_VILLES, jeu) ? CARTE_VILLES[jeu]! : null;
}
