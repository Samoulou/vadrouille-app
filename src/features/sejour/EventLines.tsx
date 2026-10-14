import Link from "next/link";

import { Tag } from "@/components/ligne/Tag";
import type { Stop } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatFaits } from "@/lib/faits";

const t = messages.sejour.evenements;

/** Plage d'un événement : « 18:00 – 19:00 », ou l'heure de début seule sans fin (F5-PO-15). */
export function eventRange(stop: Pick<Stop, "start" | "end">): string {
  return stop.end ? format(t.plage, { start: stop.start, end: stop.end }) : stop.start;
}

/** Événement tel que les lignes le lisent : `Stop` en est un sous-type, comme l'événement de la vue partagée (F10c). */
export type EventLineView = Pick<Stop, "name" | "start" | "end" | "facts" | "exceptions">;

export interface EventLinesProps<E extends EventLineView = Stop> {
  events: readonly E[];
  /**
   * Adresse de la fiche de l'événement (écran 13) ; sans fonction, la ligne n'est pas un lien (vue partagée :
   * le visiteur n'a pas de fiche, F10c), même disposition.
   */
  getHref?: (event: E) => string;
  /** Clé de rendu ; `id` de l'événement par défaut, sinon son rang. */
  getKey?: (event: E, index: number) => string;
  /**
   * Moment affiché en tête de ligne : la plage seule par défaut (« Événements du jour ») ; le Séjour y ajoute
   * le jour et la date (« J2 · dim. 30.08 · 18:00 – 19:00 », F5-PO-3).
   */
  getMoment?: (event: E) => string;
}

function defaultKey(event: EventLineView, index: number): string {
  return "id" in event && typeof event.id === "string" ? event.id : `#${index}`;
}

const LINE = "flex min-h-(--touch-target) flex-col items-start gap-1 rounded-block bg-muted p-3";

/**
 * Lignes d'événements (`Day.events`) : plage, nom, métadonnées, une `Tag` par exception ; toute la ligne
 * est un lien vers la fiche de l'événement (F5-PO-3, F5-PO-5), sauf sans `getHref` (vue partagée). Rendu
 * retenu par la décision 0018 § 3 : sur `muted`, tout le texte est en `ink-2`.
 */
export function EventLines<E extends EventLineView = Stop>({
  events,
  getHref,
  getKey = defaultKey,
  getMoment = eventRange,
}: EventLinesProps<E>) {
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event, index) => {
        const faits = formatFaits(event.facts);
        const content = (
          <>
            <span className="text-corps-s font-bold text-ink-2 tabular-nums">{getMoment(event)}</span>
            <span className="text-arret font-bold text-ink-2">{event.name}</span>
            {faits ? <span className="text-corps-s text-ink-2">{faits}</span> : null}
            {event.exceptions.length > 0 ? (
              <span className="mt-1 flex flex-wrap gap-2">
                {event.exceptions.map((exception) => (
                  <Tag key={exception} kind={exception} />
                ))}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={getKey(event, index)}>
            {getHref ? (
              <Link href={getHref(event)} scroll={false} data-part="evenement" className={LINE}>
                {content}
              </Link>
            ) : (
              <div data-part="evenement" className={LINE}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
