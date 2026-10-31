import type { Day, DayLineItem, Proposal, Stop, StopFacts, Trip } from "@/contracts";

import { MOCK_ORGANIZATION_ID } from "./edimbourg";

/**
 * Voyage simulé à deux villes (décision 0148 § 12, ligne M4-C) : Rome puis Florence, sam. 10 avril – mer. 14 avril
 * 2027. Il montre les deux formes du contrat « plusieurs villes » :
 * - `Trip.cities` (0148 § 6) : deux villes, `end` exclusif (date d'arrivée dans la ville suivante, ou fin du voyage) ;
 * - un élément `transfer` (0148 § 1) dans la ligne de J3 : billet saisi (`source: "entered"`, libellé, départ et
 *   arrivée), sans `placeId` ni donnée Google ; aucun trajet ne le précède ni ne le suit (spécification M4 § 7.3),
 *   et `Day.travelMinutes` ne le compte pas (M4-PO-11).
 *
 * Contenu entre crochets (handover § 0, règle 2), sans `placeId` ni position, comme `autres-voyages.ts`. Identifiants
 * d'étapes préfixés `rf-`. Branché dans l'adaptateur `mock` par M4c (écrans à deux villes), **hors de « Mes voyages »**
 * (adresse directe seulement : la liste simulée et ses tests ne changent pas, spécification M4 § 7.8), avec trois
 * propositions de 6b (`propositionsRomeFlorence`) tirées des étapes du voyage.
 *
 * Ce module ne s'importe que depuis `src/adapters` et les tests (règle ESLint).
 */

export const ROME_FLORENCE_TRIP_ID = "mock_trip_rome_florence";

/** Budget de trajet simulé du rythme « équilibré » (comme Édimbourg, Q8). */
const SIMULATED_TRAVEL_BUDGET_MINUTES = 90;

const HOTEL_ROME = "[Hôtel, Monti]";
const HOTEL_FLORENCE = "[Hôtel, Santa Croce]";

const walk = (minutes: number): DayLineItem => ({ type: "segment", segment: { mode: "walk", minutes, estimated: false } });

function stop(id: string, kind: Stop["kind"], name: string, facts: StopFacts, start: string, end: string): DayLineItem {
  return { type: "stop", stop: { id, kind, name, start, end, facts, exceptions: [], locked: false } };
}

/** Somme des trajets du jour : seuls les `segment` comptent, jamais le changement de ville. */
function travelMinutesOf(items: readonly DayLineItem[]): number {
  return items.reduce((total, item) => total + (item.type === "segment" ? (item.segment.minutes ?? 0) : 0), 0);
}

function day(index: number, date: string, items: DayLineItem[], theme?: string): Day {
  return {
    index,
    date,
    items,
    events: [],
    generating: false,
    travelMinutes: travelMinutesOf(items),
    travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
    ...(theme === undefined ? {} : { theme }),
  };
}

/** Jour ordinaire d'une ville : une activité le matin, un repas, retour au logement. */
function ordinaryDay(index: number, date: string, hotel: string, activity: [string, string], meal: [string, string]): Day {
  const id = (part: string) => `rf-j${index}-${part}`;
  return day(index, date, [
    { type: "terminus", role: "start", time: "09:30", label: hotel },
    walk(15),
    stop(id("activite"), "activity", activity[0], { area: activity[1], durationMinutes: 120 }, "10:00", "12:00"),
    walk(10),
    stop(id("repas"), "meal", meal[0], { area: meal[1] }, "12:30", "13:45"),
    walk(20),
    { type: "terminus", role: "end", time: "14:15", label: hotel },
  ]);
}

/**
 * Jour du changement de ville (J3 de Rome puis Florence) : une sortie du matin à Rome, temps libre jusqu'au départ (12:00), ligne « Vers
 * Florence » (billet saisi, 12:00 – 13:40), temps libre de l'arrivée (13:40) à l'étape suivante (15:00), une étape à
 * Florence sans trajet avant elle, retour au logement de Florence (option (a) de la spécification M4-suite).
 */
function changeDayOf(index: number, date: string, from: string, hotelFrom: string): Day {
  const id = (part: string) => `rf-j${index}-${part}`;
  return day(
    index,
    date,
    [
      { type: "terminus", role: "start", time: "08:30", label: hotelFrom },
      walk(10),
      stop(id("matin"), "activity", "[Basilique Saint-Clément]", { area: "[Monti]", durationMinutes: 60 }, "08:45", "09:45"),
      { type: "free", from: "09:45", to: "12:00" },
      {
        type: "transfer",
        from,
        to: "Florence",
        source: "entered",
        start: "12:00",
        end: "13:40",
        label: "[Train Rome–Florence]",
      },
      { type: "free", from: "13:40", to: "15:00" },
      stop(id("apres-midi"), "activity", "[Basilique Santa Croce]", { area: "[Santa Croce]", durationMinutes: 90 }, "15:00", "16:30"),
      walk(10),
      { type: "terminus", role: "end", time: "16:40", label: HOTEL_FLORENCE },
    ],
    `De ${from} à Florence`,
  );
}

const changeDay = changeDayOf(3, "2027-04-12", "Rome", HOTEL_ROME);

