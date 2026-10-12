import type { ChecklistItem, Day, DayLineItem, Stop, Trip, Weekday } from "@/contracts";

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
  meta: string;
}

interface DayPlan {
  date: string;
  weekday: Weekday;
  title: string;
  activity: PlannedStop;
  meal: PlannedStop;
  /** Deuxième activité de l'après-midi, facultative. */
  afternoon?: PlannedStop;
}

const walk = (minutes: number): DayLineItem => ({ type: "segment", segment: { mode: "walk", minutes, estimated: false } });

function stop(id: string, kind: Stop["kind"], planned: PlannedStop, start: string, end: string): DayLineItem {
  return {
    type: "stop",
    stop: { id, kind, name: planned.name, start, end, meta: planned.meta, exceptions: [], locked: false },
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
      weekday: plan.weekday,
      title: plan.title,
      items,
      events: [],
      generating: false,
      travelMinutes,
      travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
    };
  });
}

function check(id: string, label: string, when: string, done: boolean): ChecklistItem {
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
      weekday: "jeu.",
      title: "Jeudi 14 mai",
      activity: { name: "[Belvédère de Santa Luzia]", meta: "[Alfama, 1 h, gratuit]" },
      meal: { name: "[Tasca de l'Alfama]", meta: "[Alfama, cuisine portugaise]" },
    },
    {
      date: "2026-05-15",
      weekday: "ven.",
      title: "Vendredi 15 mai",
      activity: { name: "[Monastère des Hiéronymites]", meta: "[Belém, 1 h 30]" },
      meal: { name: "[Pastelaria de Belém]", meta: "[Belém, pâtisserie]" },
      afternoon: { name: "[Tour de Belém]", meta: "[Belém, 45 min]" },
    },
    {
      date: "2026-05-16",
      weekday: "sam.",
      title: "Samedi 16 mai",
      activity: { name: "[Musée des azulejos]", meta: "[Xabregas, 1 h 30]" },
      meal: { name: "[Marché de la Ribeira]", meta: "[Cais do Sodré, halle gourmande]" },
    },
    {
      date: "2026-05-17",
      weekday: "dim.",
      title: "Dimanche 17 mai",
      activity: { name: "[Quartier du Chiado]", meta: "[Chiado, 1 h, gratuit]" },
      meal: { name: "[Cave à vins du Bairro Alto]", meta: "[Bairro Alto, dégustation]" },
    },
  ]),
  checklist: [check("lis-check-hotel", "[Hôtel, Baixa]", "[Déjà réservé]", true)],
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
      weekday: "sam.",
      title: "Samedi 8 mai",
      activity: { name: "[Quais de la Ribeira]", meta: "[Ribeira, 1 h, gratuit]" },
      meal: { name: "[Taverne de la Ribeira]", meta: "[Ribeira, cuisine du Nord]" },
    },
    {
      date: "2027-05-09",
      weekday: "dim.",
      title: "Dimanche 9 mai",
      activity: { name: "[Librairie historique]", meta: "[Centre, 45 min]" },
      meal: { name: "[Café de la place]", meta: "[Centre, café]" },
      afternoon: { name: "[Caves de Vila Nova de Gaia]", meta: "[Gaia, 1 h 30, dégustation]" },
    },
    {
      date: "2027-05-10",
      weekday: "lun.",
      title: "Lundi 10 mai",
      activity: { name: "[Palais de la Bourse]", meta: "[Ribeira, 1 h]" },
      meal: { name: "[Marché du Bolhão]", meta: "[Centre, marché couvert]" },
    },
    {
      date: "2027-05-11",
      weekday: "mar.",
      title: "Mardi 11 mai",
      activity: { name: "[Jardins du Palais de Cristal]", meta: "[Massarelos, 1 h, gratuit]" },
      meal: { name: "[Restaurant de la Foz]", meta: "[Foz, poisson]" },
    },
  ]),
  checklist: [
    check("por-check-hotel", "[Hôtel, Ribeira]", "[Déjà réservé]", true),
    { ...check("por-check-caves", "[Visite des caves de Gaia]", "[Une semaine avant]", false), bookingUrl: "https://example.org/mock/caves" },
    { ...check("por-check-librairie", "[Librairie historique]", "[La veille]", false), bookingUrl: "https://example.org/mock/librairie" },
  ],
  unlocked: true,
};
