import "server-only";

import type { ClientPlacesMvp, ClientRoutes } from "@/grounding/interfaces";
import { createPlacesClient } from "@/grounding/places-client";
import { createRoutesClient } from "@/grounding/routes-client";
import { horlogeSysteme, type ContexteAppel, type Horloge, type Plafond, type PortConsommation } from "@/server/usage/port";

/**
 * Fabrique commune des clients Google (décision 0100 § 5.2, qui amende 0081 B9-TL-2 point 1) : **seul importateur des
 * modules de capacité Google** (`places-client.ts`, `routes-client.ts`) pour la lecture et, plus tard, pour la composition
 * de la génération (B9c), qui l'importera sans la recopier et y ajoutera les clients de modèles et la recherche web.
 * Importée par `src/server/composition/lecture.ts` seul aujourd'hui (tests de `tests/unit/p0/composition.test.ts` et
 * règle `ligne/relecture-imports`). **Câble seulement** : aucune logique métier, aucune lecture d'environnement
 * ici : la clé est lue par chaque client, à sa construction, par `lireCleGoogle` (`@/server/env/grounding`), donc après la
 * barrière de sortie (`verifierSortie`) ; un refus de la barrière ou une clé absente lève avant toute requête.
 *
 * Chaque client reçoit le port de consommation (registre en mémoire du forfait réservé) et les plafonds du forfait :
 * chaque requête réserve son unité avant l'appel. Le contexte porte la nature `relecture` ou `execution` du forfait.
 */

export type OptionsClientsGoogle = {
  /** Port de consommation de l'opération (registre du forfait réservé). */
  readonly usage: PortConsommation;
  /** Contexte de chaque appel (nature, exécution, périodes), calculé à l'appel. */
  readonly contexte: () => ContexteAppel;
  /** Plafonds des demandes, dérivés du forfait (`plafondsDuForfait`). */
  readonly plafonds: readonly Plafond[];
  readonly horloge?: Horloge;
};

export type ClientsGoogle = {
  readonly places: ClientPlacesMvp;
  readonly routes: ClientRoutes;
};

/**
 * Construit les clients Places et Routes. Lève (erreur fermée du client, code de la barrière ou `missing_key`) si la
 * barrière de sortie est fermée ou si la clé est absente : l'appelant n'a alors réservé ni appelé quoi que ce soit.
 */
export function creerClientsGoogle(options: OptionsClientsGoogle): ClientsGoogle {
  const commun = { usage: options.usage, contexte: options.contexte, plafonds: options.plafonds, horloge: options.horloge ?? horlogeSysteme };
  return { places: createPlacesClient(commun), routes: createRoutesClient(commun) };
}