export const romeFlorence: Trip = {
  id: ROME_FLORENCE_TRIP_ID,
  organizationId: MOCK_ORGANIZATION_ID,
  destination: "Rome",
  destinationColor: "ocre",
  start: "2027-04-10",
  end: "2027-04-14",
  timeZone: "Europe/Rome",
  travellers: { adults: 2, children: 0 },
  cities: [
    { name: "Rome", start: "2027-04-10", end: "2027-04-12" },
    { name: "Florence", start: "2027-04-12", end: "2027-04-14" },
  ],
  days: [
    ordinaryDay(1, "2027-04-10", HOTEL_ROME, ["[Forum romain]", "[Centre historique]"], ["[Trattoria de Monti]", "[Monti]"]),
    ordinaryDay(2, "2027-04-11", HOTEL_ROME, ["[Musées du Vatican]", "[Prati]"], ["[Pizzeria de Prati]", "[Prati]"]),
    changeDay,
    ordinaryDay(4, "2027-04-13", HOTEL_FLORENCE, ["[Galerie des Offices]", "[Centre historique]"], ["[Marché central]", "[San Lorenzo]"]),
    ordinaryDay(5, "2027-04-14", HOTEL_FLORENCE, ["[Jardin de Boboli]", "[Oltrarno]"], ["[Osteria de l'Oltrarno]", "[Oltrarno]"]),
  ],
  checklist: [],
  unlocked: true,
};

/** Étape d'un jour du voyage, par son identifiant (les propositions reprennent les étapes de la ligne). */
function etapeDuVoyage(id: string): Stop {
  for (const day of romeFlorence.days) {
    for (const item of day.items) if (item.type === "stop" && item.stop.id === id) return item.stop;
  }
  throw new Error(`étape simulée inconnue : ${id}`);
}

/**
 * Propositions de 6b (spécification M4 § 7.3, critère 14) : une étape de Rome (J1), puis, le jour du changement de ville
 * (J3), l'étape du matin à Rome et la première étape après l'arrivée à Florence. Celle-ci n'a ni `travelFromPrevious` ni
 * `detour` : aucun trajet ne la précède dans la ligne (le changement de ville puis le temps libre).
 */
export const propositionsRomeFlorence: Proposal[] = [
  {
    id: "prop-rf-j1-forum",
    kind: "activity",
    day: 1,
    time: "10:00",
    neighbours: { before: { type: "terminus", role: "start" }, after: { type: "meal", meal: "lunch" } },
    stop: etapeDuVoyage("rf-j1-activite"),
    category: "museum",
    travelFromPrevious: { mode: "walk", minutes: 15, estimated: false },
  },
  {
    id: "prop-rf-j3-matin",
    kind: "activity",
    day: 3,
    time: "08:45",
    neighbours: { before: { type: "terminus", role: "start" }, after: { type: "free" } },
    stop: etapeDuVoyage("rf-j3-matin"),
    category: "museum",
    travelFromPrevious: { mode: "walk", minutes: 10, estimated: false },
  },
  {
    id: "prop-rf-j3-apres-midi",
    kind: "activity",
    day: 3,
    time: "15:00",
    neighbours: { before: { type: "free" }, after: { type: "terminus", role: "end" } },
    stop: etapeDuVoyage("rf-j3-apres-midi"),
    category: "museum",
  },
];

/**
 * Nom de ville long des tests à 390 px (spécification M4, critères 13 et 22 ; spécification M4-suite, critère 16). Ce
 * n'est pas une des 62 villes : le voyage ne passe pas par `createTrip`.
 */
export const VILLE_LONGUE = "Saint-Jacques-de-Compostelle";
export const COMPOSTELLE_FLORENCE_TRIP_ID = "mock_trip_compostelle_florence";

/**
 * Variante de `romeFlorence` pour les mesures à 390 px : `VILLE_LONGUE` une nuit (J1), changement de ville à J2 (les
 * rangées de l'écran 5 simulé ne montrent que J1 et J2), puis Florence. Servie à son adresse seulement, sans
 * propositions : elle ne sert qu'aux mesures de mise en page.
 */
export const compostelleFlorence: Trip = {
  ...romeFlorence,
  id: COMPOSTELLE_FLORENCE_TRIP_ID,
  destination: VILLE_LONGUE,
  cities: [
    { name: VILLE_LONGUE, start: "2027-04-10", end: "2027-04-11" },
    { name: "Florence", start: "2027-04-11", end: "2027-04-14" },
  ],
  days: [
    ordinaryDay(1, "2027-04-10", HOTEL_ROME, ["[Cathédrale]", "[Centre historique]"], ["[Taverne du centre]", "[Centre historique]"]),
    changeDayOf(2, "2027-04-11", VILLE_LONGUE, HOTEL_ROME),
    ordinaryDay(3, "2027-04-12", HOTEL_FLORENCE, ["[Galerie des Offices]", "[Centre historique]"], ["[Marché central]", "[San Lorenzo]"]),
    ordinaryDay(4, "2027-04-13", HOTEL_FLORENCE, ["[Jardin de Boboli]", "[Oltrarno]"], ["[Osteria de l'Oltrarno]", "[Oltrarno]"]),
    ordinaryDay(5, "2027-04-14", HOTEL_FLORENCE, ["[Ponte Vecchio]", "[Centre historique]"], ["[Trattoria du pont]", "[Centre historique]"]),
  ],
};
