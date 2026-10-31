import type { Day, DayLineItem, Stop, TransferItem, Trip } from "@/contracts";

import { MOCK_ORGANIZATION_ID } from "./edimbourg";
import { VILLE_LONGUE } from "./rome-florence";

/**
 * Voyage simulé à trois villes pour le **bandeau de chevauchement** (spécification M4-suite § 5 ; critère 17 : axe sur la
 * Journée avec le bandeau, et mesures à 390 px) : Rome (J1), puis « Saint-Jacques-de-Compostelle » (J2 et J3), puis Florence
 * (J4 et J5), sam. 10 avril – mer. 14 avril 2027. Deux journées de changement de ville, chacune avec un engagement qui
 * chevauche la ligne « Vers {ville} », au libellé de 80 caractères (`COMMITMENT_LABEL_LENGTH.max`) :
 * - J2 : départ estimé à 10:00, environ 8 h (480 minutes), vers `VILLE_LONGUE` ; Sortie de 11:00 à 12:00 au libellé **avec
 *   espaces** : le texte le plus long du § 6 (« …, d'après la durée estimée. Vérifie tes horaires. ») ;
 * - J4 : billet de 12:00 à 13:40 vers Florence ; Sortie de 12:30 à 14:00 au libellé **sans espace**, qui doit passer à la
 *   ligne (`overflow-wrap: anywhere`).
 *
 * Contenu entre crochets (handover § 0, règle 2), sans `placeId` ni position. Identifiants d'étapes préfixés `ch-`. Servi à
 * son adresse seulement (hors de « Mes voyages »), sans propositions ni positions, comme `compostelleFlorence` : il ne sert
 * qu'aux tests de navigateur du bandeau. Ce module ne s'importe que depuis `src/adapters` et les tests (règle ESLint).
 */

export const CHEVAUCHEMENT_TRIP_ID = "mock_trip_chevauchement";

/** Libellé de 80 caractères avec des espaces (J2). */
export const LIBELLE_AVEC_ESPACES = "[Visite guidée de la cathédrale et du musée des pèlerins avec un guide du coin.]";
/** Libellé de 80 caractères sans espace (J4). */
export const LIBELLE_SANS_ESPACE = "[Concertsymphoniquedelorchestredelavilleaupalaisdescongresdeflorenceensoireeici]";

const SIMULATED_TRAVEL_BUDGET_MINUTES = 90;
const HOTEL_ROME = "[Hôtel, Monti]";
const HOTEL_LONGUE = "[Hôtel, vieille ville]";
const HOTEL_FLORENCE = "[Hôtel, Santa Croce]";

const walk = (minutes: number): DayLineItem => ({ type: "segment", segment: { mode: "walk", minutes, estimated: false } });

function stop(id: string, name: string, area: string, start: string, end: string): DayLineItem {
  return { type: "stop", stop: { id, kind: "activity", name, start, end, facts: { area }, exceptions: [], locked: false } };
}

/** Engagement « Sortie » de la personne, rendu dans « Événements du jour » (jamais dans la ligne du jour). */
function sortie(id: string, name: string, start: string, end: string): Stop {
  return { id, kind: "event", name, start, end, facts: {}, exceptions: [], locked: false };
}

function day(index: number, date: string, items: DayLineItem[], events: Stop[] = [], theme?: string): Day {
  const travelMinutes = items.reduce((total, item) => total + (item.type === "segment" ? (item.segment.minutes ?? 0) : 0), 0);
  return {
    index,
    date,
    items,
    events,
    generating: false,
    travelMinutes,
    travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
    ...(theme === undefined ? {} : { theme }),
  };
}

function ordinaryDay(index: number, date: string, hotel: string, activity: string): Day {
  return day(index, date, [
    { type: "terminus", role: "start", time: "09:30", label: hotel },
    walk(15),
    stop(`ch-j${index}-activite`, activity, "[Centre historique]", "10:00", "12:00"),
    walk(15),
    { type: "terminus", role: "end", time: "12:15", label: hotel },
  ]);
}

const versLongue: TransferItem = { type: "transfer", from: "Rome", to: VILLE_LONGUE, source: "estimated", start: "10:00", estimatedMinutes: 480, mode: "transit" };
const versFlorence: TransferItem = {
  type: "transfer",
  from: VILLE_LONGUE,
  to: "Florence",
  source: "entered",
  start: "12:00",
  end: "13:40",
  label: "[Train vers Florence]",
};

export const chevauchement: Trip = {
  id: CHEVAUCHEMENT_TRIP_ID,
  organizationId: MOCK_ORGANIZATION_ID,
  destination: "Rome",
  destinationColor: "ocre",
  start: "2027-04-10",
  end: "2027-04-14",
  timeZone: "Europe/Rome",
  travellers: { adults: 2, children: 0 },
  cities: [
    { name: "Rome", start: "2027-04-10", end: "2027-04-11" },
    { name: VILLE_LONGUE, start: "2027-04-11", end: "2027-04-13" },
    { name: "Florence", start: "2027-04-13", end: "2027-04-14" },
  ],
  days: [
    ordinaryDay(1, "2027-04-10", HOTEL_ROME, "[Forum romain]"),
    day(
      2,
      "2027-04-11",
      [
        { type: "terminus", role: "start", time: "09:00", label: HOTEL_ROME },
        { type: "free", from: "09:00", to: "10:00" },
        versLongue,
        { type: "terminus", role: "end", time: "18:00", label: HOTEL_LONGUE },
      ],
      [sortie("ch-j2-visite", LIBELLE_AVEC_ESPACES, "11:00", "12:00")],
      `De Rome à ${VILLE_LONGUE}`,
    ),
    ordinaryDay(3, "2027-04-12", HOTEL_LONGUE, "[Cathédrale]"),
    day(
      4,
      "2027-04-13",
      [
        { type: "terminus", role: "start", time: "09:30", label: HOTEL_LONGUE },
        walk(10),
        stop("ch-j4-matin", "[Marché couvert]", "[Vieille ville]", "09:40", "10:40"),
        { type: "free", from: "10:40", to: "12:00" },
        versFlorence,
        { type: "free", from: "13:40", to: "15:00" },
        stop("ch-j4-apres-midi", "[Basilique Santa Croce]", "[Santa Croce]", "15:00", "16:30"),
        walk(10),
        { type: "terminus", role: "end", time: "16:40", label: HOTEL_FLORENCE },
      ],
      [sortie("ch-j4-concert", LIBELLE_SANS_ESPACE, "12:30", "14:00")],
      `De ${VILLE_LONGUE} à Florence`,
    ),
    ordinaryDay(5, "2027-04-14", HOTEL_FLORENCE, "[Jardin de Boboli]"),
  ],
  checklist: [],
  unlocked: true,
};
