"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { StopMarker } from "@/components/ligne";

import type { MapConfig } from "./config";
import { cssLength, cssVar, defaultFitPadding, prefersReducedMotion } from "./css";
import { MapFallback } from "./MapFallback";
import { MarkerButton } from "./MarkerButton";
import { boundsOf, type LatLng, type StopMarkerSpec } from "./route";
import type { MapView } from "./types";

/**
 * Seules bibliothèques de la Maps JavaScript API chargées par F4 : aucune de Places, Routes,
 * Directions, Geocoding ni Distance Matrix (Q3 : la clé du navigateur est restreinte à la Maps JavaScript API).
 */
export const MAPS_LIBRARIES = ["maps", "marker"] as const;

/** Délai de chargement avant l'état « erreur de chargement » (F4-PO-8). */
export const LOAD_TIMEOUT_MS = 10_000;

interface Libraries {
  maps: google.maps.MapsLibrary;
  marker: google.maps.MarkerLibrary;
}

type AuthWindow = Window & { gm_authFailure?: () => void };

/** Charge `maps` et `marker` ; les options ne sont posées qu'au premier chargement de la page. */
async function loadLibraries(apiKey: string): Promise<Libraries> {
  // Après le premier appel, le chargeur a installé google.maps.importLibrary : on ne repose pas les options.
  if (typeof google === "undefined" || typeof google.maps?.importLibrary !== "function") {
    setOptions({ key: apiKey, v: "weekly" });
  }
  const [maps, marker] = await Promise.all(MAPS_LIBRARIES.map((name) => importLibrary(name)));
  return { maps: maps as google.maps.MapsLibrary, marker: marker as google.maps.MarkerLibrary };
}

/** Le marqueur sélectionné est dessiné au-dessus des autres. */
function raise(marker: google.maps.marker.AdvancedMarkerElement, selected: boolean) {
  marker.zIndex = selected ? 2 : 1;
}

interface Hosts {
  stops: { spec: StopMarkerSpec; element: HTMLElement }[];
  termini: { position: LatLng; key: string; element: HTMLElement }[];
  rings: { position: LatLng; element: HTMLElement }[];
}

/** Éléments hôtes des marqueurs avancés en HTML : React y rend `StopMarker` par des portails. */
function createHosts(view: MapView): Hosts {
  const host = () => document.createElement("div");
  if (view.mode === "overview") {
    return { stops: [], termini: [], rings: view.rings.map((position) => ({ position, element: host() })) };
  }
  return {
    stops: view.route.stops.map((spec) => ({ spec, element: host() })),
    termini: view.route.termini.map((terminus) => ({
      position: terminus.position,
      key: terminus.roles.join("-"),
      element: host(),
    })),
    rings: [],
  };
}

export interface GoogleMapRendererProps {
  view: MapView;
  /** Configuration complète (vérifiée par `DayMap` avant tout chargement). */
  config: Required<MapConfig>;
  placesFromGoogle: boolean;
}

/**
 * Rendu Google (handover § 8) : Maps JavaScript API chargée par `@googlemaps/js-api-loader`, carte
 * vectorielle au Map ID de la configuration, marqueurs avancés en HTML (`StopMarker`), tracé en
 * polylignes droites. L'attribution native de Google n'est jamais masquée ni recouverte.
 * Aucune donnée n'est écrite côté client.
 */
