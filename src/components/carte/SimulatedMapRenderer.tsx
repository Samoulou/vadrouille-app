"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { StopMarker } from "@/components/ligne/StopMarker";

import { defaultFitPadding } from "./css";
import { MarkerButton } from "./MarkerButton";
import { offsetCenter, type LatLng } from "./route";
import { drag, fitCamera, project, type Camera, type Size } from "./simulated-model";
import type { MapView } from "./types";

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
export function SimulatedMapRenderer({ view }: { view: MapView }) {
  const [size, setSize] = useState<Size | null>(null);
  const [camera, setCamera] = useState<(Camera & { key: string }) | null>(null);
  const selectedStopId = view.mode === "day" ? view.selectedStopId : undefined;
  const [previousSelection, setPreviousSelection] = useState(selectedStopId);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Cadrage au premier affichage et à chaque changement de jour seulement ; recentrage quand la
  // sélection change (zoom inchangé, sans transition). Ajusté pendant le rendu, sans effet.
  const positions: LatLng[] = view.mode === "day" ? view.route.positions : view.rings;
  let next = camera;
  if (size && (next === null || next.key !== view.fitKey)) {
    const fitted = fitCamera(positions, size, view.fitPadding ?? defaultFitPadding());
    next = fitted ? { ...fitted, key: view.fitKey } : null;
  }
  if (selectedStopId !== previousSelection) {
    setPreviousSelection(selectedStopId);
    const target = view.mode === "day" ? view.route.stops.find((stop) => stop.stopId === selectedStopId) : undefined;
    if (next && target) {
      // Étape au milieu de la zone non couverte par le panneau (décision 0015 § 4).
      const insets = view.mode === "day" ? view.visibleInsets : undefined;
      next = { ...next, center: offsetCenter(target.position, insets, next.zoom) };
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

  return (
    <div
      ref={measure}
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

      {ready && view.mode === "day"
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

      {ready && view.mode === "day"
        ? view.route.stops.map((stop) => {
            const selected = stop.stopId === view.selectedStopId;
            return (
              <MarkerButton
                key={stop.stopId}
                stop={stop}
                selected={selected}
                onPress={view.onMarkerPress}
                className={selected ? "absolute z-10 -translate-x-1/2 -translate-y-1/2" : "absolute -translate-x-1/2 -translate-y-1/2"}
                style={at(stop.position)}
              />
            );
          })
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
