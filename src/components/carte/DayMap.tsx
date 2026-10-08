"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type MouseEvent } from "react";

import type { Day, DayMap as DayMapData } from "@/contracts";
import { format, messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { isMapConfigComplete, useCarteInjection } from "./config";
import { GoogleMapRenderer } from "./GoogleMapRenderer";
import { MAP_FALLBACK_TEXTS, MapFallback, type MapFallbackCause } from "./MapFallback";
import { buildDayRoute, buildOverview } from "./route";
import type { FitPadding, MapView } from "./types";

const t = messages.carte;

export type DayMapProps =
  | {
      mode: "day";
      /** Fournit l'ordre et la numérotation (items). */
      day: Day;
      /** Positions du jour (F4-TL-1) ; `null` ou vide : état de remplacement, aucun script chargé. */
      map: DayMapData | null;
      /** Étape dont la fiche est ouverte (F4-PO-5). */
      selectedStopId?: string;
      /** Marqueur touché : l'appelant fait défiler la liste jusqu'à l'étape (F4-PO-4). */
      onMarkerPress?: (stopId: string) => void;
      /** Id de la liste des étapes, cible du lien d'évitement ; l'appelant y pose `tabindex="-1"` (F4-PO-10). */
      listId: string;
      /** Marge de cadrage ; par défaut `--touch-target` de chaque côté. */
      fitPadding?: FitPadding;
      /** F4-PO-9 ; `false` avec l'adaptateur mock. */
      placesFromGoogle: boolean;
      className?: string;
    }
  | {
      mode: "overview";
      days: Day[];
      maps: DayMapData[];
      placesFromGoogle: boolean;
      className?: string;
    };

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** `navigator.onLine`, mis à jour aux événements `online` et `offline` ; en ligne au rendu serveur. */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Carte d'une journée ou vue d'ensemble du séjour (spécification F4).
 *
 * L'enveloppe choisit ce qui s'affiche, dans cet ordre de précédence (F4-PO-8) :
 * hors ligne (quel que soit le rendu), jour sans position, configuration absente (rendu Google
 * seulement, aucun script demandé), puis le rendu ; l'erreur de chargement est gérée par le rendu Google.
 * La carte simulée n'est utilisée que si elle est injectée par `CarteProvider` (/dev/carte, tests).
 */
export function DayMap(props: DayMapProps) {
  const online = useOnline();
  const [loadError, setLoadError] = useState(false);
  const { config, simulated: Simulated } = useCarteInjection();
  const configComplete = isMapConfigComplete(config);

  const day = props.mode === "day" ? props.day : null;
  const dayMap = props.mode === "day" ? props.map : null;
  const maps = props.mode === "overview" ? props.maps : null;
  const route = useMemo(() => (day ? buildDayRoute(day, dayMap) : null), [day, dayMap]);
  const rings = useMemo(() => (maps ? buildOverview(maps) : null), [maps]);

  const selectedStopId = props.mode === "day" ? props.selectedStopId : undefined;
  const onMarkerPress = props.mode === "day" ? props.onMarkerPress : undefined;
  const fitPadding = props.mode === "day" ? props.fitPadding : undefined;
  const view = useMemo<MapView | null>(() => {
    if (route && day) {
      return { mode: "day", fitKey: `jour-${day.index}`, route, selectedStopId, onMarkerPress, fitPadding };
    }
    if (rings) {
      return { mode: "overview", fitKey: "sejour", rings };
    }
    return null;
  }, [route, day, rings, selectedStopId, onMarkerPress, fitPadding]);

  const hasPositions = view ? (view.mode === "day" ? view.route.positions.length > 0 : view.rings.length > 0) : false;
  const needsConfig = !Simulated;

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && needsConfig && !configComplete) {
      console.warn(
        "carte : NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ou NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID manquant, état de remplacement affiché.",
      );
    }
  }, [needsConfig, configComplete]);

  let content;
  let cause: MapFallbackCause | null = null;
  if (!online) {
    cause = "offline";
    content = <MapFallback cause="offline" placesFromGoogle={props.placesFromGoogle} />;
  } else if (!view || !hasPositions || (needsConfig && !configComplete)) {
    cause = "unavailable";
    content = <MapFallback cause="unavailable" placesFromGoogle={props.placesFromGoogle} />;
  } else if (Simulated) {
    content = <Simulated view={view} />;
  } else {
    content = (
      <GoogleMapRenderer
        view={view}
        config={{ apiKey: config.apiKey ?? "", mapId: config.mapId ?? "" }}
        placesFromGoogle={props.placesFromGoogle}
        onErrorChange={setLoadError}
      />
    );
    cause = loadError ? "error" : null;
  }

  const regionLabel = props.mode === "day" ? format(t.regionJour, { n: props.day.index }) : t.regionSejour;

  const skipToList = (event: MouseEvent<HTMLAnchorElement>) => {
    if (props.mode !== "day") {
      return;
    }
    const target = document.getElementById(props.listId);
    if (target) {
      // Le focus va sur la liste sans changer l'adresse de la page.
      event.preventDefault();
      target.focus();
      target.scrollIntoView?.({ block: "start" });
    }
  };

  return (
    <div data-day-map={props.mode} className={cn("relative h-full", props.className)}>
      {props.mode === "day" ? (
        <a
          href={`#${props.listId}`}
          onClick={skipToList}
          data-part="evitement"
          className="sr-only z-20 rounded-control bg-raised px-4 py-3 text-corps font-bold text-ink focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
        >
          {t.evitement}
        </a>
      ) : null}
      <div role="region" aria-label={regionLabel} className="h-full">
        {/* Région live persistante (F4-PO-8) : toujours montée, seul son texte change, pour que chaque
            entrée dans un état de remplacement soit annoncée ; vide quand la carte s'affiche. */}
        <p role="status" data-part="annonce" className="sr-only">
          {cause ? MAP_FALLBACK_TEXTS[cause] : null}
        </p>
        {content}
      </div>
    </div>
  );
}
