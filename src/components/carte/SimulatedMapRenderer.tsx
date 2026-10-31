"use client";

import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { StopMarker } from "@/components/ligne/StopMarker";
import { useElementSize } from "@/lib/use-element-size";

import { CityMark, DECALAGES_JOURNEE, DECALAGES_SEJOUR, nomRepere, nomTerminus, texteEtiquette, useCityLabelPlaces } from "./CityLabel";
import { defaultFitPadding } from "./css";
import { MarkerButton } from "./MarkerButton";
import { anneauVisible, areaRadiusDegrees, boundsOf, ZOOM_POSITION_SEULE, type LatLng } from "./route";
import { drag, fitCamera, offsetCamera, project, scaleAt, type Camera, type Size } from "./simulated-model";
import { fitTargetOf, type FitPadding, type MapView } from "./types";

/** Au-delà de ce déplacement (en pixels CSS), le geste est un glisser et non un toucher. */
const DRAG_THRESHOLD = 4;

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  camera: Camera;
  moved: boolean;
}

/**
 * Carte simulée (F4-TL-2) : mêmes marqueurs, même numérotation et même tracé que le rendu Google,
 * en HTML et SVG, sans fond cartographique ni requête réseau. Réservée à /dev/carte et aux tests,
 * où elle est injectée par `CarteProvider` ; elle n'affiche que les données simulées du dépôt.
 * Son état `{ center, zoom }` est exposé en attributs `data-center-lat`, `data-center-lng`, `data-zoom`.
 */
/** Coins de la zone d'un quartier dans la projection simulée (même échelle en latitude et en longitude). */
function areaBox(center: LatLng, radiusM: number): LatLng[] {
  const d = areaRadiusDegrees(radiusM);
  return [
    { lat: center.lat - d, lng: center.lng - d },
    { lat: center.lat + d, lng: center.lng + d },
  ];
}

/**
 * Cadrage d'une vue : boîte des positions, ou, pour une vue d'une ville ou la journée d'un changement de ville réduite à
 * une seule position (décision 0150 § 3 bis), cette position au milieu de la zone non couverte par le panneau, au zoom 15.
 */
function frame(view: MapView, size: Size, insets: FitPadding | undefined): Camera | null {
  const target = fitTargetOf(view);
  const positions: LatLng[] = target
    ? target.positions
    : view.mode === "day"
      ? view.route.positions
      : view.mode === "area"
        ? areaBox(view.center, view.radiusM)
        : view.rings;
  const box = boundsOf(positions);
  if (target?.single && box && box.north === box.south && box.east === box.west) {
    return { zoom: ZOOM_POSITION_SEULE, center: offsetCamera({ lat: box.north, lng: box.east }, insets, ZOOM_POSITION_SEULE) };
  }
  return fitCamera(positions, size, view.fitPadding ?? defaultFitPadding());
}

