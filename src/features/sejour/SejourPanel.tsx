"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";

import { createLazyTrack } from "@/analytics/lazy";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { Button } from "@/components/ligne/Button";
import { ChecklistRow } from "@/components/ligne/ChecklistRow";
import { Counter } from "@/components/ligne/Counter";
import { DayBadge } from "@/components/ligne/DayBadge";
import { DestinationPlate } from "@/components/ligne/DestinationPlate";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { ChecklistItem } from "@/contracts";
import { countToReserve } from "@/contracts/values";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import { formatDateCourte, plateMeta } from "@/features/voyage/plate";
import { currentDayIndex } from "@/features/voyage/today";
import { useClientNow } from "@/features/voyage/use-client-now";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { accessUntil, formatTitreJour } from "@/lib/dates";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

import { EventLines, eventRange } from "./EventLines";
import { useSejourOrigin } from "./SejourOrigin";
import { checklistLabel, daySummary, tripBudgetLine, tripEvents } from "./travel";
import { useTripShell } from "./TripShell";

const t = messages.sejour;
const ts = t.sejour;

export interface SejourPanelProps {
  /** Enregistreur des mesures choisi par la page (aucun envoi réseau, décision 0013 § 3.3). */
  recorderKind?: RecorderKind;
  /** Enregistreur injecté (tests) ; prime sur `recorderKind`. */
  recorder?: EventRecorder;
  /** Horloge injectable (tests) ; `Date.now` par défaut. Fonction stable. */
  now?: () => number;
}

/** Nom accessible du compteur : « 1 réservation à faire », « 4 réservations à faire ». */
function counterLabel(remaining: number): string {
  return remaining === 1 ? ts.aFaire.compteur.un : format(ts.aFaire.compteur.plusieurs, { n: remaining });
}

/**
 * Journées du séjour absentes du voyage servi (spécification E2E-essai, lot 1) : un voyage d'essai non débloqué ne sert
 * que les journées de ses premières propositions. Chaque date du séjour (du départ au retour, sur le calendrier) qui
 * n'est pas une journée servie, avec son numéro de jour ; vide pour un voyage débloqué.
 */
export function joursADebloquer(trip: { unlocked: boolean; start: string; end: string; days: readonly { date: string }[] }): { index: number; date: string }[] {
  if (trip.unlocked || trip.end < trip.start) return [];
  const servies = new Set(trip.days.map((day) => day.date));
  const jours: { index: number; date: string }[] = [];
  // Borne de sécurité : un séjour du prototype dure 15 jours au plus (D1).
  for (let rang = 0; rang < 31; rang += 1) {
    const date = accessUntil(trip.start, rang);
    if (date > trip.end) break;
    if (!servies.has(date)) jours.push({ index: rang + 1, date });
  }
  return jours;
}

/**
 * Contenu du panneau de l'écran 11 « Séjour » (spécification F5, F5-PO-3), dans cet ordre : plaque de la
 * destination (titre de niveau 1), budget, « À faire avant de partir », « Pendant ton séjour », « Jour par
 * jour ». Le voyage vient du contexte de `TripShell` : les lignes cochées y sont conservées d'un onglet à
 * l'autre, en mémoire seulement (F5-PO-16). La validation de la mesure est chargée au premier cochage
 * (`createLazyTrack`), hors du JavaScript initial du Séjour.
 */
