"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { StopMarker } from "@/components/ligne/StopMarker";

import { DECALAGES_JOURNEE, DECALAGES_SEJOUR, nomRepere, nomTerminus, texteEtiquette } from "./city-names";
import type { MapConfig } from "./config";
import { cssLength, cssVar, defaultFitPadding, prefersReducedMotion } from "./css";
import { useLabelPlaces } from "./label-places";
import { MapFallback } from "./MapFallback";
import { MarkerButton } from "./MarkerButton";
import { anneauVisible, areaCorners, boundsOf, offsetCenter, ZOOM_POSITION_SEULE, type LatLng, type StopMarkerSpec } from "./route";
import { fitTargetOf, type MapView } from "./types";

// Repères et étiquettes de ville (décision 0150) : chargés seulement à plusieurs villes (décision 0152 § 4).
const CityMark = lazy(() => import("./CityLabel").then((loaded) => ({ default: loaded.CityMark })));

/** Mesure des étiquettes, chargée avec `CityLabel` au premier `idle` (décision 0152 § 4). */
const mesurerALaDemande = (container: HTMLElement) => import("./CityLabel").then(({ mesurerEtiquettes }) => mesurerEtiquettes(container));

/**
 * Délai au-delà duquel un cadrage est tenu pour appliqué sans `idle` (cadrage qui ne change pas la vue) : un recentrage en
 * attente part alors quand même.
 */
export const CADRAGE_IDLE_MAX_MS = 1000;

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

/** Anneaux par ville attachés ou détachés selon le zoom et la vue choisie (décision 0150 § 2 point 3), sans reconstruction. */
function attachRings(
  rings: readonly { marker: google.maps.marker.AdvancedMarkerElement; city: string }[],
  map: google.maps.Map,
  zoom: number | null,
  cityView: string | undefined,
) {
  for (const { marker, city } of rings) {
    const target = anneauVisible(zoom, city, cityView) ? map : null;
    if (marker.map !== target) marker.map = target;
  }
}

/** Le marqueur sélectionné est dessiné au-dessus des autres. */
function raise(marker: google.maps.marker.AdvancedMarkerElement, selected: boolean) {
  marker.zIndex = selected ? 2 : 1;
}

/** Repère de ville (décision 0150) : terminus nommé ou masqué, avec ou sans étiquette, dans un même hôte. */
interface RepereHost {
  key: string;
  position: LatLng;
  element: HTMLElement;
  name?: string;
  label?: { text: string; decalagesMax: number };
}

interface Hosts {
  stops: { spec: StopMarkerSpec; element: HTMLElement }[];
  termini: { position: LatLng; key: string; element: HTMLElement }[];
  rings: { position: LatLng; element: HTMLElement; city?: string }[];
  reperes: RepereHost[];
}

/** Éléments hôtes des marqueurs avancés en HTML : React y rend `StopMarker` par des portails. */
function createHosts(view: MapView): Hosts {
  const host = () => document.createElement("div");
  if (view.mode === "area") {
    // Zone d'un quartier : un cercle, aucun marqueur en phase 0 (décision 0017 § 7).
    return { stops: [], termini: [], rings: [], reperes: [] };
  }
  if (view.mode === "overview") {
    if (view.cities) {
      // Plusieurs villes (décision 0150 § 2) : un repère par logement, dans l'ordre des villes ; anneaux par ville.
      return {
        stops: [],
        termini: [],
        rings: view.cities.rings.map(({ position, city }) => ({ position, city, element: host() })),
        reperes: view.cities.markers.map((marker) => ({
          key: marker.key,
          position: marker.position,
          element: host(),
          ...(marker.primary ? { name: nomRepere(marker), label: { text: texteEtiquette(marker), decalagesMax: DECALAGES_SEJOUR } } : {}),
        })),
      };
    }
    return { stops: [], termini: [], rings: view.rings.map((position) => ({ position, element: host() })), reperes: [] };
  }
  const transfer = view.transferCities;
  const termini = view.route.termini.map((terminus) => ({ terminus, key: terminus.roles.join("-") }));
  return {
    stops: view.route.stops.map((spec) => ({ spec, element: host() })),
    termini: transfer ? [] : termini.map(({ terminus, key }) => ({ position: terminus.position, key, element: host() })),
    rings: [],
    // Journée d'un changement de ville (décision 0150 § 3 point 1) : deux terminus nommés et étiquetés.
    reperes: transfer
      ? termini.map(({ terminus, key }) => {
          const nom = nomTerminus(terminus, transfer);
          return {
            key,
            position: terminus.position,
            element: host(),
            ...(nom ? { name: nom.name, label: { text: nom.city, decalagesMax: DECALAGES_JOURNEE } } : {}),
          };
        })
      : [],
  };
}

export interface GoogleMapRendererProps {
  view: MapView;
  /** Configuration complète (vérifiée par `DayMap` avant tout chargement). */
  config: Required<MapConfig>;
  placesFromGoogle: boolean;
  /** Signale l'entrée dans l'état « erreur de chargement » et la sortie, pour la région live de `DayMap`. */
  onErrorChange?: (error: boolean) => void;
}

