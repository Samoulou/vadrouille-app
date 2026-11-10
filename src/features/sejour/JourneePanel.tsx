import Link from "next/link";
import { Suspense, lazy, useRef } from "react";

import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { Button } from "@/components/ligne/Button";
import { DayLine } from "@/components/ligne/DayLine";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { Day } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatTitreJour } from "@/lib/dates";

import { DAY_LIST_ID, PLACES_FROM_GOOGLE } from "./constants";
import { EventLines } from "./EventLines";
import type { TripRoutes } from "./routes";
import { SurpriseBlock } from "./SurpriseBlock";
import { dayTravelLine, travelBannerMessage } from "./travel";

const t = messages.sejour;

/** Ligne « Vers {ville} » : chargée à la demande, le jour d'un changement de ville seulement (handover front § 14). */
const VersVille = lazy(() => import("./VersVille").then((loaded) => ({ default: loaded.VersVille })));

/**
 * Bandeau de chevauchement (spécification M4-suite § 5) : chargé à la demande, comme la ligne « Vers {ville} », seulement
 * pour une journée de changement de ville qui a des événements (décision 0152 § 4) ; le calcul du domaine reste hors du
 * JavaScript initial des autres journées.
 */
const BandeauChevauchement = lazy(() => import("./BandeauChevauchement").then((loaded) => ({ default: loaded.BandeauChevauchement })));

export interface JourneePanelProps {
  day: Day;
  routes: TripRoutes;
  /** Mention « Données de lieux : Google » (adaptateur `prototype`) ; `PLACES_FROM_GOOGLE` par défaut. */
  placesFromGoogle?: boolean;
  /** Étapes surlignées 2 s après une modification (F7, décision 0016 § 9). */
  highlightedStopIds?: readonly string[];
  /** « Ajouter un lieu » sous la ligne du jour (M5d-2 ; F7-PO-8) : voyage débloqué, adaptateurs `mock` et `api` ; absent sinon. */
  addPlaceHref?: string | null;
}

/**
 * Contenu du panneau de l'écran 12 « Journée », dans l'ordre de F5-PO-5 : titre du jour (niveau 1), titre libre
 * du jour s'il existe (`Day.theme`, décision 0116 § 6) et ligne trajet/budget, bandeaux (préparation, chevauchement de la ligne
 * « Vers {ville} », trajet : spécification M4-suite § 5), ligne du jour, « Événements du jour »,
 * « Surprends-moi », mention d'attribution. Un jour en préparation n'affiche que son bandeau et ses événements.
 */
export function JourneePanel({ day, routes, placesFromGoogle = PLACES_FROM_GOOGLE, highlightedStopIds, addPlaceHref = null }: JourneePanelProps) {
  const banner = day.generating ? null : travelBannerMessage(day);
  const travelLine = day.generating ? null : dayTravelLine(day);
  // Un chevauchement suppose une ligne « Vers {ville} » et au moins un événement ; jamais pendant la préparation (§ 5).
  const peutChevaucher = !day.generating && day.events.length > 0 && day.items.some((item) => item.type === "transfer");
  const evenements = useRef<HTMLElement>(null);

  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-8">
      <header className="flex flex-col gap-1">
        {/* Focusable par script seulement : cible du focus après l'annulation d'une modification (F7-PO-1). */}
        <h1
          tabIndex={-1}
          data-part="titre-jour"
          className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink"
        >
          {formatTitreJour(day.date)}
        </h1>
        {/* Titre libre du jour (décision 0116 § 6, lot 1 bis) : texte maison brut, sous le titre calculé depuis la date. */}
        {day.theme ? (
          <p data-part="theme-jour" className="text-corps font-bold text-ink-2">
            {day.theme}
          </p>
        ) : null}
        {travelLine === null ? null : (
          <p data-part="trajet-budget" className="text-corps-s text-ink-soft tabular-nums">
            {travelLine}
          </p>
        )}
      </header>

      {day.generating ? <StatusBanner kind="generating" message={format(t.journee.enPreparation, { n: day.index })} /> : null}
      {peutChevaucher ? (
        <Suspense fallback={null}>
          <BandeauChevauchement items={day.items} events={day.events} onShowEvents={() => evenements.current?.focus()} />
        </Suspense>
      ) : null}
      {banner ? <StatusBanner kind="travel" message={banner} /> : null}

      {day.generating ? null : (
        <div id={DAY_LIST_ID} tabIndex={-1} className="rounded-block">
          <h2 className="sr-only">{format(t.journee.etapes, { n: day.index })}</h2>
          <DayLine
            items={day.items}
            getStopHref={(stop) => routes.etape(day.index, stop.id)}
            getIdeasHref={(free) => routes.ajouter(day.index, free)}
            // « Choisir » d'un repas pas encore choisi (F7-PO-8, M5d-3) : même condition que « Ajouter un lieu » (M5-PO-1).
            getMealLink={
              addPlaceHref === null
                ? undefined
                : ({ time, meal }) => ({
                    href: routes.ajouter(day.index, { time, meal }),
                    label: t.journee.choisirRepas.libelle,
                    name: t.journee.choisirRepas[meal],
                  })
            }
            highlightedStopIds={highlightedStopIds}
            renderTransfer={(transfer) => (
              <Suspense fallback={null}>
                <VersVille transfer={transfer} />
              </Suspense>
            )}
          />
        </div>
      )}

      {day.generating || addPlaceHref === null ? null : (
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link href={addPlaceHref} data-part="ajouter-un-lieu">
            {t.journee.ajouterUnLieu}
          </Link>
        </Button>
      )}

      {day.events.length > 0 ? (
        // Focusable par script seulement, comme la liste du jour : cible de l'action du bandeau de chevauchement (M4-suite § 5).
        <section ref={evenements} tabIndex={-1} aria-labelledby="evenements-du-jour" className="flex flex-col gap-3 rounded-block">
          <h2 id="evenements-du-jour" className="text-section font-extrabold text-ink">
            {t.evenements.titreJour}
          </h2>
          <EventLines events={day.events} getHref={(event) => routes.etape(day.index, event.id)} />
        </section>
      ) : null}

      {!day.generating && day.surprise ? <SurpriseBlock idea={day.surprise} addHref={addPlaceHref === null ? null : `${addPlaceHref}?idee=${encodeURIComponent(day.surprise.id)}`} /> : null}

      <PlacesAttribution placesFromGoogle={placesFromGoogle} />
    </div>
  );
}
