import type { PlafondsUsage } from "@/server/config/usage";

/**
 * **Valeurs de test** des plafonds de consommation du MVP (spécification B7, B7c point 3) : choisies pour des
 * comptes ronds dans les tests, sans lien avec les montants réels, réservés à Samuel (Q39, Q45, Q465). Ne jamais les
 * lire hors des tests.
 *
 * Forfaits au prix plein de `prototype/config/prix-google.json` (Text Search « IDs only » à 0, fiches « enterprise »
 * à 20 USD les 1 000, éléments Routes « essentials » à 5 USD les 1 000) :
 * - aperçu : 0,05 USD de modèles + 10 fiches (0,20) + 100 éléments (0,50) = 0,75 USD ;
 * - complet : 0,20 + 40 fiches (0,80) + 400 éléments (2,00) = 3,00 USD ;
 * - mini : 0,02 + 6 fiches (0,12) + 0 élément = 0,14 USD ;
 * - lot : 0,02 + 40 fiches (0,80) + 200 éléments (1,00) = 1,82 USD ;
 * - programme (chaîne inversée, décision 0136 § 6.4) : 0,60 + 90 fiches (1,80) + 0 élément = 2,40 USD ;
 * - relecture d'un jour (profil `relecture`, valeurs de départ de 0100 § 1.4) : 20 fiches (0,40) + 24 éléments (0,12) =
 *   0,52 USD ; relecture d'un voyage (`relectureVoyage`) : 100 fiches (2,00) + 240 éléments (1,20) = 3,20 USD ;
 * - `structureBrief` : 0,01 USD ; `suggestLodging` : 0,02 USD (Text Search à 0).
 */
export const PLAFONDS_USAGE_TEST: PlafondsUsage = {
  schema: 1,
  generations: {
    apercu: { coutModelesMicros: 50_000, placesTextSearch: 20, placesDetails: 10, routesRequetes: 2, routesElements: 100 },
    complet: { coutModelesMicros: 200_000, placesTextSearch: 60, placesDetails: 40, routesRequetes: 8, routesElements: 400 },
    mini: { coutModelesMicros: 20_000, placesTextSearch: 6, placesDetails: 6, routesRequetes: 0, routesElements: 0 },
    // Recalcul d'un tri (B10b, décision 0119 § 4.1 point 3) : six jours, deux jours touchés, une ville.
    lot: { coutModelesMicros: 20_000, placesTextSearch: 4, placesDetails: 40, routesRequetes: 4, routesElements: 200 },
    // Aperçu de la chaîne inversée (décision 0136 § 6.4) : valeurs de `PLAFONDS_VARIANTE_SIMULEE.generations.programme`.
    programme: { coutModelesMicros: 600_000, placesTextSearch: 90, placesDetails: 90, routesRequetes: 0, routesElements: 0 },
  },
  relecture: {
    jour: { placesTextSearch: 2, placesDetails: 20, routesRequetes: 24, routesElements: 24 },
    voyage: { placesTextSearch: 20, placesDetails: 100, routesRequetes: 240, routesElements: 240 },
  },
  actions: {
    structureBrief: { coutModelesMicros: 10_000 },
    suggestLodging: { coutModelesMicros: 20_000, placesTextSearch: 3 },
  },
  parOrganisationJourMicros: 5_000_000,
  actionsSansCompteJourMicros: 100_000,
  limites: {
    quotaJourParMethode: 1_000,
    moisGoogleMicros: 50_000_000,
    enveloppeGoogleMicros: 100_000_000,
    moisModelesMicros: 50_000_000,
    enveloppeModelesMicros: 100_000_000,
  },
  skus: {
    textSearch: "places_text_search_essentials_ids_only",
    details: "places_details_enterprise",
    matrice: "routes_matrix_essentials",
    modeles: "modeles_forfait",
  },
};
