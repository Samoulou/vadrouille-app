import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { DayLine } from "@/components/ligne/DayLine";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { Day } from "@/contracts";
import { format, messages } from "@/i18n";
import { formatTitreJour } from "@/lib/dates";

import { DAY_LIST_ID, PLACES_FROM_GOOGLE } from "./constants";
import { EventLines } from "./EventLines";
import type { TripRoutes } from "./routes";
import { SurpriseBlock } from "./SurpriseBlock";
import { dayTravelLine, travelBannerMessage } from "./travel";

const t = messages.sejour;

export interface JourneePanelProps {
  day: Day;
  routes: TripRoutes;
  /** Mention « Données de lieux : Google » (adaptateur `prototype`) ; `PLACES_FROM_GOOGLE` par défaut. */
  placesFromGoogle?: boolean;
}

/**
 * Contenu du panneau de l'écran 12 « Journée », dans l'ordre de F5-PO-5 : titre du jour (niveau 1) et
 * ligne trajet/budget, bandeaux (préparation, trajet), ligne du jour, « Événements du jour »,
 * « Surprends-moi », mention d'attribution. Un jour en préparation n'affiche que son bandeau et ses événements.
 */
export function JourneePanel({ day, routes, placesFromGoogle = PLACES_FROM_GOOGLE }: JourneePanelProps) {
  const banner = day.generating ? null : travelBannerMessage(day);

  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{formatTitreJour(day.date)}</h1>
        {day.generating ? null : (
          <p data-part="trajet-budget" className="text-corps-s text-ink-soft tabular-nums">
            {dayTravelLine(day)}
          </p>
        )}
      </header>

      {day.generating ? <StatusBanner kind="generating" message={format(t.journee.enPreparation, { n: day.index })} /> : null}
      {banner ? <StatusBanner kind="travel" message={banner} /> : null}

      {day.generating ? null : (
        <div id={DAY_LIST_ID} tabIndex={-1} className="rounded-block">
          <h2 className="sr-only">{format(t.journee.etapes, { n: day.index })}</h2>
          <DayLine
            items={day.items}
            getStopHref={(stop) => routes.etape(day.index, stop.id)}
            getIdeasHref={(free) => routes.ajouter(day.index, free)}
          />
        </div>
      )}

      {day.events.length > 0 ? (
        <section aria-labelledby="evenements-du-jour" className="flex flex-col gap-3">
          <h2 id="evenements-du-jour" className="text-section font-extrabold text-ink">
            {t.evenements.titreJour}
          </h2>
          <EventLines events={day.events} getHref={(event) => routes.etape(day.index, event.id)} />
        </section>
      ) : null}

      {!day.generating && day.surprise ? <SurpriseBlock idea={day.surprise} /> : null}

      <PlacesAttribution placesFromGoogle={placesFromGoogle} />
    </div>
  );
}