export function GoogleMapRenderer({ view, config, placesFromGoogle }: GoogleMapRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const librariesRef = useRef<Libraries | null>(null);
  const stopMarkersRef = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const lastFitKey = useRef<string | null>(null);
  const selectedStopId = view.mode === "day" ? view.selectedStopId : undefined;
  const lastSelection = useRef(selectedStopId);
  const onMarkerPressRef = useRef(view.mode === "day" ? view.onMarkerPress : undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const ready = status === "ready";

  const route = view.mode === "day" ? view.route : null;
  const rings = view.mode === "overview" ? view.rings : null;
  const fitKey = view.fitKey;
  const fitPadding = view.fitPadding;
  // Les hôtes ne changent qu'avec le contenu (changement de jour), pas avec la sélection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hosts = useMemo(() => (typeof document === "undefined" ? null : createHosts(view)), [route, rings]);

  useEffect(() => {
    onMarkerPressRef.current = view.mode === "day" ? view.onMarkerPress : undefined;
  });

  // Chargement de l'API, avec délai et refus de la clé signalé par l'API (gm_authFailure).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const authWindow = window as AuthWindow;
    const fail = () => {
      if (!cancelled) {
        mapRef.current = null;
        setStatus("error");
      }
    };
    const failure = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("délai de chargement dépassé")), LOAD_TIMEOUT_MS);
    });
    authWindow.gm_authFailure = fail;
    Promise.race([loadLibraries(config.apiKey), failure])
      .then((libraries) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        librariesRef.current = libraries;
        mapRef.current = new libraries.maps.Map(containerRef.current, {
          mapId: config.mapId,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        setStatus("ready");
      })
      .catch(fail)
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (authWindow.gm_authFailure === fail) {
        authWindow.gm_authFailure = undefined;
      }
    };
  }, [attempt, config.apiKey, config.mapId]);

  // Marqueurs, tracé et cadrage (au premier affichage et à chaque changement de jour seulement).
  useEffect(() => {
    const map = mapRef.current;
    const libraries = librariesRef.current;
    if (!ready || !map || !libraries || !hosts) {
      return;
    }
    const { AdvancedMarkerElement } = libraries.marker;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    const stopMarkers = stopMarkersRef.current;
    stopMarkers.clear();
    for (const { position, element } of [...hosts.termini, ...hosts.rings]) {
      markers.push(new AdvancedMarkerElement({ map, position, content: element, zIndex: 0 }));
    }
    for (const { spec, element } of hosts.stops) {
      const marker = new AdvancedMarkerElement({ map, position: spec.position, content: element, zIndex: 1 });
      stopMarkers.set(spec.stopId, marker);
      markers.push(marker);
    }

    const color = cssVar("--color-line");
    const weight = cssLength("--ligne-rail");
    const dash = cssLength("--ligne-rail-dash");
    const gap = cssLength("--ligne-rail-gap");
    const polylines = (route?.legs ?? []).map(
      (leg) =>
        new libraries.maps.Polyline({
          map,
          path: [leg.from, leg.to],
          clickable: false,
          strokeColor: color,
          strokeWeight: weight,
          // Pointillé : la ligne est transparente et répète un trait de --ligne-rail-dash tous les dash + gap.
          strokeOpacity: leg.dashed ? 0 : 1,
          icons: leg.dashed
            ? [
                {
                  icon: { path: "M 0,0 0,1", strokeColor: color, strokeOpacity: 1, strokeWeight: weight, scale: dash },
                  offset: "0",
                  repeat: `${dash + gap}px`,
                },
              ]
            : undefined,
        }),
    );

    if (lastFitKey.current !== fitKey) {
      lastFitKey.current = fitKey;
      const box = boundsOf(route ? route.positions : (rings ?? []));
      if (box) {
        map.fitBounds(box, fitPadding ?? defaultFitPadding());
      }
    }

    return () => {
      for (const marker of markers) marker.map = null;
      for (const polyline of polylines) polyline.setMap(null);
      stopMarkers.clear();
    };
  }, [ready, hosts, route, rings, fitKey, fitPadding]);

  // Sélection : marqueur au-dessus des autres ; recentrage sans changer le zoom quand elle change.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) {
      return;
    }
    for (const [stopId, marker] of stopMarkersRef.current) {
      raise(marker, stopId === selectedStopId);
    }
    if (selectedStopId === lastSelection.current) {
      return;
    }
    lastSelection.current = selectedStopId;
    const target = route?.stops.find((stop) => stop.stopId === selectedStopId);
    if (!target) {
      return;
    }
    if (prefersReducedMotion()) {
      map.setCenter(target.position);
    } else {
      map.panTo(target.position);
    }
  }, [ready, selectedStopId, route, hosts]);

  if (status === "error") {
    return (
      <MapFallback
        cause="error"
        placesFromGoogle={placesFromGoogle}
        onRetry={() => {
          setStatus("loading");
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <>
      <div ref={containerRef} data-renderer="google" data-status={status} className="size-full bg-map-land" />
      {ready && hosts
        ? [
            ...hosts.stops.map(({ spec, element }) =>
              createPortal(
                <MarkerButton
                  stop={spec}
                  selected={spec.stopId === selectedStopId}
                  onPress={(stopId) => onMarkerPressRef.current?.(stopId)}
                />,
                element,
                spec.stopId,
              ),
            ),
            ...hosts.termini.map(({ key, element }) =>
              createPortal(
                <span aria-hidden="true" data-part="terminus" className="flex">
                  <StopMarker kind="terminus" />
                </span>,
                element,
                `terminus-${key}`,
              ),
            ),
            ...hosts.rings.map(({ element }, index) =>
              createPortal(
                <span aria-hidden="true" data-part="anneau" className="flex">
                  <StopMarker kind="overview" />
                </span>,
                element,
                `anneau-${index}`,
              ),
            ),
          ]
        : null}
    </>
  );
}