export function SimulatedMapRenderer({ view }: { view: MapView }) {
  // Taille du conteneur, par le crochet commun (décision 0022 § 6) : la zone de la carte, pas la fenêtre.
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [camera, setCamera] = useState<(Camera & { key: string }) | null>(null);
  const selectedStopId = view.mode === "day" ? view.selectedStopId : undefined;
  const [previousSelection, setPreviousSelection] = useState(selectedStopId);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  // Cadrage au premier affichage et à chaque changement de jour (ou de vue, décision 0150) seulement ; recentrage quand la
  // sélection change (zoom inchangé, sans transition). Ajusté pendant le rendu, sans effet.
  const insets = view.mode === "day" || view.mode === "overview" ? view.visibleInsets : undefined;
  let next = camera;
  if (size && (next === null || next.key !== view.fitKey)) {
    const fitted = frame(view, size, insets);
    next = fitted ? { ...fitted, key: view.fitKey } : null;
  }
  if (selectedStopId !== previousSelection) {
    setPreviousSelection(selectedStopId);
    const target = view.mode === "day" ? view.route.stops.find((stop) => stop.stopId === selectedStopId) : undefined;
    if (next && target) {
      // Étape au milieu de la zone non couverte par le panneau, dans la projection simulée (décision 0016 § 2) ; après un
      // recadrage du même rendu (autre moitié, décision 0150 § 3 point 5), au zoom de ce cadrage.
      next = { ...next, center: offsetCamera(target.position, insets, next.zoom) };
    }
  }
  if (next !== camera) {
    setCamera(next);
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!camera || !event.isPrimary) {
      return;
    }
    dragState.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return;
    }
    if (!state.moved) {
      state.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setCamera((current) => (current ? { ...drag(state.camera, dx, dy), key: current.key } : current));
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (state && state.pointerId === event.pointerId) {
      suppressClick.current = state.moved;
      dragState.current = null;
    }
  };

  const at = (position: LatLng) => {
    if (!camera || !size) {
      return { left: 0, top: 0 };
    }
    const { x, y } = project(position, camera);
    return { left: size.width / 2 + x, top: size.height / 2 - y };
  };
  const ready = camera !== null && size !== null;

  // Étiquettes de ville : côté et décalage recalculés à chaque rendu (décision 0150 § 4).
  const labels = useCityLabelPlaces();
  const measureLabels = labels.measure;
  const containerElement = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    measureLabels(containerElement.current);
  });
  const setContainer = useCallback(
    (element: HTMLDivElement | null) => {
      containerElement.current = element;
      return containerRef(element);
    },
    [containerRef],
  );
  const cities = view.mode === "overview" ? view.cities : undefined;
  const transfer = view.mode === "day" ? view.transferCities : undefined;

  return (
    <div
      ref={setContainer}
      data-renderer="simulated"
      data-center-lat={camera?.center.lat}
      data-center-lng={camera?.center.lng}
      data-zoom={camera?.zoom}
      className="relative size-full touch-none overflow-hidden bg-map-land select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={(event) => {
        // Un glisser terminé sur un marqueur ne vaut pas un toucher.
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {ready && view.mode === "day" ? (
        <svg aria-hidden="true" data-part="trace" className="absolute inset-0" width={size.width} height={size.height}>
          {view.route.legs.map((leg, index) => {
            const from = at(leg.from);
            const to = at(leg.to);
            return (
              <line
                key={index}
                data-dashed={leg.dashed ? "true" : "false"}
                x1={from.left}
                y1={from.top}
                x2={to.left}
                y2={to.top}
                className="stroke-line"
                style={{
                  strokeWidth: "var(--ligne-rail)",
                  strokeLinecap: leg.dashed ? "butt" : "round",
                  strokeDasharray: leg.dashed ? "var(--ligne-rail-dash) var(--ligne-rail-gap)" : undefined,
                }}
              />
            );
          })}
        </svg>
      ) : null}

      {ready && view.mode === "day" && !transfer
        ? view.route.termini.map((terminus) => (
            <span
              key={terminus.roles.join("-")}
              aria-hidden="true"
              data-part="terminus"
              className="absolute flex -translate-x-1/2 -translate-y-1/2"
              style={at(terminus.position)}
            >
              <StopMarker kind="terminus" />
            </span>
          ))
        : null}

      {ready && view.mode === "day" && transfer
        ? view.route.termini.map((terminus) => {
            const nom = nomTerminus(terminus, transfer);
            const key = terminus.roles.join("-");
            return (
              <span key={key} className="absolute flex -translate-x-1/2 -translate-y-1/2" style={at(terminus.position)}>
                <CityMark
                  name={nom?.name}
                  label={
                    nom
                      ? { placeKey: key, text: nom.city, place: labels.places[key], decalagesMax: DECALAGES_JOURNEE }
                      : undefined
                  }
                />
              </span>
            );
          })
        : null}

      {ready && view.mode === "day"
        ? view.route.stops.map((stop) => {
            const selected = stop.stopId === view.selectedStopId;
            return (
              <MarkerButton
                key={stop.stopId}
                stop={stop}
                selected={selected}
                onPress={view.onMarkerPress}
                interactive={view.interactive ?? true}
                className={selected ? "absolute z-10 -translate-x-1/2 -translate-y-1/2" : "absolute -translate-x-1/2 -translate-y-1/2"}
                style={at(stop.position)}
              />
            );
          })
        : null}

      {ready && view.mode === "area" ? (
        <svg aria-hidden="true" data-part="zone" className="absolute inset-0" width={size.width} height={size.height}>
          <circle
            cx={at(view.center).left}
            cy={at(view.center).top}
            r={areaRadiusDegrees(view.radiusM) * scaleAt(camera?.zoom ?? 0)}
            className="fill-none stroke-line"
            style={{ strokeWidth: "var(--ligne-rail)" }}
          />
        </svg>
      ) : null}

      {ready && cities
        ? cities.rings.map((ring, index) =>
            anneauVisible(camera.zoom, ring.city, view.mode === "overview" ? view.cityView : undefined) ? (
              <span
                key={index}
                aria-hidden="true"
                data-part="anneau"
                className="absolute flex -translate-x-1/2 -translate-y-1/2"
                style={at(ring.position)}
              >
                <StopMarker kind="overview" />
              </span>
            ) : null,
          )
        : null}

      {ready && cities
        ? cities.markers.map((marker) => (
            <span key={marker.key} className="absolute flex -translate-x-1/2 -translate-y-1/2" style={at(marker.position)}>
              <CityMark
                name={marker.primary ? nomRepere(marker) : undefined}
                label={
                  marker.primary
                    ? { placeKey: marker.key, text: texteEtiquette(marker), place: labels.places[marker.key], decalagesMax: DECALAGES_SEJOUR }
                    : undefined
                }
              />
            </span>
          ))
        : null}

      {ready && view.mode === "overview"
        ? view.rings.map((ring, index) => (
            <span
              key={index}
              aria-hidden="true"
              data-part="anneau"
              className="absolute flex -translate-x-1/2 -translate-y-1/2"
              style={at(ring)}
            >
              <StopMarker kind="overview" />
            </span>
          ))
        : null}
    </div>
  );
}
