import "server-only";

import { erreurGoogleDe } from "@/grounding/enveloppe-google";
import type { ClientPlacesMvp, ClientRoutes, ClientVilles, OptionsFicheVille } from "@/grounding/interfaces";
import { COUT_ESTIME_MICROS, createPlacesClient, SKU_DETAILS, SKU_IDENTIFIANT, SKU_POSITION, SKU_TEXT_SEARCH } from "@/grounding/places-client";
import { COUT_ELEMENT_MICROS, createRoutesClient, SKU_MATRICE } from "@/grounding/routes-client";
import { avecReservation, DELAI_REQUETE_MS, demandeDe, horlogeSysteme, type AppelFacture, type ContexteAppel, type Horloge, type Plafond, type PortConsommation } from "@/server/usage/port";

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

/**
 * Client de la recherche de ville de l'écran 1 (demande de Samuel du 23 octobre 2026 ; décision 0141 § 6.1) : les deux
 * seules méthodes `suggererVilles` et `ficheVille` du client Places réel, pour les terminaux `villes.ts` (site d'essai)
 * et `villes-api.ts` (`api`) seuls. Même port, mêmes plafonds, même barrière de sortie et même clé que les autres
 * clients ; lève de même avant toute requête. `fiche.position: false` (`api`, 0141 § 6.3 point 3) : chaque fiche part au
 * masque `id,addressComponents`, sans position.
 */
export function creerClientVilles(options: OptionsClientsGoogle, fiche: OptionsFicheVille = {}): ClientVilles {
  const places = createPlacesClient({ usage: options.usage, contexte: options.contexte, plafonds: options.plafonds, horloge: options.horloge ?? horlogeSysteme });
  return {
    suggererVilles: (saisie, session) => places.suggererVilles(saisie, session),
    ficheVille: (placeId, session) => places.ficheVille(placeId, session, fiche),
  };
}

/**
 * Enveloppe de réservation pour des clients Google **injectés** (doubles de la variante simulée de la génération, B9c ;
 * revue de la PR #563, bloquant 3) : chaque requête réserve son unité sur le même port, avec **les mêmes SKU, méthodes et
 * coûts estimés que les clients réels**, qui sont importés des modules de capacité et jamais recopiés (le test
 * `composition: l'enveloppe des doubles réserve comme les clients réels` en vérifie l'égalité). Un refus du port ou du
 * registre lève l'erreur fermée du client réel (`erreurGoogleDe`), sans appeler le double. Ne lit ni environnement ni clé.
 */
export function envelopperClientsGoogle(bases: ClientsGoogle, options: OptionsClientsGoogle): ClientsGoogle {
  const horloge = options.horloge ?? horlogeSysteme;
  const appeler = async <T>(delai: number, appel: AppelFacture, operation: () => Promise<T>): Promise<T> => {
    const issue = await avecReservation({ port: options.usage, horloge }, demandeDe(options.contexte(), appel, options.plafonds), delai, async (_signal, appele) => {
      appele();
      return { valeur: await operation(), coutReelMicros: null };
    });
    if (issue.ok) return issue.valeur;
    throw erreurGoogleDe(issue);
  };
  const fiche = (sku: string, cout: number): AppelFacture => ({ fournisseur: "google", methode: "places_details", sku, unites: { requetes: 1, elements: 0 }, coutEstimeMicros: cout });
  const places: ClientPlacesMvp = {
    textSearch: (requete) =>
      appeler(
        DELAI_REQUETE_MS.places,
        { fournisseur: "google", methode: "places_text_search", sku: SKU_TEXT_SEARCH, unites: { requetes: 1, elements: 0 }, coutEstimeMicros: COUT_ESTIME_MICROS.textSearch },
        () => bases.places.textSearch(requete),
      ),
    details: (placeId) => appeler(DELAI_REQUETE_MS.places, fiche(SKU_DETAILS, COUT_ESTIME_MICROS.details), () => bases.places.details(placeId)),
    position: (placeId) => appeler(DELAI_REQUETE_MS.places, fiche(SKU_POSITION, COUT_ESTIME_MICROS.position), () => bases.places.position(placeId)),
    identifiant: (placeId) => appeler(DELAI_REQUETE_MS.places, fiche(SKU_IDENTIFIANT, COUT_ESTIME_MICROS.identifiant), () => bases.places.identifiant(placeId)),
  };
  const routes: ClientRoutes = {
    matrice: (requete) => {
      const elements = requete.origines.length * requete.destinations.length;
      return appeler(
        DELAI_REQUETE_MS.routes,
        { fournisseur: "google", methode: "routes_matrix", sku: SKU_MATRICE, unites: { requetes: 1, elements }, coutEstimeMicros: elements * COUT_ELEMENT_MICROS },
        () => bases.routes.matrice(requete),
      );
    },
  };
  return { places, routes };
}
