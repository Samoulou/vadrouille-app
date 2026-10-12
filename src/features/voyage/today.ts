import type { DayLineItem, Meal, Segment, Stop, Trip } from "@/contracts";

/**
 * Date et heure de la destination (décision 0021 § 3) : seul calcul de « aujourd'hui » dans l'application,
 * partagé par « Mes voyages » (F11a) et l'écran 15 « Pendant le voyage » (F10a, F10-TL-2 : jour courant, moment
 * présent, prochaine étape, rappels). Fonctions pures, horloge injectée (`now` en millisecondes), sans
 * bibliothèque de dates. Les heures du programme sont des « HH:MM » en heure locale de la destination
 * (handover § 9) : comparées comme des chaînes, dans l'ordre du jour.
 */

/** Date ISO « AAAA-MM-JJ ». */
export type IsoDate = string;

/** Heure « HH:MM » de 00:00 à 23:59. */
export type LocalTime = string;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(cache: Map<string, Intl.DateTimeFormat>, timeZone: string, options: Intl.DateTimeFormatOptions) {
  let formatter = cache.get(timeZone);
  if (!formatter) {
    // Lève une RangeError pour un fuseau inconnu (le schéma `Trip.timeZone` l'a déjà refusé).
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    cache.set(timeZone, formatter);
  }
  return formatter;
}

function partsAt(formatter: Intl.DateTimeFormat, now: number) {
  const parts = formatter.formatToParts(new Date(now));
  return (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
}

/**
 * Date du calendrier à l'instant `now` dans le fuseau `timeZone` (identifiant IANA), « AAAA-MM-JJ ». Lue par
 * `formatToParts`, jamais dans l'ordre d'un format régional.
 */
export function localDateAt(now: number, timeZone: string): IsoDate {
  const part = partsAt(formatterFor(dateFormatters, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }), now);
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

/** Heure « HH:MM » à l'instant `now` dans le fuseau `timeZone`, à la minute près (les secondes sont ignorées). */
export function localTimeAt(now: number, timeZone: string): LocalTime {
  const part = partsAt(formatterFor(timeFormatters, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), now);
  return `${part("hour").padStart(2, "0")}:${part("minute").padStart(2, "0")}`;
}

/** Année d'une date ISO. */
export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

/** Veille d'une date ISO (calcul sur le calendrier, en UTC, sans fuseau). */
export function previousDate(date: IsoDate): IsoDate {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - 1)).toISOString().slice(0, 10);
}

/** Le fuseau de l'appareil diffère-t-il de celui de la destination à l'instant `now` (Q188) ? */
export function deviceTimeDiffers(now: number, timeZone: string, deviceTimeZone: string): boolean {
  return (
    localDateAt(now, timeZone) !== localDateAt(now, deviceTimeZone) || localTimeAt(now, timeZone) !== localTimeAt(now, deviceTimeZone)
  );
}

// --- Données de l'écran 15 ----------------------------------------------------------------------------

/** Étape telle que l'écran 15 la reçoit : ni raison, ni source, ni date de vérification, ni verrou. */
export type TodayStop = Pick<Stop, "id" | "kind" | "name" | "start" | "end" | "meta" | "exceptions" | "placeId">;

/** Élément de la ligne du jour reçu par l'écran 15. */
export type TodayItem =
  | { type: "terminus"; role: "start" | "end"; time: LocalTime; label: string }
  | { type: "stop"; stop: TodayStop }
  | { type: "segment"; segment: Segment }
  | { type: "free"; from: LocalTime; to: LocalTime }
  | { type: "openMeal"; time: LocalTime; meal: Meal };

export interface TodayDay {
  index: number;
  date: IsoDate;
  title: string;
  generating: boolean;
  items: TodayItem[];
}

/** Voyage projeté pour l'écran 15 (F10-TL-2) : le serveur transmet tous les jours, le navigateur choisit le jour. */
export interface TodayTrip {
  id: string;
  destination: string;
  timeZone: string;
  days: TodayDay[];
}

/**
 * Recopie champ par champ d'un élément de la ligne (F10-TL-2) : aucun champ ajouté plus tard au contrat ne
 * passe à l'écran 15 sans être nommé ici.
 */
function projectTodayItem(item: DayLineItem): TodayItem {
  switch (item.type) {
    case "terminus":
      return { type: "terminus", role: item.role, time: item.time, label: item.label };
    case "segment": {
      const { mode, minutes, estimated } = item.segment;
      return { type: "segment", segment: { mode, minutes, estimated } };
    }
    case "free":
      return { type: "free", from: item.from, to: item.to };
    case "openMeal":
      return { type: "openMeal", time: item.time, meal: item.meal };
    case "stop": {
      const { id, kind, name, start, end, meta, exceptions, placeId } = item.stop;
      const stop: TodayStop = { id, kind, name, start, meta, exceptions: [...exceptions] };
      if (end !== undefined) stop.end = end;
      if (placeId !== undefined) stop.placeId = placeId;
      return { type: "stop", stop };
    }
  }
}

/**
 * Projection du voyage pour l'écran 15 (F10-TL-2) : jours du programme sans positions (elles ne sont pas lues),
 * sans événements « Pendant ton séjour », sans raison, source, date de vérification, verrou, budget ni idée
 * « Surprends-moi ». Le `placeId` reste : il sert au lien « Itinéraire » au moment du clic, sans être stocké.
 */
