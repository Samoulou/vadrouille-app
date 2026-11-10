import type { TripCity } from "@/contracts";
import { estChangementDeVille, texteDeVille, villeDeLaDate } from "@/features/voyage/villes";
import * as messages from "@/i18n/messages";

/**
 * Ville du nom accessible de la pastille d'une journée de changement de ville, dans la rangée des jours de la Journée
 * (« Jour 3, lun., de Rome à Florence », spécification M4 § 7.7) ; rien pour un autre jour ou un voyage à une ville.
 */
export function villeDeLaPastille(cities: readonly TripCity[] | undefined, date: string): { ville?: string } {
  const ville = villeDeLaDate(cities, date);
  return estChangementDeVille(ville) ? { ville: texteDeVille(ville, messages.sejour.journee.changement.pastille) } : {};
}