export function SejourPanel({ recorderKind = "none", recorder, now: clock }: SejourPanelProps) {
  const { trip, routes, actions, placesFromGoogle, unlockHref } = useTripShell();
  // Journées « À débloquer » seulement avec un lien de déblocage (voyage non débloqué, routes `/voyages`, paiement simulé
  // disponible) : sans lui, la liste ne montre que les journées servies, comme avant.
  const verrouilles = unlockHref ? joursADebloquer(trip) : [];
  // Lien « Aujourd'hui · Jour {n} » (F10-PO-7) : aux dates du voyage, à la date de la destination, calculée dans
  // le navigateur après le montage ; seulement avec la base `/voyages` (pas de page `R15` de développement).
  // Décalage assumé : aux dates du voyage, le lien apparaît après le montage et pousse le panneau d'une hauteur
  // de cible tactile. Réserver cette hauteur la laisserait vide sur tous les autres voyages (avant ou après les
  // dates), qui sont le cas courant, puisque le jour courant n'est connu qu'une fois dans le navigateur.
  const now = useClientNow({ now: clock });
  const aujourdhui = routes.aujourdhui();
  const todayIndex = now === null || aujourdhui === null ? null : currentDayIndex(trip, now);
  const track = useMemo(() => createLazyTrack(recorderKind, recorder), [recorderKind, recorder]);
  const origin = useSejourOrigin();
  const eventsRef = useRef<HTMLElement>(null);

  const budget = tripBudgetLine(trip.days);
  // Compteur : réservations non faites seulement (M5-PO-13, décision 0147 § 6.2) ; absent à 0 (`Counter`).
  const remaining = countToReserve(trip.checklist);
  // Cochage enregistré (adaptateur `api`, M5e) : hors ligne, cases inactives décrites par le bandeau ; échec annoncé.
  const online = useOnline();
  const offlineId = `${useId()}-hors-ligne`;
  const checklistOffline = actions.checklistOnServer === true && !online;
  // Échecs consécutifs de l'enregistrement : l'alerte reste jusqu'au prochain cochage réussi (revue UX de M5e, m3) ; un
  // nouvel échec la remonte (clé), pour qu'elle soit annoncée de nouveau.
  const [echecs, setEchecs] = useState(0);
  const toggleFailed = echecs > 0;
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

  // Cocher envoie `checklist_item_done` une fois l'action résolue ; décocher n'envoie rien (décision 0015 § 6). Un échec de
  // l'action (case non enregistrée, rétablie par l'implémentation) affiche « Impossible d'enregistrer. Réessaie. ».
  const onToggle = async (item: ChecklistItem, done: boolean) => {
    try {
      await actions.setChecklistItemDone(item.id, done);
    } catch {
      setEchecs((n) => n + 1);
      return;
    }
    setEchecs(0);
    if (done) await track({ name: "checklist_item_done", properties: {} });
  };

  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-8">
      {aujourdhui && todayIndex !== null ? (
        <Link
          href={aujourdhui}
          data-part="aujourdhui"
          className="inline-flex min-h-(--touch-target) items-center self-start rounded-control text-corps font-bold text-line underline underline-offset-2"
        >
          {format(t.aujourdhui.lien, { n: todayIndex })}
        </Link>
      ) : null}
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
        {checklistOffline ? (
          <div id={offlineId}>
            <StatusBanner kind="offline" message={ts.aFaire.horsLigne} />
          </div>
        ) : null}
        <p key={echecs} role="alert" data-part="a-faire-echec" className={cn("text-corps-s font-semibold text-ink", toggleFailed ? undefined : EMPTY_LIVE_REGION_CLASS)}>
          {toggleFailed ? t.echecEnregistrement : null}
        </p>
        <ul>
          {trip.checklist.map((item) => (
            <li key={item.id} className="border-b border-hairline last:border-b-0">
              <ChecklistRow
                label={checklistLabel(item)}
                when={item.when}
                done={item.done}
                bookingUrl={item.bookingUrl}
                sponsored={item.sponsored}
                disabledBy={checklistOffline ? offlineId : undefined}
                onToggle={(done) => {
                  onToggle(item, done).catch(() => {
                    // Échec de la mesure (chargement impossible) : la mesure perdue n'est pas réessayée, et le
                    // prochain cochage retente le chargement (`createLazyTrack`).
                  });
                }}
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
                  <span className="text-corps font-bold text-ink">{formatTitreJour(day.date)}</span>
                  <span className="text-corps-s text-ink-soft tabular-nums">
                    {day.generating ? ts.jourParJour.enPreparation : daySummary(day)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {verrouilles.map((day) => (
            <li key={`verrouille-${day.index}`} data-part="jour-a-debloquer" className="border-b border-hairline last:border-b-0">
              <span className="flex min-h-(--touch-target) items-center gap-3 py-2">
                {/* Pastille réduite non active, sans « complet » (réservé à Déplacer) ; le nom lu est « Jour 3, à débloquer ». */}
                <span aria-hidden="true">
                  <DayBadge day={day.index} size="sm" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="sr-only" data-part="nom-jour-a-debloquer">
                    {format(ts.jourParJour.nomADebloquer, { day: day.index })}
                  </span>
                  <span className="text-corps font-bold text-ink">{formatTitreJour(day.date)}</span>
                  <span aria-hidden="true" className="text-corps-s text-ink-soft">
                    {ts.jourParJour.aDebloquer}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
        {verrouilles.length > 0 && unlockHref ? (
          <Button asChild className="mt-2 self-start">
            <Link href={unlockHref} prefetch={false} data-part="debloquer">
              {ts.jourParJour.debloquer}
            </Link>
          </Button>
        ) : null}
      </section>

      <PlacesAttribution placesFromGoogle={placesFromGoogle} />
    </div>
  );
}
