import type { DayLineItemSnapshot, DaySnapshot, StopSnapshot } from "@/contracts";

import { versMinutes } from "@/domain/temps";

/**
 * Forme d'un jour lue par les validateurs et les fonctions calculées : un `DaySnapshot` (sortie d'écriture), ou un
 * `Day` recomposé (B8), qui en est un sur-ensemble. `budgetPerPerson` et `generating` sont des champs calculés du
 * `Day` : absents d'un instantané.
 */
export type JourProgramme = DaySnapshot & { budgetPerPerson?: number; generating?: boolean };

/** Étapes du programme d'un jour (`items` de type `stop`), dans l'ordre de la ligne. */
export function etapesDuJour(jour: Pick<DaySnapshot, "items">): StopSnapshot[] {
  return jour.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));
}

/** Heure de début d'un élément de la ligne, en minutes ; un trajet n'en a pas. */
export function debutDeLigne(item: DayLineItemSnapshot): number | undefined {
  switch (item.type) {
    case "terminus":
      return versMinutes(item.time);
    case "stop":
      return versMinutes(item.stop.start);
    case "free":
      return versMinutes(item.from);
    case "openMeal":
      return versMinutes(item.time);
    case "segment":
      return undefined;
    case "transfer":
      // Changement de ville (décision 0151 § 4) : son heure est le départ (`start`). `voisins` l'arrête avant cet appel.
      return versMinutes(item.start);
  }
}
