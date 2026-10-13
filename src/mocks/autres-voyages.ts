import type { ChecklistItem, ChecklistMoment, Day, DayLineItem, Stop, StopFacts, Trip } from "@/contracts";

import { MOCK_ORGANIZATION_ID } from "./edimbourg";

/**
 * Deux voyages simulés de plus pour « Mes voyages » (spécification F11, F11-PO-15 ; décision 0021 § 2) :
 * Lisbonne, passé, et Porto, à venir. Avec les deux voyages d'Édimbourg, chaque section de l'écran 17 est
 * montrée à toute date de démonstration.
 *
 * Contenu entre crochets (handover § 0, règle 2), sans `placeId`, sans position (la carte affiche son état
 * de remplacement, Q100), sans proposition. Les jours sont construits par les fonctions de ce module, pas
 * recopiés d'Édimbourg. Identifiants d'étapes préfixés par le voyage (`lis-`, `por-`).
 *
 * Ce module ne s'importe que depuis `src/adapters` et les tests (règle ESLint).
 */

export const LISBONNE_TRIP_ID = "mock_trip_lisbonne";
export const PORTO_TRIP_ID = "mock_trip_porto";

/** Budget de trajet simulé du rythme « équilibré » (comme Édimbourg, Q8) : lu dans les données, jamais en dur. */
const SIMULATED_TRAVEL_BUDGET_MINUTES = 90;

interface PlannedStop {
  name: string;
  /** Faits de l'étape (B2, E3) : seul le secteur, texte, garde les crochets. */
  facts: StopFacts;
}

interface DayPlan {
  date: string;
  activity: PlannedStop;
  meal: PlannedStop;
  /** Deuxième activité de l'après-midi, facultative. */
  afternoon?: PlannedStop;
}

const walk = (minutes: number): DayLineItem => ({ type: "segment", segment: { mode: "walk", minutes, estimated: false } });

function stop(id: string, kind: Stop["kind"], planned: PlannedStop, start: string, end: string): DayLineItem {
  return {
    type: "stop",
    stop: { id, kind, name: planned.name, start, end, facts: planned.facts, exceptions: [], locked: false },
  };
}

/**
 * Jours d'un voyage : départ de l'hôtel, une activité le matin, un repas, éventuellement une activité
 * l'après-midi, retour à l'hôtel ; segments à pied, total sous le budget du rythme.
 */
function buildDays(prefix: string, hotel: string, plans: readonly DayPlan[]): Day[] {
  return plans.map((plan, i) => {
    const index = i + 1;
    const id = (part: string) => `${prefix}-j${index}-${part}`;
    const items: DayLineItem[] = [
      { type: "terminus", role: "start", time: "09:30", label: hotel },
      walk(15),
      stop(id("activite"), "activity", plan.activity, "10:00", "12:00"),
      walk(10),
      stop(id("repas"), "meal", plan.meal, "12:30", "13:45"),
    ];
    if (plan.afternoon) {
      items.push(walk(15), stop(id("apres-midi"), "activity", plan.afternoon, "14:30", "16:30"));
    }
    items.push(walk(20), { type: "terminus", role: "end", time: plan.afternoon ? "17:00" : "14:15", label: hotel });
    const travelMinutes = items.reduce((total, item) => total + (item.type === "segment" ? item.segment.minutes : 0), 0);
    return {
      index,
      date: plan.date,
      items,
      events: [],
      generating: false,
      travelMinutes,
      travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
    };
  });
}

function check(id: string, label: string, when: ChecklistMoment, done: boolean): ChecklistItem {
  return { id, label, when, done, sponsored: false };
}

// --- Lisbonne : jeu. 14 mai – dim. 17 mai 2026, passé -----------------------

