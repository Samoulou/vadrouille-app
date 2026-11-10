import "server-only";

import type { AddedBy } from "@/contracts/values";
import { marqueDAjout } from "@/domain/lieu-a-soi";
import { localDateAt } from "@/features/voyage/today";

/**
 * Marque d'un ajout à l'instant `maintenant` (tâche M8b, ticket 1111 ; décision 0160 § 1.4 point 4 et § 2.6 ;
 * spécification M8 § 4.1) : date locale de la destination (`timeZone` du voyage, `trips.time_zone`, jamais tirée d'une
 * réponse Google ni de l'appareil), passée à la règle pure `marqueDAjout`. **Calcul unique**, lu par l'application d'un
 * ajout sur `api` (`./ajout.ts`, horloge du serveur) et par l'ajout simulé de `mock` (`src/adapters/mock-lieux.ts`, horloge
 * de la portée) : la marque est la même sur les deux. Aucune valeur du client n'entre ici (S6). Module pur : l'instant
 * est reçu.
 */
export function marqueAuMoment(voyage: { readonly start: string; readonly end: string; readonly timeZone: string }, jour: number, maintenant: number): AddedBy {
  return marqueDAjout(voyage, jour, localDateAt(maintenant, voyage.timeZone));
}
