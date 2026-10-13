"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { DayMap } from "@/components/carte/DayMap";
import type { RouteDay, RouteMap } from "@/components/carte/route";
import { DayTabs } from "@/components/ligne/DayTabs";
import { IconRetour } from "@/components/ligne/icons";
import { Sheet } from "@/components/ligne/Sheet";
import { DEFAULT_SNAP, type SnapPoint } from "@/components/ligne/sheet-model";
import type { SharedDay, SharedDayMap } from "@/contracts";
import { weekdayOf } from "@/contracts/values";
import { DAY_LIST_ID } from "@/features/sejour/constants";
import { useMapLayout } from "@/features/sejour/map-layout";
import { messages } from "@/i18n";

import { sharedRoutes } from "./routes";

const t = messages.partage.vue;

/**
 * Jour lu par la carte : les étapes seulement, chacune désignée par sa clé locale (F10-TL-14). Aucun terminus :
 * le tracé va de la première à la dernière étape, et aucun point de départ ou d'arrivée (souvent le logement)
 * n'existe dans les données reçues.
 */
export function sharedRouteDay(day: Pick<SharedDay, "index" | "items">): RouteDay {
  return {
    index: day.index,
    items: day.items.flatMap((item) =>
      item.type === "stop" ? [{ type: "stop" as const, stop: { id: item.stop.key, name: item.stop.name } }] : [],
    ),
  };
}

/** Positions d'un jour pour la carte : chaque point relié à son étape par la clé locale. */
export function sharedRouteMap(map: SharedDayMap): RouteMap {
  return {
    dayIndex: map.index,
    points: map.points.map((point) => ({ ref: { type: "stop" as const, stopId: point.key }, lat: point.lat, lng: point.lng })),
  };
}

export interface SharedShellProps {
  token: string;
  days: readonly Pick<SharedDay, "index" | "date" | "items">[];
  /** Onglet affiché : « Séjour partagé » (`RP`) ou le jour `n` (`RPJ`). */
  current: "sejour" | number;
  /** Positions reçues : tous les jours pour `RP`, le jour affiché pour `RPJ`. */
  maps: readonly SharedDayMap[];
  placesFromGoogle: boolean;
  children: ReactNode;
}

/**
 * Mise en page de la vue partagée (spécification F10, F10c ; décision 0039, F10-TL-14) : carte en fond, panneau
 * `Sheet` au-dessus avec les onglets, comme le Séjour et la Journée, mais sans rien de privé : ni Fiche, ni
 * toast, ni session du voyage, ni « Partager », ni lien vers une page de la personne qui voyage. Marqueurs non
 * interactifs. La mise en page de la carte vient du module commun avec `TripShell`.
 */
export function SharedShell({ token, days, current, maps, placesFromGoogle, children }: SharedShellProps) {
  const routes = useMemo(() => sharedRoutes(token), [token]);
  const [snap, setSnap] = useState<SnapPoint>(DEFAULT_SNAP);
  const { mainRef, visibleInsets, fitPadding, fitScope } = useMapLayout(snap);
  const routeDays = useMemo(() => days.map(sharedRouteDay), [days]);
  const routeMaps = useMemo(() => maps.map(sharedRouteMap), [maps]);

  const day = current === "sejour" ? undefined : routeDays.find((candidate) => candidate.index === current);
  const retour =
    current === "sejour" ? null : (
      <Link
        href={routes.sejour()}
        aria-label={t.retour}
        data-part="retour"
        className="absolute left-3 top-3 z-10 inline-flex size-(--touch-target) items-center justify-center rounded-control border border-outline bg-raised text-ink"
      >
        <IconRetour />
      </Link>
    );

  const tabs = (
    <DayTabs
      days={days.map((candidate) => ({
        index: candidate.index,
        href: routes.jour(candidate.index),
        weekday: weekdayOf(candidate.date) ?? undefined,
      }))}
      current={current}
      sejourHref={routes.sejour()}
      className="px-4"
    />
  );

  return (
    <main ref={mainRef} className="fixed inset-0 overflow-hidden bg-map-land lg:flex">
      <div data-part="zone-carte" className="absolute inset-0 lg:relative lg:inset-auto lg:min-w-0 lg:flex-1">
        {day ? (
          <DayMap
            mode="day"
            day={day}
            map={routeMaps.find((candidate) => candidate.dayIndex === day.index) ?? null}
            interactiveMarkers={false}
            listId={DAY_LIST_ID}
            fitPadding={fitPadding}
            fitScope={fitScope}
            visibleInsets={visibleInsets}
            onSkipToList={() => {
              if (snap === 0.25) setSnap(DEFAULT_SNAP);
            }}
            controls={retour}
            placesFromGoogle={placesFromGoogle}
          />
        ) : (
          <DayMap
            mode="overview"
            days={routeDays}
            maps={routeMaps}
            controls={retour}
            fitPadding={fitPadding}
            fitScope={fitScope}
            placesFromGoogle={placesFromGoogle}
          />
        )}
      </div>
      <Sheet label={t.region} snap={snap} onSnapChange={setSnap} header={tabs} sideOnLargeScreen>
        {children}
      </Sheet>
    </main>
  );
}
