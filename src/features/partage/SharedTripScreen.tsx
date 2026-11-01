import Link from "next/link";

import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { DayBadge } from "@/components/ligne/DayBadge";
import { DestinationPlate } from "@/components/ligne/DestinationPlate";
import type { SharedTrip } from "@/contracts";
import { EventLines, eventRange } from "@/features/sejour/EventLines";
import { dayStopCount, tripEvents } from "@/features/sejour/travel";
import { formatDateCourte, plateMeta } from "@/features/voyage/plate";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatTitreJour } from "@/lib/dates";

import { ReadOnlyMention } from "./ReadOnlyMention";
import { sharedRoutes } from "./routes";

const t = messages.partage.vue;

export interface SharedTripScreenProps {
  token: string;
  trip: SharedTrip;
  /** Mention « Données de lieux : Google » (F10-PO-20), sous la même condition que le Séjour. */
  placesFromGoogle: boolean;
}

/**
 * Panneau de `RP`, « Séjour partagé » (spécification F10, F10c, F10-PO-14) : lecture seule de l'écran 11, sans
 * budget, sans « À faire avant de partir », sans lien « Aujourd'hui » ni « Partager ». Les événements ne sont pas
 * des liens (pas de Fiche dans la vue partagée) ; « Jour par jour » mène aux `RPJ`, sans durée de trajet.
 */
export function SharedTripScreen({ token, trip, placesFromGoogle }: SharedTripScreenProps) {
  const routes = sharedRoutes(token);
  const events = tripEvents(trip.days);
  // Les événements partagés n'ont pas d'identifiant : chaque objet est relié à son jour par sa référence.
  const dayOfEvent = new Map(events.map(({ day, event }) => [event, day]));

  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-8">
      <ReadOnlyMention />
      <DestinationPlate name={trip.destination} meta={plateMeta(trip)} color={trip.destinationColor} />

      <section aria-labelledby="pendant-le-sejour" data-part="pendant" className="flex flex-col gap-3">
        <h2 id="pendant-le-sejour" className="text-section font-extrabold text-ink">
          {t.pendant.titre}
        </h2>
        {events.length > 0 ? (
          <EventLines
            events={events.map(({ event }) => event)}
            getMoment={(event) => {
              const day = dayOfEvent.get(event);
              return day
                ? format(messages.sejour.evenements.prefixe, { n: day.index, date: formatDateCourte(day.date), plage: eventRange(event) })
                : eventRange(event);
            }}
          />
        ) : (
          <p className="text-corps text-ink-soft">{t.pendant.vide}</p>
        )}
      </section>

      <section aria-labelledby="jour-par-jour" data-part="jour-par-jour" className="flex flex-col gap-1">
        <h2 id="jour-par-jour" className="text-section font-extrabold text-ink">
          {t.jourParJour.titre}
        </h2>
        <ul>
          {trip.days.map((day) => (
            <li key={day.index} className="border-b border-hairline last:border-b-0">
              <Link
                href={routes.jour(day.index)}
                prefetch={false}
                data-part="jour"
                className="flex min-h-(--touch-target) items-center gap-3 rounded-control py-2"
              >
                <DayBadge day={day.index} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-corps font-bold text-ink">{formatTitreJour(day.date)}</span>
                  <span className="text-corps-s text-ink-soft tabular-nums">
                    {day.generating ? t.jourParJour.enPreparation : dayStopCount(day)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <PlacesAttribution placesFromGoogle={placesFromGoogle} />
    </div>
  );
}
