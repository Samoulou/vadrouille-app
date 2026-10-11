"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, type MouseEvent } from "react";

import { createLazyTrack } from "@/analytics/lazy";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { ChecklistRow } from "@/components/ligne/ChecklistRow";
import { Counter } from "@/components/ligne/Counter";
import { DayBadge } from "@/components/ligne/DayBadge";
import { DestinationPlate } from "@/components/ligne/DestinationPlate";
import type { ChecklistItem } from "@/contracts";
import { formatDateCourte, plateMeta } from "@/features/voyage/plate";
import { format, messages } from "@/i18n";

import { EventLines, eventRange } from "./EventLines";
import { useSejourOrigin } from "./SejourOrigin";
import { daySummary, tripBudgetLine, tripEvents } from "./travel";
import { useTripShell } from "./TripShell";

const t = messages.sejour;
const ts = t.sejour;

export interface SejourPanelProps {
  /** Enregistreur des mesures choisi par la page (aucun envoi réseau, décision 0013 § 3.3). */
  recorderKind?: RecorderKind;
  /** Enregistreur injecté (tests) ; prime sur `recorderKind`. */
  recorder?: EventRecorder;
}

/** Nom accessible du compteur : « 1 réservation à faire », « 4 réservations à faire ». */
function counterLabel(remaining: number): string {
  return remaining === 1 ? ts.aFaire.compteur.un : format(ts.aFaire.compteur.plusieurs, { n: remaining });
}

/**
 * Contenu du panneau de l'écran 11 « Séjour » (spécification F5, F5-PO-3), dans cet ordre : plaque de la
 * destination (titre de niveau 1), budget, « À faire avant de partir », « Pendant ton séjour », « Jour par
 * jour ». Le voyage vient du contexte de `TripShell` : les lignes cochées y sont conservées d'un onglet à
 * l'autre, en mémoire seulement (F5-PO-16). La validation de la mesure est chargée au premier cochage
 * (`createLazyTrack`), hors du JavaScript initial du Séjour.
 */
export function SejourPanel({ recorderKind = "none", recorder }: SejourPanelProps) {
  const { trip, routes, actions } = useTripShell();
  const track = useMemo(() => createLazyTrack(recorderKind, recorder), [recorderKind, recorder]);
  const origin = useSejourOrigin();
  const eventsRef = useRef<HTMLElement>(null);

  const budget = tripBudgetLine(trip.days);
  const remaining = trip.checklist.filter((item) => !item.done).length;
  const events = tripEvents(trip.days);
  const dayOfEvent = new Map(events.map(({ day, event }) => [event.id, day]));

  // Retour du navigateur depuis la fiche d'un événement ouverte ici : focus sur sa ligne (F5-PO-8).
  useEffect(() => {
    const href = origin?.take();
    if (!href) return;
    const link = Array.from(eventsRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-part='evenement']") ?? []).find(
      (candidate) => candidate.getAttribute("href") === href,
    );
    link?.focus();
  }, [origin]);

  const onEventClickCapture = (event: MouseEvent<HTMLElement>) => {
    const href = (event.target as Element).closest<HTMLAnchorElement>("a[data-part='evenement']")?.getAttribute("href");
    if (href) origin?.remember(href);
  };

  // Cocher envoie `checklist_item_done` une fois l'action résolue ; décocher n'envoie rien (décision 0015 § 6).
  const onToggle = async (item: ChecklistItem, done: boolean) => {
    await actions.setChecklistItemDone(item.id, done);
    if (done) await track({ name: "checklist_item_done", properties: {} });
  };

  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-8">
      <DestinationPlate name={trip.destination} meta={plateMeta(trip)} color={trip.destinationColor} />

      {budget ? (
        <p data-part="budget" className="text-corps text-ink-2 tabular-nums">
          {budget}
        </p>
      ) : null}

      <section aria-labelledby="a-faire-avant-de-partir" data-part="a-faire" className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 id="a-faire-avant-de-partir" className="text-section font-extrabold text-ink">
            {ts.aFaire.titre}
          </h2>
          <Counter value={remaining} label={counterLabel(remaining)} />
        </div>
        <ul>
          {trip.checklist.map((item) => (
            <li key={item.id} className="border-b border-hairline last:border-b-0">
              <ChecklistRow
                label={item.label}
                when={item.when}
                done={item.done}
                bookingUrl={item.bookingUrl}
                sponsored={item.sponsored}
                onToggle={(done) => void onToggle(item, done)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section
        ref={eventsRef}
        aria-labelledby="pendant-ton-sejour"
        data-part="pendant"
        onClickCapture={onEventClickCapture}
        className="flex flex-col gap-3"
      >
        <h2 id="pendant-ton-sejour" className="text-section font-extrabold text-ink">
          {ts.pendant.titre}
        </h2>
        {events.length > 0 ? (
          <EventLines
            events={events.map(({ event }) => event)}
            getHref={(event) => routes.etape(dayOfEvent.get(event.id)?.index ?? 1, event.id)}
            getMoment={(event) => {
              const day = dayOfEvent.get(event.id);
              return day
                ? format(t.evenements.prefixe, { n: day.index, date: formatDateCourte(day.date), plage: eventRange(event) })
                : eventRange(event);
            }}
          />
        ) : (
          <p className="text-corps text-ink-soft">{ts.pendant.vide}</p>
        )}
      </section>

      <section aria-labelledby="jour-par-jour" data-part="jour-par-jour" className="flex flex-col gap-1">
        <h2 id="jour-par-jour" className="text-section font-extrabold text-ink">
          {ts.jourParJour.titre}
        </h2>
        <ul>
          {trip.days.map((day) => (
            <li key={day.index} className="border-b border-hairline last:border-b-0">
              <Link
                href={routes.jour(day.index)}
                data-part="jour"
                className="flex min-h-(--touch-target) items-center gap-3 rounded-control py-2"
              >
                <DayBadge day={day.index} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-corps font-bold text-ink">{day.title}</span>
                  <span className="text-corps-s text-ink-soft tabular-nums">
                    {day.generating ? ts.jourParJour.enPreparation : daySummary(day)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
