import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { DayLine } from "@/components/ligne/DayLine";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { SharedDay, SharedStop } from "@/contracts";
import { DAY_LIST_ID } from "@/features/sejour/constants";
import { EventLines } from "@/features/sejour/EventLines";
import { format, messages } from "@/i18n";
import { formatTitreJour } from "@/lib/dates";

import { ReadOnlyMention } from "./ReadOnlyMention";

const t = messages.partage.vue;

export interface SharedDayScreenProps {
  day: SharedDay;
  /** Mention « Données de lieux : Google » (F10-PO-20), sous la même condition que la Journée. */
  placesFromGoogle: boolean;
}

/**
 * Panneau de `RPJ`, « Journée partagée » (spécification F10, F10c, F10-PO-14) : lecture seule de l'écran 12.
 * Titre du jour (niveau 1), `DayLine` sans lien (ni Fiche, ni « Idées », ni « Choisir », ni « Surprends-moi »),
 * terminus sans libellé, sans bandeau de trajet ni ligne de budget ; événements du jour sans lien.
 */
export function SharedDayScreen({ day, placesFromGoogle }: SharedDayScreenProps) {
  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-8">
      <ReadOnlyMention />
      <h1 data-part="titre-jour" className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
        {formatTitreJour(day.date)}
      </h1>

      {/* Cible du lien d'évitement de la carte, y compris pour un jour en préparation (bandeau à la place de la liste). */}
      <div id={DAY_LIST_ID} tabIndex={-1} className="rounded-block">
        {day.generating ? (
          <StatusBanner kind="generating" message={t.enPreparation} />
        ) : (
          <>
            <h2 className="sr-only">{format(t.etapes, { n: day.index })}</h2>
            <DayLine<SharedStop> items={day.items} />
          </>
        )}
      </div>

      {day.events.length > 0 ? (
        <section aria-labelledby="evenements-du-jour" className="flex flex-col gap-3">
          <h2 id="evenements-du-jour" className="text-section font-extrabold text-ink">
            {t.evenementsJour}
          </h2>
          <EventLines events={day.events} />
        </section>
      ) : null}

      <PlacesAttribution placesFromGoogle={placesFromGoogle} />
    </div>
  );
}