export function projectTodayTrip(trip: Pick<Trip, "id" | "destination" | "timeZone" | "days">): TodayTrip {
  return {
    id: trip.id,
    destination: trip.destination,
    timeZone: trip.timeZone,
    days: trip.days.map((day) => ({
      index: day.index,
      date: day.date,
      title: day.title,
      generating: day.generating,
      items: day.items.map(projectTodayItem),
    })),
  };
}

// --- Calculs de l'écran 15 (F10-TL-2, F10-PO-3, F10-PO-4) -------------------------------------------------

/** Moment du voyage à l'instant `now`, à la date de la destination. */
export type TripMoment =
  | { kind: "before"; eve: boolean }
  | { kind: "during"; dayIndex: number }
  | { kind: "after" };

/** Jours datés d'un voyage et son fuseau : ce que lisent `currentDayIndex` et `tripMoment` (Séjour compris). */
export interface DatedTrip {
  timeZone: string;
  days: readonly { index: number; date: IsoDate }[];
}

/** Jour courant (`index`) à la date de la destination, ou `null` hors des dates du voyage. */
export function currentDayIndex(trip: DatedTrip, now: number): number | null {
  const today = localDateAt(now, trip.timeZone);
  return trip.days.find((day) => day.date === today)?.index ?? null;
}

/** Avant (la veille comprise), pendant ou après le voyage, à la date de la destination. */
export function tripMoment(trip: DatedTrip, now: number): TripMoment {
  const today = localDateAt(now, trip.timeZone);
  const first = trip.days[0];
  const last = trip.days[trip.days.length - 1];
  if (!first || !last || today > last.date) return { kind: "after" };
  if (today < first.date) return { kind: "before", eve: previousDate(first.date) === today };
  const dayIndex = currentDayIndex(trip, now);
  return dayIndex === null ? { kind: "after" } : { kind: "during", dayIndex };
}

/** Moment présent dans la journée : étape en cours, sinon temps libre en cours. */
export type CurrentMoment = { kind: "stop"; stop: TodayStop } | { kind: "free"; to: LocalTime };

const stops = (day: Pick<TodayDay, "items">): TodayStop[] =>
  day.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));

/** Étape en cours : `start` ≤ maintenant < `end` ; une étape sans `end` n'est jamais en cours (F10-PO-4). */
export function currentStop(day: Pick<TodayDay, "items">, time: LocalTime): TodayStop | null {
  return stops(day).find((stop) => stop.end !== undefined && stop.start <= time && time < stop.end) ?? null;
}

/** Moment présent à l'heure `time` de la destination : étape en cours, sinon temps libre en cours, sinon `null`. */
export function nowAt(day: Pick<TodayDay, "items">, time: LocalTime): CurrentMoment | null {
  const stop = currentStop(day, time);
  if (stop) return { kind: "stop", stop };
  for (const item of day.items) {
    if (item.type === "free" && item.from <= time && time < item.to) return { kind: "free", to: item.to };
  }
  return null;
}

/** Prochaine étape et trajet qui la précède dans la ligne du jour. */
export interface NextUp {
  stop: TodayStop;
  segment: Segment | null;
}

/**
 * Prochaine étape : la première étape du jour dont `start` est strictement après `time` (F10-PO-4). Un repas pas
 * encore choisi n'est jamais une étape ; le segment est celui qui précède immédiatement l'étape dans la ligne.
 */
export function nextUp(day: Pick<TodayDay, "items">, time: LocalTime): NextUp | null {
  for (const [index, item] of day.items.entries()) {
    if (item.type !== "stop" || item.stop.start <= time) continue;
    const previous = day.items[index - 1];
    return { stop: item.stop, segment: previous?.type === "segment" ? previous.segment : null };
  }
  return null;
}

/** Étape passée : `end` ≤ maintenant, ou `start` ≤ maintenant pour une étape sans `end`. */
export function isPastStop(stop: Pick<TodayStop, "start" | "end">, time: LocalTime): boolean {
  return stop.end !== undefined ? stop.end <= time : stop.start <= time;
}

/** Première étape d'un jour (repas pas encore choisis exceptés), ou `null`. */
export function firstStop(day: Pick<TodayDay, "items">): TodayStop | null {
  return stops(day)[0] ?? null;
}

/** Le jour a-t-il au moins une étape (repas pas encore choisis exceptés) ? */
export function hasStops(day: Pick<TodayDay, "items">): boolean {
  return firstStop(day) !== null;
}

/** Rappels « À réserver » (F10-PO-5) : étapes du jour encore à venir, et toutes celles du lendemain. */
export interface Reminders {
  today: TodayStop[];
  tomorrow: TodayStop[];
}

const toReserve = (stop: TodayStop) => stop.exceptions.includes("toReserve");

/** Rappels du jour `dayIndex` à l'heure `time` de la destination. */
export function reminders(days: readonly Pick<TodayDay, "index" | "items">[], dayIndex: number, time: LocalTime): Reminders {
  const today = days.find((day) => day.index === dayIndex);
  const tomorrow = days.find((day) => day.index === dayIndex + 1);
  return {
    today: today ? stops(today).filter((stop) => toReserve(stop) && stop.start > time) : [],
    tomorrow: tomorrow ? stops(tomorrow).filter(toReserve) : [],
  };
}
