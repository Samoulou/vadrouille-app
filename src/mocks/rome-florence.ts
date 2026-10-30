import type { Day, DayLineItem, Stop, StopFacts, Trip } from "@/contracts";

import { MOCK_ORGANIZATION_ID } from "./edimbourg";

/**
 * Voyage simulé à deux villes (décision 0148 § 12, ligne M4-C) : Rome puis Florence, sam. 10 avril – mer. 14 avril
 * 2027. Il montre les deux formes du contrat « plusieurs villes » :
 * - `Trip.cities` (0148 § 6) : deux villes, `end` exclusif (date d'arrivée dans la ville suivante, ou fin du voyage) ;
 * - un élément `transfer` (0148 § 1) dans la ligne de J3 : billet saisi (`source: "entered"`, libellé, départ et
 *   arrivée), sans `placeId` ni donnée Google ; aucun trajet ne le précède ni ne le suit (spécification M4 § 7.3),
 *   et `Day.travelMinutes` ne le compte pas (M4-PO-11).
 *
 * Contenu entre crochets (handover § 0, règle 2), sans `placeId`, sans position, sans proposition, comme
 * `autres-voyages.ts`. Identifiants d'étapes préfixés `rf-`. Il n'est **pas encore** branché dans l'adaptateur `mock`
 * (« Mes voyages », écrans) : les écrans à deux villes sont à M4c, qui le branchera.
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
 * J3, jour du changement de ville : une sortie du matin à Rome, temps libre jusqu'au départ, ligne « Vers Florence »
 * (billet saisi, 12:00 – 13:40), une étape à Florence sans trajet avant elle, retour au logement de Florence.
 */
const changeDay = day(
  3,
  "2027-04-12",
  [
    { type: "terminus", role: "start", time: "08:30", label: HOTEL_ROME },
    walk(10),
    stop("rf-j3-matin", "activity", "[Basilique Saint-Clément]", { area: "[Monti]", durationMinutes: 60 }, "08:45", "09:45"),
    { type: "free", from: "09:45", to: "11:30" },
    {
      type: "transfer",
      from: "Rome",
      to: "Florence",
      source: "entered",
      start: "12:00",
      end: "13:40",
      label: "[Train Rome–Florence]",
    },
    stop("rf-j3-apres-midi", "activity", "[Basilique Santa Croce]", { area: "[Santa Croce]", durationMinutes: 90 }, "15:00", "16:30"),
    walk(10),
    { type: "terminus", role: "end", time: "16:40", label: HOTEL_FLORENCE },
  ],
  "De Rome à Florence",
);

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
