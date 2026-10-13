import type {
  Day,
  DayMap,
  SharedDay,
  SharedDayItem,
  SharedDayMap,
  SharedEvent,
  SharedMapPoint,
  SharedStop,
  SharedTrip,
  Stop,
  Trip,
} from "@/contracts";
import { SHARED_EXCEPTIONS, type SharedException } from "@/contracts/values";

/**
 * Projection de la vue partagée (spécification F10, F10-PO-14, F10-TL-1 et F10-TL-14), fonctions pures. Chaque objet
 * est construit **champ par champ**, sans décomposition (`...`) d'un objet du voyage : un champ ajouté plus tard au
 * contrat du voyage n'y entre jamais sans qu'on l'écrive ici. La sortie est ensuite validée par les schémas stricts
 * de `src/contracts/share.ts` (`SharedTripViewSchema`, `SharedDayViewSchema`).
 *
 * Jamais projetés : libellés et positions des terminus, liste à réserver, budgets, identifiants d'étape et
 * d'événement, `reason`, `source`, `verifiedAt`, `locked`, `placeId`, `commitment`, « Surprends-moi »,
 * `travelMinutes`, `travelBudgetMinutes`, organisation et identifiant du voyage, exception « À réserver ».
 */

function isSharedException(value: string): value is SharedException {
  return (SHARED_EXCEPTIONS as readonly string[]).includes(value);
}

function sharedFacts(facts: Stop["facts"]): SharedStop["facts"] {
  return {
    ...(facts.durationMinutes === undefined ? {} : { durationMinutes: facts.durationMinutes }),
    ...(facts.costPerPerson === undefined ? {} : { costPerPerson: facts.costPerPerson }),
    ...(facts.area === undefined ? {} : { area: facts.area }),
  };
}

function sharedExceptions(stop: Stop): SharedStop["exceptions"] {
  return stop.exceptions.filter(isSharedException);
}

function sharedStop(stop: Stop, key: string): SharedStop {
  return {
    kind: stop.kind,
    name: stop.name,
    start: stop.start,
    ...(stop.end === undefined ? {} : { end: stop.end }),
    facts: sharedFacts(stop.facts),
    key,
    exceptions: sharedExceptions(stop),
  };
}

function sharedEvent(event: Stop): SharedEvent {
  return {
    kind: "event",
    name: event.name,
    start: event.start,
    ...(event.end === undefined ? {} : { end: event.end }),
    facts: sharedFacts(event.facts),
    exceptions: sharedExceptions(event),
  };
}

/** Clé locale de chaque étape du jour : son rang parmi les étapes (« 1 » = la première), par identifiant interne. */
export function stopKeys(day: Pick<Day, "items">): Map<Stop["id"], string> {
  const keys = new Map<Stop["id"], string>();
  for (const item of day.items) {
    if (item.type === "stop") keys.set(item.stop.id, String(keys.size + 1));
  }
  return keys;
}

function sharedItem(item: Day["items"][number], keys: Map<Stop["id"], string>): SharedDayItem {
  switch (item.type) {
    case "terminus":
      return { type: "terminus", role: item.role, time: item.time };
    case "stop":
      return { type: "stop", stop: sharedStop(item.stop, keys.get(item.stop.id) ?? "") };
    case "segment":
      return {
        type: "segment",
        segment: { mode: item.segment.mode, minutes: item.segment.minutes, estimated: item.segment.estimated },
      };
    case "free":
      return { type: "free", from: item.from, to: item.to };
    case "openMeal":
      return { type: "openMeal", time: item.time, meal: item.meal };
  }
}

export function projectSharedDay(day: Day): SharedDay {
  const keys = stopKeys(day);
  return {
    index: day.index,
    date: day.date,
    generating: day.generating,
    items: day.items.map((item) => sharedItem(item, keys)),
    events: day.events.map(sharedEvent),
  };
}

export function projectSharedTrip(trip: Trip): SharedTrip {
  return {
    destination: trip.destination,
    destinationColor: trip.destinationColor,
    start: trip.start,
    end: trip.end,
    travellers: { adults: trip.travellers.adults, children: trip.travellers.children },
    days: trip.days.map(projectSharedDay),
  };
}

/**
 * Points d'un jour pour la carte de la vue partagée (F10-TL-14) : étapes seulement (aucun terminus, souvent le
 * logement), chacune reliée à son étape par sa clé locale ; un point qui ne désigne aucune étape du jour est ignoré.
 */
export function projectSharedPoints(day: Day, map: DayMap | null | undefined): SharedMapPoint[] {
  const keys = stopKeys(day);
  const points: SharedMapPoint[] = [];
  for (const point of map?.points ?? []) {
    if (point.ref.type !== "stop") continue;
    const key = keys.get(point.ref.stopId);
    if (key !== undefined) points.push({ key, lat: point.lat, lng: point.lng });
  }
  return points;
}

/** Points de tous les jours (vue d'ensemble de `RP`). */
export function projectSharedMaps(trip: Trip, maps: readonly DayMap[]): SharedDayMap[] {
  return trip.days.map((day) => ({
    index: day.index,
    points: projectSharedPoints(
      day,
      maps.find((map) => map.dayIndex === day.index),
    ),
  }));
}
