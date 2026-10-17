import type { GenerationStatus, InferredBrief, LodgingSuggestion, TripDraft } from "@/contracts";

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

/*
 * Génération simulée des premières propositions (spécification F8, F8-PO-13 ; décision 0017 § 2.4 et § 10.6) :
 * suite d'états fixe, calculée depuis l'instant du lancement sur l'horloge de la portée. Les premières propositions
 * couvrent J1 et J2 (cadrage § 4, « première journée et début de la deuxième »), 4 par jour, 8 en tout ; une de
 * plus est prête toutes les `MOCK_GENERATION_STEP_MS` (les anneaux d'un jour apparaissent un à un, U2-Q2).
 */

/** Voyage créé par `createTrip` simulé pour l'organisation simulée (F8-PO-13). */
export const MOCK_CREATED_TRIP_ID = "mock_trip_edimbourg";
/** Propositions prévues par jour couvert (J1, J2). */
export const MOCK_GENERATION_STOPS_PER_DAY = [4, 4] as const;
/** Intervalle entre deux propositions prêtes, sur l'horloge de la portée. */
export const MOCK_GENERATION_STEP_MS = 2000;

/**
 * Issues de la suite d'états, choisies par portée (`R-sim`, `configureGeneration`) pour les tests :
 * - `ready` (par défaut) : 8 propositions sur 8 au 8e pas ;
 * - `incomplete` : 6 sur 8 (4 pour J1, 2 pour J2), aperçu incomplet au 8e pas (B0 PO-6) ;
 * - `failed` : arrêt réparable (`provider_error`, `retryable`) du 3e au 5e pas, puis la suite reprend (`ready` au 10e) ;
 * - `failedFinal` : arrêt définitif au 3e pas (`cost_cap_reached`, sans « Réessayer »).
 */
export const MOCK_GENERATION_OUTCOMES = ["ready", "incomplete", "failed", "failedFinal"] as const;
export type MockGenerationOutcome = (typeof MOCK_GENERATION_OUTCOMES)[number];

const FAILURE_STEP = 3;
const RECOVERY_STEP = 5;
const INCOMPLETE_FOUND = 6;

/**
 * État de la génération du voyage `tripId`, `elapsedMs` après son lancement (`Infinity` : voyage jamais lancé dans
 * la portée, donc déjà complet, 0017 § 3.7). Fonction pure : aucune horloge.
 */
export function mockGenerationStatus(tripId: string, elapsedMs: number, outcome: MockGenerationOutcome = "ready"): GenerationStatus {
  const planned = MOCK_GENERATION_STOPS_PER_DAY;
  const expected = planned.reduce((total, stops) => total + stops, 0);
  const step = Math.max(0, Math.floor(elapsedMs / MOCK_GENERATION_STEP_MS));

  let found = Math.min(expected, step);
  let phase: GenerationStatus["phase"] = found === expected ? "ready" : "preparing";
  let failure: { reason: "provider_error" | "cost_cap_reached"; retryable: boolean } | null = null;
  switch (outcome) {
    case "incomplete":
      found = Math.min(INCOMPLETE_FOUND, step);
      phase = step >= expected ? "incomplete" : "preparing";
      break;
    case "failed":
      if (step >= FAILURE_STEP && step < RECOVERY_STEP) {
        found = FAILURE_STEP;
        failure = { reason: "provider_error", retryable: true };
      } else if (step >= RECOVERY_STEP) {
        found = Math.min(expected, step - (RECOVERY_STEP - FAILURE_STEP));
        phase = found === expected ? "ready" : "preparing";
      }
      break;
    case "failedFinal":
      if (step >= FAILURE_STEP) {
        found = FAILURE_STEP;
        failure = { reason: "cost_cap_reached", retryable: false };
      }
      break;
    case "ready":
      break;
  }

  let remaining = found;
  const finished = phase === "ready" || phase === "incomplete";
  const days = planned.map((stops, position) => {
    const readyStops = Math.min(stops, remaining);
    remaining -= readyStops;
    return { index: position + 1, state: finished || readyStops === stops ? ("ready" as const) : ("preparing" as const), readyStops };
  });
  const base = { tripId, days, expected, ready: found };
  return failure ? { phase: "failed", ...base, ...failure } : { phase, ...base };
}
