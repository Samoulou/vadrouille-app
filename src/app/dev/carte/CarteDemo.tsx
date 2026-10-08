"use client";

import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";

import { CarteProvider, DayMap, PlacesAttribution, type CarteInjection } from "@/components/carte";
import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";
import { Button, DayLine } from "@/components/ligne";
import type { Day, DayMap as DayMapData, Stop } from "@/contracts";
import { format, messages } from "@/i18n";

const t = messages.dev.carte;

export type DemoRenderer = "simulee" | "google";
export type DemoConfig = "environnement" | "absente" | "factice";
export type DemoVue = "jour" | "ensemble";

const LIST_ID = "liste-etapes";
const INITIAL_DAY = 2;

/** Configuration factice des tests : jamais une vraie clé (spécification F4, « Configuration injectable »). */
const FAKE_CONFIG = { apiKey: "test-key", mapId: "test-map" };

const stopHref = (stop: Stop) => `/dev/carte?etape=${encodeURIComponent(stop.id)}`;

export interface CarteDemoProps {
  days: Day[];
  maps: DayMapData[];
  renderer: DemoRenderer;
  config: DemoConfig;
  vue: DemoVue;
}

export function CarteDemo({ days, maps, renderer, config, vue }: CarteDemoProps) {
  const [dayIndex, setDayIndex] = useState(INITIAL_DAY);
  const [selectedStopId, setSelectedStopId] = useState<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  const injection = useMemo<CarteInjection>(
    () => ({
      simulated: renderer === "simulee" ? SimulatedMapRenderer : undefined,
      config: config === "absente" ? {} : config === "factice" ? FAKE_CONFIG : undefined,
    }),
    [renderer, config],
  );

  const day = days.find((candidate) => candidate.index === dayIndex) ?? days[0];
  const dayMap = maps.find((candidate) => candidate.dayIndex === day?.index) ?? null;

  // Toucher un marqueur : la liste défile jusqu'à l'étape ; ni sélection, ni fiche, ni changement d'adresse.
  const onMarkerPress = useCallback((stopId: string) => {
    const link = listRef.current?.querySelector<HTMLAnchorElement>(
      `a[data-part='arret'][href$='etape=${CSS.escape(encodeURIComponent(stopId))}']`,
    );
    link?.scrollIntoView?.({ block: "center" });
  }, []);

  // Toucher une étape de la liste simule l'ouverture de sa fiche (F5) : elle devient la sélection.
  const onListClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-part='arret']");
    if (!link) {
      return;
    }
    event.preventDefault();
    setSelectedStopId(new URL(link.href).searchParams.get("etape") ?? undefined);
  };

  return (
    <CarteProvider value={injection}>
      <main className="flex flex-col gap-4 pb-8">
        <header className="flex flex-col gap-2 px-4 pt-4">
          <h1 className="text-section font-extrabold text-ink">{t.titre}</h1>
          <p className="text-corps-s text-ink-soft">{t.intro}</p>
          {vue === "jour" ? (
            <div role="group" aria-label={t.jours} className="flex flex-wrap gap-2">
              {days.map((candidate) => (
                <Button
                  key={candidate.index}
                  variant="secondary"
                  size="sm"
                  aria-pressed={candidate.index === day?.index}
                  className="min-w-(--touch-target) px-2"
                  onClick={() => {
                    setDayIndex(candidate.index);
                    setSelectedStopId(undefined);
                  }}
                >
                  {format(messages.ligne.jour.pastille, { day: candidate.index })}
                </Button>
              ))}
            </div>
          ) : null}
        </header>

        {vue === "jour" && day ? (
          <section data-demo="jour" aria-label={t.titre} className="flex flex-col gap-4">
            <div className="h-80">
              <DayMap
                mode="day"
                day={day}
                map={dayMap}
                selectedStopId={selectedStopId}
                onMarkerPress={onMarkerPress}
                listId={LIST_ID}
                placesFromGoogle={false}
              />
            </div>
            <div id={LIST_ID} ref={listRef} tabIndex={-1} className="px-4" onClickCapture={onListClick}>
              <h2 className="sr-only">{format(t.liste, { n: day.index })}</h2>
              <DayLine items={day.items} getStopHref={stopHref} />
            </div>
          </section>
        ) : null}

        {vue === "ensemble" ? (
          <section data-demo="ensemble" aria-label={t.titre} className="flex flex-col gap-4">
            <div className="h-80">
              <DayMap mode="overview" days={days} maps={maps} placesFromGoogle={false} />
            </div>
            <div className="px-4">
              <h2 className="text-corps font-bold text-ink">{t.sejour}</h2>
              <ol className="text-corps text-ink-2">
                {days.map((candidate) => (
                  <li key={candidate.index}>{candidate.title}</li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="attribution-titre" className="flex flex-col gap-2 px-4">
          <h2 id="attribution-titre" className="text-corps font-bold text-ink">
            {t.attribution.titre}
          </h2>
          <p className="text-corps-s text-ink-2">{t.attribution.avec}</p>
          <PlacesAttribution placesFromGoogle />
          <p className="text-corps-s text-ink-2">{t.attribution.sans}</p>
          <PlacesAttribution placesFromGoogle={false} />
        </section>
      </main>
    </CarteProvider>
  );
}