export const lisbonne: Trip = {
  id: LISBONNE_TRIP_ID,
  organizationId: MOCK_ORGANIZATION_ID,
  destination: "Lisbonne",
  destinationColor: "azulejo",
  start: "2026-05-14",
  end: "2026-05-17",
  timeZone: "Europe/Lisbon",
  travellers: { adults: 2, children: 0 },
  days: buildDays("lis", "[Hôtel, Baixa]", [
    {
      date: "2026-05-14",
      activity: { name: "[Belvédère de Santa Luzia]", facts: { area: "[Alfama]", durationMinutes: 60, costPerPerson: 0 } },
      meal: { name: "[Tasca de l'Alfama]", facts: { area: "[Alfama]" } },
    },
    {
      date: "2026-05-15",
      activity: { name: "[Monastère des Hiéronymites]", facts: { area: "[Belém]", durationMinutes: 90 } },
      meal: { name: "[Pastelaria de Belém]", facts: { area: "[Belém]" } },
      afternoon: { name: "[Tour de Belém]", facts: { area: "[Belém]", durationMinutes: 45 } },
    },
    {
      date: "2026-05-16",
      activity: { name: "[Musée des azulejos]", facts: { area: "[Xabregas]", durationMinutes: 90 } },
      meal: { name: "[Marché de la Ribeira]", facts: { area: "[Cais do Sodré]" } },
    },
    {
      date: "2026-05-17",
      activity: { name: "[Quartier du Chiado]", facts: { area: "[Chiado]", durationMinutes: 60, costPerPerson: 0 } },
      meal: { name: "[Cave à vins du Bairro Alto]", facts: { area: "[Bairro Alto]" } },
    },
  ]),
  checklist: [check("lis-check-hotel", "[Hôtel, Baixa]", { type: "beforeDeparture" }, true)],
  unlocked: true,
};

// --- Porto : sam. 8 mai – mar. 11 mai 2027, à venir --------------------------

export const porto: Trip = {
  id: PORTO_TRIP_ID,
  organizationId: MOCK_ORGANIZATION_ID,
  destination: "Porto",
  destinationColor: "granit",
  start: "2027-05-08",
  end: "2027-05-11",
  timeZone: "Europe/Lisbon",
  travellers: { adults: 2, children: 0 },
  days: buildDays("por", "[Hôtel, Ribeira]", [
    {
      date: "2027-05-08",
      activity: { name: "[Quais de la Ribeira]", facts: { area: "[Ribeira]", durationMinutes: 60, costPerPerson: 0 } },
      meal: { name: "[Taverne de la Ribeira]", facts: { area: "[Ribeira]" } },
    },
    {
      date: "2027-05-09",
      activity: { name: "[Librairie historique]", facts: { area: "[Centre]", durationMinutes: 45 } },
      meal: { name: "[Café de la place]", facts: { area: "[Centre]" } },
      afternoon: { name: "[Caves de Vila Nova de Gaia]", facts: { area: "[Gaia]", durationMinutes: 90 } },
    },
    {
      date: "2027-05-10",
      activity: { name: "[Palais de la Bourse]", facts: { area: "[Ribeira]", durationMinutes: 60 } },
      meal: { name: "[Marché du Bolhão]", facts: { area: "[Centre]" } },
    },
    {
      date: "2027-05-11",
      activity: { name: "[Jardins du Palais de Cristal]", facts: { area: "[Massarelos]", durationMinutes: 60, costPerPerson: 0 } },
      meal: { name: "[Restaurant de la Foz]", facts: { area: "[Foz]" } },
    },
  ]),
  checklist: [
    check("por-check-hotel", "[Hôtel, Ribeira]", { type: "beforeDeparture" }, true),
    // « Une semaine avant » : début du voyage moins 7 jours (B2, E4).
    {
      ...check("por-check-caves", "[Visite des caves de Gaia]", { type: "deadline", date: "2027-05-01" }, false),
      bookingUrl: "https://example.org/mock/caves",
      stopId: "por-j2-apres-midi",
    },
    // « La veille » de la visite du J2 : le J1, « À l'arrivée » (B2, E4).
    {
      ...check("por-check-librairie", "[Librairie historique]", { type: "tripDay", day: 1 }, false),
      bookingUrl: "https://example.org/mock/librairie",
      stopId: "por-j2-activite",
    },
  ],
  unlocked: true,
};
