import type { Day, Stop } from "@/contracts";
import { format, messages } from "@/i18n";

import { eventRange } from "./EventLines";

/**
 * Fonctions pures de l'écran 13 « Fiche étape » (spécification F5, F5-PO-8 à F5-PO-11). Le paramètre
 * `etape` de l'adresse est un `Stop.id` (identifiant d'étape interne), jamais un `placeId`.
 */

export interface FicheTarget {
  stop: Stop;
  /** `true` : étape de la ligne du jour (`Day.items`) ; `false` : événement de `Day.events`, hors programme. */
  inProgramme: boolean;
}

/**
 * Étape ou événement du jour désigné par `etape`, ou `null` (absent du jour, paramètre absent). Un
 * terminus ou un créneau de repas pas encore choisi n'a pas d'identifiant : la fiche ne s'ouvre jamais pour eux.
 */
export function findFicheTarget(day: Day, etape: string | null | undefined): FicheTarget | null {
  if (!etape) return null;
  for (const item of day.items) {
    if (item.type === "stop" && item.stop.id === etape) return { stop: item.stop, inProgramme: true };
  }
  const event = day.events.find((candidate) => candidate.id === etape);
  return event ? { stop: event, inProgramme: false } : null;
}

/** Moment de la fiche : « J2 · Dimanche 30 août · 10:50 – 11:50 », ou l'heure de début seule sans fin. */
export function ficheMoment(day: Pick<Day, "index" | "title">, stop: Pick<Stop, "start" | "end">): string {
  return format(messages.sejour.fiche.moment, { n: day.index, title: day.title, range: eventRange(stop) });
}
