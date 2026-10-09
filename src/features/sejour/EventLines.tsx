import Link from "next/link";

import { Tag } from "@/components/ligne";
import type { Stop } from "@/contracts";
import { format, messages } from "@/i18n";

const t = messages.sejour.evenements;

/** Plage d'un événement : « 18:00 – 19:00 », ou l'heure de début seule sans fin (F5-PO-15). */
export function eventRange(stop: Pick<Stop, "start" | "end">): string {
  return stop.end ? format(t.plage, { start: stop.start, end: stop.end }) : stop.start;
}

export interface EventLinesProps {
  events: Stop[];
  /** Adresse de la fiche de l'événement (écran 13). */
  getHref: (stop: Stop) => string;
}

/**
 * Lignes d'événements (`Day.events`) : plage, nom, métadonnées, une `Tag` par exception ; toute la ligne
 * est un lien vers la fiche de l'événement (F5-PO-3, F5-PO-5). Rendu provisoire (F5-Q1).
 */
export function EventLines({ events, getHref }: EventLinesProps) {
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={getHref(event)}
            data-part="evenement"
            className="flex min-h-(--touch-target) flex-col items-start gap-1 rounded-block bg-muted p-3"
          >
            <span className="text-corps-s font-bold text-ink-2 tabular-nums">{eventRange(event)}</span>
            <span className="text-arret font-bold text-ink">{event.name}</span>
            <span className="text-corps-s text-ink-soft">{event.meta}</span>
            {event.exceptions.length > 0 ? (
              <span className="mt-1 flex flex-wrap gap-2">
                {event.exceptions.map((exception) => (
                  <Tag key={exception} kind={exception} />
                ))}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
