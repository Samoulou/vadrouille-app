import type { TripCity } from "@/contracts";
import { villesDeLaDate, type VilleDeLaDate } from "@/domain/villes-du-voyage";
import { format } from "@/i18n";
import { accessUntil } from "@/lib/dates";

/**
 * Villes affichées par les écrans d'un voyage à plusieurs villes (spécification M4 § 7 ; décision 0148 § 6). Seule lecture
 * de `Trip.cities` côté écrans : la ville d'un jour vient de `villesDeLaDate` (`src/domain/villes-du-voyage.ts`), jamais
 * d'un second calcul. `Trip.cities` est absent pour une seule ville : toutes ces fonctions rendent alors `undefined` ou une
 * liste vide, et les écrans à une ville ne changent pas (critère 25).
 */

/** Voyage à plusieurs villes : `Trip.cities` présent avec 2 villes au moins (forme du contrat). */
export function aPlusieursVilles(cities: readonly TripCity[] | undefined): cities is readonly TripCity[] {
  return cities !== undefined && cities.length >= 2;
}

/** Ville d'une date, seulement pour un voyage à plusieurs villes ; `undefined` sinon ou hors des plages. */
export function villeDeLaDate(cities: readonly TripCity[] | undefined, date: string | undefined): VilleDeLaDate | undefined {
  return aPlusieursVilles(cities) && date !== undefined ? villesDeLaDate(cities, date) : undefined;
}

/** Date du jour `index` (1 = J1) d'un voyage qui commence le `start` de sa première ville. */
export function dateDuJour(cities: readonly TripCity[], index: number): string | undefined {
  const premiere = cities[0];
  return premiere === undefined ? undefined : accessUntil(premiere.start, index - 1);
}

/**
 * Texte de la ville d'un jour : le nom pour un jour ordinaire, le modèle `changement` (« De {de} à {vers} », ou « de {de}
 * à {vers} » dans un nom accessible) pour une journée de changement de ville.
 */
export function texteDeVille(ville: VilleDeLaDate, changement: string): string {
  return "ville" in ville ? ville.ville : format(changement, { de: ville.de, vers: ville.vers });
}

/** Journée de changement de ville (`{ de, vers }`). */
export function estChangementDeVille(ville: VilleDeLaDate | undefined): ville is { readonly de: string; readonly vers: string } {
  return ville !== undefined && "de" in ville;
}
