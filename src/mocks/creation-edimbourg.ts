import type { InferredBrief, LodgingSuggestion, TripDraft } from "@/contracts";

/**
 * Création simulée du voyage d'Édimbourg (spécification F8, F8-PO-13) : brief préparé que `structureBrief`
 * simulé renvoie quel que soit le récit (il ne l'analyse pas). D'après le voyage du cadrage § 2 : 2 adultes,
 * rythme « Équilibré », envies « Nature », « Dégustations », « Restaurants », déplacements « À pied » et
 * « Transports publics », tous déduits ; ni limite ni budget par repas.
 *
 * Importé seulement par les adaptateurs simulés et les tests (règle de lint de F1).
 */
export const MOCK_INFERRED_BRIEF: InferredBrief = {
  travellers: { adults: 2, children: 0 },
  pace: "balanced",
  wishes: ["nature", "tasting", "restaurant"],
  mobility: ["walk", "transit"],
  inferredFields: ["travellers", "pace", "wishes", "mobility"],
};

/**
 * Écran 3 simulé (F8-PO-13, décision 0017 § 2.4) : seule Édimbourg a une suggestion (« Édimbourg », « Edimbourg »
 * ou « Edinburgh », sans tenir compte de la casse ni des accents) ; toute autre ville reçoit `no_option`. Noms,
 * raison, centre et rayon **maison**, entre crochets : jamais des données Google.
 */
const EDINBURGH_NAMES = new Set(["edimbourg", "edinburgh"]);

export function isMockEdinburgh(city: string): boolean {
  const key = city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return EDINBURGH_NAMES.has(key);
}

export const MOCK_LODGING_SUGGESTION: LodgingSuggestion = {
  area: {
    areaId: "mock_area_new_town",
    name: "[New Town]",
    reason: "[Le mieux relié à l'ensemble de ton programme : à pied pour le centre, en transports publics pour le reste.]",
    center: { lat: 55.9543, lng: -3.1976 },
    radiusM: 700,
  },
  lodgings: [
    { lodgingId: "mock_lodging_queen_street", name: "[Maison de Queen Street]", meta: "[Hôtel · 5 min à pied de Princes Street]" },
    { lodgingId: "mock_lodging_stockbridge", name: "[Appartement de Stockbridge]", meta: "[Appartement · au bord de la Water of Leith]" },
    { lodgingId: "mock_lodging_york_place", name: "[Chambres de York Place]", meta: "[Maison d'hôtes · tram à 2 min]" },
  ],
};

/**
 * Brouillon de démonstration de `R3-dev` (`/dev/voyages/nouveau/logement`, décision 0017 § 7) : voyage
 * d'Édimbourg du 29.08 au 03.09.2026 sans logement. Réservé aux pages de développement et aux tests, comme
 * `MOCK_DEMO_TRIP` ; exporté par `@/adapters` (`MOCK_DEMO_DRAFT`).
 */
export const MOCK_DEMO_TRIP_DRAFT: TripDraft = {
  destination: "Édimbourg",
  start: "2026-08-29",
  end: "2026-09-03",
  lodging: { kind: "none" },
  otherCities: [],
  commitments: [],
};