/**
 * Rendu Google (handover § 8) : Maps JavaScript API chargée par `@googlemaps/js-api-loader`, carte
 * vectorielle au Map ID de la configuration, marqueurs avancés en HTML (`StopMarker`), tracé en
 * polylignes droites. L'attribution native de Google n'est jamais masquée ni recouverte.
 * Aucune donnée n'est écrite côté client.
 */
export function GoogleMapRenderer({ view, config, placesFromGoogle, onErrorChange }: GoogleMapRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const librariesRef = useRef<Libraries | null>(null);
  const stopMarkersRef = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const lastFitKey = useRef<string | null>(null);
  const selectedStopId = view.mode === "day" ? view.selectedStopId : undefined;
  const lastSelection = useRef(selectedStopId);
  const onMarkerPressRef = useRef(view.mode === "day" ? view.onMarkerPress : undefined);
  // Lu au recentrage seulement : changer la zone couverte ne recadre ni ne recentre (décision 0015 § 4).
  const visibleInsetsRef = useRef(view.mode === "day" || view.mode === "overview" ? view.visibleInsets : undefined);
  // Anneaux par ville (décision 0150 § 2 point 3) : attachés ou détachés au passage du zoom 10, sans reconstruction.
  const ringMarkersRef = useRef<{ marker: google.maps.marker.AdvancedMarkerElement; city: string }[]>([]);
  // Zoom lu après le premier cadrage (premier `idle`), puis à chaque `zoom_changed` ; `null` tant qu'il est inconnu.
  const zoomRef = useRef<number | null>(null);
  const cityViewRef = useRef(view.mode === "overview" ? view.cityView : undefined);
  // Cadrage en cours (vue d'une ville ou moitié) : un recentrage demandé avant le prochain `idle` attend cet `idle`.
  const fitInFlightRef = useRef(false);
  const pendingPanRef = useRef<(() => void) | null>(null);
  const labels = useLabelPlaces(mesurerALaDemande);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const ready = status === "ready";

  const route = view.mode === "day" ? view.route : null;
  const rings = view.mode === "overview" ? view.rings : null;
  const areaLat = view.mode === "area" ? view.center.lat : null;
  const areaLng = view.mode === "area" ? view.center.lng : null;
  const areaRadius = view.mode === "area" ? view.radiusM : null;
  const fitKey = view.fitKey;
  const fitPadding = view.fitPadding;
  const cities = view.mode === "overview" ? view.cities : undefined;
  const transferKey = view.mode === "day" && view.transferCities ? `${view.transferCities.de}|${view.transferCities.vers}` : "";
  // Les hôtes ne changent qu'avec le contenu (changement de jour), pas avec la sélection ni avec la vue choisie.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hosts = useMemo(() => (typeof document === "undefined" ? null : createHosts(view)), [route, rings, cities, transferKey, areaLat, areaLng, areaRadius]);

  useEffect(() => {
    onMarkerPressRef.current = view.mode === "day" ? view.onMarkerPress : undefined;
    visibleInsetsRef.current = view.mode === "day" || view.mode === "overview" ? view.visibleInsets : undefined;
  });
  const multiCity = (view.mode === "overview" && view.cities !== undefined) || (view.mode === "day" && view.transferCities !== undefined);
  const cityView = view.mode === "overview" ? view.cityView : undefined;

  // L'état d'erreur est annoncé par l'enveloppe ; au démontage, il n'y a plus d'erreur à annoncer.
  const onErrorChangeRef = useRef(onErrorChange);
  useEffect(() => {
    onErrorChangeRef.current = onErrorChange;
  });
  const failed = status === "error";
  useEffect(() => {
    onErrorChangeRef.current?.(failed);
  }, [failed]);
  useEffect(() => () => onErrorChangeRef.current?.(false), []);

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
    const ringMarkers: { marker: google.maps.marker.AdvancedMarkerElement; city: string }[] = [];
    for (const { position, element } of hosts.termini) {
      markers.push(new AdvancedMarkerElement({ map, position, content: element, zIndex: 0 }));
    }
    for (const { position, element, city } of hosts.rings) {
      const visible = city === undefined || anneauVisible(zoomRef.current, city, cityViewRef.current);
      const marker = new AdvancedMarkerElement({ map: visible ? map : null, position, content: element, zIndex: 0 });
      if (city !== undefined) ringMarkers.push({ marker, city });
      markers.push(marker);
    }
    ringMarkersRef.current = ringMarkers;
    // Repères de ville, dans l'ordre des villes, au-dessus des anneaux (décision 0150 § 5).
    for (const { position, element } of hosts.reperes) {
      markers.push(new AdvancedMarkerElement({ map, position, content: element, zIndex: 1 }));
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

    // Zone d'un quartier : cercle au contour `line`, sans remplissage, dessiné dans la projection de la carte.
    const area =
      areaLat !== null && areaLng !== null && areaRadius !== null ? { center: { lat: areaLat, lng: areaLng }, radiusM: areaRadius } : null;
    const circle = area
      ? new libraries.maps.Circle({
          map,
          center: area.center,
          radius: area.radiusM,
          clickable: false,
          strokeColor: color,
          strokeWeight: weight,
          strokeOpacity: 1,
          fillOpacity: 0,
        })
      : null;

    return () => {
      for (const marker of markers) marker.map = null;
      for (const polyline of polylines) polyline.setMap(null);
      circle?.setMap(null);
      stopMarkers.clear();
      ringMarkersRef.current = [];
    };
  }, [ready, hosts, route, areaLat, areaLng, areaRadius]);

  // Anneaux par ville et étiquettes (décision 0150 § 2 point 3 et § 4) : zoom lu au premier `idle` puis à chaque
  // `zoom_changed` ; place des étiquettes recalculée à chaque `idle` (après tout cadrage, glissement ou zoom).
  const measureLabels = labels.measure;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !multiCity || typeof map.addListener !== "function") {
      return;
    }
    const updateRings = () => attachRings(ringMarkersRef.current, map, zoomRef.current, cityViewRef.current);
    const idle = map.addListener("idle", () => {
      zoomRef.current = map.getZoom() ?? null;
      updateRings();
      measureLabels(containerRef.current);
    });
    const zoom = map.addListener("zoom_changed", () => {
      if (zoomRef.current === null) return;
      zoomRef.current = map.getZoom() ?? null;
      updateRings();
    });
    return () => {
      idle.remove();
      zoom.remove();
    };
  }, [ready, multiCity, measureLabels]);

  // Vue d'une ville choisie : ses anneaux toujours attachés, les autres selon le zoom (sans reconstruction).
  useEffect(() => {
    cityViewRef.current = cityView;
    const map = mapRef.current;
    if (!ready || !map) return;
    attachRings(ringMarkersRef.current, map, zoomRef.current, cityView);
  }, [ready, cityView, hosts]);

  // Cadrage au premier affichage, à chaque changement de jour et, à plusieurs villes, à chaque changement de vue.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !hosts || lastFitKey.current === fitKey) {
      return;
    }
    lastFitKey.current = fitKey;
    const target = fitTargetOf(view);
    const area = areaLat !== null && areaLng !== null && areaRadius !== null ? { lat: areaLat, lng: areaLng } : null;
    const positions = target
      ? target.positions
      : route
        ? route.positions
        : area && areaRadius !== null
          ? areaCorners(area, areaRadius)
          : (rings ?? []);
    const box = boundsOf(positions);
    if (!box) {
      return;
    }
    if (target?.single && box.north === box.south && box.east === box.west) {
      // Une seule position (décision 0150 § 3 bis) : au milieu de la zone non couverte par le panneau, zoom 15.
      map.setZoom(ZOOM_POSITION_SEULE);
      map.setCenter(offsetCenter({ lat: box.north, lng: box.east }, visibleInsetsRef.current, ZOOM_POSITION_SEULE));
    } else {
      map.fitBounds(box, fitPadding ?? defaultFitPadding());
    }
    if (!target || typeof map.addListener !== "function") {
      return;
    }
    // Un recentrage demandé dans le même rendu (sélection dans l'autre moitié) attend que le cadrage soit appliqué : au
    // prochain `idle`, ou après `CADRAGE_IDLE_MAX_MS` si la vue n'a pas changé et qu'aucun `idle` ne vient.
    fitInFlightRef.current = true;
    const applique = () => {
      listener.remove();
      clearTimeout(timer);
      fitInFlightRef.current = false;
      const pan = pendingPanRef.current;
      pendingPanRef.current = null;
      pan?.();
    };
    const listener = map.addListener("idle", applique);
    const timer = setTimeout(applique, CADRAGE_IDLE_MAX_MS);
    return () => {
      listener.remove();
      clearTimeout(timer);
      fitInFlightRef.current = false;
      pendingPanRef.current = null;
    };
    // La vue est lue au moment du changement de `fitKey` seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hosts, fitKey]);

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
    // Un seul appel : l'étape au milieu de la zone non couverte par le panneau (pas panTo puis panBy). Après un
    // recadrage du même rendu (autre moitié, décision 0150 § 3 point 5), au zoom lu après son `idle`.
    const pan = () => {
      const center = offsetCenter(target.position, visibleInsetsRef.current, map.getZoom() ?? 0);
      if (prefersReducedMotion()) {
        map.setCenter(center);
      } else {
        map.panTo(center);
      }
    };
    if (fitInFlightRef.current) {
      pendingPanRef.current = pan;
    } else {
      pan();
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
                  interactive={view.mode === "day" ? (view.interactive ?? true) : true}
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
            ...hosts.reperes.map(({ key, element, name, label }) =>
              createPortal(
                <Suspense fallback={null}>
                  <CityMark
                    name={name}
                    label={label ? { placeKey: key, text: label.text, place: labels.places[key], decalagesMax: label.decalagesMax } : undefined}
                  />
                </Suspense>,
                element,
                `repere-${key}`,
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
