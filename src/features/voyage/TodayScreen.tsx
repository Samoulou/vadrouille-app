"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { createLazyTrack } from "@/analytics/lazy";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { ActionBanner } from "@/components/ligne/ActionBanner";
import { DayLine, segmentLabel } from "@/components/ligne/DayLine";
import { iconButtonClassName } from "@/components/ligne/IconButton";
import { IconRetour } from "@/components/ligne/icons";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { Tag } from "@/components/ligne/Tag";
import { tripRoutes } from "@/features/sejour/routes";
import { format, messages } from "@/i18n";
import { registerOfflineFallback } from "@/lib/offline/register";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

import { timeZoneMention } from "./fuseau";
import { itineraryUrl } from "./itineraire";
import {
  deviceTimeDiffers,
  firstStop,
  hasStops,
  isPastStop,
  localTimeAt,
  nextUp,
  nowAt,
  reminders,
  tripMoment,
  type CurrentMoment,
  type LocalTime,
  type NextUp,
  type TodayDay,
  type TodayStop,
  type TodayTrip,
} from "./today";
import { useClientNow } from "./use-client-now";

const t = messages.voyage.aujourdhui;

/** Identifiant du bandeau hors ligne : il décrit les liens désactivés (`aria-describedby`, F10-PO-6). */
const OFFLINE_ID = "aujourdhui-hors-ligne";

export interface TodayScreenProps {
  /** Voyage projeté par la page serveur (F10-TL-2) : tous les jours ; le jour courant est choisi ici. */
  trip: TodayTrip;
  /** Mention « Données de lieux : Google » (F10-PO-20) ; `false` en phase 0. */
  placesFromGoogle: boolean;
  /** Enregistreur des mesures choisi par la page (aucun envoi réseau, décision 0013 § 3.3). */
  recorderKind?: RecorderKind;
  /** Enregistreur injecté (tests) ; prime sur `recorderKind`. */
  recorder?: EventRecorder;
  /** Horloge injectable (tests) ; `Date.now` par défaut. Fonction stable. */
  now?: () => number;
  /** Fuseau de l'appareil (tests) ; celui du navigateur par défaut. */
  deviceTimeZone?: string;
}

/** « Samedi 29 août » → « samedi 29 août » : date d'un jour dans une phrase (`redaction.md`). */
function inSentence(title: string): string {
  return title.charAt(0).toLocaleLowerCase("fr") + title.slice(1);
}

/**
 * Lien désactivé hors ligne (F10-PO-6) : focalisable, `aria-disabled`, décrit par le bandeau, sans effet au clic,
 * clic milieu compris (`auxclick`, qui ouvrirait un nouvel onglet).
 */
function offlineLinkProps(online: boolean) {
  if (online) return {};
  const prevent = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault();
  return {
    "aria-disabled": true as const,
    "aria-describedby": OFFLINE_ID,
    onClick: prevent,
    onAuxClick: prevent,
  };
}

const LINK = "inline-flex min-h-(--touch-target) items-center self-start rounded-control font-bold underline underline-offset-2";

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-part={id} className="flex flex-col gap-1 rounded-block bg-muted p-4 text-ink-2">
      <h2 id={id} className="text-section font-extrabold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tags({ stop }: { stop: TodayStop }) {
  if (stop.exceptions.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-2">
      {stop.exceptions.map((exception) => (
        <Tag key={exception} kind={exception} />
      ))}
    </span>
  );
}

function CurrentBlock({ current }: { current: CurrentMoment }) {
  return (
    <Block id="en-ce-moment" title={t.enCeMoment.titre}>
      {current.kind === "stop" ? (
        <>
          <p className="text-arret font-bold text-ink-2">{current.stop.name}</p>
          {current.stop.end ? (
            <p className="text-heure-l font-bold text-ink-2 tabular-nums">{format(t.enCeMoment.jusqua, { end: current.stop.end })}</p>
          ) : null}
          <p className="text-corps-s text-ink-soft">{current.stop.meta}</p>
          <Tags stop={current.stop} />
        </>
      ) : (
        <p className="text-arret font-bold text-ink-2 tabular-nums">{format(t.enCeMoment.tempsLibre, { to: current.to })}</p>
      )}
    </Block>
  );
}

function NextBlock({ next, title, online }: { next: NextUp; title: string; online: boolean }) {
  const { stop, segment } = next;
  return (
    <Block id="prochaine-etape" title={title}>
      <p className="text-heure-l font-bold text-ink-2 tabular-nums">
        {stop.end ? format(t.prochaine.plage, { start: stop.start, end: stop.end }) : stop.start}
      </p>
      <p className="text-arret font-bold text-ink-2">{stop.name}</p>
      <p className="text-corps-s text-ink-soft">{stop.meta}</p>
      <Tags stop={stop} />
      {segment ? (
        <p data-part="pour-y-aller" className="text-corps-s text-ink-soft tabular-nums">
          {format(t.prochaine.pourYAller, { segment: segmentLabel(segment) })}
        </p>
      ) : null}
      {stop.placeId ? (
        <a
          href={itineraryUrl({ name: stop.name, placeId: stop.placeId }, segment?.mode)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={format(t.prochaine.itineraireNom, { name: stop.name })}
          data-part="itineraire"
          className={cn(LINK, "text-corps", online ? "text-line" : "text-ink-soft")}
          {...offlineLinkProps(online)}
        >
          {t.prochaine.itineraire}
        </a>
      ) : null}
    </Block>
  );
}

function RemindersBanner({ today, tomorrow }: { today: TodayStop[]; tomorrow: TodayStop[] }) {
  const group = (id: string, title: string, list: TodayStop[]) =>
    list.length > 0 ? (
      <div className="flex flex-col gap-1">
        <h3 id={id} className="text-corps font-bold text-ink">
          {title}
        </h3>
        <ul aria-labelledby={id} className="flex flex-col gap-1">
          {list.map((stop) => (
            <li key={stop.id} className="text-corps text-ink tabular-nums">
              {format(t.rappels.ligne, { time: stop.start, name: stop.name })}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <ActionBanner title={t.rappels.titre} titleId="a-reserver">
      {group("a-reserver-aujourdhui", t.rappels.aujourdhui, today)}
      {group("a-reserver-demain", t.rappels.demain, tomorrow)}
      <p className="text-corps-s text-ink">{t.rappels.avertissement}</p>
    </ActionBanner>
  );
}

function TomorrowBlock({ day }: { day: TodayDay | undefined }) {
  const stop = day ? firstStop(day) : null;
  if (!stop) return null;
  return (
    <section aria-labelledby="demain" data-part="demain" className="flex flex-col gap-1">
      <h2 id="demain" className="text-section font-extrabold text-ink">
        {t.demain.titre}
      </h2>
      <p className="text-corps-s text-ink-2 tabular-nums">{format(t.demain.premiereEtape, { start: stop.start, name: stop.name })}</p>
    </section>
  );
}

/** Ce que l'annonce polie dit quand l'étape en cours ou la prochaine étape change par l'horloge. */
function announcementOf(current: CurrentMoment | null, next: NextUp | null): string {
  if (current?.kind === "stop") return format(t.annonce.enCeMoment, { name: current.stop.name });
  if (next) return format(t.annonce.prochaine, { name: next.stop.name, start: next.stop.start });
  return "";
}

interface DuringProps {
  trip: TodayTrip;
  day: TodayDay;
  time: LocalTime;
  current: CurrentMoment | null;
  next: NextUp | null;
  online: boolean;
}

/** Contenu aux dates du voyage, dans l'ordre du handover § 6 (F10-PO-2). */
function During({ trip, day, time, current, next, online }: DuringProps) {
  const routes = tripRoutes("/voyages", trip.id);
  const { today, tomorrow } = reminders(trip.days, day.index, time);
  const currentStopId = current?.kind === "stop" ? current.stop.id : undefined;
  let blocks: ReactNode;
  if (day.generating) {
    blocks = <p className="text-corps text-ink">{t.journee.enPreparation}</p>;
  } else if (!hasStops(day)) {
    blocks = <p className="text-corps text-ink">{t.prochaine.aucuneEtape}</p>;
  } else {
    blocks = (
      <>
        {current ? <CurrentBlock current={current} /> : null}
        {next ? (
          <NextBlock next={next} title={current ? t.prochaine.ensuite : t.prochaine.titre} online={online} />
        ) : current?.kind !== "stop" ? (
          <p data-part="plus-d-etape" className="text-corps text-ink">
            {t.prochaine.plusDEtape}
          </p>
        ) : null}
      </>
    );
  }
  return (
    <>
      {blocks}
      {today.length > 0 || tomorrow.length > 0 ? <RemindersBanner today={today} tomorrow={tomorrow} /> : null}
      {day.generating ? null : (
        <section aria-labelledby="ta-journee" data-part="ta-journee" className="flex flex-col gap-3">
          <h2 id="ta-journee" className="text-section font-extrabold text-ink">
            {t.journee.titre}
          </h2>
          <DayLine
            items={day.items}
            compact
            currentKey={currentStopId}
            isPast={(stop) => stop.id !== currentStopId && isPastStop(stop, time)}
          />
        </section>
      )}
      <TomorrowBlock day={trip.days.find((candidate) => candidate.index === day.index + 1)} />
      <Link
        href={routes.jour(day.index)}
        prefetch={false}
        data-part="voir-carte"
        className={cn(LINK, "text-corps", online ? "text-line" : "text-ink-soft")}
        {...offlineLinkProps(online)}
      >
        {t.carte}
      </Link>
    </>
  );
}

/**
 * Écran 15 « Pendant le voyage » (`R15` ; spécification F10, F10-PO-2 à F10-PO-8 ; rendus et textes provisoires,
 * UX/UI, écran non maquetté, Q12). Page sans carte : « En ce moment », « Prochaine étape », rappels « À
 * réserver », la ligne du jour compacte, « Demain », lien vers la Journée. Le jour courant, l'heure et la
 * prochaine étape se calculent dans le navigateur, après le montage, à l'heure de la destination
 * (`Trip.timeZone`, F10-PO-3) ; avant, « Chargement de ta journée ». L'écran se met à jour au début de chaque
 * minute et au retour de l'onglet, sans rechargement, et annonce poliment un changement d'étape. Réseau perdu,
 * écran ouvert : bandeau hors ligne, contenu gardé en mémoire, liens réseau désactivés ; rien n'est enregistré
 * sur l'appareil.
 */
export function TodayScreen({ trip, placesFromGoogle, recorderKind = "none", recorder, now: clock, deviceTimeZone }: TodayScreenProps) {
  const now = useClientNow({ now: clock, tickEveryMinute: true });
  const online = useOnline();
  const routes = tripRoutes("/voyages", trip.id);
  const track = useMemo(() => createLazyTrack(recorderKind, recorder), [recorderKind, recorder]);

  const moment = now === null ? null : tripMoment(trip, now);
  const time = now === null ? null : localTimeAt(now, trip.timeZone);
  const day = moment?.kind === "during" ? trip.days.find((candidate) => candidate.index === moment.dayIndex) : undefined;
  const current = day && time && !day.generating ? nowAt(day, time) : null;
  const next = day && time && !day.generating ? nextUp(day, time) : null;

  // Annonce du changement d'étape (F10-PO-2) : rien au premier calcul, une annonce par changement de l'étape en
  // cours ou de la prochaine étape. Ajustement pendant le rendu, sans effet.
  const announceKey = day ? `${current?.kind === "stop" ? current.stop.id : ""}|${next?.stop.id ?? ""}` : null;
  const [announced, setAnnounced] = useState<{ key: string | null; message: string }>({ key: null, message: "" });
  if (announceKey !== null && announceKey !== announced.key) {
    setAnnounced({ key: announceKey, message: announced.key === null ? "" : announcementOf(current, next) });
  }

  // Page de repli hors ligne (F10b, F10-PO-8) : le service worker s'enregistre à l'ouverture de l'écran avec le
  // réseau, à toute date ; il ne contient aucune donnée du voyage. Aucun autre écran ne l'enregistre.
  useEffect(() => {
    registerOfflineFallback();
  }, []);

  // Une mesure par chargement, à la sortie de « Chargement de ta journée », quel que soit le cas (F10-PO-16).
  const opened = useRef(false);
  useEffect(() => {
    if (now === null || opened.current) return;
    opened.current = true;
    track({ name: "today_opened", properties: { offline: false } }).catch(() => {
      // Mesure perdue (chargement impossible) : rien à montrer, elle n'est pas réessayée.
    });
  }, [now, track]);

  let content: ReactNode;
  if (now === null || moment === null || time === null) {
    content = (
      <>
        <p role="status" data-part="chargement" className="text-corps text-ink-soft">
          {t.chargement}
        </p>
        <noscript>
          <p className="text-corps text-ink">{t.sansJavascript}</p>
          <a href={routes.sejour()} className={cn(LINK, "text-corps text-line")}>
            {t.voirSejour}
          </a>
        </noscript>
      </>
    );
  } else {
    const first = trip.days[0];
    const zone = deviceTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    content = (
      <>
        <div className="flex flex-col gap-1">
          <p data-part="sous-titre" className="text-corps-s text-ink-soft">
            {day ? format(t.sousTitre, { destination: trip.destination, n: day.index, title: day.title }) : trip.destination}
          </p>
          {deviceTimeDiffers(now, trip.timeZone, zone) ? (
            <p data-part="fuseau" className="text-legende text-ink-soft">
              {timeZoneMention(trip.destination)}
            </p>
          ) : null}
        </div>
        {/*
          Région live présente dès l'affichage de la journée, vide tant que le réseau est là : le bandeau y est
          injecté hors ligne, donc annoncé (règle des annonces de 0018). Vide, elle annule l'espacement du parent.
        */}
        <div id={OFFLINE_ID} role="status" data-part="hors-ligne" className="empty:-mt-5">
          {online ? null : <StatusBanner kind="offline" message={t.horsLigne} announce={false} />}
        </div>
        {day ? (
          <During trip={trip} day={day} time={time} current={current} next={next} online={online} />
        ) : (
          <>
            <p className="text-corps text-ink">
              {moment.kind === "after"
                ? t.apres
                : moment.kind === "before" && moment.eve
                  ? t.veille
                  : format(t.avant, { date: first ? inSentence(first.title) : "" })}
            </p>
            {moment.kind === "before" && moment.eve ? <TomorrowBlock day={first} /> : null}
            <Link href={routes.sejour()} prefetch={false} data-part="voir-sejour" className={cn(LINK, "text-corps text-line")}>
              {t.voirSejour}
            </Link>
          </>
        )}
        <PlacesAttribution placesFromGoogle={placesFromGoogle} />
      </>
    );
  }

  return (
    <main aria-labelledby="aujourdhui-titre" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-3 pb-10">
      <div className="flex items-center gap-3">
        <Link href={routes.sejour()} prefetch={false} aria-label={t.retour} data-part="retour" className={iconButtonClassName("square")}>
          <IconRetour />
        </Link>
        <h1 id="aujourdhui-titre" className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
          {t.titre}
        </h1>
      </div>
      {content}
      <p role="status" data-part="annonce" className="sr-only">
        {announced.message}
      </p>
    </main>
  );
}
